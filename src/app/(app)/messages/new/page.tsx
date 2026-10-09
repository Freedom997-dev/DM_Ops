import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { StaffPicker } from "@/components/messages/StaffPicker";

export const dynamic = "force-dynamic";

export default async function NewMessagePage() {
  const me = await requireUser();
  const staff = await prisma.user.findMany({
    where: { active: true, id: { not: me.id } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, roles: { select: { role: { select: { label: true } } } } },
  });
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/messages" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Messages
      </Link>
      <h1 className="text-2xl font-bold text-slate-900">New message</h1>
      <StaffPicker staff={staff.map((s) => ({ id: s.id, name: s.name, roles: s.roles.map((r) => r.role.label).join(", ") }))} />
    </div>
  );
}
