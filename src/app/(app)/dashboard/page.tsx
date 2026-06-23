import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { RoomStatusBadge } from "@/components/StatusBadge";
import { roomStatusFromSummary, ROOM_STATUS_META, type RoomStatus } from "@/lib/status";
import { ClipboardCheck, DoorOpen, Plus, TriangleAlert, CircleCheck, CircleHelp } from "lucide-react";
import clsx from "clsx";

export const dynamic = "force-dynamic";

function byRoomNumber(a: { number: string }, b: { number: string }) {
  const na = parseInt(a.number, 10);
  const nb = parseInt(b.number, 10);
  if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
  return a.number.localeCompare(b.number, undefined, { numeric: true });
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const isAdmin = user?.role === "ADMIN";

  const rooms = await prisma.room.findMany({
    where: { archived: false },
    include: {
      inspections: {
        where: { status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        take: 1,
        include: {
          inspector: { select: { name: true } },
          items: { where: { status: "NEEDS_REPAIR" }, select: { id: true } },
        },
      },
    },
  });
  rooms.sort(byRoomNumber);

  const enriched = rooms.map((r) => {
    const latest = r.inspections[0];
    const status = roomStatusFromSummary(latest?.summary) as RoomStatus;
    return {
      id: r.id,
      number: r.number,
      name: r.name,
      floor: r.floor,
      status,
      issues: latest?.items.length ?? 0,
      inspectedAt: latest?.completedAt ?? null,
      inspector: latest?.inspector.name ?? null,
    };
  });

  const stats = {
    total: enriched.length,
    ok: enriched.filter((r) => r.status === "OK").length,
    repair: enriched.filter((r) => r.status === "NEEDS_REPAIR").length,
    none: enriched.filter((r) => r.status === "NOT_INSPECTED").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Current condition of every room at Divya Motel.
          </p>
        </div>
        {isAdmin && (
          <Link href="/rooms?add=1" className="btn-primary">
            <Plus className="h-4 w-4" />
            Add room
          </Link>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={<DoorOpen className="h-5 w-5" />} label="Total Rooms" value={stats.total} tone="slate" />
        <StatCard icon={<CircleCheck className="h-5 w-5" />} label="OK" value={stats.ok} tone="emerald" />
        <StatCard icon={<TriangleAlert className="h-5 w-5" />} label="Needs Repair" value={stats.repair} tone="red" />
        <StatCard icon={<CircleHelp className="h-5 w-5" />} label="Not Inspected" value={stats.none} tone="slate" />
      </div>

      {enriched.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-3 p-12 text-center">
          <DoorOpen className="h-10 w-10 text-slate-300" />
          <p className="text-slate-600">No rooms yet.</p>
          {isAdmin && (
            <Link href="/rooms?add=1" className="btn-primary">
              <Plus className="h-4 w-4" />
              Add your first room
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {enriched.map((room) => (
            <RoomTile key={room.id} room={room} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "slate" | "emerald" | "red";
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    emerald: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
  };
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className={clsx("flex h-10 w-10 items-center justify-center rounded-xl", tones[tone])}>
        {icon}
      </span>
      <div>
        <div className="text-2xl font-bold leading-none text-slate-900">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function RoomTile({
  room,
}: {
  room: {
    id: string;
    number: string;
    name: string | null;
    status: RoomStatus;
    issues: number;
    inspectedAt: Date | null;
    inspector: string | null;
  };
}) {
  const meta = ROOM_STATUS_META[room.status];
  return (
    <Link
      href={`/rooms/${room.id}`}
      className={clsx(
        "card group relative flex flex-col gap-3 p-4 ring-1 transition hover:shadow-md",
        meta.ring,
      )}
    >
      <span className={clsx("absolute inset-x-0 top-0 h-1.5 rounded-t-2xl", meta.bar)} />
      <div className="flex items-start justify-between pt-1">
        <div>
          <div className="text-lg font-bold text-slate-900">Room {room.number}</div>
          {room.name && <div className="text-xs text-slate-500">{room.name}</div>}
        </div>
        <span className={clsx("h-3 w-3 rounded-full", meta.dot)} />
      </div>

      <RoomStatusBadge status={room.status} />

      <div className="mt-auto space-y-0.5 text-xs text-slate-500">
        {room.status === "NEEDS_REPAIR" && (
          <div className="font-medium text-red-600">
            {room.issues} item{room.issues === 1 ? "" : "s"} need repair
          </div>
        )}
        {room.inspectedAt ? (
          <div>
            Last: {new Date(room.inspectedAt).toLocaleDateString()}
          </div>
        ) : (
          <div>Never inspected</div>
        )}
      </div>

      <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 opacity-0 transition group-hover:opacity-100">
        <ClipboardCheck className="h-3.5 w-3.5" />
        View &amp; inspect
      </span>
    </Link>
  );
}
