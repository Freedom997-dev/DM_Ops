"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Check, Loader2, Megaphone } from "lucide-react";
import { postAnnouncement } from "@/lib/actions/messages";

const ALL = "ALL";

export function AnnouncementForm({ roles }: { roles: { key: string; label: string }[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set([ALL]));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle(key: string) {
    setPicked((cur) => {
      if (key === ALL) return new Set([ALL]);
      const next = new Set(cur);
      next.delete(ALL);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next.size ? next : new Set([ALL]);
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await postAnnouncement({ title, body, roles: [...picked] });
      if (res.ok) router.push(`/messages/${res.conversationId}`);
      else setError(res.error);
    });
  }

  const chip = (key: string, label: string) => {
    const on = picked.has(key);
    return (
      <button
        key={key}
        type="button"
        onClick={() => toggle(key)}
        className={clsx(
          "chip cursor-pointer ring-1 ring-inset transition",
          on ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-600 ring-slate-300 hover:ring-brand-400",
        )}
      >
        {on && <Check className="h-3 w-3" />}
        {label}
      </button>
    );
  };

  return (
    <form onSubmit={submit} className="card space-y-4 p-5">
      <div>
        <label className="label" htmlFor="ann-title">Title</label>
        <input id="ann-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required className="input" placeholder="e.g. Pool closed today" />
      </div>
      <div>
        <label className="label" htmlFor="ann-body">Message</label>
        <textarea id="ann-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} required rows={5} className="input" />
        <div className="mt-1 text-right text-[11px] text-slate-400">{body.length} / 2000</div>
      </div>
      <div>
        <span className="label">Send to</span>
        <div className="flex flex-wrap gap-2">
          {chip(ALL, "All staff")}
          {roles.map((r) => chip(r.key, r.label))}
        </div>
      </div>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
        Post announcement
      </button>
    </form>
  );
}
