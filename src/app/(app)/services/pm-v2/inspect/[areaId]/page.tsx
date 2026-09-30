import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission, can } from "@/lib/session";
import { getAreas } from "@/lib/pmv2-data";
import { quarterFromParams } from "@/lib/pmv2";
import { PmV2InspectForm, type InspectData } from "@/components/pmv2/PmV2InspectForm";

export const dynamic = "force-dynamic";

export default async function PmV2InspectPage({
  params,
  searchParams,
}: {
  params: Promise<{ areaId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ areaId }, sp] = await Promise.all([params, searchParams]);
  const user = await requirePermission("pmv2:board:view");
  const q = quarterFromParams(sp.q);

  const [areas, area] = await Promise.all([
    getAreas(),
    prisma.pmV2Area.findUnique({
      where: { id: areaId },
      include: {
        checklist: {
          include: {
            sections: {
              where: { archived: false },
              orderBy: { order: "asc" },
              include: { items: { where: { archived: false }, orderBy: { order: "asc" } } },
            },
          },
        },
        inspections: {
          where: { quarter: q },
          include: {
            results: { orderBy: { createdAt: "asc" } },
            updatedBy: { select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);
  if (!area || area.archived) notFound();

  const insp = area.inspections[0] ?? null;
  const i = areas.findIndex((a) => a.id === area.id);
  const nav = (a?: (typeof areas)[number]) => (a ? { id: a.id, name: a.name, type: a.type } : null);

  const data: InspectData = {
    quarter: q,
    area: { id: area.id, name: area.name, type: area.type },
    checklistName: area.checklist?.name ?? null,
    sections: (area.checklist?.sections ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      items: s.items.map((it) => ({ id: it.id, label: it.label })),
    })),
    results: Object.fromEntries(
      (insp?.results ?? [])
        .filter((r) => r.itemId)
        .map((r) => [r.itemId!, { status: r.status, note: r.note }]),
    ),
    extras: (insp?.results ?? [])
      .filter((r) => !r.itemId)
      .map((r) => ({ id: r.id, label: r.label ?? "", status: r.status, note: r.note })),
    meta: {
      date: insp?.date ?? null,
      initials: insp?.initials ?? "",
      notes: insp?.notes ?? "",
      done: insp?.done ?? false,
      completedOn: insp?.completedOn ?? null,
      updatedAt: insp?.updatedAt.toISOString() ?? null,
      updatedBy: insp?.updatedBy
        ? insp.updatedBy.id === user.id
          ? "you"
          : insp.updatedBy.name
        : null,
    },
    prev: nav(areas[i - 1]),
    next: nav(areas[i + 1]),
  };

  return <PmV2InspectForm key={`${area.id}-${q}`} data={data} canWrite={can(user, "pmv2:inspections:submit")} />;
}
