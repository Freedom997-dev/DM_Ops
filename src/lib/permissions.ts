/**
 * Per-service (workflow) access helpers.
 *
 * Static app permissions now live in the RBAC catalog (src/lib/rbac/catalog.ts)
 * and are checked via `can(user, "app:feature:action")` in src/lib/session.ts.
 *
 * Per-workflow access still lives in `WorkflowDefinition.rolesAllowed` — a JSON
 * array of role keys. With multi-role users, a user may run a workflow if any of
 * their roles is in that list (Super Admin bypasses; see requireWorkflowAccess).
 */

// Parse the JSON-encoded rolesAllowed into a plain array of role keys. Roles are
// dynamic (DB-driven) now, so we no longer filter against a fixed set.
export function parseRolesAllowed(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

// True if any of the user's role keys is permitted to run the workflow.
export function canRunWorkflow(
  roleKeys: string[],
  rolesAllowed: string[],
): boolean {
  return roleKeys.some((r) => rolesAllowed.includes(r));
}
