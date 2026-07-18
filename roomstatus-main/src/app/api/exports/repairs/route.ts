import ExcelJS from "exceljs";
import { requireUser } from "@/lib/session";
import { getRepairRows } from "@/lib/reports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Downloads the outstanding repair list as a real .xlsx workbook.
 * Auth-guarded — same access model as the dashboard it mirrors.
 */
export async function GET() {
  await requireUser();

  const rows = await getRepairRows();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Divya Motel — Room Condition Program";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Repairs", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "Room", key: "roomNumber", width: 10 },
    { header: "Room Name", key: "roomName", width: 20 },
    { header: "Floor", key: "floor", width: 10 },
    { header: "Section", key: "sectionName", width: 28 },
    { header: "Repair Item", key: "questionText", width: 46 },
    { header: "Note", key: "note", width: 34 },
    { header: "Inspected On", key: "inspectedAt", width: 16 },
    { header: "Inspector", key: "inspector", width: 20 },
  ];

  // Header styling
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFB91C1C" }, // red-700, matches the Needs Repair theme
  };
  header.alignment = { vertical: "middle" };
  header.height = 20;

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

  // Date formatting + wrap long text
  sheet.getColumn("inspectedAt").numFmt = "yyyy-mm-dd";
  sheet.getColumn("questionText").alignment = { wrapText: true, vertical: "top" };
  sheet.getColumn("note").alignment = { wrapText: true, vertical: "top" };

  // Filter dropdowns across the populated range
  if (rows.length > 0) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 8 } };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="divya-motel-repairs-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
