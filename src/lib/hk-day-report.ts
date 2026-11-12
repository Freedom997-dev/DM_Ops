// Housekeeping day summary / day report (housekeeping:reports:view).
// Server-only: loads room-cleaning tasks for one motel business day.
//
// A day's rooms = rooms checked out that day + rooms carried over (checked out
// earlier and still not cleaned when the day began). "Cleaned" = approved
// (Ready to Rent) before the day ended; everything else is pending.

import { prisma } from "@/lib/db";
import { motelDayRange } from "@/lib/business-date";
import { dateKey } from "@/lib/workflow-lock";

export const OTHER_REASON = "Other";

export type HkDayCounts = {
  byReason: Record<string, number>;
  carried: number;
  total: number;
  cleaned: number;
  pending: number;
};

export type HkDayPersonRow = HkDayCounts & { key: string; name: string }; // key "" = Unassigned

export type HkDayRoom = {
  taskId: string;
  roomNumber: string;
  roomName: string | null;
  reason: string;
  carried: boolean;
  checkedOutAt: string;
  housekeeperId: string | null;
  housekeeper: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  submittedBy: string | null;
  /** Approved by (when cleaned) or last sent back by (when still pending). */
  reviewedAt: string | null;
  reviewedBy: string | null;
  sentBack: boolean;
  cleaned: boolean;
  statusNow: string;
};

export type HkDayReport = {
  dateKey: string;
  reasons: string[];
  people: HkDayPersonRow[];
  totals: HkDayCounts;
  rooms: HkDayRoom[];
};

const empty = (reasons: string[]): HkDayCounts => ({
  byReason: Object.fromEntries(reasons.map((r) => [r, 0])),
  carried: 0, total: 0, cleaned: 0, pending: 0,
});

/** `day` is UTC midnight of the motel calendar day (motelTodayUTC / parseDateKey). */
export async function getHkDayReport(day: Date): Promise<HkDayReport> {
  const { start, end } = motelDayRange(day);

  const [tasks, actions] = await Promise.all([
    prisma.housekeepingTask.findMany({
      where: {
        kind: "ROOM_CLEANING",
        OR: [
          { createdAt: { gte: start, lt: end } },
          { createdAt: { lt: start }, OR: [{ closedAt: null }, { closedAt: { gte: start } }] },
        ],
      },
      include: {
        room: { select: { number: true, name: true } },
        assignedHousekeeper: { select: { id: true, name: true } },
        submittedBy: { select: { name: true } },
        reviewedBy: { select: { name: true } },
      },
    }),
    prisma.housekeepingStatusAction.findMany({ orderBy: { order: "asc" }, select: { label: true } }),
  ]);

  const rooms: HkDayRoom[] = tasks
    .map((t) => {
      const cleaned = !!t.closedAt && t.closedAt < end;
      return {
        taskId: t.id,
        roomNumber: t.room?.number ?? "?",
        roomName: t.room?.name ?? null,
        reason: t.requestReason?.trim() || OTHER_REASON,
        carried: t.createdAt < start,
        checkedOutAt: t.createdAt.toISOString(),
        housekeeperId: t.assignedHousekeeper?.id ?? null,
        housekeeper: t.assignedHousekeeper?.name ?? null,
        assignedAt: t.assignedAt?.toISOString() ?? null,
        startedAt: t.startedAt?.toISOString() ?? null,
        submittedAt: t.submittedAt?.toISOString() ?? null,
        submittedBy: t.submittedBy?.name ?? null,
        reviewedAt: t.reviewedAt?.toISOString() ?? null,
        reviewedBy: t.reviewedBy?.name ?? null,
        sentBack: !cleaned && !!t.reviewNote && t.status === "READY_TO_CLEAN",
        cleaned,
        statusNow: t.status,
      };
    })
    .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));

  // Columns: status actions in their settings order (only those used that day),
  // then any older/renamed reasons found on the tasks.
  const used = new Set(rooms.map((r) => r.reason));
  const reasons = [
    ...actions.map((a) => a.label).filter((l) => used.has(l)),
    ...[...used].filter((r) => !actions.some((a) => a.label === r) && r !== OTHER_REASON).sort(),
    ...(used.has(OTHER_REASON) ? [OTHER_REASON] : []),
  ];

  const people = new Map<string, HkDayPersonRow>();
  const totals = empty(reasons);
  for (const r of rooms) {
    const key = r.housekeeperId ?? "";
    if (!people.has(key)) people.set(key, { key, name: r.housekeeper ?? "Unassigned", ...empty(reasons) });
    for (const c of [people.get(key)!, totals]) {
      c.byReason[r.reason]++;
      c.total++;
      if (r.carried) c.carried++;
      if (r.cleaned) c.cleaned++;
      else c.pending++;
    }
  }

  return {
    dateKey: dateKey(day),
    reasons,
    people: [...people.values()].sort((a, b) => (!a.key ? 1 : !b.key ? -1 : a.name.localeCompare(b.name))),
    totals,
    rooms,
  };
}
