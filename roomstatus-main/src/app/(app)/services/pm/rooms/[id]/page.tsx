import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardCheck, MapPin, Pencil } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission, can } from "@/lib/session";
import { getSignedUrl } from "@/lib/storage";
import { RoomStatusBadge } from "@/components/StatusBadge";
import { InspectionHistory } from "@/components/InspectionHistory";
import { roomStatusFromSummary, type RoomStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function RoomDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requirePermission("pm:rooms:view");
  const isAdmin = can(user, "pm:rooms:update");

  const room = await prisma.room.findUnique({
    where: { id: params.id },
    include: {
      inspections: {
        orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
        include: {
          inspector: { select: { name: true } },
          items: {
            include: { images: true },
          },
        },
      },
    },
  });
  if (!room) notFound();

  const latest = room.inspections[0];
  const latestFixedCount =
    latest?.items.filter((i) => i.status === "REPAIR_COMPLETED").length ?? 0;
  const status = roomStatusFromSummary(latest?.summary, latestFixedCount) as RoomStatus;

  const history = await Promise.all(
    room.inspections.map(async (i) => ({
      id: i.id,
      summary: (i.summary === "NEEDS_REPAIR" ? "NEEDS_REPAIR" : "OK") as "OK" | "NEEDS_REPAIR",
      notes: i.notes,
      completedAt: i.completedAt ? i.completedAt.toISOString() : null,
      inspector: i.inspector.name,
      items: await Promise.all(
        i.items.map(async (it) => ({
          id: it.id,
          sectionName: it.sectionName,
          questionText: it.questionText,
          status: it.status as "OK" | "NEEDS_REPAIR" | "REPAIR_COMPLETED" | "NA",
          note: it.note,
          images: await Promise.all(
            it.images.map(async (img) => ({
              id: img.id,
              url: await getSignedUrl(img.storagePath, 3600),
              width: img.width,
              height: img.height,
            })),
          ),
        })),
      ),
    })),
  );

  return (
    <div className="space-y-6">
      <Link
        href="/services/pm"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>

      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">
                Room {room.number}
              </h1>
              <RoomStatusBadge status={status} />
            </div>
            {room.name && <p className="text-slate-600">{room.name}</p>}
            <div className="flex flex-wrap gap-4 text-sm text-slate-500">
              {room.floor && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-4 w-4" /> Floor {room.floor}
                </span>
              )}
              <span>
                {room.inspections.length} inspection
                {room.inspections.length === 1 ? "" : "s"} on record
              </span>
              {latest?.completedAt && (
                <span>
                  Last inspected {new Date(latest.completedAt).toLocaleDateString()}
                </span>
              )}
            </div>
            {room.notes && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {room.notes}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Link href={`/services/pm/inspect/${room.id}`} className="btn-primary">
              <ClipboardCheck className="h-4 w-4" />
              Start inspection
            </Link>
            {isAdmin && (
              <Link href={`/services/pm/rooms?edit=${room.id}`} className="btn-secondary">
                <Pencil className="h-4 w-4" />
                Edit room
              </Link>
            )}
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold text-slate-900">
          Inspection history
        </h2>
        <InspectionHistory inspections={history} isAdmin={isAdmin} />
      </div>
    </div>
  );
}
