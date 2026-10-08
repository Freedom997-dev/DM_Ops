"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

// Which day the sheet is for — big and unmissable — plus ◀ / ▶ and a calendar
// picker to change day. The forward arrow and the picker stop at today.
export function WorkflowDayBar({
  workflowSlug,
  dateKey,
  dateLabel,
  todayKey,
  prevKey,
  nextKey,
  isToday,
}: {
  workflowSlug: string;
  dateKey: string; // YYYY-MM-DD being viewed
  dateLabel: string; // e.g. "Thursday, October 8, 2026"
  todayKey: string;
  prevKey: string;
  nextKey: string | null; // null when viewing today
  isToday: boolean;
}) {
  const router = useRouter();
  const hrefFor = (key: string) =>
    key === todayKey ? `/services/${workflowSlug}` : `/services/${workflowSlug}?date=${key}`;

  const arrow = "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50";

  return (
    <div
      className={clsx(
        "no-print flex items-center gap-2 rounded-2xl border p-2 sm:gap-3",
        isToday ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/70",
      )}
    >
      <Link href={hrefFor(prevKey)} className={arrow} aria-label="Previous day">
        <ChevronLeft className="h-5 w-5" />
      </Link>

      <div className="min-w-0 flex-1 text-center">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span
            className={clsx(
              "rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
              isToday ? "bg-emerald-600 text-white" : "bg-amber-500 text-white",
            )}
          >
            {isToday ? "Today" : "Past date"}
          </span>
          <span className="text-base font-bold text-slate-900 sm:text-lg">{dateLabel}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-3 text-xs">
          <label className="inline-flex items-center gap-1 font-medium text-brand-600">
            <CalendarDays className="h-3.5 w-3.5" />
            <input
              type="date"
              className="rounded-md border border-slate-200 bg-white px-1 py-0.5 text-xs text-slate-700"
              value={dateKey}
              max={todayKey}
              onChange={(e) => e.target.value && router.push(hrefFor(e.target.value))}
              aria-label="Pick a day"
            />
          </label>
          {!isToday && (
            <Link href={hrefFor(todayKey)} className="font-semibold text-brand-600 hover:underline">
              Back to today →
            </Link>
          )}
        </div>
      </div>

      {nextKey ? (
        <Link href={hrefFor(nextKey)} className={arrow} aria-label="Next day">
          <ChevronRight className="h-5 w-5" />
        </Link>
      ) : (
        <span className={clsx(arrow, "pointer-events-none opacity-30")} aria-hidden>
          <ChevronRight className="h-5 w-5" />
        </span>
      )}
    </div>
  );
}
