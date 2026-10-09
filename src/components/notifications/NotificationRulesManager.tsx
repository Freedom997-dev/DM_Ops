"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Check, RotateCcw } from "lucide-react";
import { useToast } from "@/components/Toast";
import { resetNotificationRule, setNotificationRule } from "@/lib/actions/notifications";

type EventRow = {
  type: string;
  group: string;
  label: string;
  description: string;
  recipients: "direct" | "audience";
  defaultAudience: string | null;
  enabled: boolean;
  roles: string[] | null; // null = default audience
  customized: boolean;
};

export function NotificationRulesManager({ events, roles }: { events: EventRow[]; roles: { key: string; label: string }[] }) {
  const groups = [...new Set(events.map((e) => e.group))];
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g} className="card divide-y divide-slate-100">
          <div className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">{g}</div>
          {events
            .filter((e) => e.group === g)
            .map((e) => (
              <RuleRow key={e.type} event={e} roles={roles} />
            ))}
        </div>
      ))}
    </div>
  );
}

function RuleRow({ event, roles }: { event: EventRow; roles: { key: string; label: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [enabled, setEnabled] = useState(event.enabled);
  const [picked, setPicked] = useState<Set<string> | null>(event.roles ? new Set(event.roles) : null);

  function save(nextEnabled: boolean, nextRoles: Set<string> | null) {
    start(async () => {
      const res = await setNotificationRule(event.type, nextEnabled, nextRoles ? [...nextRoles] : null);
      if (!res.ok) toast.show(res.error, "error");
      else router.refresh();
    });
  }

  function toggleRole(key: string) {
    const next = new Set(picked ?? []);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPicked(next);
    if (next.size > 0) save(enabled, next);
  }

  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">{event.label}</div>
          <div className="text-xs text-slate-500">{event.description}</div>
          <div className="mt-0.5 text-xs text-slate-400">
            Goes to:{" "}
            {event.recipients === "direct"
              ? "the person it's about"
              : picked
                ? `roles: ${[...picked].map((k) => roles.find((r) => r.key === k)?.label ?? k).join(", ") || "none"}`
                : event.defaultAudience}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {event.customized && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await resetNotificationRule(event.type);
                  setPicked(null);
                  router.refresh();
                })
              }
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
              title="Reset to default"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Default
            </button>
          )}
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={enabled}
              disabled={pending}
              onChange={(ev) => {
                setEnabled(ev.target.checked);
                save(ev.target.checked, picked);
              }}
              aria-label={`${event.label} on or off`}
            />
            <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-brand-600" />
            <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
          </label>
        </div>
      </div>

      {event.recipients === "audience" && enabled && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500">Send to roles:</span>
          {roles.map((r) => {
            const on = picked ? picked.has(r.key) : false;
            return (
              <button
                key={r.key}
                type="button"
                disabled={pending}
                onClick={() => toggleRole(r.key)}
                className={clsx(
                  "chip cursor-pointer ring-1 ring-inset transition",
                  on ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-600 ring-slate-300 hover:ring-brand-400",
                )}
              >
                {on && <Check className="h-3 w-3" />}
                {r.label}
              </button>
            );
          })}
          {!picked && <span className="text-[11px] text-slate-400">(none picked = default)</span>}
        </div>
      )}
    </div>
  );
}
