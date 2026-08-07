"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { sanitizePermissions } from "@/lib/rbac/catalog";
import { ROLE_KEYS } from "@/lib/roles";
import type { ActionState } from "./rooms";

export type { ActionState };

function slugKey(label: string): string {
  return label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function createRole(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requirePermission("admin:roles:add");
  const label = String(formData.get("label") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  if (!label) return { ok: false, error: "Role name is required." };

  const key = slugKey(label);
  if (!key) return { ok: false, error: "Enter a valid role name." };

  const existing = await prisma.role.findUnique({ where: { key } });
  if (existing)
    return { ok: false, error: "A role with a similar name already exists." };

  const role = await prisma.role.create({
    data: { key, label, description, isSystem: false },
  });
  await logAudit({
    userId: admin.id,
    action: "CREATE",
    entity: "Role",
    entityId: role.id,
    details: { key, label },
  });
  revalidatePath("/settings/access");
  return { ok: true, message: `Role "${label}" created.` };
}

export async function deleteRole(roleId: string): Promise<ActionState> {
  const admin = await requirePermission("admin:roles:delete");
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { _count: { select: { users: true } } },
  });
  if (!role) return { ok: false, error: "Role not found." };
  if (role.isSystem)
    return { ok: false, error: "Built-in roles cannot be deleted." };
  if (role._count.users > 0)
    return {
      ok: false,
      error: "This role is still assigned to users. Reassign them first.",
    };

  await prisma.role.delete({ where: { id: roleId } });
  await logAudit({
    userId: admin.id,
    action: "DELETE",
    entity: "Role",
    entityId: roleId,
    details: { key: role.key, label: role.label },
  });
  revalidatePath("/settings/access");
  return { ok: true, message: `Role "${role.label}" deleted.` };
}

// Replace a role's permission grants (validated against the code catalog).
// Changes take effect immediately (permissions resolve per request).
export async function setRolePermissions(
  roleId: string,
  permissions: string[],
): Promise<ActionState> {
  const admin = await requirePermission("admin:roles:update");
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) return { ok: false, error: "Role not found." };
  if (role.key === ROLE_KEYS.SUPER_ADMIN)
    return {
      ok: false,
      error: "Super Admin always has full access and cannot be edited.",
    };

  const valid = sanitizePermissions(permissions);

  // No privilege escalation: a non-Super-Admin can only grant permissions they
  // themselves hold (otherwise an admin could edit a role they belong to and
  // give themselves more power).
  if (!admin.isSuperAdmin) {
    const beyond = valid.filter((p) => !admin.permissions.has(p));
    if (beyond.length > 0) {
      return {
        ok: false,
        error: "You can only grant permissions you hold yourself.",
      };
    }
  }

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({
      data: valid.map((permission) => ({ roleId, permission })),
    }),
  ]);
  await logAudit({
    userId: admin.id,
    action: "UPDATE",
    entity: "Role",
    entityId: roleId,
    details: { label: role.label, permissionCount: valid.length },
  });
  revalidatePath("/settings/access");
  return { ok: true, message: "Permissions updated." };
}
