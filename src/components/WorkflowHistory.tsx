"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Calendar, DoorOpen, TriangleAlert, User2 } from "lucide-react";

export type HistorySubmission = {
  id: string;
  date: string; // ISO
  status: "IN_PROGRESS" | "COMPLETED";
  createdBy: string;
  roomsTouched: number;
  issueCount: number;
};

export type RoomHistoryEntry = {
  submissionId: string;
  date: string;
  createdBy: string;
  cellsTouched: number;
  issueCount: number;
};

type Props = {
  workflowSlug: string;
  submissions: HistorySubmission[];
  rooms: { id: string; number: string; name: string | null }[];
  // Map of roomId -> entries (computed server-side)
  byRoom: Record<string, RoomHistoryEntry[]>;
};

export function WorkflowHistory({ workflowSlug, submissions, rooms, byRoom }: Props) {
  const [tab, setTab] = useState<"date" | "room">("date");
  const [selectedRoomId, setSelectedRoomId] = useState<string>(rooms[0]?.id ?? "");

  const roomEntries = useMemo(() => byRoom[selectedRoomId] ?? [], [byRoom, selectedRoomId]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("date")}
          className={clsx(
            "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
            tab === "date" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
          )}
        >
          <Calendar className="mr-1 inline h-4 w-4" />
          By date
        </button>
        <button
          type="button"
          onClick={() => setTab("room")}
          className={clsx(
            "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
            tab === "room" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
          )}
        >
          <DoorOpen className="mr-1 inline h-4 w-4" />
          By room
        </button>
      </div>

      {tab === "date" && (
        <div className="space-y-2">
          {submissions.length === 0 ? (
            <div className="card p-8 text-center text-slate-500">No submissions yet.</div>
          ) : (
            submissions.map((s) => (
              <Link
                key={s.id}
                href={`/services/${workflowSlug}?date=${encodeURIComponent(s.date.slice(0, 10))}`}
                className="card flex items-center justify-between px-4 py-3 hover:bg-slate-50"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    {new Date(s.date).toLocaleDateString(undefined, {
                      dateStyle: "full",
                    })}
                  </div>
                  <div className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <User2 className="h-3.5 w-3.5" />
                    Started by {s.createdBy} · {s.roomsTouched} room{s.roomsTouched === 1 ? "" : "s"} touched
                    {s.issueCount > 0 && (
                      <span className="ml-1 inline-flex items-center gap-0.5 text-red-600">
                        <TriangleAlert className="h-3.5 w-3.5" />
                        {s.issueCount} issue{s.issueCount === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={clsx(
                    "rounded-full px-2 py-0.5 text-xs font-semibold",
                    s.status === "COMPLETED"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700",
                  )}
                >
                  {s.status === "COMPLETED" ? "Completed" : "In progress"}
                </span>
              </Link>
            ))
          )}
        </div>
      )}

      {tab === "room" && (
        <div className="space-y-3">
          <select
            value={selectedRoomId}
            onChange={(e) => setSelectedRoomId(e.target.value)}
            className="input"
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                Room {r.number} {r.name ? `· ${r.name}` : ""}
              </option>
            ))}
          </select>

          {roomEntries.length === 0 ? (
            <div className="card p-8 text-center text-slate-500">
              No submissions touching this room yet.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {roomEntries.map((e) => (
                <li key={e.submissionId} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {new Date(e.date).toLocaleDateString(undefined, { dateStyle: "medium" })}
                      </div>
                      <div className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <User2 className="h-3.5 w-3.5" />
                        {e.createdBy} · {e.cellsTouched} cell{e.cellsTouched === 1 ? "" : "s"} marked
                        {e.issueCount > 0 && (
                          <span className="ml-1 text-red-600">· {e.issueCount} issue{e.issueCount === 1 ? "" : "s"}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
