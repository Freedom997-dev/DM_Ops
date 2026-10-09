"use server";

// PM V2 server actions. Inspection edits auto-save (one call per tap/field),
// so they are validated + permission-checked but NOT audit-logged individually
// — only milestones (complete / reopen / mark fixed) and setup changes are.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { PMV2_BASE, RESULT_STATUSES, isIssue } from "@/lib/pmv2";
import { notify } from "@/lib/notifications/notify";

export type PmV2Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const fail = (error: string) => ({ ok: false as const, error });
const done = () => ({ ok: true as const });

const quarter = z.string().regex(/^\d{4}-Q[1-4]$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/); // client's local "today"
const id = z.string().min(1).max(64);
const status = z.enum(RESULT_STATUSES).nullable();

function revalidate() {
  revalidatePath(PMV2_BASE, "layout");
}

// ---- Inspections -------------------------------------------------------------

const SUBMIT = "pmv2:inspections:submit";

async function ensureInspection(areaId: string, q: string, today: string, userId: string) {
  return prisma.pmV2Inspection.upsert({
    where: { areaId_quarter: { areaId, quarter: q } },
    create: { areaId, quarter: q, date: today, updatedById: userId },
    update: { updatedById: userId },
  });
}

const target = z
  .object({
    areaId: id,
    quarter,
    today: day,
    itemId: id.optional(), // checklist item
    resultId: id.optional(), // one-off "added" item
  })
  .refine((v) => !!v.itemId !== !!v.resultId, "Pass exactly one of itemId / resultId");

/** Set (or clear with null) the status of one item. */
export async function pmv2SetStatus(input: unknown): Promise<PmV2Result> {
  const user = await requirePermission(SUBMIT);
  const p = target.and(z.object({ status })).safeParse(input);
  if (!p.success) return fail("Invalid input.");
  const { areaId, quarter: q, today, itemId, resultId, status: s } = p.data;
  const insp = await ensureInspection(areaId, q, today, user.id);
  const fixedOn = s === "FIXED" ? today : null;
  if (itemId) {
    await prisma.pmV2Result.upsert({
      where: { inspectionId_itemId: { inspectionId: insp.id, itemId } },
      create: { inspectionId: insp.id, itemId, status: s, fixedOn },
      update: { status: s, fixedOn },
    });
  } else {
    await prisma.pmV2Result.updateMany({
      where: { id: resultId, inspectionId: insp.id },
      data: { status: s, fixedOn },
    });
  }
  revalidate();
  return done();
}

export async function pmv2SetNote(input: unknown): Promise<PmV2Result> {
  const user = await requirePermission(SUBMIT);
  const p = target.and(z.object({ note: z.string().max(2000) })).safeParse(input);
  if (!p.success) return fail("Note is too long.");
  const { areaId, quarter: q, today, itemId, resultId, note } = p.data;
  const insp = await ensureInspection(areaId, q, today, user.id);
  if (itemId) {
    await prisma.pmV2Result.upsert({
      where: { inspectionId_itemId: { inspectionId: insp.id, itemId } },
      create: { inspectionId: insp.id, itemId, note },
      update: { note },
    });
  } else {
    await prisma.pmV2Result.updateMany({ where: { id: resultId, inspectionId: insp.id }, data: { note } });
  }
  revalidate();
  return done();
}

/** Date / initials / general notes on the inspection header. */
export async function pmv2SetMeta(input: unknown): Promise<PmV2Result> {
  const user = await requirePermission(SUBMIT);
  const p = z
    .object({
      areaId: id,
      quarter,
      today: day,
      date: day.optional(),
      initials: z.string().trim().max(6).optional(),
      notes: z.string().max(4000).optional(),
    })
    .safeParse(input);
  if (!p.success) return fail("Invalid input.");
  const { areaId, quarter: q, today, date, initials, notes } = p.data;
  await ensureInspection(areaId, q, today, user.id);
  await prisma.pmV2Inspection.update({
    where: { areaId_quarter: { areaId, quarter: q } },
    data: { date, initials: initials?.toUpperCase(), notes },
  });
  revalidate();
  return done();
}

