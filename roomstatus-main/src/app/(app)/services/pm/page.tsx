import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePermission, can } from "@/lib/session";
import { RoomStatusBadge } from "@/components/StatusBadge";
import { roomStatusFromSummary, ROOM_STATUS_META, type RoomStatus } from "@/lib/status";
import {
  ClipboardCheck,
  DoorOpen,
  Plus,
  TriangleAlert,
  CircleCheck,
  CircleHelp,
  X,
  ChevronRight,
  Download,
  Wrench,
  FileSpreadsheet,
} from "lucide-react";
import clsx from "clsx";
import { byRoomNumber } from "@/lib/reports";

export const dynamic = "force-dynamic";

// Which stat card is currently selected. "all" is the default (no filter).
type ViewKey = "all" | "ok" | "repair" | "fixed" | "not-inspected";

const VIEW_TO_STATUS: Record<Exclude<ViewKey, "all">, RoomStatus> = {
  ok: "OK",
  repair: "NEEDS_REPAIR",
  fixed: "FIXED",
  "not-inspected": "NOT_INSPECTED",
};

const VIEW_HEADING: Record<ViewKey, string> = {
  all: "All rooms",
  ok: "Rooms in good condition",
  repair: "Rooms needing repair",
  fixed: "Rooms repaired — awaiting verification",
  "not-inspected": "Rooms not yet inspected",
};

