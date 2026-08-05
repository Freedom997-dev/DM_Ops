import { cache } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ROLE_KEYS } from "@/lib/roles";
import { can, canAny, type AuthUser } from "@/lib/rbac/can";
import type { PermissionKey } from "@/lib/rbac/catalog";
import { parseRolesAllowed } from "@/lib/permissions";

// Resolve the signed-in user with their roles and the union of all permissions
// those roles grant — read fresh from the DB every request, so permission
// changes take effect immediately. Memoised per request via React `cache`.
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: { include: { role: { include: { permissions: true } } } },
    },
  });
  if (!user || !user.active) return null;

  const roleKeys = user.roles.map((ur) => ur.role.key);
  const permissions = new Set<string>();
  for (const ur of user.roles) {
    for (const rp of ur.role.permissions) permissions.add(rp.permission);
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roleKeys,
    permissions,
    isSuperAdmin: roleKeys.includes(ROLE_KEYS.SUPER_ADMIN),
  };
});

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// Require a specific permission; otherwise bounce to the services home.
export async function requirePermission(
  permission: PermissionKey,
): Promise<AuthUser> {
  const user = await requireUser();
  if (!can(user, permission)) redirect("/services");
  return user;
}

// Require at least one of a set of permissions (e.g. to open a hub page).
export async function requireAnyPermission(
  permissions: PermissionKey[],
): Promise<AuthUser> {
  const user = await requireUser();
  if (!canAny(user, permissions)) redirect("/services");
  return user;
}

/**
 * Confirms the current user can run a specific workflow service.
 * Per-service access still lives in WorkflowDefinition.rolesAllowed; a user may
 * run it if Super Admin or any of their roles is in the allowed list.
 */
export async function requireWorkflowAccess(workflowSlug: string) {
  const user = await requireUser();
  const workflow = await prisma.workflowDefinition.findUnique({
    where: { slug: workflowSlug },
  });
  if (!workflow || workflow.archived) redirect("/services");
  if (!user.isSuperAdmin) {
    const allowed = parseRolesAllowed(workflow.rolesAllowed);
    if (!user.roleKeys.some((r) => allowed.includes(r))) redirect("/services");
  }
  return { user, workflow };
}

// Coarse role-key convenience checks. Prefer can(user, "app:feature:action").
export function isAdmin(user: AuthUser | null | undefined): boolean {
  return !!user && (user.isSuperAdmin || user.roleKeys.includes(ROLE_KEYS.ADMIN));
}

export function isManager(user: AuthUser | null | undefined): boolean {
  return isAdmin(user) || (!!user && user.roleKeys.includes(ROLE_KEYS.MANAGER));
}

// Coarse "has any admin-area access" — used to gate the Settings hub.
export async function requireManager(): Promise<AuthUser> {
  const user = await requireUser();
  if (!isManager(user)) redirect("/services");
  return user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (!isAdmin(user)) redirect("/services");
  return user;
}

// Re-export the pure helpers so callers import checks from one place.
export { can, canAny, canAll, canAccessApp } from "@/lib/rbac/can";
export type { AuthUser } from "@/lib/rbac/can";
