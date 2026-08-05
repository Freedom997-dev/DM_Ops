// Built-in role keys for the DM Operations platform.
//
// Roles live in the database (see prisma Role model) and can be added/removed
// at runtime; these are the keys of the roles that are seeded and treated as
// system roles (cannot be deleted). SUPER_ADMIN is a wildcard that bypasses all
// permission checks (see src/lib/rbac/can.ts).

export const ROLE_KEYS = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  INSPECTOR: "INSPECTOR",
  HOUSEKEEPER: "HOUSEKEEPER",
} as const;

export type RoleKey = (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS];

export const SUPER_ADMIN = ROLE_KEYS.SUPER_ADMIN;