function parseView(raw: string | string[] | undefined): ViewKey {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "ok" || v === "repair" || v === "fixed" || v === "not-inspected") return v;
  return "all";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const user = await requirePermission("pm:dashboard:view");
  const isAdmin = can(user, "pm:rooms:update");
  const view = parseView(searchParams?.view);

  const rooms = await prisma.room.findMany({
    where: { archived: false },
    include: {
      inspections: {
        where: { status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        take: 1,
        include: {
          inspector: { select: { name: true } },
          items: {
            where: { status: { in: ["NEEDS_REPAIR", "REPAIR_COMPLETED"] } },
            select: {
              id: true,
              status: true,
              sectionName: true,
              questionText: true,
              note: true,
            },
          },
        },
      },
    },
  });
  rooms.sort(byRoomNumber);

  const enriched = rooms.map((r) => {
    const latest = r.inspections[0];
    const items = latest?.items ?? [];
    const repairs = items.filter((i) => i.status === "NEEDS_REPAIR");
    const fixed = items.filter((i) => i.status === "REPAIR_COMPLETED");
    const status = roomStatusFromSummary(latest?.summary, fixed.length) as RoomStatus;
    return {
      id: r.id,
      number: r.number,
      name: r.name,
      floor: r.floor,
      status,
      issues: repairs.length,
      repairs,
      fixedCount: fixed.length,
      inspectedAt: latest?.completedAt ?? null,
      inspector: latest?.inspector.name ?? null,
    };
  });

  const stats = {
    total: enriched.length,
    ok: enriched.filter((r) => r.status === "OK").length,
    repair: enriched.filter((r) => r.status === "NEEDS_REPAIR").length,
    fixed: enriched.filter((r) => r.status === "FIXED").length,
    none: enriched.filter((r) => r.status === "NOT_INSPECTED").length,
  };

  const visible =
    view === "all" ? enriched : enriched.filter((r) => r.status === VIEW_TO_STATUS[view]);

  // Every room that needs repair, with its individual repair items.
  const repairRooms = enriched.filter((r) => r.status === "NEEDS_REPAIR");
  const totalRepairItems = repairRooms.reduce((sum, r) => sum + r.issues, 0);

  // Clicking the active card again clears the filter.
  const hrefFor = (key: ViewKey) =>
    view === key || key === "all" ? "/services/pm" : `/services/pm?view=${key}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Room Condition (PM)</h1>
          <p className="text-sm text-slate-500">
            Current condition of every room at Divya Motel.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Plain anchor: triggers a file download rather than a client-side nav. */}
          <a
            href="/api/exports/status-report"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Full report
          </a>
          {isAdmin && (
            <Link href="/services/pm/rooms?add=1" className="btn-primary">
              <Plus className="h-4 w-4" />
              Add room
            </Link>
          )}
        </div>
      </div>

      {/* Summary stats — click to filter the rooms below */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          icon={<DoorOpen className="h-5 w-5" />}
          label="Total Rooms"
          value={stats.total}
          tone="slate"
          href={hrefFor("all")}
          active={view === "all"}
        />
        <StatCard
          icon={<CircleCheck className="h-5 w-5" />}
          label="OK"
          value={stats.ok}
          tone="emerald"
          href={hrefFor("ok")}
          active={view === "ok"}
        />
        <StatCard
          icon={<TriangleAlert className="h-5 w-5" />}
          label="Needs Repair"
          value={stats.repair}
          tone="red"
          href={hrefFor("repair")}
          active={view === "repair"}
        />
        <StatCard
          icon={<Wrench className="h-5 w-5" />}
          label="Fixed – verify"
          value={stats.fixed}
          tone="amber"
          href={hrefFor("fixed")}
          active={view === "fixed"}
        />
        <StatCard
          icon={<CircleHelp className="h-5 w-5" />}
          label="Not Inspected"
          value={stats.none}
          tone="slate"
          href={hrefFor("not-inspected")}
          active={view === "not-inspected"}
        />
      </div>

      {/* Active filter header */}
      {view !== "all" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{VIEW_HEADING[view]}</h2>
            <p className="text-sm text-slate-500">
              {visible.length} room{visible.length === 1 ? "" : "s"}
              {view === "repair" && totalRepairItems > 0 && (
                <> · {totalRepairItems} item{totalRepairItems === 1 ? "" : "s"} to fix</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {view === "repair" && repairRooms.length > 0 && (
              // Plain anchor: triggers a file download rather than a client-side nav.
              <a
                href="/api/exports/repairs"
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
              >
                <Download className="h-3.5 w-3.5" />
                Export to Excel
              </a>
            )}
            <Link
              href="/services/pm"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              <X className="h-3.5 w-3.5" />
              Clear filter
            </Link>
          </div>
        </div>
      )}

      {/* Needs Repair → full breakdown of every room and its repairs */}
      {view === "repair" && (
        <RepairBreakdown rooms={repairRooms} />
      )}

      {enriched.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-3 p-12 text-center">
          <DoorOpen className="h-10 w-10 text-slate-300" />
          <p className="text-slate-600">No rooms yet.</p>
          {isAdmin && (
            <Link href="/services/pm/rooms?add=1" className="btn-primary">
              <Plus className="h-4 w-4" />
              Add your first room
            </Link>
          )}
        </div>
      ) : visible.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-3 p-12 text-center">
          <CircleCheck className="h-10 w-10 text-slate-300" />
          <p className="text-slate-600">No rooms in this category.</p>
          <Link href="/services/pm" className="text-sm font-semibold text-brand-600 hover:underline">
            Show all rooms
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((room) => (
            <RoomTile key={room.id} room={room} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Detailed list of every room needing repair and the specific items flagged
 * on its most recent inspection.
 */
function RepairBreakdown({
  rooms,
}: {
  rooms: {
    id: string;
    number: string;
    name: string | null;
    issues: number;
    repairs: { id: string; sectionName: string; questionText: string; note: string | null }[];
    inspectedAt: Date | null;
    inspector: string | null;
  }[];
}) {
  if (rooms.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center gap-2 p-10 text-center">
        <CircleCheck className="h-10 w-10 text-emerald-400" />
        <p className="font-medium text-slate-700">Nothing needs repair right now.</p>
        <p className="text-sm text-slate-500">Every inspected room came back OK.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rooms.map((room) => (
        <div key={room.id} className="card overflow-hidden ring-1 ring-red-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-red-50/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 text-red-600" />
              <span className="font-bold text-slate-900">Room {room.number}</span>
              {room.name && <span className="text-sm text-slate-500">· {room.name}</span>}
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                {room.issues} item{room.issues === 1 ? "" : "s"}
              </span>
            </div>
            <Link
              href={`/services/pm/rooms/${room.id}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
            >
              Open room
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <ul className="divide-y divide-slate-100">
            {room.repairs.map((item) => (
              <li key={item.id} className="px-4 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {item.sectionName}
                </div>
                <div className="text-sm text-slate-800">{item.questionText}</div>
                {item.note && (
                  <div className="mt-0.5 text-xs italic text-slate-500">“{item.note}”</div>
                )}
              </li>
            ))}
          </ul>

          <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            {room.inspectedAt
              ? `Inspected ${new Date(room.inspectedAt).toLocaleDateString()}${
                  room.inspector ? ` by ${room.inspector}` : ""
                }`
              : "Never inspected"}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
  href,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "slate" | "emerald" | "red" | "amber";
  href: string;
  active: boolean;
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    emerald: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700",
  };
  const activeRing = {
    slate: "ring-2 ring-slate-400",
    emerald: "ring-2 ring-emerald-400",
    red: "ring-2 ring-red-400",
    amber: "ring-2 ring-amber-400",
  };
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={clsx(
        "card flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-md",
        active && activeRing[tone],
      )}
    >
      <span className={clsx("flex h-10 w-10 items-center justify-center rounded-xl", tones[tone])}>
        {icon}
      </span>
      <div>
        <div className="text-2xl font-bold leading-none text-slate-900">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </Link>
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
    fixedCount: number;
    inspectedAt: Date | null;
    inspector: string | null;
  };
}) {
  const meta = ROOM_STATUS_META[room.status];
  return (
    <Link
      href={`/services/pm/rooms/${room.id}`}
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
        {room.status === "FIXED" && (
          <div className="font-medium text-amber-600">
            {room.fixedCount} item{room.fixedCount === 1 ? "" : "s"} fixed · verify &amp; mark OK
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