/** "Mark rest OK": every unanswered item in the section becomes OK. */
export async function pmv2MarkSectionOk(input: unknown): Promise<PmV2Result> {
  const user = await requirePermission(SUBMIT);
  const p = z.object({ areaId: id, quarter, today: day, sectionId: id }).safeParse(input);
  if (!p.success) return fail("Invalid input.");
  const { areaId, quarter: q, today, sectionId } = p.data;
  const insp = await ensureInspection(areaId, q, today, user.id);
  const items = await prisma.pmV2Item.findMany({
    where: { sectionId, archived: false },
    select: { id: true },
  });
  const existing = await prisma.pmV2Result.findMany({
    where: { inspectionId: insp.id, itemId: { in: items.map((i) => i.id) } },
  });
  const byItem = new Map(existing.map((r) => [r.itemId, r]));
  await prisma.$transaction([
    prisma.pmV2Result.updateMany({
      where: { inspectionId: insp.id, itemId: { in: items.map((i) => i.id) }, status: null },
      data: { status: "OK" },
    }),
    prisma.pmV2Result.createMany({
      data: items
        .filter((i) => !byItem.has(i.id))
        .map((i) => ({ inspectionId: insp.id, itemId: i.id, status: "OK" })),
    }),
  ]);
  revalidate();
  return done();
}

export async function pmv2AddExtra(input: unknown): Promise<PmV2Result<{ id: string }>> {
  const user = await requirePermission(SUBMIT);
  const p = z
    .object({ areaId: id, quarter, today: day, label: z.string().trim().min(1).max(300) })
    .safeParse(input);
  if (!p.success) return fail("Give the item a name.");
  const insp = await ensureInspection(p.data.areaId, p.data.quarter, p.data.today, user.id);
  const r = await prisma.pmV2Result.create({
    data: { inspectionId: insp.id, itemId: null, label: p.data.label },
  });
  revalidate();
  return { ok: true, data: { id: r.id } };
}

export async function pmv2RemoveExtra(resultId: string): Promise<PmV2Result> {
  await requirePermission(SUBMIT);
  await prisma.pmV2Result.deleteMany({ where: { id: resultId, itemId: null } });
  revalidate();
  return done();
}

export async function pmv2SetDone(input: unknown): Promise<PmV2Result> {
  const user = await requirePermission(SUBMIT);
  const p = z.object({ areaId: id, quarter, today: day, done: z.boolean() }).safeParse(input);
  if (!p.success) return fail("Invalid input.");
  const { areaId, quarter: q, today, done: isDone } = p.data;
  const insp = await ensureInspection(areaId, q, today, user.id);
  await prisma.pmV2Inspection.update({
    where: { id: insp.id },
    data: { done: isDone, completedOn: isDone ? today : null },
  });
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "PmV2Inspection",
    entityId: insp.id,
    details: { quarter: q, areaId, event: isDone ? "completed" : "reopened" },
  });
  if (isDone) {
    const results = await prisma.pmV2Result.findMany({
      where: { inspectionId: insp.id },
      select: { status: true },
    });
    const repairs = results.filter((x) => isIssue(x.status)).length;
    if (repairs > 0) {
      const area = await prisma.pmV2Area.findUnique({ where: { id: areaId }, select: { name: true } });
      await notify({
        type: "pmv2.repairs_found",
        actorId: user.id,
        title: `${area?.name ?? "Inspection"}: ${repairs} repair${repairs === 1 ? "" : "s"} found`,
        body: `Inspection completed by ${user.name}.`,
        href: `${PMV2_BASE}/issues?q=${q}`,
        entityType: "PmV2Inspection",
        entityId: insp.id,
      });
    }
  }
  revalidate();
  return done();
}

