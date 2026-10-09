import Link from "next/link";
import clsx from "clsx";
import { BellOff, Megaphone, MessageSquarePlus, Users } from "lucide-react";
import { requireUser, can } from "@/lib/session";
import { listConversations } from "@/lib/messaging/server";
import { RefreshOnNewMessages } from "@/components/messages/RefreshOnNewMessages";
import { timeAgo } from "@/components/notifications/timeAgo";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = { DIRECT: "Direct", GROUP: "Group", ANNOUNCEMENT: "Announcement", THREAD: "Comments" };

export default async function MessagesPage() {
  const me = await requireUser();
  const conversations = await listConversations(me);
  const canAnnounce = can(me, "comms:announcements:send");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <RefreshOnNewMessages />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Messages</h1>
          <p className="text-sm text-slate-500">Private to staff. Groups follow your roles.</p>
        </div>
        <div className="flex gap-2">
          {canAnnounce && (
            <Link href="/messages/announce" className="btn-secondary">
              <Megaphone className="h-4 w-4" /> Announcement
            </Link>
          )}
          <Link href="/messages/new" className="btn-primary">
            <MessageSquarePlus className="h-4 w-4" /> New message
          </Link>
        </div>
      </div>

      <ul className="card divide-y divide-slate-100 overflow-hidden">
        {conversations.length === 0 && <li className="p-8 text-center text-sm text-slate-500">No conversations yet.</li>}
        {conversations.map((c) => (
          <li key={c.id}>
            <Link href={`/messages/${c.id}`} className={clsx("flex items-center gap-3 px-4 py-3 hover:bg-slate-50", c.unread > 0 && "bg-brand-50/40")}>
              <span
                className={clsx(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold uppercase",
                  c.kind === "ANNOUNCEMENT" ? "bg-amber-100 text-amber-700" : c.kind === "GROUP" ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-700",
                )}
              >
                {c.kind === "ANNOUNCEMENT" ? <Megaphone className="h-5 w-5" /> : c.kind === "GROUP" ? <Users className="h-5 w-5" /> : c.title.slice(0, 2)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className={clsx("truncate text-sm text-slate-900", c.unread > 0 && "font-bold")}>{c.title}</span>
                  {c.kind !== "DIRECT" && <span className="chip-slate shrink-0 text-[10px]">{KIND_LABEL[c.kind]}</span>}
                  {c.muted && <BellOff className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="Muted" />}
                </span>
                <span className="block truncate text-xs text-slate-500">{c.preview ?? "No messages yet"}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {c.lastMessageAt && <span className="text-[11px] text-slate-400">{timeAgo(c.lastMessageAt)}</span>}
                {c.unread > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white">
                    {c.unread > 99 ? "99+" : c.unread}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
