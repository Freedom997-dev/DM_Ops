import ExcelJS from "exceljs";
import { requirePermission } from "@/lib/session";
import { buildReport } from "@/lib/pmv2-data";
import { quarterFromParams, STATUS_META, type ResultStatus } from "@/lib/pmv2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * PM V2 condition report for one quarter (?q=YYYY-Qn) as .xlsx:
 * Summary, Rooms, Open issues, Fixed — same sheets as the original artifact.
 */
export async function GET(req: Request) {
  await requirePermission("pmv2:reports:view");
  const q = quarterFromParams(new URL(req.url).searchParams.get("q") ?? undefined);
  const R = await buildReport(q);
  const label = (s: string) => STATUS_META[s as ResultStatus]?.label ?? s;

  const wb = new ExcelJS.Workbook();
  wb.creator = `${R.hotel} — Room Condition V2`;
  wb.created = R.generated;

  const addSheet = (name: string, headers: string[] | null, widths: number[], rows: (string | number)[][]) => {
    const ws = wb.addWorksheet(name, headers ? { views: [{ state: "frozen", ySplit: 1 }] } : {});
    ws.columns = widths.map((width) => ({ width }));
    if (headers) {
      const h = ws.addRow(headers);
      h.font = { bold: true, color: { argb: "FFFFFFFF" } };
      h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF172FE1" } }; // brand-700
    }
    rows.forEach((r) => ws.addRow(r));
    ws.eachRow((row) => (row.alignment = { wrapText: true, vertical: "top" }));
    if (headers && rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  };

  addSheet("Summary", null, [30, 34], [
    [`${R.hotel} – Room condition report`],
    ["Quarter", R.quarterLabel],
    ["Generated", R.generated.toISOString().replace("T", " ").slice(0, 16) + " UTC"],
    [],
    ["Rooms & areas", R.total],
    ["Complete", R.counts.done],
    ["In progress", R.counts.prog],
    ["Not started", R.counts.todo],
    [],
    ["Open issues", R.open.length],
    ["  Repair", R.byStatus.REPAIR],
    ["  Replace", R.byStatus.REPLACE],
    ["  Missing", R.byStatus.MISSING],
    ["Rooms/areas with open issues", R.withIssues],
    ["Fixed this quarter", R.fixed.length],
  ]);
  wb.getWorksheet("Summary")!.getRow(1).font = { bold: true, size: 13 };

  addSheet(
    "Rooms",
    ["Room / area", "Group", "Checklist", "Status", "Items checked", "Total items", "Open issues", "Fixed", "Inspection date", "Initials", "General notes"],
    [16, 14, 14, 13, 12, 11, 11, 8, 14, 9, 40],
    R.rooms.map((r) => [r.name, r.group, r.checklist, r.status, r.ans, r.total, r.iss, r.fixed, r.date, r.initials, r.notes]),
  );
  addSheet(
    "Open issues",
    ["Room / area", "Group", "Section", "Item", "Status", "Note", "Inspected on", "Initials"],
    [16, 14, 24, 44, 10, 60, 13, 9],
    R.open.map((o) => [o.area, o.group, o.section, o.item, label(o.status), o.note, o.date, o.initials]),
  );
  addSheet(
    "Fixed",
    ["Room / area", "Group", "Section", "Item", "Note", "Fixed on"],
    [16, 14, 24, 44, 60, 13],
    R.fixed.map((o) => [o.area, o.group, o.section, o.item, o.note, o.fixedOn ?? ""]),
  );

  const buffer = await wb.xlsx.writeBuffer();
  const slug = R.hotel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "hotel";
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${slug}-condition-report-${q}-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
