// PM V2 — import from the "Room Condition PM" Claude artifact.
//
// Two uses:
//   1. seed.ts calls importPmV2Config() with prisma/pmv2-seed.json so a fresh
//      database gets the V2 checklists + rooms/areas (only when V2 is empty).
//   2. One-off data move (config + inspections) from an artifact export:
//        tsx prisma/pmv2Import.ts ../pmv2-artifact-export
//      where the folder holds config/{checklists,areas,settings}.json and
//      inspections/<quarter>__<areaId>.json as exported from the artifact DB.
//
// Artifact ids ("gr01", "r101", "guestroom") are kept as primary keys, so the
// import is idempotent and inspection results line up with checklist items.

import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

type SeedConfig = {
  hotel: string;
  checklists: {
    id: string;
    name: string;
    sections: { id: string; name: string; items: { id: string; label: string }[] }[];
  }[];
  areas: { id: string; name: string; group: string; type: "ROOM" | "AREA"; checklist: string }[];
};

type ArtifactResult = { s?: string; n?: string; fixedOn?: string };
type ArtifactInspection = {
  quarter: string;
  areaId: string;
  date?: string;
  initials?: string;
  notes?: string;
  done?: boolean;
  completedOn?: string;
  results?: Record<string, ArtifactResult>;
  extra?: ({ id: string; label: string } & ArtifactResult)[];
};

const STATUS: Record<string, string> = {
  ok: "OK",
  repair: "REPAIR",
  replace: "REPLACE",
  missing: "MISSING",
  fixed: "FIXED",
  na: "NA",
};
const mapStatus = (s?: string) => (s && STATUS[s]) || null;

/** Upsert checklists, sections, items, areas and the hotel name. */
export async function importPmV2Config(prisma: PrismaClient, cfg: SeedConfig) {
  await prisma.pmV2Setting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", hotelName: cfg.hotel },
    update: {},
  });

  for (const [ci, c] of cfg.checklists.entries()) {
    await prisma.pmV2Checklist.upsert({
      where: { id: c.id },
      create: { id: c.id, name: c.name, order: ci + 1 },
      update: {},
    });
    for (const [si, s] of c.sections.entries()) {
      await prisma.pmV2Section.upsert({
        where: { id: s.id },
        create: { id: s.id, checklistId: c.id, name: s.name, order: si + 1 },
        update: {},
      });
      for (const [ii, it] of s.items.entries()) {
        await prisma.pmV2Item.upsert({
          where: { id: it.id },
          create: { id: it.id, sectionId: s.id, label: it.label, order: ii + 1 },
          update: {},
        });
      }
    }
  }

  // Link guest rooms to the shared Room record by number ("Room 204" -> "204").
  const rooms = new Map(
    (await prisma.room.findMany({ select: { id: true, number: true } })).map((r) => [r.number, r.id]),
  );
  for (const [ai, a] of cfg.areas.entries()) {
    const num = a.type === "ROOM" ? a.name.replace(/^room\s*/i, "") : null;
    await prisma.pmV2Area.upsert({
      where: { id: a.id },
      create: {
        id: a.id,
        name: a.name,
        group: a.group,
        type: a.type,
        checklistId: a.checklist,
        roomId: (num && rooms.get(num)) || null,
        order: ai + 1,
      },
      update: {},
    });
  }
}

/**
 * Decide what to do when an inspection for this area+quarter already exists
 * in V2 (e.g. someone started using V2 before the final import was re-run).
 *
 * "skip"      keep the V2 inspection untouched, ignore the artifact copy
 * "overwrite" replace the V2 inspection's results with the artifact's
 *
 * TODO(you): pick the rule. Things you might weigh:
 *   - existing.updatedAt vs incoming.updatedAt (which is newer?)
 *   - existing.done (never clobber a completed V2 inspection?)
 *   - existing result count (V2 has real work in it vs. an empty shell)
 */
function resolveConflict(
  existing: { done: boolean; updatedAt: Date; resultCount: number },
  incoming: { done: boolean; updatedAt: Date | null; resultCount: number },
): "skip" | "overwrite" {
  return "skip"; // safe default: never lose work done in V2
}

export async function importPmV2Inspections(prisma: PrismaClient, dir: string) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const items = new Set((await prisma.pmV2Item.findMany({ select: { id: true } })).map((i) => i.id));
  let created = 0,
    overwritten = 0,
    skipped = 0;

  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const d: ArtifactInspection & { updatedAt?: string } = raw.data ?? raw;
    const results = Object.entries(d.results ?? {}).filter(([itemId]) => items.has(itemId));
    const incoming = {
      done: !!d.done,
      updatedAt: d.updatedAt ? new Date(d.updatedAt) : null,
      resultCount: results.length + (d.extra?.length ?? 0),
    };

    const existing = await prisma.pmV2Inspection.findUnique({
      where: { areaId_quarter: { areaId: d.areaId, quarter: d.quarter } },
      include: { _count: { select: { results: true } } },
    });
    if (existing) {
      const verdict = resolveConflict(
        { done: existing.done, updatedAt: existing.updatedAt, resultCount: existing._count.results },
        incoming,
      );
      if (verdict === "skip") {
        skipped++;
        continue;
      }
      await prisma.pmV2Inspection.delete({ where: { id: existing.id } }); // cascades results
      overwritten++;
    } else {
      created++;
    }

    await prisma.pmV2Inspection.create({
      data: {
        areaId: d.areaId,
        quarter: d.quarter,
        date: d.date || new Date().toISOString().slice(0, 10),
        initials: (d.initials ?? "").toUpperCase(),
        notes: d.notes ?? "",
        done: !!d.done,
        completedOn: d.completedOn ?? null,
        results: {
          create: [
            ...results.map(([itemId, r]) => ({
              itemId,
              status: mapStatus(r.s),
              note: r.n ?? "",
              fixedOn: r.fixedOn ?? null,
            })),
            ...(d.extra ?? []).map((e) => ({
              itemId: null,
              label: e.label,
              status: mapStatus(e.s),
              note: e.n ?? "",
              fixedOn: e.fixedOn ?? null,
            })),
          ],
        },
      },
    });
  }
  return { created, overwritten, skipped, files: files.length };
}

// CLI: tsx prisma/pmv2Import.ts <export-dir>
if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("Usage: tsx prisma/pmv2Import.ts <artifact-export-dir>");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  (async () => {
    const read = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, "config", f), "utf8"));
    const unwrap = (j: any) => j.data ?? j;
    const lists = unwrap(read("checklists.json")).lists as Record<string, any>;
    const areas = unwrap(read("areas.json")).areas as any[];
    const hotel = unwrap(read("settings.json")).hotel ?? "";
    await importPmV2Config(prisma, {
      hotel,
      checklists: Object.entries(lists).map(([id, l]) => ({ id, name: l.name, sections: l.sections })),
      areas: areas.map((a) => ({
        id: a.id,
        name: a.name,
        group: a.group ?? "",
        type: a.type === "room" ? "ROOM" : "AREA",
        checklist: a.checklist,
      })),
    });
    console.log("✓ PM V2 config imported");
    const r = await importPmV2Inspections(prisma, path.join(dir, "inspections"));
    console.log(
      `✓ PM V2 inspections: ${r.created} created, ${r.overwritten} overwritten, ${r.skipped} skipped (of ${r.files})`,
    );
  })()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
