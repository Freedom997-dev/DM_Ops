"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { Loader2, SendHorizontal, Trash2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { deleteMessage, markConversationRead, postComment, sendMessage } from "@/lib/actions/messages";
import type { MessageDTO } from "@/lib/messaging/dto";

const POLL_MS = 5_000;
const MAX = 2000;

export type ThreadTarget =
  | { mode: "conversation"; conversationId: string }
  | { mode: "comments"; contextType: "HK_TASK" | "ROOM"; contextId: string };

function timeLabel(iso: string) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * Message list + composer, polled every 5 s while visible. Used for direct
 * chats, groups and announcements (`conversation`) and for task/room comments
 * (`comments` — the thread is created on the first comment).
 */
export function MessageThread({
  target,
  meId,
  initialMessages,
  initialConversationId,
  canSend,
  canModerate,
  compact,
  emptyText = "No messages yet.",
}: {
  target: ThreadTarget;
  meId: string;
  initialMessages: MessageDTO[];
  initialConversationId?: string | null;
  canSend: boolean;
  canModerate: boolean; // may delete others' messages (never in direct chats)
  compact?: boolean; // inside a panel: shorter list
  emptyText?: string;
}) {
  const toast = useToast();
  const [messages, setMessages] = useState(initialMessages);
  const [conversationId, setConversationId] = useState<string | null>(
    target.mode === "conversation" ? target.conversationId : (initialConversationId ?? null),
  );
  const [text, setText] = useState("");
  const [sending, start] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const lastAt = useRef<string | null>(initialMessages.at(-1)?.createdAt ?? null);

  const scrollDown = () => requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));

  const pollUrl = useCallback(
    (after?: string | null) => {
      const a = after ? `after=${encodeURIComponent(after)}` : "";
      return target.mode === "conversation"
        ? `/api/messages/${target.conversationId}${a ? `?${a}` : ""}`
        : `/api/messages/thread?type=${target.contextType}&id=${target.contextId}${a ? `&${a}` : ""}`;
    },
    [target],
  );

  const fetchNew = useCallback(async () => {
    try {
      const res = await fetch(pollUrl(lastAt.current), { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { messages: MessageDTO[]; conversationId?: string | null };
      if (data.conversationId) setConversationId(data.conversationId);
      if (data.messages.length) {
        setMessages((cur) => {
          const seen = new Set(cur.map((m) => m.id));
          return [...cur, ...data.messages.filter((m) => !seen.has(m.id))];
        });
        lastAt.current = data.messages.at(-1)!.createdAt;
        scrollDown();
      }
    } catch {
      // offline — try again next tick
    }
  }, [pollUrl]);

  // Mark read on open and whenever new messages arrive.
  useEffect(() => {
    if (conversationId && messages.some((m) => m.senderId !== meId)) markConversationRead(conversationId);
  }, [conversationId, messages, meId]);

  useEffect(() => {
    scrollDown();
    // Comments start empty and load here; conversations arrive pre-loaded.
    if (target.mode === "comments") fetchNew();
    const id = setInterval(() => document.visibilityState === "visible" && fetchNew(), POLL_MS);
    return () => clearInterval(id);
  }, [fetchNew, target.mode]);

  function send() {
    const body = text.trim();
    if (!body) return;
    start(async () => {
      const res =
        target.mode === "conversation"
          ? await sendMessage(target.conversationId, body)
          : await postComment(target.contextType, target.contextId, body);
      if (!res.ok) {
        toast.show(res.error, "error");
        return;
      }
      if ("conversationId" in res && res.conversationId) setConversationId(res.conversationId);
      setText("");
      await fetchNew();
    });
  }

  async function remove(id: string) {
    if (!confirm("Delete this message?")) return;
    const res = await deleteMessage(id);
    if (!res.ok) return toast.show(res.error, "error");
    setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, body: null } : m)));
  }

  return (
    <div className="flex flex-col">
      <div ref={listRef} className={clsx("space-y-2 overflow-y-auto p-3", compact ? "max-h-72" : "max-h-[60vh] min-h-[40vh]")}>
        {messages.length === 0 && <p className="py-6 text-center text-sm text-slate-400">{emptyText}</p>}
        {messages.map((m, i) => {
          const mine = m.senderId === meId;
          const showName = !mine && (i === 0 || messages[i - 1].senderId !== m.senderId);
          const deletable = m.body !== null && (mine || canModerate);
          return (
            <div key={m.id} className={clsx("group flex flex-col", mine ? "items-end" : "items-start")}>
              {showName && <span className="mb-0.5 px-1 text-[11px] font-semibold text-slate-500">{m.senderName}</span>}
              <div className="flex max-w-[85%] items-end gap-1">
                {mine && deletable && (
                  <button type="button" onClick={() => remove(m.id)} className="invisible rounded p-1 text-slate-300 hover:text-red-600 group-hover:visible" aria-label="Delete message">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                <div
                  className={clsx(
                    "whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm",
                    m.body === null
                      ? "bg-slate-50 italic text-slate-400"
                      : mine
                        ? "rounded-br-md bg-brand-600 text-white"
                        : "rounded-bl-md bg-slate-100 text-slate-900",
                  )}
                >
                  {m.body ?? "Message deleted"}
                </div>
                {!mine && deletable && (
                  <button type="button" onClick={() => remove(m.id)} className="invisible rounded p-1 text-slate-300 hover:text-red-600 group-hover:visible" aria-label="Delete message">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <span className="mt-0.5 px-1 text-[10px] text-slate-400">{timeLabel(m.createdAt)}</span>
            </div>
          );
        })}
      </div>

      {canSend && (
        <div className="flex items-end gap-2 border-t border-slate-100 p-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={target.mode === "comments" ? "Add a comment…" : "Write a message…"}
            className="input max-h-32 min-h-[42px] flex-1 resize-y"
            aria-label="Message"
          />
          <button type="button" onClick={send} disabled={sending || !text.trim()} className="btn-primary h-[42px] px-3" aria-label="Send">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
