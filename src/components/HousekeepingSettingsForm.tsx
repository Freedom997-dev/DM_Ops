"use client";

import { useState, useTransition } from "react";
import { Loader2, Save, ShieldCheck } from "lucide-react";
import { updateHousekeepingSettings } from "@/lib/actions/housekeeping";

export function HousekeepingSettingsForm({
  initial,
}: {
  initial: { instructions: string };
}) {
  const [instructions, setInstructions] = useState(initial.instructions);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null); setMsg(null);
    start(async () => {
      const res = await updateHousekeepingSettings({ instructions });
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
