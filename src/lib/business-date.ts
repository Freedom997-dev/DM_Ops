// Calendar dates for date-only records (e.g. WorkflowSubmission.date).
//
// Those columns store UTC midnight of the *motel's* calendar day. Two rules
// keep them from drifting a day:
//   1. "Today" comes from the motel's timezone, not the server's (Vercel runs
//      in UTC, so after ~8 PM Eastern the UTC date is already tomorrow).
//   2. Display with timeZone "UTC" — rendering UTC midnight in a US browser's
//      local zone shows the previous day.

export const MOTEL_TIME_ZONE = "America/New_York";

/** UTC midnight of the current calendar day at the motel. */
export function motelTodayUTC(now = new Date()): Date {
  // en-CA formats as YYYY-MM-DD.
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: MOTEL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

// Milliseconds the motel's clock is ahead of UTC at `at` (negative in the US).
function motelOffsetMs(at: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: MOTEL_TIME_ZONE, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(at).map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - at.getTime();
}

/**
 * The real instants a motel calendar day spans, for filtering timestamps
 * (createdAt, closedAt…) by business date. `day` is UTC midnight of that day,
 * as from motelTodayUTC(). DST days are 23 or 25 hours long.
 */
export function motelDayRange(day: Date): { start: Date; end: Date } {
  const startOf = (d: Date) => {
    const guess = new Date(d.getTime() - motelOffsetMs(d));
    return new Date(d.getTime() - motelOffsetMs(guess)); // re-check across a DST change
  };
  return { start: startOf(day), end: startOf(new Date(day.getTime() + 86_400_000)) };
}

/** Format a date-only value (stored as UTC midnight) without timezone shift. */
export function formatBusinessDate(
  date: Date | string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "full" },
): string {
  return new Date(date).toLocaleDateString(undefined, { ...options, timeZone: "UTC" });
}
