"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { useToast } from "@/components/Toast";
import { startDirectChat } from "@/lib/actions/messages";

export function StaffPicker({ staff }: { staff: { id: string; name: string; roles: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, start] = useTransition();
  const shown = staff.filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase()));

  function pick(id: string) {
    setBusyId(id);
    start(async () => {
      const res = await startDirectChat(id);
      if (res.ok) router.push(`/messages/${res.conversationId}`);
      else {
        toast.show(res.error, "error");
        setBusyId(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} className="input pl-9" placeholder="Search staff" autoFocus />
      </label>
      <ul className="card divide-y divide-slate-100 overflow-hidden">
        {shown.length === 0 && <li className="p-6 text-center text-sm text-slate-500">No one matches.</li>}
        {shown.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => pick(s.id)} disabled={!!busyId} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-sm font-bold uppercase text-brand-700">{s.name.slice(0, 2)}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">{s.name}</span>
                <span className="block text-xs text-slate-500">{s.roles || "No role"}</span>
              </span>
              {busyId === s.id && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
