// Pure permission-check helpers. No I/O — they operate on an already-resolved
// user (see src/lib/session.ts, which loads roles + permissions from the DB).

import { permissionsForApp, type PermissionKey } from "./catalog";

// The shape every authenticated user is resolved into for authorization.
export type AuthUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  roleKeys: string[];
  permissions: Set<string>;
  isSuperAdmin: boolean;
};

export function can(
  user: AuthUser | null | undefined,
  permission: PermissionKey,
): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true; // wildcard bypass
  return user.permissions.has(permission);
}

export function canAny(
  user: AuthUser | null | undefined,
  permissions: PermissionKey[],
): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return permissions.some((p) => user.permissions.has(p));
}

export function canAll(
  user: AuthUser | null | undefined,
  permissions: PermissionKey[],
): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return permissions.every((p) => user.permissions.has(p));
}

// A user can enter an app iff they hold any permission within it.
export function canAccessApp(
  user: AuthUser | null | undefined,
  appKey: string,
): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return canAny(user, permissionsForApp(appKey));
}
