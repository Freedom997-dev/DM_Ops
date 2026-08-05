// ---------------------------------------------------------------------------
// RBAC permission catalog — the single, authoritative definition of every
// static permission in the DM Operations platform.
//
// Structure is hierarchical:  App  →  Feature  →  Action.
// A permission key is the string  "app:feature:action"  (e.g. "pm:rooms:delete",
// "housekeeping:tasks:submit", "admin:roles:view").
//
// Actions are defined per-feature (not a fixed CRUD set) because 2.0's features
// need verbs like submit / review / configure alongside view/add/update/delete.
//
// NOTE: dynamic workflow "services" are NOT in this catalog — their access is
// governed per-record by WorkflowDefinition.rolesAllowed (see src/lib/permissions.ts).
// This catalog covers the fixed apps: PM, Housekeeping, and Administration.
// ---------------------------------------------------------------------------

export type ActionDef = { key: string; label: string };
export type FeatureDef = { key: string; label: string; actions: ActionDef[] };
export type AppDef = {
  key: string;
  label: string;
  description?: string;
  icon: string; // lucide-react icon name, resolved in the UI
  features: FeatureDef[];
};

// Canonical actions, reused across features.
const A = {
  view: { key: "view", label: "View" },
  add: { key: "add", label: "Add" },
  update: { key: "update", label: "Update" },
  delete: { key: "delete", label: "Delete" },
  manage: { key: "manage", label: "Manage" },
  submit: { key: "submit", label: "Submit" },
  review: { key: "review", label: "Review" },
  configure: { key: "configure", label: "Configure" },
} as const;

// Add a new app by appending a block here — the roles matrix, seeding and
// enforcement all read from this list.
export const APPS: AppDef[] = [
  {
    key: "pm",
    label: "Room Condition",
    description: "Preventive maintenance inspections",
    icon: "ClipboardCheck",
    features: [
      { key: "dashboard", label: "Dashboard", actions: [A.view] },
      { key: "rooms", label: "Rooms", actions: [A.view, A.add, A.update, A.delete] },
      { key: "checklist", label: "Checklist", actions: [A.view, A.add, A.update, A.delete] },
      { key: "inspections", label: "Inspections", actions: [A.view, A.add, A.update, A.delete] },
    ],
  },
  {
    key: "housekeeping",
    label: "Housekeeping",
    description: "Room turnover & daily tasks",
    icon: "BedDouble",
    features: [
      { key: "board", label: "Board", actions: [A.view] },
      { key: "tasks", label: "Tasks", actions: [A.manage, A.submit] },
      { key: "cleaning", label: "Cleaning", actions: [A.review] },
      { key: "settings", label: "Settings", actions: [A.configure] },
    ],
  },
  {
    key: "admin",
    label: "Administration",
    description: "Staff, roles, services & activity",
    icon: "Settings",
    features: [
      { key: "staff", label: "Staff", actions: [A.view, A.add, A.update, A.delete] },
      { key: "roles", label: "Roles", actions: [A.view, A.add, A.update, A.delete] },
      { key: "services", label: "Services", actions: [A.view, A.manage] },
      { key: "audit", label: "Activity log", actions: [A.view] },
    ],
  },
];

export type PermissionKey = string;

function keysForApp(app: AppDef): string[] {
  return app.features.flatMap((f) => f.actions.map((a) => `${app.key}:${f.key}:${a.key}`));
}

export const ALL_PERMISSIONS: string[] = APPS.flatMap((app) => keysForApp(app));

const PERMISSION_SET = new Set(ALL_PERMISSIONS);

export function isPermissionKey(value: string): boolean {
  return PERMISSION_SET.has(value);
}

// Drop any keys not in the catalog (guards against stale grants).
export function sanitizePermissions(keys: string[]): string[] {
  return keys.filter((k) => PERMISSION_SET.has(k));
}

export function permissionsForApp(appKey: string): string[] {
  const app = APPS.find((a) => a.key === appKey);
  return app ? keysForApp(app) : [];
}

// "Room Condition · Rooms · Delete"
export function permissionLabel(key: string): string {
  const [appKey, featureKey, actionKey] = key.split(":");
  const app = APPS.find((a) => a.key === appKey);
  const feature = app?.features.find((f) => f.key === featureKey);
  const action = feature?.actions.find((a) => a.key === actionKey);
  if (!app || !feature || !action) return key;
  return `${app.label} · ${feature.label} · ${action.label}`;
}
