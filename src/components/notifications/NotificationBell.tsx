"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/actions/notifications";
import { timeAgo } from "./timeAgo";

type Item = { id: string; title: string; body: string | null; href: string | null; readAt: string | null; createdAt: string };

const POLL_MS = 30_000;

// The bell does the only header poll; it re-broadcasts the unread-chats count
// so the Messages button (and an open /messages list) needn't poll separately.
export const COUNTS_EVENT = "dmo:counts";
export type CountsDetail = { unread: number; messagesUnread: number };

// Header bell: unread badge (polled every 30 s and when the tab regains focus)
// and a panel with the latest 20 notifications.
export function NotificationBell() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (list: boolean) => {
    try {
      const res = await fetch(`/api/notifications${list ? "?list=1" : ""}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { unread: number; messagesUnread: number; items: Item[] | null };
      setUnread(data.unread);
      window.dispatchEvent(
        new CustomEvent<CountsDetail>(COUNTS_EVENT, { detail: { unread: data.unread, messagesUnread: data.messagesUnread } }),
      );
      if (data.items) setItems(data.items);
    } catch {
      // offline — keep the last count
    }
  }, []);

  useEffect(() => {
    load(false);
    const id = setInterval(() => document.visibilityState === "visible" && load(false), POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && load(false);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load(true);
    const onDown = (e: MouseEvent) => !wrapRef.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, load]);

  async function openItem(it: Item) {
    setOpen(false);
    if (!it.readAt) {
      setUnread((n) => Math.max(0, n - 1));
      await markNotificationRead(it.id);
    }
    if (it.href) router.push(it.href);
  }

  async function readAll() {
    setUnread(0);
    setItems((cur) => cur?.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })) ?? cur);
    await markAllNotificationsRead();
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-xl p-2 text-slate-600 hover:bg-slate-100"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-2 top-16 z-50 max-h-[70vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="text-sm font-bold text-slate-900">Notifications</span>
            {unread > 0 && (
              <button type="button" onClick={readAll} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[calc(70vh-6rem)] overflow-y-auto">
            {items === null ? (
              <div className="flex justify-center p-6 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">You&apos;re all caught up.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((it) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => openItem(it)}
                      className={clsx("flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50", !it.readAt && "bg-brand-50/50")}
                    >
                      <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", it.readAt ? "bg-transparent" : "bg-brand-600")} />
                      <span className="min-w-0 flex-1">
                        <span className={clsx("block text-sm text-slate-900", !it.readAt && "font-semibold")}>{it.title}</span>
                        {it.body && <span className="mt-0.5 block line-clamp-2 text-xs text-slate-500">{it.body}</span>}
                        <span className="mt-0.5 block text-[11px] text-slate-400">{timeAgo(it.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-2.5 text-center text-xs font-semibold text-brand-600 hover:bg-slate-50">
            See all · Notification settings
          </Link>
        </div>
      )}
    </div>
  );
}
