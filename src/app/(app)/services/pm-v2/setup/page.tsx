import Link from "next/link";
import clsx from "clsx";
import { requirePermission } from "@/lib/session";
import { getAreas, getChecklists, getHotelName } from "@/lib/pmv2-data";
import { PMV2_BASE, quarterFromParams } from "@/lib/pmv2";
import { PmV2ChecklistSetup } from "@/components/pmv2/PmV2ChecklistSetup";
import { PmV2AreasSetup } from "@/components/pmv2/PmV2AreasSetup";

export const dynamic = "force-dynamic";

export default async function PmV2Setup({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  await requirePermission("pmv2:setup:configure");
  const q = quarterFromParams(sp.q);
  const tab = sp.tab === "areas" ? "areas" : "checklists";
  const [checklists, areas, hotel] = await Promise.all([getChecklists(), getAreas(), getHotelName()]);

  const lists = checklists.map((c) => ({
    id: c.id,
    name: c.name,
    used: areas.filter((a) => a.checklistId === c.id).length,
    sections: c.sections.map((s) => ({
      id: s.id,
      name: s.name,
      items: s.items.map((i) => ({ id: i.id, label: i.label })),
    })),
  }));
  const listParam = typeof sp.list === "string" ? sp.list : undefined;
  const selected = lists.find((l) => l.id === listParam)?.id ?? lists[0]?.id ?? null;

  const tabLink = (k: string, label: string) => (
    <Link
      href={`${PMV2_BASE}/setup?q=${q}${k === "areas" ? "&tab=areas" : ""}`}
      aria-current={tab === k ? "true" : undefined}
      className={clsx(
        "rounded-full border px-3 py-1 text-sm font-semibold transition",
        tab === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-500 hover:text-slate-800",
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="section-heading">Setup</div>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">{tab === "areas" ? "Rooms & areas" : "Checklists"}</h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tabLink("checklists", "Checklists")}
          {tabLink("areas", `Rooms & areas (${areas.length})`)}
        </div>
      </div>

      {tab === "areas" ? (
        <PmV2AreasSetup
          hotel={hotel}
          lists={lists.map((l) => ({ id: l.id, name: l.name }))}
          areas={areas.map((a) => ({ id: a.id, name: a.name, group: a.group, type: a.type, checklistId: a.checklistId }))}
        />
      ) : (
        <PmV2ChecklistSetup lists={lists} selected={selected} q={q} />
      )}
    </div>
  );
}
