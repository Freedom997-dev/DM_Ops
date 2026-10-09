"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Download,
  ExternalLink,
  Grid3x3,
  LayoutList,
  Printer,
  XCircle,
} from "lucide-react";
import { formatBusinessDate } from "@/lib/business-date";
import type { PerfLevel, RoomDayState, RoomPerformance, WorkflowPerformance as Perf } from "@/lib/workflow-performance";

// Status palette (fixed; always paired with an icon + label, never colour alone).
const STATUS = { good: "#0ca30c", warning: "#fab219", critical: "#d03b3b", none: "#cbd5e1" } as const;
const LEVEL_META: Record<PerfLevel, { label: string; Icon: typeof CheckCircle2 }> = {
  good: { label: "Good", Icon: CheckCircle2 },
  warning: { label: "Needs attention", Icon: AlertTriangle },
  critical: { label: "Poor", Icon: XCircle },
  none: { label: "Not checked", Icon: CircleDashed },
};
const DAY_META: Record<RoomDayState, { label: string; color: string }> = {
  ok: { label: "All OK", color: STATUS.good },
  issue: { label: "Issues", color: STATUS.critical },
  unchecked: { label: "Not checked", color: "#e2e8f0" },
  missed: { label: "Missed day", color: "transparent" },
};

const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);
const shortDate = (key: string) => formatBusinessDate(`${key}T00:00:00.000Z`, { weekday: "short", month: "short", day: "numeric" });

