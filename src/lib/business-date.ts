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

/** Format a date-only value (stored as UTC midnight) without timezone shift. */
export function formatBusinessDate(
  date: Date | string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "full" },
): string {
  return new Date(date).toLocaleDateString(undefined, { ...options, timeZone: "UTC" });
}
