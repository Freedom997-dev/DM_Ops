// Who may edit a day's workflow sheet (Daily Cleanliness).
//
//   • Today        — editable until marked complete.
//   • Past days    — locked once the date passes (missed or left in progress).
//                    A manager+ unlocks a day; while unlocked, anyone with
//                    access to the service can edit it. Locking again or
//                    marking it complete ends that.
//   • Future days  — never editable.
//   • Completed    — read-only on any day; an admin can Reopen.
//
// Dates are UTC midnight of the motel's calendar day (src/lib/business-date.ts).

export type DayKind = "today" | "past" | "future";

export type SheetState = {
  kind: DayKind;
  editable: boolean;
  /** Shown when not editable. */
  lockReason: "completed" | "past-locked" | "future" | null;
  unlocked: boolean;
};

type SubmissionLike = { status: string; unlockedAt: Date | null } | null;

export function dayKind(date: Date, today: Date): DayKind {
  const d = date.getTime();
  const t = today.getTime();
  return d === t ? "today" : d < t ? "past" : "future";
}

export function sheetState(date: Date, today: Date, submission: SubmissionLike): SheetState {
  const kind = dayKind(date, today);
  const unlocked = kind === "past" && !!submission?.unlockedAt;
  if (kind === "future") return { kind, editable: false, lockReason: "future", unlocked: false };
  if (submission?.status === "COMPLETED") return { kind, editable: false, lockReason: "completed", unlocked };
  if (kind === "past" && !unlocked) return { kind, editable: false, lockReason: "past-locked", unlocked };
  return { kind, editable: true, lockReason: null, unlocked };
}

export function lockMessage(reason: SheetState["lockReason"]): string {
  switch (reason) {
    case "completed":
      return "This inspection is marked complete.";
    case "past-locked":
      return "This day is locked. Ask a manager to unlock it for editing.";
    case "future":
      return "You can't fill in a future day.";
    default:
      return "";
  }
}

/** YYYY-MM-DD of a UTC-midnight business date. */
export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Parse YYYY-MM-DD to UTC midnight, or null if malformed. */
export function parseDateKey(s: string | undefined | null): Date | null {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return dateKey(d) === s ? d : null; // rejects e.g. 2026-02-31
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
