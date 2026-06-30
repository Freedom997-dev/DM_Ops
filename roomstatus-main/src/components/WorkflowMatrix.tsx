"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Check, Loader2, RefreshCw } from "lucide-react";
import { WorkflowCellButton, type CellStatus } from "@/components/WorkflowCellButton";
import { WorkflowMatrixRowPanel, type RowImage } from "@/components/WorkflowMatrixRowPanel";
import { getOrCreateTodaySubmission, markSubmissionComplete } from "@/lib/actions/workflows";

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
      issue = 0,
      na = 0;
    for (const c of seedCells) {
      if (c.status === "OK") ok++;
      else if (c.status === "ISSUE") issue++;
      else if (c.status === "NA") na++;
    }
    const total = rooms.length * items.length;
    const marked = ok + issue + na;
    return { ok, issue, na, total, marked, unmarked: total - marked };
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

  function handleRefresh() {
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* Counts */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium">
        <span className="inline-flex items-center gap-1 text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> {counts.ok} OK
        </span>
        <span className="inline-flex items-center gap-1 text-red-700">
          <span className="h-2 w-2 rounded-full bg-red-500" /> {counts.issue} Issue
        </span>
        <span className="inline-flex items-center gap-1 text-slate-500">
          <span className="h-2 w-2 rounded-full bg-slate-400" /> {counts.na} N/A
        </span>
        <span className="inline-flex items-center gap-1 text-slate-400">
          <span className="h-2 w-2 rounded-full bg-slate-200" /> {counts.unmarked} unmarked
        </span>
      </div>

      {/* Matrix */}
      <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 min-w-[100px] border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-slate-600">
                Room
              </th>
              {items.map((item) => (
                <th
                  key={item.id}
                  className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-1 py-1 text-xs text-slate-600"
                  style={{ minWidth: 84 }}
                >
                  <div className="flex h-24 items-end justify-center px-0.5">
                    <span
                      className="whitespace-nowrap text-[11px] font-semibold"
                      style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                    >
                      {item.text}
                    </span>
                  </div>
                </th>
              ))}
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
                        <td key={item.id} className="border-b border-slate-100 p-0">
                          <WorkflowCellButton
                            submissionId={submissionId ?? ""}
                            roomId={room.id}
                            itemId={item.id}
                            initialStatus={cell?.status ?? null}
                            lastUpdatedBy={cell?.lastUpdatedBy ?? null}
                            disabled={completed || !submissionId}
                            onChange={async () => {
                              if (!submissionId) await ensureSubmission();
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                  {isOpen && submissionId && (
                    <tr>
                      <td colSpan={items.length + 1} className="border-b border-slate-200 bg-amber-50 p-3">
                        <WorkflowMatrixRowPanel
                          submissionId={submissionId}
                          roomId={room.id}
                          initialNote={row?.note ?? null}
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
