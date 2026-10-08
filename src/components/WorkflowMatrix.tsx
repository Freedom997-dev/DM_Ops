"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Check, ChevronDown, Loader2, Lock, LockOpen, Printer, RefreshCw } from "lucide-react";
import { WorkflowCellButton, type CellStatus } from "@/components/WorkflowCellButton";
import { WorkflowNoteCell } from "@/components/WorkflowNoteCell";
import { WorkflowMatrixRowPanel, type RowImage } from "@/components/WorkflowMatrixRowPanel";
import {
  getOrCreateSubmission,
  markSubmissionComplete,
  reopenSubmission,
  unlockDay,
  lockDay,
} from "@/lib/actions/workflows";
import { lockMessage, type SheetState } from "@/lib/workflow-lock";

type Room = { id: string; number: string; name: string | null };
type Item = { id: string; text: string };

export type MatrixCellSeed = {
  roomId: string;
  itemId: string;
  status: CellStatus;
  lastUpdatedBy: string | null;
};

export type MatrixRowSeed = {
  roomId: string;
  note: string | null;
  images: RowImage[];
};

type Props = {
  workflowSlug: string;
  workflowName: string;
  dateKey: string; // YYYY-MM-DD of the day shown
  submissionId: string | null; // null means "not yet created — will be created on first cell tap"
  submissionStatus: "IN_PROGRESS" | "COMPLETED" | null;
  rooms: Room[];
  items: Item[];
  seedCells: MatrixCellSeed[];
  seedRows: MatrixRowSeed[];
  isAdmin: boolean;
  canMarkComplete: boolean;
  canUnlock: boolean; // manager+: unlock / lock past days
  isPast: boolean;
  editable: boolean; // server-computed (src/lib/workflow-lock.ts); the server re-checks every write
  lockReason: SheetState["lockReason"];
  unlockedBy: string | null; // past day currently unlocked by this person
  printDateLabel: string;
  printFileDate: string; // YYYY-MM-DD, used in the saved PDF's file name
};

