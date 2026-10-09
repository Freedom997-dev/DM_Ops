// Phone push (Web Push / VAPID) to the devices a user enabled on /notifications.
// Without VAPID keys push is simply off — in-app notifications still work.

import webpush from "web-push";
import { prisma } from "@/lib/db";

export type PushPayload = { title: string; body?: string | null; href?: string | null; tag?: string };

let configured: boolean | null = null;

export function pushConfigured(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (configured = false);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);
  return (configured = true);
}

/** Send to every saved device of these users; forget devices the push service says are gone. */
export async function sendPush(userIds: string[], payload: PushPayload): Promise<void> {
  if (userIds.length === 0 || !pushConfigured()) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
  const gone: string[] = [];
  const delivered: string[] = [];
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 60 * 60, urgency: "normal", timeout: 10_000 },
        );
        delivered.push(s.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(s.id);
        else console.error("[push] send failed:", status ?? (e as Error).message);
      }
    }),
  );
  if (gone.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: gone } } });
  if (delivered.length) {
    await prisma.pushSubscription.updateMany({ where: { id: { in: delivered } }, data: { lastUsedAt: new Date() } });
  }
}
