import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission, can } from "@/lib/session";
import { parseRolesAllowed } from "@/lib/permissions";
import { RolesManager } from "@/components/RolesManager";

export const dynamic = "force-dynamic";

export default async function AccessControlPage() {
  const admin = await requirePermission("admin:roles:view");

  const [roles, definitions] = await Promise.all([
    prisma.role.findMany({
      orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
      include: {
        permissions: { select: { permission: true } },
        _count: { select: { users: true } },
      },
    }),
    prisma.workflowDefinition.findMany({
      where: { archived: false },
      orderBy: { name: "asc" },
    }),
  ]);

  const roleView = roles.map((r) => ({
    id: r.id,
    key: r.key,
    label: r.label,
    description: r.description,
    isSystem: r.isSystem,
    userCount: r._count.users,
    permissions: r.permissions.map((p) => p.permission),
  }));

  // Which roles can reach each service. Built-in services derive from
  // permissions; workflow services keep their per-service rolesAllowed.
  const serviceRows: { name: string; allowedKeys: string[]; settingsHref: string | null }[] = [
    {
      name: "Room Condition (PM)",
      allowedKeys: roleView.filter((r) => r.key === "SUPER_ADMIN" || r.permissions.some((p) => p.startsWith("pm:"))).map((r) => r.key),
      settingsHref: null,
    },
    {
      name: "Housekeeping",
      allowedKeys: roleView.filter((r) => r.key === "SUPER_ADMIN" || r.permissions.includes("housekeeping:board:view")).map((r) => r.key),
      settingsHref: null,
    },
    ...definitions.map((d) => {
      const allowed = parseRolesAllowed(d.rolesAllowed);
      return {
        name: d.name,
        allowedKeys: roleView.filter((r) => r.key === "SUPER_ADMIN" || allowed.includes(r.key)).map((r) => r.key),
        settingsHref: `/services/${d.slug}/settings`,
      };
    }),
  ];

  return (
    <div className="space-y-6">
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        Back to settings
      </Link>

      <RolesManager
        roles={roleView}
        canAdd={can(admin, "admin:roles:add")}
        canUpdate={can(admin, "admin:roles:update")}
        canDelete={can(admin, "admin:roles:delete")}
        grantable={admin.isSuperAdmin ? null : [...admin.permissions]}
      />

      {/* Per-service access (workflow services keep their own rolesAllowed) */}
      <div className="space-y-2">
        <h2 className="text-lg font-bold text-slate-900">Service access</h2>
        <p className="text-sm text-slate-500">
          Which roles can open each service. Built-in services follow the permissions above;
          edit a workflow service&rsquo;s roles from its own settings page.
        </p>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Service</th>
                {roleView.map((r) => (
                  <th key={r.id} className="px-3 py-2.5 text-center font-medium">{r.label}</th>
                ))}
                <th className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {serviceRows.map((row) => (
                <tr key={row.name} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{row.name}</td>
                  {roleView.map((r) => (
                    <td key={r.id} className="px-3 py-2.5 text-center">
                      {row.allowedKeys.includes(r.key) ? (
                        <Check className="mx-auto h-4 w-4 text-emerald-600" />
                      ) : (
                        <span className="text-slate-300">–</span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right">
                    {row.settingsHref ? (
                      <Link href={row.settingsHref} className="text-xs font-semibold text-brand-600 hover:underline">Edit</Link>
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
    </div>
  );
}
