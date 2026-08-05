import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, can } from "@/lib/session";
import { HkConfigManager } from "@/components/HkConfigManager";
import type { HkStatusAction, HkChecklistItem, HkTemplateWithChecklist } from "@/lib/hk-view";

export const dynamic = "force-dynamic";

export default async function HousekeepingSettingsPage() {
  const user = await requireUser();
  if (!can(user, "housekeeping:settings:configure")) redirect("/services/housekeeping");

  const [setting, statusActions, taskTemplates, roomChecklist, roomCount] = await Promise.all([
    prisma.housekeepingSetting.findUnique({ where: { id: "singleton" } }),
    prisma.housekeepingStatusAction.findMany({
      where: { archived: false },
      orderBy: { order: "asc" },
      select: { id: true, label: true },
    }),
    prisma.housekeepingTaskTemplate.findMany({
      where: { archived: false },
      orderBy: { order: "asc" },
      select: {
        id: true, label: true,
        checklistItems: {
          where: { archived: false }, orderBy: { order: "asc" }, select: { id: true, label: true },
        },
      },
    }),
    prisma.housekeepingChecklistItem.findMany({
      where: { templateId: null, archived: false },
      orderBy: { order: "asc" },
      select: { id: true, label: true },
    }),
    prisma.room.count({ where: { archived: false } }),
  ]);
  const actions: HkStatusAction[] = statusActions.map((a) => ({ id: a.id, label: a.label }));
  const templates: HkTemplateWithChecklist[] = taskTemplates.map((t) => ({
    id: t.id, label: t.label,
    checklist: t.checklistItems.map((c) => ({ id: c.id, label: c.label })),
  }));
  const roomList: HkChecklistItem[] = roomChecklist.map((c) => ({ id: c.id, label: c.label }));

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/services/housekeeping" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Back to Housekeeping
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Housekeeping — Settings</h1>
        <p className="text-sm text-slate-500">Photo retention and cleaning instructions.</p>
      </div>
      <HkConfigManager
        statusActions={actions}
        taskTemplates={templates}
        roomChecklist={roomList}
        roomCount={roomCount}
        retention={{
          deleteOnApproval: setting?.deleteOnApproval ?? true,
          retentionDays: setting?.retentionDays ?? 7,
          instructions: setting?.instructions ?? "",
        }}
      />
    </div>
  );
}
