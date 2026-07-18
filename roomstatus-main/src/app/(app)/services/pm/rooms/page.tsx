import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { roomStatusFromSummary, type RoomStatus } from "@/lib/status";
import { RoomsManager } from "@/components/RoomsManager";

export const dynamic = "force-dynamic";

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: { add?: string; edit?: string };
}) {
  const user = await getCurrentUser();
  const isAdmin = user?.role === "ADMIN";

  const rooms = await prisma.room.findMany({
    include: {
      inspections: {
        where: { status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        take: 1,
        select: {
          summary: true,
          completedAt: true,
          // Repaired-but-unverified items drive the amber "Fixed – verify" state.
          _count: { select: { items: { where: { status: "REPAIR_COMPLETED" } } } },
        },
      },
    },
  });

  const data = rooms
    .map((r) => {
      const latest = r.inspections[0];
      return {
        id: r.id,
        number: r.number,
        name: r.name,
        floor: r.floor,
        notes: r.notes,
        archived: r.archived,
        status: roomStatusFromSummary(
          latest?.summary,
          latest?._count.items ?? 0,
        ) as RoomStatus,
        lastInspected: latest?.completedAt ? latest.completedAt.toISOString() : null,
      };
    })
    .sort((a, b) =>
      a.number.localeCompare(b.number, undefined, { numeric: true }),
    );

  return (
    <RoomsManager
      rooms={data}
      isAdmin={isAdmin}
      initialAdd={searchParams.add === "1"}
      initialEditId={searchParams.edit ?? null}
    />
  );
}
