"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Check, Loader2, LockOpen, Printer, RefreshCw } from "lucide-react";
import { WorkflowCellButton, type CellStatus } from "@/components/WorkflowCellButton";
import { WorkflowNoteCell } from "@/components/WorkflowNoteCell";
import { WorkflowMatrixRowPanel, type RowImage } from "@/components/WorkflowMatrixRowPanel";
import { getOrCreateTodaySubmission, markSubmissionComplete, reopenSubmission } from "@/lib/actions/workflows";

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
  submissionId: string | null; // null means "not yet created — will be created on first cell tap"
  submissionStatus: "IN_PROGRESS" | "COMPLETED" | null;
  rooms: Room[];
  items: Item[];
  seedCells: MatrixCellSeed[];
  seedRows: MatrixRowSeed[];
  isAdmin: boolean;
  canMarkComplete: boolean;
  printDateLabel: string;
};

export function WorkflowMatrix({
  workflowSlug,
  workflowName,
  submissionId: initialSubmissionId,
  submissionStatus: initialSubmissionStatus,
  rooms,
  items,
  seedCells,
  seedRows,
  isAdmin,
  canMarkComplete,
  printDateLabel,
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

  // Synced sticky horizontal scrollbar. The grid keeps its natural height so
  // the page (and mouse wheel) scrolls vertically; a thin bar pinned near the
  // top mirrors the grid's horizontal scroll so it's always reachable.
  const topBarRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [scrollW, setScrollW] = useState(0);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const update = () => setScrollW(grid.scrollWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(grid);
    return () => ro.disconnect();
  }, [rooms.length, items.length]);

  function syncFromTop() {
    if (gridRef.current && topBarRef.current) {
      gridRef.current.scrollLeft = topBarRef.current.scrollLeft;
    }
  }
  function syncFromGrid() {
    if (gridRef.current && topBarRef.current) {
      topBarRef.current.scrollLeft = gridRef.current.scrollLeft;
    }
  }

  const completed = submissionStatus === "COMPLETED";

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
    setError(null);
    return new Promise<string | null>((resolve) => {
      startCreate(async () => {
        const res = await getOrCreateTodaySubmission(workflowSlug);
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

  function handleRefresh() {
    router.refresh();
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-4 print-area">
      {/* Print-only header (hidden on screen, shown on the printed PDF) */}
      <div className="print-only mb-3">
        <h1 className="text-lg font-bold">{workflowName} — Divya Motel</h1>
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
          {canMarkComplete && !completed && submissionId && (
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
        <span className="ml-auto text-slate-400">
          Tap a box: blank → <span className="text-emerald-700">✓ OK</span> → <span className="text-red-700">✗ Issue</span> → blank
        </span>
      </div>

      {/* Sticky horizontal scrollbar pinned below the nav — mirrors the grid's
          scroll so you can pan left/right from anywhere without scrolling to
          the bottom. Vertical scrolling stays on the page (mouse wheel works). */}
      <div
        ref={topBarRef}
        onScroll={syncFromTop}
        className="no-print sticky top-[60px] z-20 overflow-x-auto overflow-y-hidden rounded-t-lg border border-b-0 border-slate-200 bg-slate-50"
      >
        <div style={{ width: scrollW, height: 8 }} />
      </div>

      {/* Matrix — natural height so the page (and mouse wheel) scrolls vertically. */}
      <div
        ref={gridRef}
        onScroll={syncFromGrid}
        className="matrix-scroll overflow-x-auto rounded-b-xl rounded-tr-xl border border-slate-200 bg-white"
      >
        <table className="border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 min-w-[100px] border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-slate-600">
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
                className="sticky right-0 top-0 z-30 border-b border-l-2 border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-slate-600"
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
                <>
                  <tr key={room.id} className={clsx(isOpen && "bg-amber-50")}>
                    <th
                      className={clsx(
                        "sticky left-0 z-10 border-b border-r border-slate-200 px-3 py-2 text-left",
                        isOpen ? "bg-amber-50" : "bg-white",
                      )}
                    >
                      <button
                        type="button"
                        onClick={async () => {
                          await ensureSubmission();
                          handleOpenRoom(room.id);
                        }}
                        className="block w-full text-left"
                      >
                        <div className="text-sm font-bold text-slate-900">Room {room.number}</div>
                        {room.name && <div className="text-[11px] text-slate-500">{room.name}</div>}
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
                            disabled={completed}
                          />
                        </td>
                      );
                    })}
                    <td
                      className={clsx(
                        "sticky right-0 z-10 border-b border-l-2 border-slate-200 p-1 align-top",
                        isOpen ? "bg-amber-50" : "bg-white",
                      )}
                      style={{ minWidth: 220, width: 220 }}
                    >
                      <WorkflowNoteCell
                        submissionId={submissionId}
                        ensureSubmission={ensureSubmission}
                        roomId={room.id}
                        initialNote={row?.note ?? null}
                        disabled={completed}
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
                          disabled={completed}
                          onClose={() => setOpenRoomId(null)}
                          onSaved={() => {
                            handleRefresh();
                            setOpenRoomId(null);
                          }}
                        />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