export function WorkflowMatrix({
  workflowSlug,
  workflowName,
  dateKey,
  submissionId: initialSubmissionId,
  submissionStatus: initialSubmissionStatus,
  rooms,
  items,
  seedCells,
  seedRows,
  isAdmin,
  canMarkComplete,
  canUnlock,
  isPast,
  editable,
  lockReason,
  unlockedBy,
  printDateLabel,
  printFileDate,
}: Props) {
  const router = useRouter();
  const [submissionId, setSubmissionId] = useState<string | null>(initialSubmissionId);
  const [submissionStatus, setSubmissionStatus] = useState<"IN_PROGRESS" | "COMPLETED" | null>(
    initialSubmissionStatus,
  );
  const [openRoomId, setOpenRoomId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [creating, startCreate] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Notes saved since the last server refresh, so the printed notes are current
  const [savedNotes, setSavedNotes] = useState<Record<string, string>>({});

  // Pick up a sheet the server created or changed (unlock, reopen) after a
  // router.refresh(); local state only seeds from props on first render.
  useEffect(() => {
    if (initialSubmissionId) setSubmissionId(initialSubmissionId);
  }, [initialSubmissionId]);
  useEffect(() => {
    if (initialSubmissionStatus) setSubmissionStatus(initialSubmissionStatus);
  }, [initialSubmissionStatus]);

  const completed = submissionStatus === "COMPLETED";
  const locked = !editable || completed;

  // cellMap[`${roomId}::${itemId}`] = status (or undefined if not marked)
  const cellMap = useMemo(() => {
    const m = new Map<string, { status: CellStatus; lastUpdatedBy: string | null }>();
    for (const c of seedCells) m.set(`${c.roomId}::${c.itemId}`, { status: c.status, lastUpdatedBy: c.lastUpdatedBy });
    return m;
  }, [seedCells]);

  const rowMap = useMemo(() => {
    const m = new Map<string, MatrixRowSeed>();
    for (const r of seedRows) m.set(r.roomId, r);
    return m;
  }, [seedRows]);

  const printNotes = useMemo(
    () =>
      rooms
        .map((room) => ({ room, note: (savedNotes[room.id] ?? rowMap.get(room.id)?.note ?? "").trim() }))
        .filter((n) => n.note),
    [rooms, rowMap, savedNotes],
  );

  const counts = useMemo(() => {
    let ok = 0,
      issue = 0;
    for (const c of seedCells) {
      if (c.status === "OK") ok++;
      else if (c.status === "ISSUE") issue++;
    }
    const total = rooms.length * items.length;
    return { ok, issue, total, blank: total - ok - issue };
  }, [seedCells, rooms.length, items.length]);

  async function ensureSubmission(): Promise<string | null> {
    if (submissionId) return submissionId;
    if (locked) {
      setError(lockMessage(lockReason));
      return null;
    }
    setError(null);
    return new Promise<string | null>((resolve) => {
      startCreate(async () => {
        const res = await getOrCreateSubmission(workflowSlug, dateKey);
        if (!res.ok) {
          setError(res.error);
          resolve(null);
          return;
        }
        setSubmissionId(res.submissionId);
        setSubmissionStatus("IN_PROGRESS");
        resolve(res.submissionId);
      });
    });
  }

  function handleOpenRoom(roomId: string) {
    setOpenRoomId((cur) => (cur === roomId ? null : roomId));
  }

  function handleMarkComplete() {
    if (!submissionId) return;
    if (!confirm("Mark this inspection complete? Cells will become read-only.")) return;
    setError(null);
    startTransition(async () => {
      const res = await markSubmissionComplete(submissionId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSubmissionStatus("COMPLETED");
      router.refresh();
    });
  }

  function handleReopen() {
    if (!submissionId) return;
    if (!confirm("Reopen this completed inspection? Cells become editable again.")) return;
    setError(null);
    startTransition(async () => {
      const res = await reopenSubmission(submissionId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSubmissionStatus("IN_PROGRESS");
      router.refresh();
    });
  }

  function handleUnlock() {
    if (!confirm("Unlock this day? Anyone with access can then edit it until it's locked again or marked complete.")) return;
    setError(null);
    startTransition(async () => {
      const res = await unlockDay(workflowSlug, dateKey);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function handleLock() {
    if (!submissionId) return;
    setError(null);
    startTransition(async () => {
      const res = await lockDay(submissionId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function handleRefresh() {
    router.refresh();
  }

  function handlePrint() {
    // Browsers use document.title as the default "Save as PDF" file name
    const originalTitle = document.title;
    document.title = `Daily room inspection report ${printFileDate}`;
    window.addEventListener("afterprint", () => (document.title = originalTitle), { once: true });
    window.print();
  }

  return (
    <div className="space-y-4 print-area">
      {/* Print-only header (hidden on screen, shown on the printed PDF) */}
      <div className="print-only mb-3">
        <h1 className="text-lg font-bold">Daily Room Inspection Report — Divya Motel</h1>
        <p className="text-sm">
          {printDateLabel} · {counts.ok} OK · {counts.issue} Issue · {counts.blank} blank/N/A ·{" "}
          {completed ? "Completed" : "In progress"}
        </p>
      </div>

      {/* Top bar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{workflowName}</h1>
          <p className="text-sm text-slate-500">
            {completed ? (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <Check className="h-4 w-4" /> Completed
              </span>
            ) : !editable ? (
              <span className="inline-flex items-center gap-1 text-amber-700">
                <Lock className="h-4 w-4" />
                {submissionId ? "Locked" : "Missed — no inspection"}
                {canUnlock ? " · unlock to edit" : " · ask a manager to unlock"}
              </span>
            ) : unlockedBy ? (
              <span className="inline-flex items-center gap-1 text-amber-700">
                <LockOpen className="h-4 w-4" /> Unlocked by {unlockedBy} · {submissionId ? "editing" : "tap a cell to begin"}
              </span>
            ) : submissionId ? (
              "In progress"
            ) : (
              "Not started — tap a cell to begin"
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            className="btn-secondary"
            disabled={pending || creating}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          {submissionId && (
            <button
              type="button"
              onClick={handlePrint}
              className="btn-secondary"
              title="Print / Save as PDF"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
          )}
          {canUnlock && isPast && lockReason === "past-locked" && (
            <button type="button" onClick={handleUnlock} className="btn-secondary" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />}
              Unlock for editing
            </button>
          )}
          {canUnlock && isPast && unlockedBy && !completed && submissionId && (
            <button type="button" onClick={handleLock} className="btn-secondary" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Lock
            </button>
          )}
          {canMarkComplete && !locked && submissionId && (
            <button
              type="button"
              onClick={handleMarkComplete}
              className="btn-primary"
              disabled={pending}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Mark complete
            </button>
          )}
          {isAdmin && completed && submissionId && (
            <button
              type="button"
              onClick={handleReopen}
              className="btn-secondary"
              disabled={pending}
              title="Admin: reopen this completed inspection"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />}
              Reopen
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="no-print rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* Counts */}
      <div className="no-print flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium">
        <span className="inline-flex items-center gap-1 text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> {counts.ok} OK
        </span>
        <span className="inline-flex items-center gap-1 text-red-700">
          <span className="h-2 w-2 rounded-full bg-red-500" /> {counts.issue} Issue
        </span>
        <span className="inline-flex items-center gap-1 text-slate-400">
          <span className="h-2 w-2 rounded-full border border-slate-300 bg-white" /> {counts.blank} blank / N/A
        </span>
        <span className={clsx("ml-auto text-slate-400", locked && "hidden")}>
          Tap a box: blank → <span className="text-emerald-700">✓ OK</span> → <span className="text-red-700">✗ Issue</span> → blank
        </span>
      </div>

      {/* Matrix — bounded scroll box: header row stays fixed at the top and the
          Room column stays fixed at the left while you scroll inside. */}
      <div className="matrix-scroll max-h-[75vh] overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 w-14 min-w-[56px] border-b border-r border-slate-200 bg-slate-50 px-1 py-2 text-center text-[11px] font-bold uppercase text-slate-600">
                Room
              </th>
              {items.map((item) => (
                <th
                  key={item.id}
                  className="sticky top-0 z-20 border-b border-l border-slate-100 bg-slate-50 px-1 py-1 text-xs text-slate-600"
                  style={{ minWidth: 46, width: 46 }}
                >
                  <div className="flex h-28 items-end justify-center px-0.5">
                    <span
                      className="whitespace-nowrap text-[11px] font-semibold"
                      style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                    >
                      {item.text}
                    </span>
                  </div>
                </th>
              ))}
              <th
                className="no-print sticky top-0 z-20 border-b border-l-2 border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-slate-600"
                style={{ minWidth: 220, width: 220 }}
              >
                Notes
              </th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => {
              const isOpen = openRoomId === room.id;
              const row = rowMap.get(room.id);
              return (
                <Fragment key={room.id}>
                  <tr className={clsx(isOpen && "bg-amber-50")}>
                    <th
                      className={clsx(
                        "sticky left-0 z-10 w-14 min-w-[56px] border-b border-r border-slate-200 px-1 py-2 text-center",
                        isOpen ? "bg-amber-50" : "bg-white",
                      )}
                    >
                      <button
                        type="button"
                        onClick={async () => {
                          await ensureSubmission();
                          handleOpenRoom(room.id);
                        }}
                        className="flex w-full flex-col items-center"
                        title={room.name ?? undefined}
                        aria-expanded={isOpen}
                        aria-label={`Room ${room.number} photos`}
                      >
                        <span className="text-sm font-bold text-slate-900">{room.number}</span>
                        <ChevronDown
                          className={clsx(
                            "no-print mt-0.5 h-5 w-5 rounded-md border p-0.5 transition-transform",
                            isOpen
                              ? "rotate-180 border-amber-300 bg-amber-100 text-amber-700"
                              : "border-slate-200 text-slate-400",
                          )}
                        />
                      </button>
                    </th>
                    {items.map((item) => {
                      const cell = cellMap.get(`${room.id}::${item.id}`);
                      return (
                        <td key={item.id} className="border-b border-l border-slate-100 p-0">
                          <WorkflowCellButton
                            submissionId={submissionId}
                            ensureSubmission={ensureSubmission}
                            roomId={room.id}
                            itemId={item.id}
                            initialStatus={cell?.status ?? null}
                            lastUpdatedBy={cell?.lastUpdatedBy ?? null}
                            disabled={locked}
                          />
                        </td>
                      );
                    })}
                    <td
                      className={clsx(
                        "no-print border-b border-l-2 border-slate-200 p-1 align-top",
                        isOpen ? "bg-amber-50" : "bg-white",
                      )}
                      style={{ minWidth: 220, width: 220 }}
                    >
                      <WorkflowNoteCell
                        submissionId={submissionId}
                        ensureSubmission={ensureSubmission}
                        roomId={room.id}
                        initialNote={row?.note ?? null}
                        disabled={locked}
                        onSaved={(note) => setSavedNotes((cur) => ({ ...cur, [room.id]: note }))}
                      />
                    </td>
                  </tr>
                  {isOpen && submissionId && (
                    <tr>
                      <td colSpan={items.length + 2} className="border-b border-slate-200 bg-amber-50 p-3">
                        <WorkflowMatrixRowPanel
                          submissionId={submissionId}
                          roomId={room.id}
                          roomLabel={`Room ${room.number}`}
                          initialImages={row?.images ?? []}
                          isAdmin={isAdmin}
                          disabled={locked}
                          onClose={() => setOpenRoomId(null)}
                          onSaved={() => {
                            handleRefresh();
                            setOpenRoomId(null);
                          }}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Print-only notes list — replaces the Notes column on the PDF */}
      {printNotes.length > 0 && (
        <div className="print-only print-notes mt-4">
          <h2 className="mb-1 text-sm font-bold">Notes</h2>
          <table className="w-full border-collapse text-xs">
            <tbody>
              {printNotes.map(({ room, note }) => (
                <tr key={room.id}>
                  <th className="w-16 border border-slate-300 px-2 py-1 text-left align-top font-bold">
                    {room.number}
                  </th>
                  <td className="whitespace-pre-wrap border border-slate-300 px-2 py-1">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
