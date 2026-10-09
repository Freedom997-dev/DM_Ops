import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { NOTIFICATION_EVENTS, parseRoles } from "@/lib/notifications/catalog";
import { permissionLabel } from "@/lib/rbac/catalog";
import { NotificationRulesManager } from "@/components/notifications/NotificationRulesManager";

export const dynamic = "force-dynamic";

export default async function NotificationRulesPage() {
  await requirePermission("admin:notifications:manage");
  const [rules, roles] = await Promise.all([
    prisma.notificationRule.findMany(),
    prisma.role.findMany({ orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }], select: { key: true, label: true } }),
  ]);
  const ruleByType = new Map(rules.map((r) => [r.type, r]));

  return (
    <div className="space-y-5">
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        Back to settings
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
        <p className="text-sm text-slate-500">
          Turn events on or off for everyone and choose who receives them. Staff can still mute types for
          themselves on their Notifications page. Nobody is notified about their own action.
        </p>
      </div>
      <NotificationRulesManager
        roles={roles}
        events={NOTIFICATION_EVENTS.map((e) => {
          const rule = ruleByType.get(e.type);
          return {
            type: e.type,
            group: e.group,
            label: e.label,
            description: e.description,
            recipients: e.recipients,
            defaultAudience: e.defaultPermission ? `Everyone with “${permissionLabel(e.defaultPermission)}”` : null,
            enabled: rule?.enabled ?? e.defaultEnabled,
            roles: parseRoles(rule?.roles),
            customized: !!rule,
          };
        })}
      />
    </div>
  );
}
