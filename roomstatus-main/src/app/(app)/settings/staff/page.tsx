import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireManager, isAdmin as userIsAdmin } from "@/lib/session";
import { UsersManager } from "@/components/UsersManager";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const admin = await requireManager();

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      _count: { select: { inspections: true } },
    },
  });

  return (
    <div className="space-y-5">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to settings
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Staff & access</h1>
        <p className="text-sm text-slate-500">
          Add staff, set their role, reset passwords, and deactivate accounts.
        </p>
      </div>
      <UsersManager
        currentUserId={admin.id}
        isAdmin={userIsAdmin(admin)}
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          active: u.active,
          inspections: u._count.inspections,
        }))}
      />
    </div>
  );
}
