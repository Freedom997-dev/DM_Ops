import ExcelJS from "exceljs";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireWorkflowAccess, can } from "@/lib/session";
import { motelTodayUTC } from "@/lib/business-date";
import { addDays, dateKey } from "@/lib/workflow-lock";
import { getWorkflowPerformance, parseRange, type PerfLevel } from "@/lib/workflow-performance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const LEVEL_LABEL: Record<PerfLevel, string> = { good: "Good", warning: "Needs attention", critical: "Poor", none: "Not checked" };
const LEVEL_FILL: Record<PerfLevel, string | null> = { good: "FFD1FAE5", warning: "FFFEF3C7", critical: "FFFEE2E2", none: null };
// Problem-map shading, same steps as the on-screen heatmap.
const HEAT = [
  { max: 0, argb: null },
  { max: 0.1, argb: "FFFEE2E2" },
  { max: 0.25, argb: "FFFECACA" },
  { max: 0.5, argb: "FFFCA5A5" },
  { max: 0.75, argb: "FFEF4444" },
  { max: 1, argb: "FFB91C1C" },
];

/**
 * Performance report for a workflow (Daily Cleanliness) as .xlsx, for the
 * period shown on the Performance tab (?range=7|30|90). Sheets: Summary, Rooms,
 * Problem map, Issue log. Permission: workflows:performance:view.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { user, workflow } = await requireWorkflowAccess((await params).slug);
  if (workflow.shape !== "MATRIX" || !can(user, "workflows:performance:view")) notFound();

  const range = parseRange(new URL(req.url).searchParams.get("range") ?? undefined);
  const today = motelTodayUTC();
  const data = await getWorkflowPerformance(workflow.id, range, today);

  // Issue log: every ISSUE cell in the period, with that room's note for the day.
  const from = addDays(today, -(range - 1));
  const issueCells = await prisma.workflowCell.findMany({
    where: { status: "ISSUE", submission: { workflowId: workflow.id, date: { gte: from, lte: today } } },
    select: {
      itemText: true,
      roomId: true,
      submissionId: true,
      lastUpdatedAt: true,
      room: { select: { number: true } },
      lastUpdatedBy: { select: { name: true } },
      submission: { select: { date: true } },
    },
    orderBy: [{ submission: { date: "desc" } }],
  });
  const notes = await prisma.workflowRow.findMany({
    where: { submissionId: { in: [...new Set(issueCells.map((c) => c.submissionId))] }, note: { not: null } },
    select: { submissionId: true, roomId: true, note: true },
  });
  const noteFor = new Map(notes.map((n) => [`${n.submissionId}:${n.roomId}`, n.note ?? ""]));

  const wb = new ExcelJS.Workbook();
  wb.creator = `Divya Motel — ${workflow.name}`;
  wb.created = new Date();

  const header = (ws: ExcelJS.Worksheet, headers: string[]) => {
    const h = ws.addRow(headers);
    h.font = { bold: true, color: { argb: "FFFFFFFF" } };
    h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF172FE1" } }; // brand-700
    ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  };
  const pct = (r: number | null) => (r === null ? "" : Math.round(r * 1000) / 10);

  // --- Summary --------------------------------------------------------------
  const sum = wb.addWorksheet("Summary");
  sum.columns = [{ width: 30 }, { width: 40 }];
  sum.addRows([
    [`Divya Motel — ${workflow.name} performance`],
    ["Period", `${data.fromKey} to ${data.toKey} (${range} days)`],
    ["Generated", new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC"],
    [],
    ["Overall OK %", pct(data.passRate)],
    ["Issues found", data.issues],
    ["Days inspected", `${data.daysInspected} of ${data.daysInPeriod}`],
    ["Most common issue", data.topItem ? `${data.topItem.text} (${data.topItem.issues})` : "None"],
    [],
    ["Score = OK ÷ (OK + Issue). Blank boxes are not counted."],
    ["Good ≥ 95% · Needs attention 80–95% · Poor < 80%"],
  ]);
  sum.getRow(1).font = { bold: true, size: 13 };

  // --- Rooms ----------------------------------------------------------------
  const rooms = wb.addWorksheet("Rooms");
  rooms.columns = [10, 22, 10, 16, 8, 8, 13, 16, 30].map((width) => ({ width }));
  header(rooms, ["Room", "Name", "OK %", "Rating", "OK", "Issues", "Days checked", "Change vs previous (pts)", "Top problem"]);
  for (const r of data.rooms) {
    const top = r.items.find((i) => i.issues > 0);
    const change = r.passRate !== null && r.prevPassRate !== null ? Math.round((r.passRate - r.prevPassRate) * 100) : "";
    const row = rooms.addRow([
      r.number, r.name ?? "", pct(r.passRate), LEVEL_LABEL[r.level], r.ok, r.issues,
      `${r.daysChecked} of ${r.days.length}`, change, top ? `${top.text} (${top.issues})` : "",
    ]);
    const fill = LEVEL_FILL[r.level];
    if (fill) row.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  }

  // --- Problem map: rooms × items, issues (shaded by share of checks) ----------
  const map = wb.addWorksheet("Problem map");
  map.columns = [{ width: 10 }, ...data.items.map(() => ({ width: 6 }))];
  const mh = map.addRow(["Room", ...data.items.map((i) => i.text)]);
  mh.font = { bold: true };
  mh.height = 110;
  mh.eachCell((c, col) => {
    if (col > 1) c.alignment = { textRotation: 90, vertical: "bottom", horizontal: "center" };
  });
  map.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  const byNumber = [...data.rooms].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  for (const r of byNumber) {
    const byItem = new Map(r.items.map((i) => [i.itemId, i]));
    const row = map.addRow([r.number, ...data.items.map((it) => {
      const c = byItem.get(it.id);
      return c && c.checks > 0 ? c.issues : "–";
    })]);
    data.items.forEach((it, i) => {
      const c = byItem.get(it.id);
      const cell = row.getCell(i + 2);
      cell.alignment = { horizontal: "center" };
      if (!c || c.checks === 0) return;
      const share = c.issues / c.checks;
      const step = HEAT.find((h) => share <= h.max) ?? HEAT[HEAT.length - 1];
      if (step.argb) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: step.argb } };
      if (share > 0.5) cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
      cell.note = `${c.issues} issue(s) in ${c.checks} checks`;
    });
  }
  map.addRow([]);
  map.addRow(["Number = issues found · shade = share of checks with an issue · – = not checked"]);

  // --- Issue log --------------------------------------------------------------
  const log = wb.addWorksheet("Issue log");
  log.columns = [12, 8, 26, 50, 18].map((width) => ({ width }));
  header(log, ["Date", "Room", "Item", "Room note that day", "Marked by"]);
  for (const c of issueCells) {
    log.addRow([dateKey(c.submission.date), c.room.number, c.itemText, noteFor.get(`${c.submissionId}:${c.roomId}`) ?? "", c.lastUpdatedBy?.name ?? ""]);
  }
  log.eachRow((row, n) => n > 1 && (row.alignment = { wrapText: true, vertical: "top" }));

  const buffer = await wb.xlsx.writeBuffer();
  const file = `${workflow.slug}-performance-${data.fromKey}-to-${data.toKey}.xlsx`;
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
