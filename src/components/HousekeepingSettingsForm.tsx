"use client";

import { useState, useTransition } from "react";
import { Loader2, Save, ShieldCheck } from "lucide-react";
import { updateHousekeepingSettings } from "@/lib/actions/housekeeping";

export function HousekeepingSettingsForm({
  initial,
}: {
  initial: { instructions: string; requireRoomMedia: boolean; requireTaskMedia: boolean };
}) {
  const [instructions, setInstructions] = useState(initial.instructions);
  const [requireRoomMedia, setRequireRoomMedia] = useState(initial.requireRoomMedia);
  const [requireTaskMedia, setRequireTaskMedia] = useState(initial.requireTaskMedia);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null); setMsg(null);
    start(async () => {
      const res = await updateHousekeepingSettings({ instructions, requireRoomMedia, requireTaskMedia });
      if (!res.ok) { setError(res.error); return; }
      setMsg("Saved.");
    });
  }

  return (
    <div className="card space-y-5 p-6">
      <div className="flex items-start gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <span className="font-semibold">Photos and videos are kept until someone deletes them.</span>
          <span className="block text-emerald-800">
            They stay with each room&rsquo;s history (approved or sent back). An admin can delete a single
            photo from its viewer, or a manager can delete a whole task.
          </span>
        </span>
      </div>

      <div className="space-y-3">
        <div className="label">Photo / video evidence</div>
        <Toggle
          checked={requireRoomMedia}
          onChange={setRequireRoomMedia}
          title="Required to submit a room for inspection"
          hint={requireRoomMedia
            ? "Housekeepers must add at least one photo or video before submitting a cleaned room."
            : "Optional — rooms can be submitted without photos. Inspectors see “No photos” on those rooms."}
        />
        <Toggle
          checked={requireTaskMedia}
          onChange={setRequireTaskMedia}
          title="Required to complete a daily task"
          hint={requireTaskMedia
            ? "Daily tasks (laundry, lobby…) need at least one photo or video to be marked done."
            : "Optional — daily tasks can be completed without photos."}
        />
      </div>

      <div>
        <label className="label">Cleaning instructions (shown to housekeepers)</label>
        <textarea
          className="input min-h-[90px] text-sm"
          value={instructions} onChange={(e) => setInstructions(e.target.value)}
          placeholder="e.g. Strip beds, sanitize bathroom, restock amenities, photograph the finished room."
        />
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}

      <button onClick={save} disabled={pending} className="btn-primary">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save settings
      </button>
    </div>
  );
}

function Toggle({ checked, onChange, title, hint }: { checked: boolean; onChange: (v: boolean) => void; title: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0 items-center">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={title} />
        <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-brand-600" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}
