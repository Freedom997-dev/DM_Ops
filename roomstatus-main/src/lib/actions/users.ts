"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import type { ActionState } from "./rooms";

export type { ActionState };

const userSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(["ADMIN", "MANAGER", "INSPECTOR", "HOUSEKEEPER"]),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export async function createUser(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = userSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (existing) return { ok: false, error: "A user with that email already exists." };

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      passwordHash,
    },
  });
  await logAudit({
    userId: admin.id,
    action: "CREATE",
    entity: "User",
    entityId: user.id,
    details: { email: user.email, role: user.role },
  });
  revalidatePath("/settings/staff");
  return { ok: true, message: `${user.name} added as ${user.role}.` };
}

export async function setUserActive(id: string, active: boolean) {
  const admin = await requireAdmin();
  if (id === admin.id) return; // can't disable yourself

  // Don't let the last active admin be disabled.
  if (!active) {
    const target = await prisma.user.findUnique({ where: { id } });
    if (target?.role === "ADMIN") {
      const otherAdmins = await prisma.user.count({
        where: { role: "ADMIN", active: true, NOT: { id } },
      });
      if (otherAdmins === 0) return; // silently refuse; UI guards this too
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

const ROLE_VALUES = ["ADMIN", "MANAGER", "INSPECTOR", "HOUSEKEEPER"] as const;

export async function setUserRole(
  id: string,
  role: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (!ROLE_VALUES.includes(role as (typeof ROLE_VALUES)[number])) {
    return { ok: false, error: "Invalid role." };
  }
  if (id === admin.id) {
    return { ok: false, error: "You can't change your own role." };
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return { ok: false, error: "User not found." };
  if (target.role === role) return { ok: true };

  // Prevent demoting the last remaining admin.
  if (target.role === "ADMIN" && role !== "ADMIN") {
    const otherAdmins = await prisma.user.count({
      where: { role: "ADMIN", active: true, NOT: { id } },
    });
    if (otherAdmins === 0) {
      return { ok: false, error: "Can't change the last admin's role — promote someone else first." };
    }
  }

  await prisma.user.update({ where: { id }, data: { role } });
  await logAudit({
    userId: admin.id,
    action: "UPDATE",
    entity: "User",
    entityId: id,
    details: { roleFrom: target.role, roleTo: role },
  });
  revalidatePath("/settings/staff");
  return { ok: true };
}

export async function resetPassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") || "");
  const password = String(formData.get("password") || "");
  if (password.length < 6)
    return { ok: false, error: "Password must be at least 6 characters" };

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.update({
    where: { id },
    data: { passwordHash },
  });
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
