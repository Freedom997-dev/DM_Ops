"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { BarChart3, Calendar, ChevronRight, Lock, LockOpen, TriangleAlert, User2 } from "lucide-react";
import { WorkflowPerformance } from "@/components/WorkflowPerformance";
import type { WorkflowPerformance as PerformanceData } from "@/lib/workflow-performance";
import { formatBusinessDate } from "@/lib/business-date";

export type HistorySubmission = {
  id: string;
  date: string; // ISO
  status: "IN_PROGRESS" | "COMPLETED";
  createdBy: string;
  roomsTouched: number;
  issueCount: number;
  unlocked: boolean; // past day currently unlocked by a manager
};

export type HistoryDay = {
  dateKey: string; // YYYY-MM-DD
  date: string; // ISO (UTC midnight)
  submission: HistorySubmission | null; // null = no inspection that day
};

const PAGE = 30;

type Props = {
  workflowSlug: string;
  today: HistoryDay;
  pastDays: HistoryDay[]; // newest first, including missed days
  view: "date" | "performance";
  canPerformance: boolean; // workflows:performance:view
  performance: PerformanceData | null; // only loaded on the Performance tab
  canRoomHistory: boolean;
};

export function WorkflowHistory({ workflowSlug, today, pastDays, view, canPerformance, performance, canRoomHistory }: Props) {
  const [shown, setShown] = useState(PAGE);
  const tabClass = (on: boolean) =>
    clsx(
      "inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-semibold transition",
      on ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
    );

  return (
    <div className="space-y-4">
      {canPerformance && (
        <div className="flex gap-2">
          <Link href={`/services/${workflowSlug}/history`} className={tabClass(view === "date")}>
            <Calendar className="mr-1 h-4 w-4" />
            By date
          </Link>
          <Link href={`/services/${workflowSlug}/history?view=performance`} className={tabClass(view === "performance")}>
            <BarChart3 className="mr-1 h-4 w-4" />
            Performance
          </Link>
        </div>
      )}

      {view === "date" && (
        <div className="space-y-2">
          <TodayCard workflowSlug={workflowSlug} day={today} />

          {pastDays.length > 0 && (
            <h2 className="px-1 pt-3 text-xs font-bold uppercase tracking-wide text-slate-400">Earlier days</h2>
          )}
          {pastDays.slice(0, shown).map((d) => (
            <PastDayRow key={d.dateKey} workflowSlug={workflowSlug} day={d} />
          ))}
          {shown < pastDays.length && (
            <button type="button" onClick={() => setShown((n) => n + PAGE)} className="btn-secondary w-full">
              Show older days ({pastDays.length - shown} more)
            </button>
          )}
        </div>
      )}

      {view === "performance" && performance && (
        <WorkflowPerformance workflowSlug={workflowSlug} data={performance} canRoomHistory={canRoomHistory} />
      )}
    </div>
  );
}

function Summary({ s }: { s: HistorySubmission }) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1 text-xs text-slate-500">
      <User2 className="h-3.5 w-3.5" />
      Started by {s.createdBy} · {s.roomsTouched} room{s.roomsTouched === 1 ? "" : "s"} touched
      {s.issueCount > 0 && (
        <span className="ml-1 inline-flex items-center gap-0.5 text-red-600">
          <TriangleAlert className="h-3.5 w-3.5" />
          {s.issueCount} issue{s.issueCount === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

function TodayCard({ workflowSlug, day }: { workflowSlug: string; day: HistoryDay }) {
  const s = day.submission;
  const done = s?.status === "COMPLETED";
  return (
    <div className="card border-2 border-emerald-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
              Today
            </span>
            <span className="text-base font-bold text-slate-900">{formatBusinessDate(day.date)}</span>
          </div>
          <div className="mt-1">
            {s ? <Summary s={s} /> : <span className="text-xs text-slate-500">Not started yet</span>}
          </div>
        </div>
        <Link href={`/services/${workflowSlug}`} className={done ? "btn-secondary" : "btn-primary"}>
          {done ? "View" : s ? "Continue" : "Start today\u2019s inspection"}
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function PastDayRow({ workflowSlug, day }: { workflowSlug: string; day: HistoryDay }) {
  const s = day.submission;
  const href = `/services/${workflowSlug}?date=${day.dateKey}`;

  if (!s) {
    return (
      <Link href={href} className="card flex items-center justify-between gap-3 border-dashed bg-slate-50/60 px-4 py-3 hover:bg-slate-100">
        <div>
          <div className="text-sm font-semibold text-slate-500">{formatBusinessDate(day.date)}</div>
          <div className="text-xs text-slate-400">Blank sheet</div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
          <Lock className="h-3 w-3" />
          Missed
        </span>
      </Link>
    );
  }

  const done = s.status === "COMPLETED";
  return (
    <Link href={href} className="card flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900">{formatBusinessDate(day.date)}</div>
        <Summary s={s} />
      </div>
      <span
        className={clsx(
          "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
          done ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
        )}
      >
        {done ? null : s.unlocked ? <LockOpen className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
        {done ? "Completed" : s.unlocked ? "Unlocked" : "Not completed"}
      </span>
    </Link>
  );
}
