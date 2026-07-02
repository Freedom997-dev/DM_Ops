"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { Loader2, Check } from "lucide-react";
import { saveRowNote } from "@/lib/actions/workflows";

type Props = {
  submissionId: string | null;
  ensureSubmission: () => Promise<string | null>;
  roomId: string;
  initialNote: string | null;
  disabled?: boolean;
};

export function WorkflowNoteCell({
  submissionId,
  ensureSubmission,
  roomId,
  initialNote,
  disabled,
}: Props) {
  const [note, setNote] = useState(initialNote ?? "");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function commit() {
    if (disabled) return;
    if ((note.trim() || "") === (initialNote ?? "")) return; // no change
    setError(null);
    setSaved(false);
    startTransition(async () => {
      let sid = submissionId;
      if (!sid) {
        sid = await ensureSubmission();
        if (!sid) {
          setError("Could not start today's inspection.");
          return;
        }
      }
      const res = await saveRowNote(sid, roomId, note);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <div className="relative">
      <textarea
        rows={2}
        value={note}
        disabled={disabled || pending}
        onChange={(e) => setNote(e.target.value)}
        onBlur={commit}
        placeholder="Add a note…"
        className={clsx(
          "w-full resize-none rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 outline-none focus:border-brand-400",
          disabled && "cursor-not-allowed bg-slate-50 opacity-60",
        )}
        maxLength={1000}
      />
      <span className="pointer-events-none absolute right-1.5 top-1.5">
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
        {saved && !pending && <Check className="h-3.5 w-3.5 text-emerald-600" />}
      </span>
      {error && <p className="mt-0.5 text-[10px] text-red-600">{error}</p>}
    </div>
  );
}
