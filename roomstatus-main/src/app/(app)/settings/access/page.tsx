import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { ROLES, parseRolesAllowed } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function AccessControlPage() {
  await requireAdmin();

  const definitions = await prisma.workflowDefinition.findMany({
    where: { archived: false },
    orderBy: { name: "asc" },
  });

  // PM is a built-in service accessible to ADMIN + INSPECTOR.
  const rows: { name: string; slug: string; allowed: string[]; settingsHref: string | null }[] = [
    { name: "Room Condition (PM)", slug: "pm", allowed: ["ADMIN", "INSPECTOR"], settingsHref: null },
    ...definitions.map((d) => ({
      name: d.name,
      slug: d.slug,
      allowed: parseRolesAllowed(d.rolesAllowed) as string[],
      settingsHref: `/services/${d.slug}/settings`,
    })),
  ];

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
        <h1 className="text-2xl font-bold text-slate-900">Access control</h1>
        <p className="text-sm text-slate-500">
          Which roles can run each service. Edit a workflow service&rsquo;s roles from its own
          settings page. PM access is built-in.
        </p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Service</th>
              {ROLES.map((r) => (
                <th key={r} className="px-3 py-2.5 text-center font-medium">
                  {r}
                </th>
              ))}
              <th className="px-4 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.slug} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-800">{row.name}</td>
                {ROLES.map((r) => (
                  <td key={r} className="px-3 py-2.5 text-center">
                    {row.allowed.includes(r) ? (
                      <Check className="mx-auto h-4 w-4 text-emerald-600" />
                    ) : (
                      <span className="text-slate-300">–</span>
                    )}
                  </td>
                ))}
                <td className="px-4 py-2.5 text-right">
                  {row.settingsHref ? (
                    <Link href={row.settingsHref} className="text-xs font-semibold text-brand-600 hover:underline">
                      Edit
                    </Link>
                  ) : (
                    <span className="text-xs text-slate-400">built-in</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
