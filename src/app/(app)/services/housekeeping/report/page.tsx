import Link from "next/link";
import clsx from "clsx";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FileBarChart, X } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { motelTodayUTC, formatBusinessDate, MOTEL_TIME_ZONE } from "@/lib/business-date";
import { addDays, dateKey, parseDateKey } from "@/lib/workflow-lock";
import { getHkDayReport, type HkDayRoom } from "@/lib/hk-day-report";
import { HK_STATUS_META, isHkStatus } from "@/lib/housekeeping";
import { HkDaySummary } from "@/components/housekeeping/HkDaySummary";

export const dynamic = "force-dynamic";

type Search = { date?: string; hk?: string; reason?: string; carried?: string; state?: string };

/** Time in the motel's zone; adds the date when it isn't the report day. */
function when(iso: string | null, reportKey: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: MOTEL_TIME_ZONE }).format(d);
  const time = d.toLocaleTimeString("en-US", { timeZone: MOTEL_TIME_ZONE, hour: "numeric", minute: "2-digit" });
  if (day === reportKey) return time;
  return `${d.toLocaleDateString("en-US", { timeZone: MOTEL_TIME_ZONE, month: "short", day: "numeric" })}, ${time}`;
}

export default async function HousekeepingDayReportPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("housekeeping:reports:view");
  const q = await searchParams;
  const today = motelTodayUTC();
  const requested = parseDateKey(q.date);
  const day = requested && requested <= today ? requested : today;
  const report = await getHkDayReport(day);

  // Filters from the summary links.
  const filters: { label: string; drop: keyof Search }[] = [];
  let rooms: HkDayRoom[] = report.rooms;
  if (q.hk) {
    rooms = rooms.filter((r) => (q.hk === "none" ? !r.housekeeperId : r.housekeeperId === q.hk));
    filters.push({ label: q.hk === "none" ? "Unassigned" : rooms[0]?.housekeeper ?? "Housekeeper", drop: "hk" });
  }
  if (q.reason) {
    rooms = rooms.filter((r) => r.reason === q.reason);
    filters.push({ label: q.reason.replace(/_/g, " "), drop: "reason" });
  }
  if (q.carried === "1") {
    rooms = rooms.filter((r) => r.carried);
    filters.push({ label: "Carried over", drop: "carried" });
  }
  if (q.state === "cleaned" || q.state === "pending") {
    rooms = rooms.filter((r) => r.cleaned === (q.state === "cleaned"));
    filters.push({ label: q.state === "cleaned" ? "Cleaned" : "Pending", drop: "state" });
  }
  const without = (drop: keyof Search) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v && k !== drop) p.set(k, v);
    p.set("date", report.dateKey);
    return `/services/housekeeping/report?${p}#rooms`;
  };

  const isToday = report.dateKey === dateKey(today);
  const prevKey = dateKey(addDays(day, -1));
  const nextKey = dateKey(addDays(day, 1));

  return (
    <div className="space-y-5">
      <Link href="/services/housekeeping" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Back to housekeeping
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <FileBarChart className="h-6 w-6 text-brand-600" /> Housekeeping day report
          </h1>
          <p className="text-sm text-slate-500">
            {formatBusinessDate(day)}
            {isToday && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Today · live</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/services/housekeeping/report?date=${prevKey}`} className="btn-secondary !px-2.5" aria-label="Previous day">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <form action="/services/housekeeping/report" className="flex items-center gap-2">
            <input type="date" name="date" defaultValue={report.dateKey} max={dateKey(today)} className="input !w-auto !py-1.5 text-sm" aria-label="Report date" />
            <button type="submit" className="btn-primary !py-1.5">Show</button>
          </form>
          {!isToday && (
            <Link href={`/services/housekeeping/report?date=${nextKey}`} className="btn-secondary !px-2.5" aria-label="Next day">
              <ChevronRight className="h-4 w-4" />
            </Link>
          )}
          <a href={`/api/exports/housekeeping-day?date=${report.dateKey}`} className="btn-secondary !py-1.5">
            <Download className="h-4 w-4" /> Excel
          </a>
        </div>
      </div>

      <section className="card overflow-hidden">
        <h2 className="border-b border-slate-100 px-4 py-3 font-bold text-slate-900">Summary by housekeeper</h2>
        <HkDaySummary report={report} />
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
          Rooms checked out this day plus rooms <span className="font-semibold text-amber-700">carried over</span> (checked out earlier, not yet cleaned when the day began).
          Cleaned = approved by an inspector before the day ended. Tap a number to list those rooms.
        </p>
      </section>

      <section id="rooms" className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="font-bold text-slate-900">Rooms ({rooms.length})</h2>
          {filters.map((f) => (
            <Link key={f.drop} href={without(f.drop)} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 hover:bg-brand-100">
              {f.label} <X className="h-3 w-3" />
            </Link>
          ))}
          {filters.length > 0 && (
            <Link href={`/services/housekeeping/report?date=${report.dateKey}#rooms`} className="text-xs font-semibold text-slate-500 hover:underline">Show all</Link>
          )}
        </div>

        {rooms.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">No rooms.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Room</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2">Housekeeper</th>
                  <th className="px-3 py-2">Checked out</th>
                  <th className="px-3 py-2">Assigned</th>
                  <th className="px-3 py-2">Started</th>
                  <th className="px-3 py-2">Submitted</th>
                  <th className="px-3 py-2">Inspected</th>
                  <th className="px-3 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r) => (
                  <tr key={r.taskId} className="border-t border-slate-100 align-top">
                    <td className="whitespace-nowrap px-3 py-2">
                      <Link href={`/services/housekeeping?task=${r.taskId}`} className="font-bold text-slate-900 hover:underline">{r.roomNumber}</Link>
                      {r.carried && <div className="text-[11px] font-semibold text-amber-700">Carried over</div>}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{r.reason.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2">{r.housekeeper ?? <span className="text-slate-400">Unassigned</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{when(r.checkedOutAt, report.dateKey)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{when(r.assignedAt, report.dateKey)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{when(r.startedAt, report.dateKey)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                      {when(r.submittedAt, report.dateKey)}
                      {r.submittedBy && r.submittedBy !== r.housekeeper && <div className="text-[11px] text-slate-500">by {r.submittedBy}</div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                      {when(r.reviewedAt, report.dateKey)}
                      {r.reviewedBy && <div className="text-[11px] text-slate-500">by {r.reviewedBy}</div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <ResultChip room={r} isToday={isToday} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ResultChip({ room, isToday }: { room: HkDayRoom; isToday: boolean }) {
  if (room.cleaned) {
    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Cleaned</span>;
  }
  // Pending at the end of the day; for today, its live status.
  const meta = isToday && isHkStatus(room.statusNow) ? HK_STATUS_META[room.statusNow] : null;
  return (
    <span className="space-y-0.5">
      <span className={clsx("inline-block rounded-full border px-2 py-0.5 text-xs font-semibold", meta?.chip ?? "border-red-200 bg-red-50 text-red-700")}>
        {meta?.label ?? "Not cleaned"}
      </span>
      {room.sentBack && <span className="block text-[11px] font-semibold text-red-600">Sent back</span>}
    </span>
  );
}
