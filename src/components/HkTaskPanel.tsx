"use client";

import { useState, useTransition } from "react";
import {
  Loader2, Check, X, Send, Play, CheckCircle2, Camera, Clock, ListChecks, Save, Minus, Trash2, ImageOff,
} from "lucide-react";
import clsx from "clsx";
import { HkMediaPicker } from "@/components/HkMediaPicker";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import {
  startTask, submitForInspection, completeGeneralTask, reviewTask, saveTaskItems,
  deleteHousekeepingTask,
} from "@/lib/actions/housekeeping";
import { HK_STATUS_META } from "@/lib/housekeeping";
import { buildTimeline, type HkTaskView, type HkSubtask, type HkSubtaskStatus } from "@/lib/hk-view";

const DOT_TONE: Record<string, string> = {
  slate: "bg-slate-400", amber: "bg-amber-500", sky: "bg-sky-500",
  violet: "bg-violet-500", emerald: "bg-emerald-500", red: "bg-red-500",
};

const SUBTASK_CHOICES: { value: HkSubtaskStatus; label: string; on: string }[] = [
  { value: "DONE", label: "Done", on: "bg-emerald-600 text-white border-emerald-600" },
  { value: "NOT_DONE", label: "Not Done", on: "bg-red-600 text-white border-red-600" },
  { value: "NA", label: "N/A", on: "bg-slate-500 text-white border-slate-500" },
];

