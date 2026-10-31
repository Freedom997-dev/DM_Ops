"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Hand, Loader2, X } from "lucide-react";
import { decideTakeover } from "@/lib/actions/housekeeping";
import { timeAgo } from "@/components/notifications/timeAgo";
import type { TakeoverRequestView } from "@/app/api/housekeeping/takeover-requests/route";

const POLL_MS = 15_000;
const SEEN_KEY = "dmo:takeover-later";

function readLater(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

// Managers only (mounted by the app layout): pops up whenever a housekeeper asks
// to take over someone else's room. "Later" hides the requests shown until a new
// one arrives; they stay answerable from the task on the Housekeeping board.
export function TakeoverRequestsPopup() {
  const router = useRouter();
  const [requests, setRequests] = useState<TakeoverRequestView[]>([]);
  const [later, setLater] = useState<Set<string>>(() => new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/housekeeping/takeover-requests", { cache: "no-store" });
      if (!res.ok) return;
      setRequests(((await res.json()) as { requests: TakeoverRequestView[] }).requests);
    } catch {
      // offline — try again on the next tick
    }
  }, []);

  useEffect(() => {
    setLater(readLater());
    load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const shown = requests.filter((r) => !later.has(r.id));
  if (shown.length === 0) return null;

  function snooze() {
    const next = new Set([...later, ...shown.map((r) => r.id)]);
    setLater(next);
    try {
      sessionStorage.setItem(SEEN_KEY, JSON.stringify([...next]));
    } catch {
      // private mode — it just shows again after a reload
    }
  }

  function decide(id: string, outcome: "APPROVE" | "REJECT") {
    setBusyId(id);
    setError(null);
    start(async () => {
      const res = await decideTakeover(id, outcome);
      setBusyId(null);
      if (!res.ok) setError(res.error);
      setRequests((cur) => cur.filter((r) => r.id !== id));
      router.refresh();
      load();
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="takeover-title">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
            <Hand className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="takeover-title" className="font-bold text-slate-900">
              {shown.length === 1 ? "Takeover request" : `${shown.length} takeover requests`}
            </h2>
            <p className="text-xs text-slate-500">A housekeeper wants to work on a room assigned to someone else.</p>
          </div>
        </div>

        <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
          {shown.map((r) => (
            <li key={r.id} className="space-y-2 px-5 py-4">
              <p className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{r.requestedBy}</span> asks to take{" "}
                <Link href={`/services/housekeeping?task=${r.taskId}`} onClick={snooze} className="font-semibold text-brand-600 hover:underline">
                  {r.taskLabel}
                </Link>
                {r.assignedTo && <> from <span className="font-semibold text-slate-900">{r.assignedTo}</span></>}
                <span className="text-slate-400"> · {timeAgo(r.createdAt)}</span>
              </p>
              {r.note && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm italic text-slate-600">“{r.note}”</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => decide(r.id, "APPROVE")} disabled={busyId !== null} className="btn-primary flex-1">
                  {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Approve
                </button>
                <button type="button" onClick={() => decide(r.id, "REJECT")} disabled={busyId !== null} className="btn-secondary flex-1">
                  <X className="h-4 w-4" /> Decline
                </button>
              </div>
            </li>
          ))}
        </ul>

        {error && <p className="px-5 pb-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end border-t border-slate-100 px-5 py-3">
          <button type="button" onClick={snooze} className="btn-ghost text-sm">Later</button>
        </div>
      </div>
    </div>
  );
}