/** From the repair list: flip an open issue to Fixed. */
export async function pmv2MarkFixed(input: unknown): Promise<PmV2Result> {
  const user = await requirePermission(SUBMIT);
  const p = z.object({ resultId: id, today: day }).safeParse(input);
  if (!p.success) return fail("Invalid input.");
  const r = await prisma.pmV2Result.update({
    where: { id: p.data.resultId },
    data: { status: "FIXED", fixedOn: p.data.today },
  });
  await logAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "PmV2Inspection",
    entityId: r.inspectionId,
    details: { event: "marked fixed", resultId: r.id },
  });
  const insp = await prisma.pmV2Inspection.findUnique({
    where: { id: r.inspectionId },
    select: { quarter: true, updatedById: true, area: { select: { name: true } } },
  });
  const item = r.itemId ? await prisma.pmV2Item.findUnique({ where: { id: r.itemId }, select: { label: true } }) : null;
  if (insp) {
    await notify({
      type: "pmv2.repair_fixed",
      actorId: user.id,
      userIds: [insp.updatedById],
      title: `Fixed: ${item?.label ?? r.label ?? "repair"} · ${insp.area.name}`,
      body: `Marked fixed by ${user.name}.`,
      href: `${PMV2_BASE}/issues?q=${insp.quarter}`,
      entityType: "PmV2Result",
      entityId: r.id,
    });
  }
  revalidate();
  return done();
}

// ---- Setup -------------------------------------------------------------------

const CONFIGURE = "pmv2:setup:configure";
const name = z.string().trim().min(1, "Name is required").max(120);

async function audit(
  userId: string,
  action: "CREATE" | "UPDATE" | "ARCHIVE",
  entity: "PmV2Setting" | "PmV2Checklist" | "PmV2Section" | "PmV2Item" | "PmV2Area",
  entityId: string,
  details: Record<string, unknown>,
) {
  await logAudit({ userId, action, entity, entityId, details });
}

export async function pmv2SetHotelName(value: string): Promise<PmV2Result> {
  const user = await requirePermission(CONFIGURE);
  const v = z.string().trim().max(120).safeParse(value);
  if (!v.success) return fail("Name is too long.");
  await prisma.pmV2Setting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", hotelName: v.data },
    update: { hotelName: v.data },
  });
  await audit(user.id, "UPDATE", "PmV2Setting", "singleton", { hotelName: v.data });
  revalidate();
  return done();
}

// Checklists
export async function pmv2CreateChecklist(): Promise<PmV2Result<{ id: string }>> {
  const user = await requirePermission(CONFIGURE);
  const max = await prisma.pmV2Checklist.aggregate({ _max: { order: true } });
  const c = await prisma.pmV2Checklist.create({
    data: {
      name: "New checklist",
      order: (max._max.order ?? 0) + 1,
      sections: { create: { name: "General", order: 1 } },
    },
  });
  await audit(user.id, "CREATE", "PmV2Checklist", c.id, { name: c.name });
  revalidate();
  return { ok: true, data: { id: c.id } };
}

export async function pmv2RenameChecklist(checklistId: string, value: string): Promise<PmV2Result> {
  const user = await requirePermission(CONFIGURE);
  const v = name.safeParse(value);
  if (!v.success) return fail(v.error.issues[0].message);
  await prisma.pmV2Checklist.update({ where: { id: checklistId }, data: { name: v.data } });
  await audit(user.id, "UPDATE", "PmV2Checklist", checklistId, { name: v.data });
  revalidate();
  return done();
}

export async function pmv2DeleteChecklist(checklistId: string): Promise<PmV2Result> {
  const user = await requirePermission(CONFIGURE);
  const used = await prisma.pmV2Area.count({ where: { checklistId, archived: false } });
  if (used) return fail(`Move its ${used} area${used === 1 ? "" : "s"} to another checklist first.`);
  await prisma.pmV2Checklist.update({ where: { id: checklistId }, data: { archived: true } });
  await audit(user.id, "ARCHIVE", "PmV2Checklist", checklistId, {});
  revalidate();
  return done();
}

