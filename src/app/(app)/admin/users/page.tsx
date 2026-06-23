import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { UsersManager } from "@/components/UsersManager";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const admin = await requireAdmin();

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
    <UsersManager
      currentUserId={admin.id}
      users={users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        active: u.active,
        inspections: u._count.inspections,
      }))}
    />
  );
}
