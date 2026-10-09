"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { MessageSquare } from "lucide-react";
import { COUNTS_EVENT, type CountsDetail } from "@/components/notifications/NotificationBell";

// Header link to /messages with an unread-chats badge (count comes from the bell's poll).
export function MessagesButton() {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const on = (e: Event) => setCount((e as CustomEvent<CountsDetail>).detail.messagesUnread);
    window.addEventListener(COUNTS_EVENT, on);
    return () => window.removeEventListener(COUNTS_EVENT, on);
  }, []);

  return (
    <Link
      href="/messages"
      className={clsx(
        "relative rounded-xl p-2 hover:bg-slate-100",
        pathname.startsWith("/messages") ? "bg-brand-50 text-brand-700" : "text-slate-600",
      )}
      aria-label={count ? `Messages, ${count} unread` : "Messages"}
    >
      <MessageSquare className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
