import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { parseRolesAllowed } from "@/lib/permissions";
import { WorkflowDefinitionEditor } from "@/components/WorkflowDefinitionEditor";

export const dynamic = "force-dynamic";

export default async function AdminWorkflowEditorPage({ params }: { params: { id: string } }) {
  await requireAdmin();

  const workflow = await prisma.workflowDefinition.findUnique({
    where: { id: params.id },
    include: {
      items: { orderBy: { order: "asc" } },
    },
  });
  if (!workflow) notFound();

  return (
    <div className="space-y-5">
      <Link
        href="/admin/workflows"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to workflows
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Edit: {workflow.name}</h1>
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
      />
    </div>
  );
}
