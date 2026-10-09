"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { setNotificationMuted } from "@/lib/actions/notifications";

type Event = { type: string; group: string; label: string; description: string; mutable: boolean };

// Per-type on/off for the signed-in user (stored as NotificationMute rows).
export function MuteSettings({ events, muted: initial }: { events: Event[]; muted: string[] }) {
  const toast = useToast();
  const [muted, setMuted] = useState(new Set(initial));
  const [pending, start] = useTransition();
  const groups = [...new Set(events.map((e) => e.group))];

  function toggle(type: string, on: boolean) {
    setMuted((cur) => {
      const next = new Set(cur);
      if (on) next.delete(type);
      else next.add(type);
      return next;
    });
    start(async () => {
      const res = await setNotificationMuted(type, !on);
      if (!res.ok) toast.show(res.error, "error");
    });
  }

  return (
    <div className="card divide-y divide-slate-100">
      <div className="px-4 py-3 text-sm font-semibold text-slate-700">What to notify me about</div>
      {groups.map((g) => (
        <div key={g} className="px-4 py-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{g}</div>
          <ul className="space-y-2">
            {events
              .filter((e) => e.group === g)
              .map((e) => {
                const on = !muted.has(e.type);
                return (
                  <li key={e.type} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-slate-900">{e.label}</div>
                      <div className="text-xs text-slate-500">
                        {e.description}
                        {!e.mutable && " Always on for your security."}
                      </div>
                    </div>
                    <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={on}
                        disabled={!e.mutable || pending}
                        onChange={(ev) => toggle(e.type, ev.target.checked)}
                        aria-label={e.label}
                      />
                      <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-brand-600 peer-disabled:opacity-50" />
                      <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
                    </label>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}
