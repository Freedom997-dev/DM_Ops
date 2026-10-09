"use client";

import { MessageSquare } from "lucide-react";
import { MessageThread } from "./MessageThread";

// Comments on a housekeeping task or a room — the same thread engine as chats.
// Loads on open; the thread itself is created with the first comment.
export function CommentsSection({
  contextType,
  contextId,
  meId,
  canModerate,
}: {
  contextType: "HK_TASK" | "ROOM";
  contextId: string;
  meId: string;
  canModerate: boolean;
}) {
  return (
    <div className="border-t border-slate-200 pt-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
        <MessageSquare className="h-3.5 w-3.5" /> Comments
      </div>
      <div className="rounded-xl border border-slate-200 bg-white">
        <MessageThread
          key={`${contextType}:${contextId}`}
          target={{ mode: "comments", contextType, contextId }}
          meId={meId}
          initialMessages={[]}
          canSend
          canModerate={canModerate}
          compact
          emptyText="No comments yet — notes for the team about this go here."
        />
      </div>
    </div>
  );
}
