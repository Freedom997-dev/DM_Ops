import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  canRunWorkflow,
  parseRolesAllowed,
  isAdmin as roleIsAdmin,
  isManager as roleIsManager,
} from "@/lib/permissions";

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/workflows");
  return user;
}

export async function requireManager() {
  const user = await requireUser();
  if (!roleIsManager(user.role)) redirect("/workflows");
  return user;
}

/**
 * Confirms the current user can submit/edit a specific workflow.
 * Looks up the workflow's `rolesAllowed` field; redirects if not allowed.
 * Returns both the user and the workflow definition for convenience.
 */
export async function requireWorkflowAccess(workflowSlug: string) {
  const user = await requireUser();
  const workflow = await prisma.workflowDefinition.findUnique({
    where: { slug: workflowSlug },
  });
  if (!workflow || workflow.archived) redirect("/workflows");
  const allowed = parseRolesAllowed(workflow.rolesAllowed);
  if (!canRunWorkflow(user.role, allowed)) redirect("/workflows");
  return { user, workflow };
}

export function isAdmin(user: { role: string } | null | undefined) {
  return roleIsAdmin(user?.role);
}

export function isManager(user: { role: string } | null | undefined) {
  return roleIsManager(user?.role);
}
