import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission, can } from "@/lib/session";
import { UsersManager } from "@/components/UsersManager";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const admin = await requirePermission("admin:staff:view");

  const [users, allRoles] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        roles: { select: { role: { select: { id: true, key: true, label: true } } } },
        _count: { select: { inspections: true } },
      },
    }),
    prisma.role.findMany({
      orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        key: true,
        label: true,
        permissions: { select: { permission: true } },
      },
    }),
  ]);

  // Roles the current admin may assign (null = Super Admin, can assign all).
  const grantableRoleIds = admin.isSuperAdmin
    ? null
    : allRoles
        .filter(
          (r) =>
            r.key !== "SUPER_ADMIN" &&
            r.permissions.every((p) => admin.permissions.has(p.permission)),
        )
        .map((r) => r.id);

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
        <h1 className="text-2xl font-bold text-slate-900">Staff</h1>
        <p className="text-sm text-slate-500">
          Add staff, assign one or more roles, reset passwords, and deactivate accounts.
        </p>
      </div>
      <UsersManager
        currentUserId={admin.id}
        canAdd={can(admin, "admin:staff:add")}
        canUpdate={can(admin, "admin:staff:update")}
        allRoles={allRoles.map((r) => ({ id: r.id, key: r.key, label: r.label }))}
        grantableRoleIds={grantableRoleIds}
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          active: u.active,
          roles: u.roles.map((r) => r.role),
          inspections: u._count.inspections,
        }))}
      />
    </div>
  );
}