// Sections
export async function pmv2AddSection(checklistId: string, value: string): Promise<PmV2Result> {
  const user = await requirePermission(CONFIGURE);
  const v = name.safeParse(value);
  if (!v.success) return fail(v.error.issues[0].message);
  const max = await prisma.pmV2Section.aggregate({ where: { checklistId }, _max: { order: true } });
  const s = await prisma.pmV2Section.create({
    data: { checklistId, name: v.data, order: (max._max.order ?? 0) + 1 },
  });
  await audit(user.id, "CREATE", "PmV2Section", s.id, { name: s.name });
  revalidate();
  return done();
}

export async function pmv2RenameSection(sectionId: string, value: string): Promise<PmV2Result> {
  const user = await requirePermission(CONFIGURE);
  const v = name.safeParse(value);
  if (!v.success) return fail(v.error.issues[0].message);
  await prisma.pmV2Section.update({ where: { id: sectionId }, data: { name: v.data } });
  await audit(user.id, "UPDATE", "PmV2Section", sectionId, { name: v.data });
  revalidate();
  return done();
}

export async function pmv2DeleteSection(sectionId: string): Promise<PmV2Result> {
  const user = await requirePermission(CONFIGURE);
  // Archive (not delete) so past results keep their labels.
  await prisma.$transaction([
    prisma.pmV2Section.update({ where: { id: sectionId }, data: { archived: true } }),
    prisma.pmV2Item.updateMany({ where: { sectionId }, data: { archived: true } }),
  ]);
  await audit(user.id, "ARCHIVE", "PmV2Section", sectionId, {});
  revalidate();
  return done();
}

// Items
export async function pmv2AddItem(sectionId: string, value: string): Promise<PmV2Result> {
  const user = await requirePermission(CONFIGURE);
  const v = z.string().trim().min(1, "Item text is required").max(300).safeParse(value);
  if (!v.success) return fail(v.error.issues[0].message);
  const max = await prisma.pmV2Item.aggregate({ where: { sectionId }, _max: { order: true } });
  const i = await prisma.pmV2Item.create({
    data: { sectionId, label: v.data, order: (max._max.order ?? 0) + 1 },
  });
  await audit(user.id, "CREATE", "PmV2Item", i.id, { label: i.label });
  revalidate();
  return done();
}

export async function pmv2RenameItem(itemId: string, value: string): Promise<PmV2Result> {
  const user = await requirePermission(CONFIGURE);
  const v = z.string().trim().min(1, "Item text is required").max(300).safeParse(value);
  if (!v.success) return fail(v.error.issues[0].message);
  const before = await prisma.pmV2Item.findUnique({ where: { id: itemId } });
  await prisma.pmV2Item.update({ where: { id: itemId }, data: { label: v.data } });
  await audit(user.id, "UPDATE", "PmV2Item", itemId, { before: before?.label, after: v.data });
  revalidate();
  return done();
}

export async function pmv2DeleteItem(itemId: string): Promise<PmV2Result> {
  const user = await requirePermission(CONFIGURE);
  await prisma.pmV2Item.update({ where: { id: itemId }, data: { archived: true } });
  await audit(user.id, "ARCHIVE", "PmV2Item", itemId, {});
  revalidate();
  return done();
}

/** Swap a section or item with its visible neighbour (dir -1 = up, 1 = down). */
export async function pmv2Move(
  kind: "section" | "item",
  rowId: string,
  dir: -1 | 1,
): Promise<PmV2Result> {
  await requirePermission(CONFIGURE);
  if (kind === "section") {
    const me = await prisma.pmV2Section.findUnique({ where: { id: rowId } });
    if (!me) return fail("Section not found.");
    const sibs = await prisma.pmV2Section.findMany({
      where: { checklistId: me.checklistId, archived: false },
      orderBy: { order: "asc" },
    });
    await reorder(sibs, rowId, dir, (sid, order) =>
      prisma.pmV2Section.update({ where: { id: sid }, data: { order } }),
    );
  } else {
    const me = await prisma.pmV2Item.findUnique({ where: { id: rowId } });
    if (!me) return fail("Item not found.");
    const sibs = await prisma.pmV2Item.findMany({
      where: { sectionId: me.sectionId, archived: false },
      orderBy: { order: "asc" },
    });
    await reorder(sibs, rowId, dir, (sid, order) =>
      prisma.pmV2Item.update({ where: { id: sid }, data: { order } }),
    );
  }
  revalidate();
  return done();
}

