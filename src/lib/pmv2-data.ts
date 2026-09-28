// PM V2 — server-side loaders. Single source of truth for the board, issues
// list, report and Excel export so their numbers always agree. Server only.
import { prisma } from "@/lib/db";
import { isIssue, quarterLabel, type AreaState } from "@/lib/pmv2";

export async function getHotelName(): Promise<string> {
  const s = await prisma.pmV2Setting.findUnique({ where: { id: "singleton" } });
  return s?.hotelName || "";
}

/** Active checklists with their active sections/items, in display order. */
export async function getChecklists() {
  return prisma.pmV2Checklist.findMany({
    where: { archived: false },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: {
      sections: {
        where: { archived: false },
        orderBy: { order: "asc" },
        include: { items: { where: { archived: false }, orderBy: { order: "asc" } } },
      },
    },
  });
}
export type ChecklistFull = Awaited<ReturnType<typeof getChecklists>>[number];

export async function getAreas() {
  return prisma.pmV2Area.findMany({
    where: { archived: false },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });
}

/**
 * Everything for one quarter: areas + their inspection + derived stats.
 * Stats follow the artifact: total = active checklist items + extras;
 * "answered" = any status set; issues = Repair/Replace/Missing.
 */
export async function loadQuarter(quarter: string) {
  const [areas, checklists, inspections] = await Promise.all([
    getAreas(),
    getChecklists(),
    prisma.pmV2Inspection.findMany({
      where: { quarter },
      include: {
        results: { include: { item: { include: { section: true } } } },
        updatedBy: { select: { name: true } },
      },
    }),
  ]);

  const listById = new Map(checklists.map((c) => [c.id, c]));
  const inspByArea = new Map(inspections.map((i) => [i.areaId, i]));

  const rows = areas.map((a) => {
    const list = a.checklistId ? listById.get(a.checklistId) : undefined;
    const activeIds = new Set(list?.sections.flatMap((s) => s.items.map((i) => i.id)) ?? []);
    const insp = inspByArea.get(a.id) ?? null;
    const results = insp?.results ?? [];
    const counted = results.filter((r) => (r.itemId ? activeIds.has(r.itemId) : true));
    const extras = results.filter((r) => !r.itemId);
    const total = activeIds.size + extras.length;
    const ans = counted.filter((r) => r.status).length;
    const iss = counted.filter((r) => isIssue(r.status)).length;
    const state: AreaState = insp?.done ? "done" : ans > 0 ? "prog" : "todo";
    return { area: a, checklistName: list?.name ?? "", insp, total, ans, iss, state };
  });

  return { quarter, rows, checklists };
}
export type QuarterData = Awaited<ReturnType<typeof loadQuarter>>;
export type AreaRow = QuarterData["rows"][number];

// ---- Issues / report --------------------------------------------------------

export type IssueLine = {
  resultId: string;
  areaId: string;
  area: string;
  group: string;
  section: string;
  item: string;
  status: string;
  note: string;
  date: string;
  initials: string;
  fixedOn: string | null;
};

/** Every Repair/Replace/Missing/Fixed result in the quarter, grouped by area order. */
export function issueLines(data: QuarterData): IssueLine[] {
  const out: IssueLine[] = [];
  for (const row of data.rows) {
    if (!row.insp) continue;
    const results = [...row.insp.results].sort(
      (a, b) =>
        (a.item?.section.order ?? 1e9) - (b.item?.section.order ?? 1e9) ||
        (a.item?.order ?? 1e9) - (b.item?.order ?? 1e9) ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
    for (const r of results) {
      if (!isIssue(r.status) && r.status !== "FIXED") continue;
      const removed = r.item && (r.item.archived || r.item.section.archived);
      out.push({
        resultId: r.id,
        areaId: row.area.id,
        area: row.area.name,
        group: row.area.group,
        section: r.item ? (removed ? "Removed from checklist" : r.item.section.name) : "Added item",
        item: r.item ? r.item.label : r.label ?? "",
        status: r.status!,
        note: r.note,
        date: row.insp.date,
        initials: row.insp.initials,
        fixedOn: r.fixedOn,
      });
    }
  }
  return out;
}

export async function buildReport(quarter: string) {
  const [data, hotel] = await Promise.all([loadQuarter(quarter), getHotelName()]);
  const lines = issueLines(data);
  const open = lines.filter((l) => isIssue(l.status));
  const fixed = lines.filter((l) => l.status === "FIXED");
  const c = { done: 0, prog: 0, todo: 0 };
  data.rows.forEach((r) => c[r.state]++);
  const byStatus = {
    REPAIR: open.filter((o) => o.status === "REPAIR").length,
    REPLACE: open.filter((o) => o.status === "REPLACE").length,
    MISSING: open.filter((o) => o.status === "MISSING").length,
  };
  const rooms = data.rows.map((r) => ({
    id: r.area.id,
    name: r.area.name,
    group: r.area.group,
    checklist: r.checklistName,
    status: { done: "Complete", prog: "In progress", todo: "Not started" }[r.state],
    ans: r.ans,
    total: r.total,
    iss: r.iss,
    fixed: fixed.filter((f) => f.areaId === r.area.id).length,
    date: r.insp?.date ?? "",
    initials: r.insp?.initials ?? "",
    notes: r.insp?.notes ?? "",
  }));
  return {
    hotel: hotel || "Hotel",
    quarter,
    quarterLabel: quarterLabel(quarter),
    generated: new Date(),
    counts: c,
    byStatus,
    rooms,
    open,
    fixed,
    total: data.rows.length,
    withIssues: new Set(open.map((o) => o.areaId)).size,
  };
}
export type Report = Awaited<ReturnType<typeof buildReport>>;

/** Report as sent to the browser (Dates as ISO strings). */
export type ReportDTO = Omit<Report, "generated"> & { generated: string };
export function toDTO(r: Report): ReportDTO {
  return { ...r, generated: r.generated.toISOString() };
}
