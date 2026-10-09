import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { NOTIFICATION_EVENTS } from "@/lib/notifications/catalog";
import { NotificationList } from "@/components/notifications/NotificationList";
import { PushToggle } from "@/components/notifications/PushToggle";
import { MuteSettings } from "@/components/notifications/MuteSettings";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const me = await requireUser();
  const [items, mutes, rules] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: me.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, title: true, body: true, href: true, readAt: true, createdAt: true },
    }),
    prisma.notificationMute.findMany({ where: { userId: me.id }, select: { type: true } }),
    prisma.notificationRule.findMany({ where: { enabled: false }, select: { type: true } }),
  ]);
  const off = new Set(rules.map((r) => r.type));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
        <p className="text-sm text-slate-500">Updates about your work. Older than 90 days are cleared automatically.</p>
      </div>

      <NotificationList
        items={items.map((i) => ({ ...i, readAt: i.readAt?.toISOString() ?? null, createdAt: i.createdAt.toISOString() }))}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">Settings</h2>
        <PushToggle vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
        <MuteSettings
          events={NOTIFICATION_EVENTS.filter((e) => !off.has(e.type)).map((e) => ({
            type: e.type,
            group: e.group,
            label: e.label,
            description: e.description,
            mutable: e.mutable,
          }))}
          muted={mutes.map((m) => m.type)}
        />
      </section>
    </div>
  );
}
