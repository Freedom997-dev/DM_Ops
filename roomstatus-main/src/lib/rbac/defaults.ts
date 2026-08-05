// Default roles + starting permission grants for the seed. These mirror 2.0's
// previous behaviour exactly (static admin matrix + housekeeping role helpers),
// so existing accounts keep the same access after migration. Admins can edit
// everything at runtime in the roles matrix.

import { ROLE_KEYS } from "../roles";
import { permissionsForApp } from "./catalog";

export type RoleSeed = {
  key: string;
  label: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
};

export const DEFAULT_ROLES: RoleSeed[] = [
  {
    key: ROLE_KEYS.SUPER_ADMIN,
    label: "Super Admin",
    description: "Full, unrestricted access to every app and setting.",
    isSystem: true,
    permissions: [], // wildcard bypass — see src/lib/rbac/can.ts
  },
  {
    key: ROLE_KEYS.ADMIN,
    label: "Admin",
    description: "Manages all apps, staff and services; can view and edit roles.",
    isSystem: true,
    permissions: [
      ...permissionsForApp("pm"),
      ...permissionsForApp("housekeeping"),
      "admin:staff:view",
      "admin:staff:add",
      "admin:staff:update",
      "admin:staff:delete",
      "admin:services:view",
      "admin:services:manage",
      "admin:audit:view",
      // Can see and edit role permissions; creating/deleting roles is reserved
      // for Super Admin (keeps the top role meaningful).
      "admin:roles:view",
      "admin:roles:update",
    ],
  },
  {
    key: ROLE_KEYS.MANAGER,
    label: "Manager",
    description: "Runs housekeeping operations; views staff and activity.",
    isSystem: true,
    // Mirrors old admin matrix (users+audit) + housekeeping manage/submit/review.
    permissions: [
      "housekeeping:board:view",
      "housekeeping:tasks:manage",
      "housekeeping:tasks:submit",
      "housekeeping:cleaning:review",
      "admin:staff:view",
      "admin:audit:view",
    ],
  },
  {
    key: ROLE_KEYS.INSPECTOR,
    label: "Inspector",
    description: "Performs room condition inspections and cleanliness reviews.",
    isSystem: true,
    permissions: [
      "pm:dashboard:view",
      "pm:rooms:view",
      "pm:inspections:view",
      "pm:inspections:add",
      "housekeeping:board:view",
      "housekeeping:cleaning:review",
    ],
  },
  {
    key: ROLE_KEYS.HOUSEKEEPER,
    label: "Housekeeper",
    description: "Cleans rooms and submits completed tasks.",
    isSystem: true,
    permissions: ["housekeeping:board:view", "housekeeping:tasks:submit"],
  },
];
