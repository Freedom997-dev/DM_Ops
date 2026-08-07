import cuid from "cuid";

// A task is either a room clean (full photo + inspection flow) or a general
// daily job (simpler flow). Its status set depends on the kind.
export const HK_KINDS = ["ROOM_CLEANING", "GENERAL"] as const;
export type HkKind = (typeof HK_KINDS)[number];

// Room-cleaning lifecycle (4 states; In Progress added to the original spec).
export const HK_ROOM_STATUS = [
  "READY_TO_CLEAN",
  "IN_PROGRESS",
  "READY_FOR_INSPECTION",
  "READY_TO_RENT",
] as const;

// General daily-task lifecycle (3 states, no mandatory inspection).
export const HK_GENERAL_STATUS = ["TODO", "IN_PROGRESS", "DONE"] as const;

export type HkStatus =
  | (typeof HK_ROOM_STATUS)[number]
  | (typeof HK_GENERAL_STATUS)[number];

export function statusesForKind(kind: HkKind): readonly HkStatus[] {
  return kind === "ROOM_CLEANING" ? HK_ROOM_STATUS : HK_GENERAL_STATUS;
}

// Terminal (closed) statuses — everything else is an "open" task.
const TERMINAL: HkStatus[] = ["READY_TO_RENT", "DONE"];
export function isOpenStatus(status: string): boolean {
  return !TERMINAL.includes(status as HkStatus);
}

export const HK_STATUS_META: Record<
  HkStatus,
  { label: string; short: string; chip: string; dot: string; bar: string; tone: string }
> = {
  // Room-cleaning
  READY_TO_CLEAN: {
    label: "Ready to Clean", short: "To Clean",
    chip: "bg-amber-100 text-amber-800 border-amber-200",
    dot: "bg-amber-500", bar: "bg-amber-500", tone: "amber",
  },
  IN_PROGRESS: {
    label: "In Progress", short: "In Progress",
    chip: "bg-sky-100 text-sky-800 border-sky-200",
    dot: "bg-sky-500", bar: "bg-sky-500", tone: "sky",
  },
  READY_FOR_INSPECTION: {
    label: "Ready for Inspection", short: "Inspect",
    chip: "bg-violet-100 text-violet-800 border-violet-200",
    dot: "bg-violet-500", bar: "bg-violet-500", tone: "violet",
  },
  READY_TO_RENT: {
    label: "Ready to Rent", short: "Ready",
    chip: "bg-emerald-100 text-emerald-800 border-emerald-200",
    dot: "bg-emerald-500", bar: "bg-emerald-500", tone: "emerald",
  },
  // General task
  TODO: {
    label: "To Do", short: "To Do",
    chip: "bg-slate-100 text-slate-700 border-slate-200",
    dot: "bg-slate-400", bar: "bg-slate-300", tone: "slate",
  },
  DONE: {
    label: "Done", short: "Done",
    chip: "bg-emerald-100 text-emerald-800 border-emerald-200",
    dot: "bg-emerald-500", bar: "bg-emerald-500", tone: "emerald",
  },
};

export function isHkStatus(s: string): s is HkStatus {
  return s in HK_STATUS_META;
}

/** Label for a task: "Room 102" or the general task's title. */
export function taskLabel(t: {
  kind: string;
  title: string | null;
  roomNumber?: string | null;
  room?: { number: string } | null;
}): string {
  if (t.kind === "ROOM_CLEANING") {
    const num = t.roomNumber ?? t.room?.number;
    return num ? `Room ${num}` : "Room";
  }
  return t.title?.trim() || "Task";
}

// housekeeping/<YYYY-MM>/<YYYY-MM-DD>/room-<number>/<uuid>.<ext>
export function hkPhotoPath(roomNumber: string, ext: string): string {
  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const ymd = `${ym}-${String(now.getUTCDate()).padStart(2, "0")}`;
  const safeRoom = roomNumber.replace(/[^A-Za-z0-9_-]/g, "");
  return `housekeeping/${ym}/${ymd}/room-${safeRoom}/${cuid()}.${ext}`;
}

// General-task photos aren't tied to a room number.
export function hkGeneralPhotoPath(ext: string): string {
  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const ymd = `${ym}-${String(now.getUTCDate()).padStart(2, "0")}`;
  return `housekeeping/${ym}/${ymd}/task/${cuid()}.${ext}`;
}

// --- Role helpers (HK is a built-in service; roles hardcoded like PM) ---
export function canAccessHousekeeping(role: string | null | undefined): boolean {
  return (
    role === "ADMIN" || role === "MANAGER" || role === "INSPECTOR" || role === "HOUSEKEEPER"
  );
}
// Managers/admins create tasks, check out rooms, and assign work.
export function canManageHousekeeping(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "MANAGER";
}
export function canSubmitCleaning(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "MANAGER" || role === "HOUSEKEEPER";
}
export function canReviewCleaning(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "MANAGER" || role === "INSPECTOR";
}
export function canConfigureHousekeeping(role: string | null | undefined): boolean {
  return role === "ADMIN";
}
