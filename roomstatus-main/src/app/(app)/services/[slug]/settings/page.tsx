import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { parseRolesAllowed } from "@/lib/permissions";
import { WorkflowDefinitionEditor } from "@/components/WorkflowDefinitionEditor";

export const dynamic = "force-dynamic";

export default async function ServiceSettingsPage({ params }: { params: { slug: string } }) {
  await requirePermission("admin:services:manage");

  const [workflow, roles] = await Promise.all([
    prisma.workflowDefinition.findUnique({
      where: { slug: params.slug },
      include: { items: { orderBy: { order: "asc" } } },
    }),
    prisma.role.findMany({
      orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
      select: { key: true, label: true },
    }),
  ]);
  if (!workflow) notFound();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/services/${workflow.slug}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {workflow.name}
        </Link>
        <Link
          href="/settings/services"
          className="text-sm font-semibold text-brand-600 hover:underline"
        >
          All services →
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{workflow.name} — Settings</h1>
        <p className="text-sm text-slate-500">
          Slug <code>{workflow.slug}</code> · shape <code>{workflow.shape}</code>
        </p>
      </div>
      <WorkflowDefinitionEditor
        definition={{
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          rolesAllowed: parseRolesAllowed(workflow.rolesAllowed),
          archived: workflow.archived,
        }}
        items={workflow.items.map((i) => ({ id: i.id, text: i.text, order: i.order, archived: i.archived }))}
        roles={roles}
      />
    </div>
  );
}
