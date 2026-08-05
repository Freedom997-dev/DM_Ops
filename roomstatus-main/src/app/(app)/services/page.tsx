import Link from "next/link";
import { ChevronRight, ClipboardList, LayoutGrid, Settings, User2, Sparkles } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser, can, canAccessApp, isManager } from "@/lib/session";
import { canRunWorkflow, parseRolesAllowed } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function todayMidnightUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export default async function ServicesIndex() {
  const user = await requireUser();
  const showSettings = isManager(user);
  const today = todayMidnightUTC();

  const definitions = await prisma.workflowDefinition.findMany({
    where: { archived: false },
    orderBy: { name: "asc" },
  });

  const accessible = definitions.filter(
    (d) =>
      user.isSuperAdmin ||
      canRunWorkflow(user.roleKeys, parseRolesAllowed(d.rolesAllowed)),
  );

  const workflowCards = await Promise.all(
    accessible.map(async (d) => {
      const submission = await prisma.workflowSubmission.findUnique({
        where: { workflowId_date: { workflowId: d.id, date: today } },
        include: {
          createdBy: { select: { name: true } },
          _count: { select: { rows: true } },
        },
      });
      return { slug: d.slug, name: d.name, submission };
    }),
  );

  // PM is a built-in service (its own tables). Shown to anyone with PM access.
  const showPmCard = canAccessApp(user, "pm");
  const showHkCard = can(user, "housekeeping:board:view");

  // Live housekeeping snapshot for the card status line.
  const hkCounts = showHkCard
    ? {
        toClean: await prisma.housekeepingTask.count({ where: { status: "READY_TO_CLEAN" } }),
        inProgress: await prisma.housekeepingTask.count({ where: { status: "IN_PROGRESS" } }),
        forInspection: await prisma.housekeepingTask.count({ where: { status: "READY_FOR_INSPECTION" } }),
      }
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Services</h1>
          <p className="text-sm text-slate-500">Pick a service to run.</p>
        </div>
        {showSettings && (
          <Link href="/settings" className="btn-secondary">
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {workflowCards.length === 0 && !showPmCard && !showHkCard && (
          <div className="card col-span-full p-8 text-center text-slate-500">
            No services assigned to your role. Talk to an admin.
          </div>
        )}

        {/* Built-in PM service — title only */}
        {showPmCard && (
          <ServiceCard
            href="/services/pm"
            icon={<ClipboardList className="h-5 w-5" />}
            name="Room Condition (PM)"
            settingsHref={can(user, "pm:checklist:view") ? "/services/pm/settings" : undefined}
          />
        )}

        {/* Built-in Housekeeping (HKT) service */}
        {showHkCard && (
          <ServiceCard
            href="/services/housekeeping"
            icon={<Sparkles className="h-5 w-5" />}
            name="Housekeeping"
            settingsHref={can(user, "housekeeping:settings:configure") ? "/services/housekeeping/settings" : undefined}
            statusLine={
              hkCounts
                ? `${hkCounts.toClean} to clean · ${hkCounts.inProgress} in progress · ${hkCounts.forInspection} to inspect`
                : undefined
            }
            completed={hkCounts ? hkCounts.toClean + hkCounts.inProgress + hkCounts.forInspection === 0 : undefined}
          />
        )}

        {/* Workflow services (Daily Cleanliness, future) — title + today's status */}
        {workflowCards.map((c) => (
          <ServiceCard
            key={c.slug}
            href={`/services/${c.slug}`}
            icon={<LayoutGrid className="h-5 w-5" />}
            name={c.name}
            settingsHref={can(user, "admin:services:manage") ? `/services/${c.slug}/settings` : undefined}
            historyHref={`/services/${c.slug}/history`}
            statusLine={
              c.submission
                ? `Today: ${c.submission.status === "COMPLETED" ? "Completed" : "In progress"} · ${c.submission._count.rows} room${c.submission._count.rows === 1 ? "" : "s"} touched`
                : "Today: Not started"
            }
            startedBy={c.submission?.createdBy.name ?? null}
            completed={c.submission?.status === "COMPLETED"}
          />
        ))}
      </div>
    </div>
  );
}

function ServiceCard({
  href,
  icon,
  name,
  settingsHref,
  historyHref,
  statusLine,
  startedBy,
  completed,
}: {
  href: string;
  icon: React.ReactNode;
  name: string;
  settingsHref?: string;
  historyHref?: string;
  statusLine?: string;
  startedBy?: string | null;
  completed?: boolean;
}) {
  return (
    <div className="card group relative flex flex-col gap-3 p-5 transition hover:shadow-md">
      {settingsHref && (
        <Link
          href={settingsHref}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
          aria-label={`${name} settings`}
        >
          <Settings className="h-4 w-4" />
        </Link>
      )}
      <Link href={href} className="flex items-center gap-3 pr-8">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          {icon}
        </span>
        <h2 className="text-lg font-bold text-slate-900">{name}</h2>
      </Link>

      {statusLine && (
        <div className="space-y-1 text-xs">
          <div
            className={
              completed
                ? "inline-flex items-center gap-1 text-emerald-700"
                : "inline-flex items-center gap-1 text-slate-500"
            }
          >
            {completed !== undefined && (
              <span
                className={
                  completed
                    ? "h-2 w-2 rounded-full bg-emerald-500"
                    : "h-2 w-2 rounded-full bg-amber-500"
                }
              />
            )}
            {statusLine}
          </div>
          {startedBy && (
            <div className="inline-flex items-center gap-1 text-slate-500">
              <User2 className="h-3.5 w-3.5" />
              Started by {startedBy}
            </div>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center gap-3">
        {historyHref && (
          <Link
            href={historyHref}
            className="text-xs font-semibold text-brand-600 hover:underline"
          >
            View history →
          </Link>
        )}
        <Link
          href={href}
          className="ml-auto inline-flex items-center text-xs font-semibold text-slate-400 group-hover:text-brand-600"
        >
          Open <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
