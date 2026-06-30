import Link from "next/link";
import { ClipboardCheck, ChevronRight, LayoutDashboard, User2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canRunWorkflow, parseRolesAllowed, isAdmin } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function todayMidnightUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export default async function WorkflowsIndex() {
  const user = await requireUser();
  const today = todayMidnightUTC();

  const definitions = await prisma.workflowDefinition.findMany({
    where: { archived: false },
    orderBy: { name: "asc" },
  });

  // For each accessible workflow, fetch today's submission stats
  const accessible = definitions.filter((d) => canRunWorkflow(user.role, parseRolesAllowed(d.rolesAllowed)));

  const cards = await Promise.all(
    accessible.map(async (d) => {
      const submission = await prisma.workflowSubmission.findUnique({
        where: { workflowId_date: { workflowId: d.id, date: today } },
        include: {
          createdBy: { select: { name: true } },
          _count: { select: { rows: true, cells: true } },
        },
      });
      return {
        slug: d.slug,
        name: d.name,
        description: d.description,
        submission,
      };
    }),
  );

  const showLegacyPmCard = isAdmin(user.role) || user.role === "INSPECTOR";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Workflows</h1>
        <p className="text-sm text-slate-500">Pick a workflow to run.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.length === 0 && !showLegacyPmCard && (
          <div className="card col-span-full p-8 text-center text-slate-500">
            No workflows assigned to your role. Talk to an admin.
          </div>
        )}

        {cards.map((c) => (
          <Link
            key={c.slug}
            href={`/workflows/${c.slug}`}
            className="card group flex flex-col gap-3 p-5 transition hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{c.name}</h2>
                {c.description && <p className="text-xs text-slate-500">{c.description}</p>}
              </div>
              <ChevronRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
            </div>
            <div className="space-y-1 text-xs">
              {c.submission ? (
                <>
                  <div
                    className={
                      c.submission.status === "COMPLETED"
                        ? "inline-flex items-center gap-1 text-emerald-700"
                        : "inline-flex items-center gap-1 text-amber-700"
                    }
                  >
                    <span
                      className={
                        c.submission.status === "COMPLETED"
                          ? "h-2 w-2 rounded-full bg-emerald-500"
                          : "h-2 w-2 rounded-full bg-amber-500"
                      }
                    />
                    Today:{" "}
                    {c.submission.status === "COMPLETED" ? "Completed" : "In progress"} ·{" "}
                    {c.submission._count.rows} room{c.submission._count.rows === 1 ? "" : "s"} touched
                  </div>
                  <div className="inline-flex items-center gap-1 text-slate-500">
                    <User2 className="h-3.5 w-3.5" />
                    Started by {c.submission.createdBy.name}
                  </div>
                </>
              ) : (
                <div className="text-slate-500">Today: Not started</div>
              )}
            </div>
            <Link
              href={`/workflows/${c.slug}/history`}
              className="self-start text-xs font-semibold text-brand-600 hover:underline"
            >
              View history →
            </Link>
          </Link>
        ))}

        {showLegacyPmCard && (
          <Link
            href="/dashboard"
            className="card group flex flex-col gap-3 p-5 transition hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Room Condition (PM)</h2>
                <p className="text-xs text-slate-500">
                  Per-room deep inspection — the original 95-item preventive maintenance checklist.
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
            </div>
            <div className="inline-flex items-center gap-1 text-xs text-slate-500">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Open dashboard
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
