/**
 * Role matrix + permission helpers for the Foundation platform.
 *
 * Static permissions (admin sections + workflow access) live here.
 * Per-workflow access is also enforced via `WorkflowDefinition.rolesAllowed`
 * (see src/lib/session.ts → requireWorkflowAccess).
 */

export const ROLES = ["ADMIN", "MANAGER", "INSPECTOR", "HOUSEKEEPER"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(s: string | null | undefined): s is Role {
  return s != null && (ROLES as readonly string[]).includes(s);
}

export type AdminSection = "rooms" | "users" | "questions" | "audit" | "workflows";

const ADMIN_MATRIX: Record<Role, Record<AdminSection, boolean>> = {
  ADMIN:       { rooms: true,  users: true,  questions: true,  audit: true,  workflows: true  },
  MANAGER:     { rooms: false, users: true,  questions: false, audit: true,  workflows: false },
  INSPECTOR:   { rooms: false, users: false, questions: false, audit: false, workflows: false },
  HOUSEKEEPER: { rooms: false, users: false, questions: false, audit: false, workflows: false },
};

export function canAccessAdminSection(role: string | null | undefined, section: AdminSection): boolean {
  if (!isRole(role)) return false;
  return ADMIN_MATRIX[role][section];
}

/**
 * Can this role submit/edit the given workflow?
 * `rolesAllowed` is the JSON-decoded array stored on WorkflowDefinition.
 */
export function canRunWorkflow(role: string | null | undefined, rolesAllowed: string[]): boolean {
  if (!isRole(role)) return false;
  return rolesAllowed.includes(role);
}

export function parseRolesAllowed(json: string): Role[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRole);
  } catch {
    return [];
  }
}

export function isAdmin(role: string | null | undefined): boolean {
  return role === "ADMIN";
}

export function isManager(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "MANAGER";
}
