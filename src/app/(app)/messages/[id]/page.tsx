import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle, Megaphone } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser, can } from "@/lib/session";
import { canAccess, conversationTitle, memberIds, threadHref } from "@/lib/messaging/server";
import { loadMessages } from "@/lib/messaging/dto";
import { MessageThread } from "@/components/messages/MessageThread";
import { MuteChatToggle } from "@/components/messages/MuteChatToggle";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const c = await prisma.conversation.findUnique({ where: { id: (await params).id } });
  if (!c || !canAccess(me, c)) notFound();

  const [title, messages, myRead] = await Promise.all([
    conversationTitle(c, me),
    loadMessages(c.id),
    prisma.conversationRead.findUnique({ where: { conversationId_userId: { conversationId: c.id, userId: me.id } } }),
  ]);
  const isAnnouncement = c.kind === "ANNOUNCEMENT";

  // "Seen by" — for the announcement's author (and Super Admin).
  let seen: { name: string; seen: boolean }[] | null = null;
  if (isAnnouncement && (c.createdById === me.id || me.isSuperAdmin)) {
    const ids = (await memberIds(c)).filter((id) => id !== c.createdById);
    const [users, reads] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.conversationRead.findMany({ where: { conversationId: c.id, userId: { in: ids } }, select: { userId: true, lastReadAt: true } }),
    ]);
    const postedAt = messages[0] ? new Date(messages[0].createdAt) : c.createdAt;
    const readBy = new Set(reads.filter((r) => r.lastReadAt >= postedAt).map((r) => r.userId));
    seen = users.map((u) => ({ name: u.name, seen: readBy.has(u.id) })).sort((a, b) => Number(b.seen) - Number(a.seen));
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Link href="/messages" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Messages
        </Link>
        {!isAnnouncement && <MuteChatToggle conversationId={c.id} muted={myRead?.muted ?? false} />}
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          {isAnnouncement && <Megaphone className="h-5 w-5 text-amber-600" />}
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-slate-900">{title}</h1>
            <p className="text-xs text-slate-500">
              {c.kind === "DIRECT" && "Private — only the two of you can see this."}
              {c.kind === "GROUP" && "Group — everyone in this role can read and post."}
              {isAnnouncement && "Announcement — read-only."}
              {c.kind === "THREAD" && (
                <>
                  Comments ·{" "}
                  <Link href={threadHref(c)} className="font-semibold text-brand-600 hover:underline">
                    open the {c.contextType === "ROOM" ? "room" : "task"}
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
        <MessageThread
          target={{ mode: "conversation", conversationId: c.id }}
          meId={me.id}
          initialMessages={messages}
          canSend={!isAnnouncement}
          canModerate={c.kind !== "DIRECT" && can(me, "comms:messages:moderate")}
        />
      </div>

      {seen && (
        <div className="card p-4">
          <h2 className="mb-2 text-sm font-bold text-slate-900">
            Seen by {seen.filter((s) => s.seen).length} of {seen.length}
          </h2>
          <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            {seen.map((s) => (
              <li key={s.name} className="flex items-center gap-1.5 text-slate-700">
                {s.seen ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Seen" /> : <Circle className="h-4 w-4 text-slate-300" aria-label="Not seen yet" />}
                {s.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
