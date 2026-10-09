"use client";

import { useState, useTransition } from "react";
import { Bell, BellOff } from "lucide-react";
import { setConversationMuted } from "@/lib/actions/messages";

export function MuteChatToggle({ conversationId, muted: initial }: { conversationId: string; muted: boolean }) {
  const [muted, setMuted] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const next = !muted;
        setMuted(next);
        start(() => setConversationMuted(conversationId, next).then(() => undefined));
      }}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
      title={muted ? "You won't be notified about this chat" : "Stop notifications for this chat"}
    >
      {muted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
      {muted ? "Muted" : "Mute"}
    </button>
  );
}