function fmt(ts: string) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export function HkTaskPanel({
  task,
  caps,
  onDone,
}: {
  task: HkTaskView;
  caps: { submit: boolean; review: boolean; manage: boolean };
  onDone: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();

  // Local subtask edit state (id -> {status, note}).
  const [subs, setSubs] = useState<Record<string, { status: HkSubtaskStatus; note: string | null }>>(
    () => Object.fromEntries(task.subtasks.map((s) => [s.id, { status: s.status, note: s.note }])),
  );

  const isRoom = task.kind === "ROOM_CLEANING";
  const timeline = buildTimeline(task);
  const editable =
    caps.submit && (task.status === "READY_TO_CLEAN" || task.status === "IN_PROGRESS" || task.status === "TODO");
  const images = task.photos.filter((p) => p.mediaType === "IMAGE");

  function setSub(id: string, patch: Partial<{ status: HkSubtaskStatus; note: string | null }>) {
    setSubs((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
    setSaved(false);
  }

  function persistSubtasks() {
    return saveTaskItems(
      task.id,
      task.subtasks.map((s) => ({ id: s.id, status: subs[s.id].status, note: subs[s.id].note })),
    );
  }

  function saveChecklist() {
    setError(null);
    start(async () => {
      const res = await persistSubtasks();
      if (!res.ok) { setError(res.error); return; }
      setSaved(true);
    });
  }

  function act(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) { setError(res.error); return; }
      onDone();
    });
  }

  function doDelete() {
    setError(null);
    start(async () => {
      const res = await deleteHousekeepingTask(task.id);
      if (!res.ok) { setError(res.error); return; }
      onDone();
    });
  }

  function doSubmit() {
    setError(null);
    if (isRoom && files.length === 0) { setError("Add at least one photo or video of the cleaned room."); return; }
    const form = new FormData();
    form.set("taskId", task.id);
    files.forEach((f, i) => form.append(`media-${i}`, f, f.name));
    start(async () => {
      // Persist checklist first, then submit/complete.
      if (task.subtasks.length > 0) {
        const s = await persistSubtasks();
        if (!s.ok) { setError(s.error); return; }
      }
      const res = isRoom ? await submitForInspection(form) : await completeGeneralTask(form);
      if (!res.ok) { setError(res.error); return; }
      onDone();
    });
  }

  return (
    <div className="space-y-4 rounded-b-2xl border-x border-b border-slate-200 bg-slate-50/70 p-4">
      {task.reviewNote && task.status === "READY_TO_CLEAN" && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <span className="font-semibold">Sent back:</span> {task.reviewNote}
        </div>
      )}

      {/* --- Subtask checklist --- */}
      {task.subtasks.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
              <ListChecks className="h-3.5 w-3.5" /> Checklist
            </div>
            {editable && (
              <button type="button" onClick={saveChecklist} disabled={pending}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline disabled:opacity-50">
                {saved ? <><Check className="h-3.5 w-3.5" /> Saved</> : <><Save className="h-3.5 w-3.5" /> Save</>}
              </button>
            )}
          </div>
          <ul className="space-y-2">
            {task.subtasks.map((s) => (
              <SubtaskRow
                key={s.id}
                subtask={s}
                value={subs[s.id]}
                editable={editable}
                onStatus={(status) => setSub(s.id, { status })}
                onNote={(n) => setSub(s.id, { note: n })}
              />
            ))}
          </ul>
        </div>
      )}

      {/* --- Media (photos + videos) --- */}
      {task.photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {task.photos.map((p) =>
            p.mediaType === "VIDEO" ? (
              <video key={p.id} src={p.url} controls className="h-24 w-32 rounded-xl border border-slate-200 bg-black object-cover" />
            ) : (
              <button
                key={p.id}
                type="button"
                onClick={() => setLightbox(images.findIndex((im) => im.id === p.id))}
                className="h-20 w-20 overflow-hidden rounded-xl border border-slate-200 ring-1 ring-transparent transition hover:ring-brand-300"
              >
                <Thumb url={p.url} />
              </button>
            ),
          )}
        </div>
      )}

      {/* --- Actions --- */}
      {caps.submit && (task.status === "READY_TO_CLEAN" || task.status === "TODO") && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => act(() => startTask(task.id))} disabled={pending} className="btn-primary">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {isRoom ? "Start cleaning" : "Start task"}
          </button>
        </div>
      )}

      {caps.submit && (task.status === "IN_PROGRESS" || task.status === "READY_TO_CLEAN" || task.status === "TODO") && (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <Camera className="h-3.5 w-3.5" />
            {isRoom ? "Photos / videos of the cleaned room" : "Photos / videos (optional)"}
          </div>
          <HkMediaPicker id={task.id} files={files} onChange={setFiles} />
          <button type="button" onClick={doSubmit} disabled={pending} className="btn-primary">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : isRoom ? <Send className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {isRoom ? "Submit for inspection" : "Mark done"}
          </button>
        </div>
      )}

      {caps.review && task.status === "READY_FOR_INSPECTION" && (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <textarea
            className="input min-h-[56px] text-sm"
            placeholder="Note (required to send back)…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={pending}
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => act(() => reviewTask(task.id, "APPROVE", note))} disabled={pending} className="btn-primary">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Approve
            </button>
            <button type="button" onClick={() => act(() => reviewTask(task.id, "REJECT", note))} disabled={pending} className="btn-danger">
              <X className="h-4 w-4" /> Send back
            </button>
          </div>
        </div>
      )}

      {caps.manage && (
        <div className="border-t border-slate-200 pt-3">
          {confirmDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600">Delete this task permanently?</span>
              <button type="button" onClick={doDelete} disabled={pending} className="btn-danger">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} disabled={pending} className="btn-secondary">
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 hover:underline"
            >
              <Trash2 className="h-4 w-4" /> Delete task
            </button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}

      {/* --- Timeline --- */}
      {timeline.length > 0 && (
        <div className="border-t border-slate-200 pt-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
            <Clock className="h-3.5 w-3.5" /> Activity
          </div>
          <ol className="space-y-2">
            {timeline.map((e, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT_TONE[e.tone])} />
                <div className="flex-1">
                  <span className="text-slate-700">{e.label}</span>
                  {e.who && <span className="text-slate-500"> · {e.who}</span>}
                </div>
                <span className="shrink-0 text-xs text-slate-400">{fmt(e.at)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {lightbox !== null && lightbox >= 0 && (
        <PhotoLightbox
          images={images}
          startIndex={lightbox}
          isAdmin={false}
          onClose={() => setLightbox(null)}
          onDeleted={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

// --- Photo thumbnail with a graceful fallback when the file is missing or a
//     signed URL has expired (F5) ---
function Thumb({ url }: { url: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-100 text-slate-400">
        <ImageOff className="h-5 w-5" />
        <span className="text-[10px]">Unavailable</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-full w-full object-cover" onError={() => setBroken(true)} />
  );
}

// --- One checklist subtask row ---
function SubtaskRow({
  subtask, value, editable, onStatus, onNote,
}: {
  subtask: HkSubtask;
  value: { status: HkSubtaskStatus; note: string | null };
  editable: boolean;
  onStatus: (s: HkSubtaskStatus) => void;
  onNote: (n: string) => void;
}) {
  const [showNote, setShowNote] = useState(!!value.note);
  const activeMeta = SUBTASK_CHOICES.find((c) => c.value === value.status);

  return (
    <li className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-slate-700">{subtask.label}</span>
        {editable ? (
          <div className="flex shrink-0 gap-1">
            {SUBTASK_CHOICES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => onStatus(value.status === c.value ? "PENDING" : c.value)}
                className={clsx(
                  "rounded-lg border px-2 py-0.5 text-[11px] font-semibold transition",
                  value.status === c.value ? c.on : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        ) : (
          <span className={clsx(
            "shrink-0 rounded-lg border px-2 py-0.5 text-[11px] font-semibold",
            value.status === "DONE" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : value.status === "NOT_DONE" ? "border-red-200 bg-red-50 text-red-700"
              : value.status === "NA" ? "border-slate-200 bg-slate-50 text-slate-500"
              : "border-slate-200 bg-white text-slate-400",
          )}>
            {activeMeta?.label ?? "—"}
          </span>
        )}
      </div>

      {editable ? (
        showNote || value.note ? (
          <input
            className="input mt-2 text-sm"
            placeholder="Note (optional)…"
            value={value.note ?? ""}
            onChange={(e) => onNote(e.target.value)}
          />
        ) : (
          <button type="button" onClick={() => setShowNote(true)}
            className="mt-1 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
            <Minus className="h-3 w-3" /> Add note
          </button>
        )
      ) : (
        value.note && <p className="mt-1 text-xs italic text-slate-500">“{value.note}”</p>
      )}
    </li>
  );
}