export function WorkflowPerformance({
  workflowSlug,
  workflowName = "Daily Cleanliness Inspection",
  data,
  canRoomHistory,
}: {
  workflowSlug: string;
  workflowName?: string;
  data: Perf;
  canRoomHistory: boolean; // manager: link to /settings/rooms/[id]
}) {
  const [view, setView] = useState<"scoreboard" | "map">("scoreboard");
  const [openRoom, setOpenRoom] = useState<string | null>(null);
  const rangeHref = (r: number) => `/services/${workflowSlug}/history?view=performance&range=${r}`;
  const fileStem = `${workflowSlug}-performance-${data.fromKey}-to-${data.toKey}`;

  function print() {
    // The browser uses document.title as the default "Save as PDF" file name.
    const original = document.title;
    document.title = fileStem;
    window.addEventListener("afterprint", () => (document.title = original), { once: true });
    window.print();
  }

  return (
    <div className="print-area space-y-4">
      {/* Printed report header (the page title and tabs aren't printed) */}
      <div className="print-only">
        <h1 className="text-lg font-bold">Divya Motel — {workflowName} performance</h1>
        <p className="text-sm">
          {shortDate(data.fromKey)} – {shortDate(data.toKey)} ({data.range} days) · printed{" "}
          {new Date().toLocaleDateString(undefined, { dateStyle: "medium" })}
        </p>
      </div>

      {/* Filters: one row above everything */}
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Period">
          {[7, 30, 90].map((r) => (
            <Link
              key={r}
              href={rangeHref(r)}
              className={clsx(
                "rounded-lg px-3 py-1 text-sm font-semibold",
                data.range === r ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
              )}
            >
              {r} days
            </Link>
          ))}
        </div>
        <div className="inline-flex rounded-xl bg-slate-100 p-1" role="group" aria-label="View">
          <button
            type="button"
            onClick={() => setView("scoreboard")}
            className={clsx("inline-flex items-center gap-1 rounded-lg px-3 py-1 text-sm font-semibold", view === "scoreboard" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
          >
            <LayoutList className="h-4 w-4" /> Rooms
          </button>
          <button
            type="button"
            onClick={() => setView("map")}
            className={clsx("inline-flex items-center gap-1 rounded-lg px-3 py-1 text-sm font-semibold", view === "map" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
          >
            <Grid3x3 className="h-4 w-4" /> Problem map
          </button>
        </div>
        <div className="flex gap-2" role="group" aria-label="Export">
          <a
            href={`/api/exports/workflow-performance/${workflowSlug}?range=${data.range}`}
            download={`${fileStem}.xlsx`}
            className="btn-secondary px-3 py-1.5 text-sm"
            title="Download as Excel: summary, rooms, problem map and issue log"
          >
            <Download className="h-4 w-4" /> Excel
          </a>
          <button type="button" onClick={print} className="btn-secondary px-3 py-1.5 text-sm" title="Print, or choose “Save as PDF”">
            <Printer className="h-4 w-4" /> Print / PDF
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        {shortDate(data.fromKey)} – {shortDate(data.toKey)} · score = OK ÷ (OK + Issue); blank boxes don&apos;t count.
      </p>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Overall OK" value={pct(data.passRate)} />
        <Tile label="Issues found" value={String(data.issues)} />
        <Tile label="Days inspected" value={`${data.daysInspected} / ${data.daysInPeriod}`} />
        <Tile label="Most common issue" value={data.topItem ? data.topItem.text : "None"} sub={data.topItem ? `${data.topItem.issues}×` : undefined} small />
      </div>

      {/* Both views print (rooms, then problem map); on screen only the chosen one shows. */}
      <div className={clsx("perf-print-section", view !== "scoreboard" && "hidden print:block")}>
        <div className="grid gap-3 md:grid-cols-2 print:grid-cols-2">
          {data.rooms.map((r) => (
            <RoomCard
              key={r.roomId}
              room={r}
              range={data.range}
              open={openRoom === r.roomId}
              onToggle={() => setOpenRoom((cur) => (cur === r.roomId ? null : r.roomId))}
              workflowSlug={workflowSlug}
              canRoomHistory={canRoomHistory}
            />
          ))}
        </div>
      </div>
      <div className={clsx("perf-print-section", view !== "map" && "hidden print:block")}>
        <h2 className="print-only mb-2 mt-4 text-sm font-bold">Problem map — issues by room and checklist item</h2>
        <ProblemMap data={data} />
      </div>
    </div>
  );
}

function Tile({ label, value, sub, small }: { label: string; value: string; sub?: string; small?: boolean }) {
  return (
    <div className="card p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={clsx("mt-0.5 font-bold text-slate-900", small ? "truncate text-sm" : "text-2xl")} title={value}>
        {value}
        {sub && <span className="ml-1 text-xs font-medium text-slate-500">{sub}</span>}
      </div>
    </div>
  );
}

function LevelPill({ room }: { room: RoomPerformance }) {
  const { label, Icon } = LEVEL_META[room.level];
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-800 ring-1 ring-slate-200">
      <Icon className="h-3.5 w-3.5" style={{ color: STATUS[room.level] }} aria-hidden />
      {room.passRate === null ? label : `${pct(room.passRate)} OK`}
      <span className="sr-only"> — {label}</span>
    </span>
  );
}

function Trend({ room, range }: { room: RoomPerformance; range: number }) {
  if (room.passRate === null || room.prevPassRate === null) return null;
  const diff = Math.round((room.passRate - room.prevPassRate) * 100);
  if (diff === 0) return <span className="text-slate-500">same as previous {range} days</span>;
  const better = diff > 0;
  const Icon = better ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-0.5 text-slate-600">
      <Icon className="h-3.5 w-3.5" style={{ color: better ? STATUS.good : STATUS.critical }} aria-hidden />
      {better ? "+" : ""}
      {diff} pts vs previous {range} days
    </span>
  );
}

// Daily issue count — one thin bar per day, anchored to the baseline. Missed
// days show a hairline tick so gaps are visible.
function Sparkline({ days }: { days: RoomPerformance["days"] }) {
  const max = Math.max(1, ...days.map((d) => d.issues));
  const w = 4;
  const gap = 2;
  const h = 28;
  return (
    <svg width={days.length * (w + gap)} height={h} className="block max-w-full" role="img" aria-label="Issues per day">
      {days.map((d, i) => {
        const x = i * (w + gap);
        const label = `${shortDate(d.key)}: ${d.state === "issue" ? `${d.issues} issue${d.issues === 1 ? "" : "s"}` : DAY_META[d.state].label}`;
        if (d.state === "issue") {
          const bh = Math.max(4, (d.issues / max) * (h - 2));
          return (
            <rect key={d.key} x={x} y={h - bh} width={w} height={bh} rx={2} fill={STATUS.critical}>
              <title>{label}</title>
            </rect>
          );
        }
        return (
          <rect key={d.key} x={x} y={h - 2} width={w} height={2} rx={1} fill={d.state === "ok" ? STATUS.good : "#cbd5e1"}>
            <title>{label}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function RoomCard({
  room,
  range,
  open,
  onToggle,
  workflowSlug,
  canRoomHistory,
}: {
  room: RoomPerformance;
  range: number;
  open: boolean;
  onToggle: () => void;
  workflowSlug: string;
  canRoomHistory: boolean; // manager: link to /settings/rooms/[id]
}) {
  const top = room.items.find((i) => i.issues > 0);
  return (
    <div className={clsx("card overflow-hidden", open && "md:col-span-2")}>
      <button type="button" onClick={onToggle} className="w-full p-4 text-left hover:bg-slate-50" aria-expanded={open}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold text-slate-900">
              Room {room.number}
              {room.name && <span className="font-normal text-slate-500"> · {room.name}</span>}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {room.issues} issue{room.issues === 1 ? "" : "s"} · checked {room.daysChecked} of {room.days.length} days
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LevelPill room={room} />
            <ChevronDown className={clsx("h-4 w-4 text-slate-400 transition-transform", open && "rotate-180")} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-2 text-xs">
          <Sparkline days={room.days} />
          <Trend room={room} range={range} />
        </div>
        <div className="mt-2 text-xs text-slate-600">
          {top ? (
            <>Top problem: <span className="font-semibold text-slate-800">{top.text}</span> ({top.issues})</>
          ) : room.passRate !== null ? (
            "No issues in this period"
          ) : (
            "Not checked in this period"
          )}
        </div>
      </button>
      {open && <RoomDetail room={room} workflowSlug={workflowSlug} canRoomHistory={canRoomHistory} />}
    </div>
  );
}

function RoomDetail({
  room,
  workflowSlug,
  canRoomHistory,
}: {
  room: RoomPerformance;
  workflowSlug: string;
  canRoomHistory: boolean; // manager: link to /settings/rooms/[id]
}) {
  const maxIssues = Math.max(1, ...room.items.map((i) => i.issues));
  return (
    <div className="space-y-4 border-t border-slate-100 bg-slate-50/50 p-4">
      {/* Day strip */}
      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Day by day</h3>
        <div className="flex flex-wrap gap-0.5">
          {room.days.map((d) => (
            <Link
              key={d.key}
              href={`/services/${workflowSlug}?date=${d.key}`}
              className="flex h-6 w-6 items-center justify-center rounded text-[10px] font-semibold text-white ring-inset hover:ring-2 hover:ring-slate-900"
              style={{
                background: DAY_META[d.state].color,
                border: d.state === "missed" ? "1px dashed #94a3b8" : undefined,
              }}
              title={`${shortDate(d.key)} — ${d.state === "issue" ? `${d.issues} issue${d.issues === 1 ? "" : "s"}` : DAY_META[d.state].label}`}
              aria-label={`${shortDate(d.key)}: ${DAY_META[d.state].label}`}
            >
              {d.state === "issue" ? d.issues : ""}
            </Link>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
          {(["ok", "issue", "unchecked", "missed"] as RoomDayState[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ background: DAY_META[s].color, border: s === "missed" ? "1px dashed #94a3b8" : undefined }}
              />
              {DAY_META[s].label}
            </span>
          ))}
          <span>· tap a day to open its sheet</span>
        </div>
      </div>

      {/* Item breakdown — single series, so no legend; values labelled at the bar end */}
      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Issues by checklist item <span className="font-normal normal-case">(issues / times checked)</span></h3>
        {room.items.length === 0 ? (
          <p className="text-xs text-slate-500">Nothing checked in this period.</p>
        ) : (
          <>
          <ul className="space-y-1.5">
            {room.items.filter((it) => it.issues > 0).map((it) => (
              <li key={it.itemId} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-2 text-xs" title={`${it.text}: ${it.issues} issue${it.issues === 1 ? "" : "s"} in ${it.checks} checks`}>
                <span className="truncate text-slate-700">{it.text}</span>
                <span className="flex items-center gap-2">
                  <span className="h-3 rounded-r" style={{ width: `${(it.issues / maxIssues) * 100}%`, maxWidth: "calc(100% - 4rem)", background: STATUS.critical }} />
                  <span className="shrink-0 text-slate-600">
                    {it.issues} / {it.checks}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {room.items.some((it) => it.issues === 0) && (
            <p className="mt-2 text-xs text-slate-500">
              <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 align-text-bottom" style={{ color: STATUS.good }} aria-hidden />
              No issues: {room.items.filter((it) => it.issues === 0).map((it) => it.text).join(", ")}
            </p>
          )}
          </>
        )}
      </div>

      {/* Latest notes */}
      {room.notes.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Latest notes</h3>
          <ul className="space-y-1 text-xs">
            {room.notes.map((n) => (
              <li key={n.key} className="text-slate-700">
                <Link href={`/services/${workflowSlug}?date=${n.key}`} className="font-semibold text-brand-600 hover:underline">
                  {shortDate(n.key)}
                </Link>{" "}
                — {n.note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {canRoomHistory && (
        <Link href={`/settings/rooms/${room.roomId}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
          Full room history (cleanings, repairs, photos) <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

// Rooms × checklist items, shaded by how often the item failed (one-hue ramp).
const HEAT = [
  { max: 0, bg: "#f8fafc", fg: "#64748b", label: "0%" },
  { max: 0.1, bg: "#fee2e2", fg: "#7f1d1d", label: "≤10%" },
  { max: 0.25, bg: "#fecaca", fg: "#7f1d1d", label: "≤25%" },
  { max: 0.5, bg: "#fca5a5", fg: "#7f1d1d", label: "≤50%" },
  { max: 0.75, bg: "#ef4444", fg: "#ffffff", label: "≤75%" },
  { max: 1, bg: "#b91c1c", fg: "#ffffff", label: ">75%" },
];
const heatFor = (r: number) => HEAT.find((h) => r <= h.max) ?? HEAT[HEAT.length - 1];

function ProblemMap({ data }: { data: Perf }) {
  const rooms = [...data.rooms].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  return (
    <div className="space-y-2">
      <div className="matrix-scroll overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="border-separate border-spacing-0.5 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left font-bold text-slate-600">Room</th>
              {data.items.map((it) => (
                <th key={it.id} className="px-0.5 align-bottom" style={{ minWidth: 40 }}>
                  <div className="flex h-24 items-end justify-center">
                    <span className="whitespace-nowrap font-semibold text-slate-600" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                      {it.text}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rooms.map((r) => {
              const byItem = new Map(r.items.map((i) => [i.itemId, i]));
              return (
                <tr key={r.roomId}>
                  <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left font-bold text-slate-800">{r.number}</th>
                  {data.items.map((it) => {
                    const c = byItem.get(it.id);
                    if (!c || c.checks === 0) {
                      return (
                        <td key={it.id} className="h-8 rounded text-center text-slate-300" title={`Room ${r.number} · ${it.text}: not checked`}>
                          –
                        </td>
                      );
                    }
                    const h = heatFor(c.issues / c.checks);
                    return (
                      <td
                        key={it.id}
                        className="h-8 rounded text-center font-semibold"
                        style={{ background: h.bg, color: h.fg }}
                        title={`Room ${r.number} · ${it.text}: ${c.issues} issue${c.issues === 1 ? "" : "s"} in ${c.checks} checks (${Math.round((c.issues / c.checks) * 100)}%)`}
                      >
                        {c.issues}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <span>Number = issues found · shade = share of checks with an issue:</span>
        {HEAT.map((h) => (
          <span key={h.label} className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-4 rounded-sm ring-1 ring-slate-200" style={{ background: h.bg }} />
            {h.label}
          </span>
        ))}
        <span>· – not checked</span>
      </div>
    </div>
  );
}
