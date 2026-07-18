// Centralised status definitions used across the dashboard, room views and
// inspection flow.

export type ItemStatus = "OK" | "NEEDS_REPAIR" | "REPAIR_COMPLETED" | "NA";
export type RoomStatus = "OK" | "NEEDS_REPAIR" | "FIXED" | "NOT_INSPECTED";

export const ITEM_STATUS_META: Record<
  ItemStatus,
  { label: string; short: string; dot: string; chip: string; activeBtn: string }
> = {
  OK: {
    label: "OK",
    short: "OK",
    dot: "bg-emerald-500",
    chip: "bg-emerald-100 text-emerald-800 border-emerald-200",
    activeBtn: "bg-emerald-600 text-white border-emerald-600",
  },
  NEEDS_REPAIR: {
    label: "Needs Repair",
    short: "Repair",
    dot: "bg-red-500",
    chip: "bg-red-100 text-red-800 border-red-200",
    activeBtn: "bg-red-600 text-white border-red-600",
  },
  REPAIR_COMPLETED: {
    label: "Repair Completed",
    short: "Fixed",
    dot: "bg-blue-500",
    chip: "bg-blue-100 text-blue-800 border-blue-200",
    activeBtn: "bg-blue-600 text-white border-blue-600",
  },
  NA: {
    label: "N/A",
    short: "N/A",
    dot: "bg-slate-300",
    chip: "bg-slate-100 text-slate-600 border-slate-200",
    activeBtn: "bg-slate-500 text-white border-slate-500",
  },
};

export const ROOM_STATUS_META: Record<
  RoomStatus,
  { label: string; chip: string; dot: string; ring: string; bar: string }
> = {
  OK: {
    label: "OK",
    chip: "bg-emerald-100 text-emerald-800 border-emerald-200",
    dot: "bg-emerald-500",
    ring: "ring-emerald-200",
    bar: "bg-emerald-500",
  },
  NEEDS_REPAIR: {
    label: "Needs Repair",
    chip: "bg-red-100 text-red-800 border-red-200",
    dot: "bg-red-500",
    ring: "ring-red-200",
    bar: "bg-red-500",
  },
  FIXED: {
    label: "Fixed – verify",
    chip: "bg-amber-100 text-amber-800 border-amber-200",
    dot: "bg-amber-500",
    ring: "ring-amber-200",
    bar: "bg-amber-500",
  },
  NOT_INSPECTED: {
    label: "Not Inspected",
    chip: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
    ring: "ring-slate-200",
    bar: "bg-slate-300",
  },
};

/**
 * Derives the room status from its latest completed inspection.
 *
 * Priority: outstanding repairs beat everything — a room with both a broken
 * item and a repaired one is still red. A room whose repairs are all done but
 * not yet re-checked goes amber ("Fixed – verify") until an inspection marks
 * those items OK, which is what turns it green.
 */
export function roomStatusFromSummary(
  summary: string | null | undefined,
  fixedCount = 0,
): RoomStatus {
  if (!summary) return "NOT_INSPECTED";
  if (summary === "NEEDS_REPAIR") return "NEEDS_REPAIR";
  if (fixedCount > 0) return "FIXED";
  return "OK";
}

// Compute an inspection summary from its item statuses.
export function summaryFromItems(statuses: string[]): "OK" | "NEEDS_REPAIR" {
  return statuses.includes("NEEDS_REPAIR") ? "NEEDS_REPAIR" : "OK";
}
