import ExcelJS from "exceljs";
import { requirePermission } from "@/lib/session";
import { motelTodayUTC, formatBusinessDate, MOTEL_TIME_ZONE } from "@/lib/business-date";
import { parseDateKey } from "@/lib/workflow-lock";
import { getHkDayReport, type HkDayCounts } from "@/lib/hk-day-report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Motel-local "Nov 12, 9:40 AM" (Excel has no time zones, so send text).
function when(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: MOTEL_TIME_ZONE, month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

/**
 * Housekeeping day report as .xlsx (?date=YYYY-MM-DD, default today) — the same
 * data as /services/housekeeping/report. Sheets: Summary, Rooms.
 * Permission: housekeeping:reports:view.
 */
export async function GET(req: Request) {
  await requirePermission("housekeeping:reports:view");
  const today = motelTodayUTC();
  const requested = parseDateKey(new URL(req.url).searchParams.get("date"));
  const day = requested && requested <= today ? requested : today;
  const report = await getHkDayReport(day);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Divya Motel — Housekeeping";
  wb.created = new Date();

  const header = (ws: ExcelJS.Worksheet, headers: string[]) => {
    const h = ws.addRow(headers);
    h.font = { bold: true, color: { argb: "FFFFFFFF" } };
    h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF172FE1" } }; // brand-700
  };

  // --- Summary --------------------------------------------------------------
  const sum = wb.addWorksheet("Summary");
  const cols = ["Housekeeper", ...report.reasons.map((r) => r.replace(/_/g, " ")), "Carried over", "Total", "Cleaned", "Pending"];
  sum.columns = cols.map((_, i) => ({ width: i === 0 ? 24 : 16 }));
  sum.addRow([`Divya Motel — Housekeeping day report · ${formatBusinessDate(day)}`]).font = { bold: true, size: 13 };
  sum.addRow([`Generated ${when(new Date().toISOString())} (motel time)`]);
  sum.addRow([]);
  header(sum, cols);
  const line = (name: string, c: HkDayCounts) => [
    name, ...report.reasons.map((r) => c.byReason[r] ?? 0), c.carried, c.total, c.cleaned, c.pending,
  ];
  for (const p of report.people) sum.addRow(line(p.name, p));
  sum.addRow(line("Total", report.totals)).font = { bold: true };
  sum.addRow([]);
  sum.addRow(["Rooms checked out this day plus rooms carried over (checked out earlier, not cleaned when the day began)."]);
  sum.addRow(["Cleaned = approved by an inspector before the day ended."]);

  // --- Rooms ----------------------------------------------------------------
  const rooms = wb.addWorksheet("Rooms");
  rooms.columns = [8, 20, 16, 12, 20, 16, 16, 16, 16, 18, 16, 18, 14].map((width) => ({ width }));
  header(rooms, [
    "Room", "Reason", "Housekeeper", "Carried over", "Checked out", "Assigned", "Started",
    "Submitted", "Submitted by", "Inspected", "Inspected by", "Result", "Sent back",
  ]);
  rooms.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  rooms.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 13 } };
  for (const r of report.rooms) {
    const row = rooms.addRow([
      r.roomNumber, r.reason.replace(/_/g, " "), r.housekeeper ?? "Unassigned", r.carried ? "Yes" : "",
      when(r.checkedOutAt), when(r.assignedAt), when(r.startedAt),
      when(r.submittedAt), r.submittedBy ?? "", when(r.reviewedAt), r.reviewedBy ?? "",
      r.cleaned ? "Cleaned" : "Not cleaned", r.sentBack ? "Yes" : "",
    ]);
    row.getCell(12).fill = {
      type: "pattern", pattern: "solid", fgColor: { argb: r.cleaned ? "FFD1FAE5" : "FFFEE2E2" },
    };
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="housekeeping-day-${report.dateKey}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
