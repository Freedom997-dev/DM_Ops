import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { ROLE_KEYS } from "@/lib/roles";
import { AnnouncementForm } from "@/components/messages/AnnouncementForm";

export const dynamic = "force-dynamic";

export default async function AnnouncePage() {
  await requirePermission("comms:announcements:send");
  const roles = await prisma.role.findMany({
    where: { key: { not: ROLE_KEYS.SUPER_ADMIN } },
    orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
    select: { key: true, label: true },
  });
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/messages" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Messages
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">New announcement</h1>
        <p className="text-sm text-slate-500">Everyone you pick gets a notification. They can read it but not reply; you&apos;ll see who has seen it.</p>
      </div>
      <AnnouncementForm roles={roles} />
    </div>
  );
}
