"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { COUNTS_EVENT, type CountsDetail } from "@/components/notifications/NotificationBell";

// On the conversation list: re-render when the header poll sees the unread-chats count change.
export function RefreshOnNewMessages() {
  const router = useRouter();
  const last = useRef<number | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const n = (e as CustomEvent<CountsDetail>).detail.messagesUnread;
      if (last.current !== null && n !== last.current) router.refresh();
      last.current = n;
    };
    window.addEventListener(COUNTS_EVENT, on);
    return () => window.removeEventListener(COUNTS_EVENT, on);
  }, [router]);
  return null;
}
