"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { updateHousekeepingSettings } from "@/lib/actions/housekeeping";

export function HousekeepingSettingsForm({
  initial,
}: {
  initial: { deleteOnApproval: boolean; retentionDays: number; instructions: string };
}) {
  const [deleteOnApproval, setDeleteOnApproval] = useState(initial.deleteOnApproval);
  const [retentionDays, setRetentionDays] = useState(String(initial.retentionDays));
  const [instructions, setInstructions] = useState(initial.instructions);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null); setMsg(null);
    start(async () => {
      const res = await updateHousekeepingSettings({
        deleteOnApproval,
        retentionDays: parseInt(retentionDays, 10) || 7,
        instructions,
      });
      if (!res.ok) { setError(res.error); return; }
      setMsg("Saved.");
    });
  }

  return (
    <div className="card space-y-5 p-6">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={deleteOnApproval}
          onChange={(e) => setDeleteOnApproval(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300"
        />
        <span className="text-sm text-slate-700">
          <span className="font-semibold">Delete photos on approval</span>
          <span className="block text-slate-500">
            Remove a room&rsquo;s photos as soon as it&rsquo;s approved (Ready to Rent). Keeps storage on the free tier.
          </span>
        </span>
      </label>

      <div>
        <label className="label">Delete photos older than (days)</label>
        <input
          type="number" min={1} max={365} className="input w-32"
          value={retentionDays} onChange={(e) => setRetentionDays(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-500">
          Safety sweep: photos past this age are removed daily, even if not yet approved.
        </p>
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
