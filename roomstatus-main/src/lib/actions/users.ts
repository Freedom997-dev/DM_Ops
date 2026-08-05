"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission, type AuthUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { ROLE_KEYS } from "@/lib/roles";
import { validatePassword } from "@/lib/password";
import type { ActionState } from "./rooms";

export type { ActionState };

const userSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  // Length/complexity is enforced by validatePassword() (src/lib/password.ts).
  password: z.string().min(1, "Password is required"),
});

type ResolvedRole = {
  id: string;
  label: string;
  key: string;
  permissions: { permission: string }[];
};

async function resolveRoles(roleIds: string[]): Promise<ResolvedRole[]> {
  if (roleIds.length === 0) return [];
  return prisma.role.findMany({
    where: { id: { in: roleIds } },
    select: {
      id: true,
      label: true,
      key: true,
      permissions: { select: { permission: true } },
    },
  });
}

// No privilege escalation: a non-Super-Admin may grant a role only if they hold
// every permission that role carries, and may never grant the Super Admin role.
function roleGrantableBy(admin: AuthUser, role: ResolvedRole): boolean {
  if (admin.isSuperAdmin) return true;
  if (role.key === ROLE_KEYS.SUPER_ADMIN) return false;
  return role.permissions.every((p) => admin.permissions.has(p.permission));
}

export async function createUser(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requirePermission("admin:staff:add");
  const parsed = userSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const pw = validatePassword(parsed.data.password);
  if (!pw.ok) return { ok: false, error: pw.error };

  const roleIds = formData.getAll("roleIds").map(String).filter(Boolean);
  if (roleIds.length === 0) return { ok: false, error: "Select at least one role." };

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { ok: false, error: "A user with that email already exists." };

  const roles = await resolveRoles(roleIds);
  if (roles.length === 0) return { ok: false, error: "Select at least one valid role." };

  // No privilege escalation: you can't assign roles more powerful than your own.
  const ungrantable = roles.find((r) => !roleGrantableBy(admin, r));
  if (ungrantable) {
    return {
      ok: false,
      error:
        ungrantable.key === ROLE_KEYS.SUPER_ADMIN
          ? "Only a Super Admin can assign the Super Admin role."
          : `You can't assign the "${ungrantable.label}" role — it has permissions you don't hold.`,
    };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      roles: { create: roles.map((r) => ({ roleId: r.id })) },
    },
  });
  await logAudit({
    userId: admin.id,
    action: "CREATE",
    entity: "User",
    entityId: user.id,
    details: { email: user.email, roles: roles.map((r) => r.label) },
  });
  revalidatePath("/settings/staff");
  return { ok: true, message: `${user.name} added.` };
}

async function superAdminRoleId(): Promise<string | null> {
  const r = await prisma.role.findUnique({
    where: { key: ROLE_KEYS.SUPER_ADMIN },
    select: { id: true },
  });
  return r?.id ?? null;
}

export async function setUserActive(id: string, active: boolean) {
  const admin = await requirePermission("admin:staff:update");
  if (id === admin.id) return; // can't disable yourself

  // Don't let the last active Super Admin be disabled.
  if (!active) {
    const superId = await superAdminRoleId();
    if (superId) {
      const isSuper = await prisma.userRole.findUnique({
        where: { userId_roleId: { userId: id, roleId: superId } },
      });
      if (isSuper) {
        const otherActive = await prisma.userRole.count({
          where: { roleId: superId, user: { active: true }, NOT: { userId: id } },
        });
        if (otherActive === 0) return; // silently refuse; UI guards this too
      }
    }
  }

  const user = await prisma.user.update({ where: { id }, data: { active } });
  await logAudit({
    userId: admin.id,
    action: "UPDATE",
    entity: "User",
    entityId: user.id,
    details: { active },
  });
  revalidatePath("/settings/staff");
}

// Replace a user's role assignments. Never leaves the system without a Super Admin.
export async function setUserRoles(
  userId: string,
  roleIds: string[],
): Promise<ActionState> {
  const admin = await requirePermission("admin:staff:update");

  // No self-modification — prevents self-escalation and self-lockout.
  if (userId === admin.id && !admin.isSuperAdmin) {
    return { ok: false, error: "You can't change your own roles." };
  }

  const roles = await resolveRoles(roleIds);
  const validIds = roles.map((r) => r.id);
  const newIdSet = new Set(validIds);

  const current = await prisma.userRole.findMany({
    where: { userId },
    select: {
      role: {
        select: {
          id: true,
          key: true,
          label: true,
          permissions: { select: { permission: true } },
        },
      },
    },
  });
  const currentRoles = current.map((c) => c.role);
  const oldIdSet = new Set(currentRoles.map((r) => r.id));

  // No privilege escalation: every role being added OR removed must be one the
  // admin can grant (Super Admin bypasses). Roles the target already holds that
  // the admin can't manage are left untouched only if unchanged.
  if (!admin.isSuperAdmin) {
    const changed = [
      ...roles.filter((r) => !oldIdSet.has(r.id)),
      ...currentRoles.filter((r) => !newIdSet.has(r.id)),
    ];
    for (const r of changed) {
      if (r.key === ROLE_KEYS.SUPER_ADMIN) {
        return { ok: false, error: "Only a Super Admin can assign or remove the Super Admin role." };
      }
      if (!roleGrantableBy(admin, r)) {
        return { ok: false, error: `You can't manage the "${r.label}" role — it has permissions you don't hold.` };
      }
    }
  }

  // Never leave the system without a Super Admin.
  const superId = await superAdminRoleId();
  if (superId && oldIdSet.has(superId) && !newIdSet.has(superId)) {
    const otherSupers = await prisma.userRole.count({
      where: { roleId: superId, NOT: { userId } },
    });
    if (otherSupers === 0)
      return { ok: false, error: "At least one Super Admin is required." };
  }

  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId } }),
    prisma.userRole.createMany({ data: validIds.map((roleId) => ({ userId, roleId })) }),
  ]);
  await logAudit({
    userId: admin.id,
    action: "UPDATE",
    entity: "UserRole",
    entityId: userId,
    details: { roles: roles.map((r) => r.label) },
  });
  revalidatePath("/settings/staff");
  return { ok: true, message: "Roles updated." };
}

export async function resetPassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requirePermission("admin:staff:update");
  const id = String(formData.get("id") || "");
  const password = String(formData.get("password") || "");
  const pw = validatePassword(password);
  if (!pw.ok) return { ok: false, error: pw.error };

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.update({ where: { id }, data: { passwordHash } });
  await logAudit({
    userId: admin.id,
    action: "UPDATE",
    entity: "User",
    entityId: user.id,
    details: { passwordReset: true },
  });
  revalidatePath("/settings/staff");
  return { ok: true, message: "Password reset." };
}