// Rewrites 1..n orders after swapping — also heals duplicate order values.
async function reorder<T extends { id: string }>(
  rows: T[],
  rowId: string,
  dir: -1 | 1,
  write: (id: string, order: number) => Promise<unknown>,
) {
  const i = rows.findIndex((r) => r.id === rowId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  await Promise.all(rows.map((r, k) => write(r.id, k + 1)));
}

// Areas
const areaType = z.enum(["ROOM", "AREA"]);

export async function pmv2BulkAddRooms(input: unknown): Promise<PmV2Result<{ added: number }>> {
  const user = await requirePermission(CONFIGURE);
  const p = z
    .object({
      from: z.number().int().min(0),
      to: z.number().int().min(0),
      group: z.string().trim().max(60),
      checklistId: id.nullable(),
    })
    .safeParse(input);
  if (!p.success) return fail("Enter a first and last room number.");
  const { from, to, group, checklistId } = p.data;
  if (to < from) return fail("Enter a first and last room number, with the last one higher.");
  if (to - from > 200) return fail("Add up to 200 rooms at a time.");

  const existing = new Set(
    (await prisma.pmV2Area.findMany({ where: { archived: false }, select: { name: true } })).map(
      (a) => a.name.toLowerCase(),
    ),
  );
  // Link to the shared Room record when one exists with that number.
  const rooms = new Map(
    (await prisma.room.findMany({ select: { id: true, number: true } })).map((r) => [r.number, r.id]),
  );
  const max = await prisma.pmV2Area.aggregate({ _max: { order: true } });
  let order = max._max.order ?? 0;
  const data = [];
  for (let n = from; n <= to; n++) {
    const nm = `Room ${n}`;
    if (existing.has(nm.toLowerCase())) continue;
    data.push({
      name: nm,
      type: "ROOM",
      group: group || "Guest rooms",
      checklistId,
      roomId: rooms.get(String(n)) ?? null,
      order: ++order,
    });
  }
  if (data.length) await prisma.pmV2Area.createMany({ data });
  await audit(user.id, "CREATE", "PmV2Area", "bulk", { from, to, added: data.length });
  revalidate();
  return { ok: true, data: { added: data.length } };
}

export async function pmv2AddArea(input: unknown): Promise<PmV2Result> {
  const user = await requirePermission(CONFIGURE);
  const p = z
    .object({ name, group: z.string().trim().max(60), type: areaType, checklistId: id.nullable() })
    .safeParse(input);
  if (!p.success) return fail("Give the area a name.");
  const max = await prisma.pmV2Area.aggregate({ _max: { order: true } });
  const a = await prisma.pmV2Area.create({
    data: {
      ...p.data,
      group: p.data.group || "Common areas",
      order: (max._max.order ?? 0) + 1,
    },
  });
  await audit(user.id, "CREATE", "PmV2Area", a.id, { name: a.name });
  revalidate();
  return done();
}

export async function pmv2UpdateArea(input: unknown): Promise<PmV2Result> {
  const user = await requirePermission(CONFIGURE);
  const p = z
    .object({
      id,
      name: name.optional(),
      group: z.string().trim().max(60).optional(),
      type: areaType.optional(),
      checklistId: id.nullable().optional(),
    })
    .safeParse(input);
  if (!p.success) return fail("Invalid value.");
  const { id: areaId, ...data } = p.data;
  await prisma.pmV2Area.update({ where: { id: areaId }, data });
  await audit(user.id, "UPDATE", "PmV2Area", areaId, data);
  revalidate();
  return done();
}

export async function pmv2RemoveArea(areaId: string): Promise<PmV2Result> {
  const user = await requirePermission(CONFIGURE);
  // Archive so past quarters keep their history.
  await prisma.pmV2Area.update({ where: { id: areaId }, data: { archived: true } });
  await audit(user.id, "ARCHIVE", "PmV2Area", areaId, {});
  revalidate();
  return done();
}
