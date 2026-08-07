import { prisma } from "@/lib/db";
import { roomStatusFromSummary, ROOM_STATUS_META, type RoomStatus } from "@/lib/status";

/** Sorts rooms numerically where possible ("2" before "10"), else alphabetically. */
export function byRoomNumber(a: { number: string }, b: { number: string }) {
  const na = parseInt(a.number, 10);
  const nb = parseInt(b.number, 10);
  if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
  return a.number.localeCompare(b.number, undefined, { numeric: true });
}

/** One row per flagged checklist item — used by the item-level report sheets. */
export type ReportItem = {
  roomNumber: string;
  roomName: string | null;
  floor: string | null;
  sectionName: string;
  questionText: string;
  note: string | null;
  inspectedAt: Date | null;
  inspector: string | null;
};

export type ReportRoom = {
  number: string;
  name: string | null;
  floor: string | null;
  status: RoomStatus;
  statusLabel: string;
  openRepairs: number;
  awaitingVerification: number;
  inspectedAt: Date | null;
  inspector: string | null;
};

export type StatusReport = {
  generatedAt: Date;
  rooms: ReportRoom[];
  repairs: ReportItem[];
  awaitingVerification: ReportItem[];
  counts: { total: number } & Record<RoomStatus, number>;
};

/**
 * Current condition of every active room, derived from each room's most recent
 * completed inspection. Single source of truth for the dashboard exports so the
 * spreadsheets always agree with what staff see on screen.
 */
export async function getStatusReport(): Promise<StatusReport> {
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
            select: { status: true, sectionName: true, questionText: true, note: true },
          },
        },
      },
    },
  });
  rooms.sort(byRoomNumber);

  const reportRooms: ReportRoom[] = [];
  const repairs: ReportItem[] = [];
  const awaiting: ReportItem[] = [];
  const counts = {
    total: 0,
    OK: 0,
    NEEDS_REPAIR: 0,
    FIXED: 0,
    NOT_INSPECTED: 0,
  };

  for (const room of rooms) {
    const latest = room.inspections[0];
    const items = latest?.items ?? [];
    const openItems = items.filter((i) => i.status === "NEEDS_REPAIR");
    const fixedItems = items.filter((i) => i.status === "REPAIR_COMPLETED");
    const status = roomStatusFromSummary(latest?.summary, fixedItems.length);

    counts.total += 1;
    counts[status] += 1;

    reportRooms.push({
      number: room.number,
      name: room.name,
      floor: room.floor,
      status,
      statusLabel: ROOM_STATUS_META[status].label,
      openRepairs: openItems.length,
      awaitingVerification: fixedItems.length,
      inspectedAt: latest?.completedAt ?? null,
      inspector: latest?.inspector.name ?? null,
    });

    const toItem = (i: (typeof items)[number]): ReportItem => ({
      roomNumber: room.number,
      roomName: room.name,
      floor: room.floor,
      sectionName: i.sectionName,
      questionText: i.questionText,
      note: i.note,
      inspectedAt: latest?.completedAt ?? null,
      inspector: latest?.inspector.name ?? null,
    });

    repairs.push(...openItems.map(toItem));
    awaiting.push(...fixedItems.map(toItem));
  }

  return {
    generatedAt: new Date(),
    rooms: reportRooms,
    repairs,
    awaitingVerification: awaiting,
    counts,
  };
}

/** Outstanding repair items only — backs the "Export to Excel" button. */
export async function getRepairRows(): Promise<ReportItem[]> {
  return (await getStatusReport()).repairs;
}
