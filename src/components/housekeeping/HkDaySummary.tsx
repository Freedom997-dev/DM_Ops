import Link from "next/link";
import clsx from "clsx";
import type { HkDayCounts, HkDayReport } from "@/lib/hk-day-report";

// Per-housekeeper counts for one day. Every number links to the day report,
// filtered to those rooms. Renders on the server (no client state).
export function HkDaySummary({ report, compact = false }: { report: HkDayReport; compact?: boolean }) {
  const href = (q: { hk?: string; reason?: string; carried?: boolean; state?: "cleaned" | "pending" }) => {
    const p = new URLSearchParams({ date: report.dateKey });
    if (q.hk !== undefined) p.set("hk", q.hk || "none");
    if (q.reason) p.set("reason", q.reason);
    if (q.carried) p.set("carried", "1");
    if (q.state) p.set("state", q.state);
    return `/services/housekeeping/report?${p}#rooms`;
  };

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
      <td className="px-3 py-2 text-center">{cell(c.cleaned, href({ hk, state: "cleaned" }), "text-emerald-700")}</td>
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
            <th className="px-3 py-2 text-center" title="Checked out on an earlier day and still not cleaned when this day began">Carried over</th>
            <th className="px-3 py-2 text-center">Total</th>
            <th className="px-3 py-2 text-center">Cleaned</th>
            <th className="px-3 py-2 text-center">Pending</th>
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
