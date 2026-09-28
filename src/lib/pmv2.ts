// PM V2 — shared constants and pure helpers (safe to import from client and
// server). Quarter-based room condition inspections; see docs/features/pm-v2.md.

export const PMV2_BASE = "/services/pm-v2";

export const RESULT_STATUSES = ["OK", "REPAIR", "REPLACE", "MISSING", "FIXED", "NA"] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

// Statuses that count as an open issue on the board / repair list.
export const ISSUE_STATUSES: ReadonlySet<string> = new Set(["REPAIR", "REPLACE", "MISSING"]);
export const isIssue = (s: string | null | undefined) => !!s && ISSUE_STATUSES.has(s);

// Tailwind classes per status: segmented button when selected, row accent, pill.
export const STATUS_META: Record<
  ResultStatus,
  { label: string; on: string; border: string; pill: string }
> = {
  OK: {
    label: "OK",
    on: "bg-emerald-600 border-emerald-600 text-white",
    border: "border-l-emerald-500",
    pill: "bg-emerald-100 text-emerald-700",
  },
  REPAIR: {
    label: "Repair",
    on: "bg-amber-600 border-amber-600 text-white",
    border: "border-l-amber-500",
    pill: "bg-amber-100 text-amber-800",
  },
  REPLACE: {
    label: "Replace",
    on: "bg-orange-600 border-orange-600 text-white",
    border: "border-l-orange-600",
    pill: "bg-orange-100 text-orange-700",
  },
  MISSING: {
    label: "Missing",
    on: "bg-fuchsia-700 border-fuchsia-700 text-white",
    border: "border-l-fuchsia-600",
    pill: "bg-fuchsia-100 text-fuchsia-700",
  },
  FIXED: {
    label: "Fixed",
    on: "bg-brand-600 border-brand-600 text-white",
    border: "border-l-brand-500",
    pill: "bg-brand-50 text-brand-700",
  },
  NA: {
    label: "N/A",
    on: "bg-slate-500 border-slate-500 text-white",
    border: "border-l-slate-400",
    pill: "bg-slate-100 text-slate-600",
  },
};

// ---- Quarters ("YYYY-Qn") --------------------------------------------------

export function quarterOf(d: Date): string {
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

export function isQuarter(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-Q[1-4]$/.test(v);
}

export function quarterLabel(q: string): string {
  const [y, n] = q.split("-Q");
  return `Q${n} ${y} · ${["Jan–Mar", "Apr–Jun", "Jul–Sep", "Oct–Dec"][Number(n) - 1]}`;
}

// Last year's Q1 through next quarter, newest first (same range as the artifact).
export function quarterList(now = new Date()): string[] {
  const cy = now.getFullYear();
  const cn = Math.floor(now.getMonth() / 3) + 1;
  const ey = cn === 4 ? cy + 1 : cy;
  const en = cn === 4 ? 1 : cn + 1;
  const out: string[] = [];
  for (let y = cy - 1, n = 1; y < ey || (y === ey && n <= en); ) {
    out.push(`${y}-Q${n}`);
    if (++n > 4) {
      n = 1;
      y++;
    }
  }
  return out.reverse();
}

// Read ?q= from a page's searchParams, defaulting to the current quarter.
export function quarterFromParams(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return isQuarter(v) ? v : quarterOf(new Date());
}

// ---- Dates (plain "YYYY-MM-DD" strings, local time) -----------------------

export function todayISO(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtDay(s: string | null | undefined): string {
  if (!s) return "";
  const d = new Date(s.length === 10 ? `${s}T12:00` : s);
  return isNaN(d.getTime())
    ? s
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// "Room 204" -> "204" for compact tiles; other areas keep their full name.
export function shortName(a: { name: string; type: string }): string {
  return a.type === "ROOM" ? a.name.replace(/^room\s*/i, "") : a.name;
}

export type AreaState = "done" | "prog" | "todo";
