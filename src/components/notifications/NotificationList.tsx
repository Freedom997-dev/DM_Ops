"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { CheckCheck } from "lucide-react";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/actions/notifications";
import { timeAgo } from "./timeAgo";

type Item = { id: string; title: string; body: string | null; href: string | null; readAt: string | null; createdAt: string };

export function NotificationList({ items: initial }: { items: Item[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [pending, start] = useTransition();
  const unread = items.filter((i) => !i.readAt).length;

  function open(it: Item) {
    if (!it.readAt) {
      setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, readAt: new Date().toISOString() } : x)));
      start(() => markNotificationRead(it.id).then(() => undefined));
    }
    if (it.href) router.push(it.href);
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <span className="text-sm font-semibold text-slate-700">{unread ? `${unread} unread` : "All read"}</span>
        {unread > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setItems((cur) => cur.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
              start(() => markAllNotificationsRead().then(() => undefined));
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="p-8 text-center text-sm text-slate-500">No notifications yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => open(it)}
                className={clsx("flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50", !it.readAt && "bg-brand-50/50")}
              >
                <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", it.readAt ? "bg-transparent" : "bg-brand-600")} />
                <span className="min-w-0 flex-1">
                  <span className={clsx("block text-sm text-slate-900", !it.readAt && "font-semibold")}>{it.title}</span>
                  {it.body && <span className="mt-0.5 block text-xs text-slate-500">{it.body}</span>}
                </span>
                <span className="shrink-0 text-[11px] text-slate-400">{timeAgo(it.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
