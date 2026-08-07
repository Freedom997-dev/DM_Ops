import ExcelJS from "exceljs";
import { requirePermission } from "@/lib/session";
import { getStatusReport, type ReportItem } from "@/lib/reports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Tailwind-ish tones so the workbook reads like the dashboard.
const RED = "FFB91C1C";
const AMBER = "FFB45309";
const GREEN = "FF047857";
const SLATE = "FF334155";

function styleHeader(sheet: ExcelJS.Worksheet, argb: string, columns: number) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
  header.alignment = { vertical: "middle" };
  header.height = 20;
  if (sheet.rowCount > 1) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns } };
  }
}

/** Shared column layout for the two item-level sheets. */
function addItemSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  rows: ReportItem[],
  headerColor: string,
  emptyMessage: string,
) {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    { header: "Room", key: "roomNumber", width: 10 },
    { header: "Room Name", key: "roomName", width: 20 },
    { header: "Floor", key: "floor", width: 8 },
    { header: "Section", key: "sectionName", width: 28 },
    { header: "Item", key: "questionText", width: 46 },
    { header: "Note", key: "note", width: 32 },
    { header: "Inspected On", key: "inspectedAt", width: 15 },
    { header: "Inspector", key: "inspector", width: 18 },
  ];

  for (const r of rows) {
    sheet.addRow({
      roomNumber: r.roomNumber,
      roomName: r.roomName ?? "",
      floor: r.floor ?? "",
      sectionName: r.sectionName,
      questionText: r.questionText,
      note: r.note ?? "",
      inspectedAt: r.inspectedAt ? new Date(r.inspectedAt) : "",
      inspector: r.inspector ?? "",
    });
  }

  sheet.getColumn("inspectedAt").numFmt = "yyyy-mm-dd";
  sheet.getColumn("questionText").alignment = { wrapText: true, vertical: "top" };
  sheet.getColumn("note").alignment = { wrapText: true, vertical: "top" };
  styleHeader(sheet, headerColor, 8);

  if (rows.length === 0) {
    const row = sheet.addRow({ roomNumber: emptyMessage });
    row.font = { italic: true, color: { argb: "FF64748B" } };
  }
  return sheet;
}

/**
 * Full current-status report as a multi-sheet .xlsx:
 * Summary · Rooms · Open Repairs · Awaiting Verification.
 */
export async function GET() {
  await requirePermission("pm:inspections:view");

  const report = await getStatusReport();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Divya Motel — Room Condition Program";
  workbook.created = report.generatedAt;

  // --- Sheet 1: Summary -----------------------------------------------------
  const summary = workbook.addWorksheet("Summary");
  summary.columns = [
    { header: "", key: "label", width: 30 },
    { header: "", key: "value", width: 22 },
  ];
  summary.addRow({ label: "Divya Motel — Room Condition" }).font = {
    bold: true,
    size: 14,
  };
  summary.addRow({
    label: "Generated",
    value: report.generatedAt.toLocaleString(),
  });
  summary.addRow({});

  const headingRow = summary.addRow({ label: "Status", value: "Rooms" });
  headingRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headingRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE } };

  const statusRows: [string, number, string][] = [
    ["OK", report.counts.OK, GREEN],
    ["Needs Repair", report.counts.NEEDS_REPAIR, RED],
    ["Fixed – verify", report.counts.FIXED, AMBER],
    ["Not Inspected", report.counts.NOT_INSPECTED, SLATE],
  ];
  for (const [label, value, color] of statusRows) {
    const row = summary.addRow({ label, value });
    row.getCell("label").font = { bold: true, color: { argb: color } };
  }
  const totalRow = summary.addRow({ label: "Total Rooms", value: report.counts.total });
  totalRow.font = { bold: true };

  summary.addRow({});
  summary.addRow({ label: "Open repair items", value: report.repairs.length });
  summary.addRow({
    label: "Items awaiting verification",
    value: report.awaitingVerification.length,
  });

  // --- Sheet 2: Rooms -------------------------------------------------------
  const roomsSheet = workbook.addWorksheet("Rooms", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  roomsSheet.columns = [
    { header: "Room", key: "number", width: 10 },
    { header: "Room Name", key: "name", width: 20 },
    { header: "Floor", key: "floor", width: 8 },
    { header: "Status", key: "status", width: 16 },
    { header: "Open Repairs", key: "openRepairs", width: 14 },
    { header: "Awaiting Verification", key: "awaitingVerification", width: 20 },
    { header: "Last Inspected", key: "inspectedAt", width: 15 },
    { header: "Inspector", key: "inspector", width: 18 },
  ];

  for (const r of report.rooms) {
    const row = roomsSheet.addRow({
      number: r.number,
      name: r.name ?? "",
      floor: r.floor ?? "",
      status: r.statusLabel,
      openRepairs: r.openRepairs,
      awaitingVerification: r.awaitingVerification,
      inspectedAt: r.inspectedAt ? new Date(r.inspectedAt) : "",
      inspector: r.inspector ?? "",
    });
    const color =
      r.status === "NEEDS_REPAIR"
        ? RED
        : r.status === "FIXED"
          ? AMBER
          : r.status === "OK"
            ? GREEN
            : SLATE;
    row.getCell("status").font = { bold: true, color: { argb: color } };
  }
  roomsSheet.getColumn("inspectedAt").numFmt = "yyyy-mm-dd";
  styleHeader(roomsSheet, SLATE, 8);

  // --- Sheets 3 & 4: item detail -------------------------------------------
  addItemSheet(
    workbook,
    "Open Repairs",
    report.repairs,
    RED,
    "No open repairs — every inspected room is clear.",
  );
  addItemSheet(
    workbook,
    "Awaiting Verification",
    report.awaitingVerification,
    AMBER,
    "Nothing awaiting verification.",
  );

  const buffer = await workbook.xlsx.writeBuffer();
  const stamp = report.generatedAt.toISOString().slice(0, 10);

  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="divya-motel-status-report-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
