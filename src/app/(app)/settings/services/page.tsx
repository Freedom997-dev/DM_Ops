import Link from "next/link";
import { ChevronRight, ArchiveRestore, Archive, ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SettingsServicesPage() {
  await requireAdmin();
  const definitions = await prisma.workflowDefinition.findMany({
    orderBy: [{ archived: "asc" }, { name: "asc" }],
    include: { _count: { select: { items: true, submissions: true } } },
  });

  return (
    <div className="space-y-5">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to settings
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Services</h1>
        <p className="text-sm text-slate-500">
          Manage service definitions and their item lists. Each service&rsquo;s own settings are
          reachable from its settings page.
        </p>
      </div>

      <div className="space-y-2">
        {definitions.map((d) => (
          <Link
            key={d.id}
            href={`/services/${d.slug}/settings`}
            className="card flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
          >
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900">{d.name}</h2>
                {d.archived && (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    Archived
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500">
                slug:&nbsp;<code>{d.slug}</code> · shape:&nbsp;{d.shape} · items:&nbsp;{d._count.items} ·
                submissions:&nbsp;{d._count.submissions}
              </div>
            </div>
            <span className="inline-flex items-center text-slate-400">
              {d.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              <ChevronRight className="h-5 w-5" />
            </span>
          </Link>
        ))}
        {definitions.length === 0 && (
          <div className="card p-8 text-center text-slate-500">
            No services defined yet. Seed Daily Cleanliness via the migration script.
          </div>
        )}
      </div>
    </div>
  );
}
