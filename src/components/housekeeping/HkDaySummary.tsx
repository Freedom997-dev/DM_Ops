import Link from "next/link";
import clsx from "clsx";
import { CheckCircle2, Hourglass } from "lucide-react";
import type { HkDayCounts, HkDayReport } from "@/lib/hk-day-report";
import { REASON_COLOR_CLASSES, reasonStyleLookup } from "@/lib/hk-reason-style";
import { ReasonIconView } from "@/components/housekeeping/ReasonIcon";

type RoomState = "submitted" | "uninspected" | "approved" | "pending";
type ReportQuery = { hk?: string; reason?: string; carried?: boolean; state?: RoomState };

function reportHref(dateKey: string, q: ReportQuery): string {
  const p = new URLSearchParams({ date: dateKey });
  if (q.hk !== undefined) p.set("hk", q.hk || "none");
  if (q.reason) p.set("reason", q.reason);
  if (q.carried) p.set("carried", "1");
  if (q.state) p.set("state", q.state);
  return `/services/housekeeping/report?${p}#rooms`;
}

// The day's headline numbers: one tile per check-out reason (active status
// actions in settings order, plus any other reason used that day), then rooms
// cleaned and cleaned-but-not-inspected. Each tile links to those rooms.
export function HkDayTiles({ report }: { report: HkDayReport }) {
  const styleOf = reasonStyleLookup(report.reasonActions);
  const reasons = [
    ...report.reasonActions.filter((a) => !a.archived).map((a) => a.label),
    ...report.reasons.filter((r) => !report.reasonActions.some((a) => !a.archived && a.label === r)),
  ];

  const tile = (key: string, href: string, n: number, label: string, icon: React.ReactNode, tone: string, hint?: string) => (
    <Link
      key={key}
      href={href}
      title={hint}
      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <span className={clsx("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", tone)}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-2xl font-bold leading-none text-slate-900">{n}</span>
        <span className="block text-xs leading-tight text-slate-500">{label}</span>
      </span>
    </Link>
  );

  return (
    // As many equal columns as fit, so 4–8 tiles stay on one row on a wide screen.
    <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
      {reasons.map((r) => {
        const st = styleOf(r)!;
        return tile(
          `reason:${r}`, reportHref(report.dateKey, { reason: r }), report.totals.byReason[r] ?? 0, st.name,
          <ReasonIconView icon={st.icon} className="h-6 w-6" />, REASON_COLOR_CLASSES[st.color].tile,
        );
      })}
      {tile(
        "submitted", reportHref(report.dateKey, { state: "submitted" }), report.totals.submitted, "Rooms cleaned",
        <CheckCircle2 className="h-6 w-6" />, "bg-emerald-100 text-emerald-700",
        "Housekeeper finished and submitted the room this day",
      )}
      {tile(
        "uninspected", reportHref(report.dateKey, { state: "uninspected" }), report.totals.uninspected, "Cleaned, not inspected",
        <Hourglass className="h-6 w-6" />, "bg-amber-100 text-amber-700",
        "Submitted but not yet approved or sent back by an inspector",
      )}
    </div>
  );
}

// Per-housekeeper counts for one day. Every number links to the day report,
// filtered to those rooms. Renders on the server (no client state).
export function HkDaySummary({ report, compact = false }: { report: HkDayReport; compact?: boolean }) {
  const href = (q: ReportQuery) => reportHref(report.dateKey, q);

  if (report.rooms.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-slate-500">No rooms checked out or carried over on this day.</p>;
  }

  const cell = (n: number, link: string, tone?: string) =>
    n === 0 ? (
      <span className="text-slate-300">0</span>
    ) : (
      <Link href={link} className={clsx("font-semibold hover:underline", tone ?? "text-slate-900")}>{n}</Link>
    );

  const row = (c: HkDayCounts, hk: string | undefined, label: React.ReactNode, isTotal = false) => (
    <tr key={isTotal ? "total" : hk || "unassigned"} className={clsx(isTotal ? "border-t-2 border-slate-200 bg-slate-50 font-bold" : "border-t border-slate-100")}>
      <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-semibold text-slate-800">{label}</th>
      {report.reasons.map((r) => (
        <td key={r} className="px-3 py-2 text-center">{cell(c.byReason[r] ?? 0, href({ hk, reason: r }))}</td>
      ))}
      <td className="px-3 py-2 text-center">{cell(c.carried, href({ hk, carried: true }), "text-amber-700")}</td>
      <td className="px-3 py-2 text-center">{cell(c.total, href({ hk }))}</td>
      <td className="px-3 py-2 text-center">{cell(c.submitted, href({ hk, state: "submitted" }), "text-emerald-700")}</td>
      <td className="px-3 py-2 text-center">{cell(c.uninspected, href({ hk, state: "uninspected" }), "text-amber-700")}</td>
      <td className="px-3 py-2 text-center">{cell(c.approved, href({ hk, state: "approved" }), "text-emerald-700")}</td>
      <td className="px-3 py-2 text-center">{cell(c.pending, href({ hk, state: "pending" }), "text-red-700")}</td>
    </tr>
  );

  return (
    <div className="overflow-x-auto">
      <table className={clsx("w-full text-sm", compact && "text-[13px]")}>
        <thead>
          <tr className="text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 text-left">Housekeeper</th>
            {report.reasons.map((r) => (
              <th key={r} className="px-3 py-2 text-center font-semibold normal-case">{r.replace(/_/g, " ")}</th>
            ))}
            <th className="px-3 py-2 text-center" title="Checked out on an earlier day and still not approved when this day began">Carried over</th>
            <th className="px-3 py-2 text-center">Total</th>
            <th className="px-3 py-2 text-center" title="Housekeeper finished and submitted the room this day">Cleaned</th>
            <th className="px-3 py-2 text-center" title="Submitted but not yet approved or sent back by an inspector">Not inspected</th>
            <th className="px-3 py-2 text-center" title="Approved by an inspector before the day ended">Approved</th>
            <th className="px-3 py-2 text-center" title="Not approved by the end of the day">Pending</th>
          </tr>
        </thead>
        <tbody>
          {report.people.map((p) =>
            row(p, p.key, p.key ? p.name : <span className="text-slate-500">Unassigned</span>),
          )}
          {row(report.totals, undefined, "Total", true)}
        </tbody>
      </table>
    </div>
  );
}
