// Room performance for a MATRIX workflow (Daily Cleanliness) over a period.
// Read-only aggregation of WorkflowCell rows; shown on the day list's
// Performance tab (permission workflows:performance:view).
//
//   pass rate = OK / (OK + Issue). Blank cells (not checked / N/A) are left out.
//   coverage  = days the room had at least one cell marked.

import { prisma } from "@/lib/db";
import { addDays, dateKey } from "@/lib/workflow-lock";

export const PERFORMANCE_RANGES = [7, 30, 90] as const;
export type PerformanceRange = (typeof PERFORMANCE_RANGES)[number];

export type RoomDayState = "ok" | "issue" | "unchecked" | "missed";
export type PerfLevel = "good" | "warning" | "critical" | "none";

export type RoomPerformance = {
  roomId: string;
  number: string;
  name: string | null;
  ok: number;
  issues: number;
  passRate: number | null; // 0..1, null = nothing checked
  prevPassRate: number | null; // previous period of the same length
  level: PerfLevel;
  daysChecked: number;
  days: { key: string; state: RoomDayState; issues: number }[]; // oldest → newest
  items: { itemId: string; text: string; issues: number; checks: number }[]; // most issues first
  notes: { key: string; note: string }[]; // latest first, up to 3
};

export type WorkflowPerformance = {
  range: PerformanceRange;
  fromKey: string;
  toKey: string;
  daysInPeriod: number;
  daysInspected: number;
  passRate: number | null;
  issues: number;
  topItem: { text: string; issues: number } | null;
  items: { id: string; text: string }[]; // column order for the problem map
  rooms: RoomPerformance[]; // worst first
};

// Thresholds for the room score colour.
export function perfLevel(rate: number | null): PerfLevel {
  if (rate === null) return "none";
  if (rate >= 0.95) return "good";
  if (rate >= 0.8) return "warning";
  return "critical";
}

export function parseRange(s: string | undefined): PerformanceRange {
  const n = Number(s);
  return (PERFORMANCE_RANGES as readonly number[]).includes(n) ? (n as PerformanceRange) : 30;
}

const rate = (ok: number, issues: number) => (ok + issues > 0 ? ok / (ok + issues) : null);

export async function getWorkflowPerformance(
  workflowId: string,
  range: PerformanceRange,
  today: Date,
): Promise<WorkflowPerformance> {
  const from = addDays(today, -(range - 1));
  const prevFrom = addDays(from, -range);

  const [rooms, items, submissions, prevCells] = await Promise.all([
    prisma.room.findMany({ where: { archived: false }, orderBy: { number: "asc" }, select: { id: true, number: true, name: true } }),
    prisma.workflowItem.findMany({ where: { workflowId, archived: false }, orderBy: { order: "asc" }, select: { id: true, text: true } }),
    prisma.workflowSubmission.findMany({
      where: { workflowId, date: { gte: from, lte: today } },
      select: {
        date: true,
        cells: { select: { roomId: true, itemId: true, itemText: true, status: true } },
        rows: { where: { note: { not: null } }, select: { roomId: true, note: true } },
      },
    }),
    prisma.workflowCell.findMany({
      where: { submission: { workflowId, date: { gte: prevFrom, lt: from } } },
      select: { roomId: true, status: true },
    }),
  ]);

  const subByKey = new Map(submissions.map((s) => [dateKey(s.date), s]));
  const dayKeys: string[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) dayKeys.push(dateKey(d));
  const todayKey = dateKey(today);

  // Item labels: current items first, then any archived item still seen in cells.
  const itemText = new Map(items.map((i) => [i.id, i.text]));
  for (const s of submissions) for (const c of s.cells) if (!itemText.has(c.itemId)) itemText.set(c.itemId, c.itemText);

  const prevByRoom = new Map<string, { ok: number; issues: number }>();
  for (const c of prevCells) {
    const p = prevByRoom.get(c.roomId) ?? { ok: 0, issues: 0 };
    if (c.status === "OK") p.ok++;
    else if (c.status === "ISSUE") p.issues++;
    prevByRoom.set(c.roomId, p);
  }

  const itemIssueTotals = new Map<string, number>();
  let totalOk = 0;
  let totalIssues = 0;

  const roomPerf: RoomPerformance[] = rooms.map((room) => {
    let ok = 0;
    let issues = 0;
    let daysChecked = 0;
    const perItem = new Map<string, { issues: number; checks: number }>();
    const notes: { key: string; note: string }[] = [];

    const days = dayKeys.map((key) => {
      const sub = subByKey.get(key);
      if (!sub) return { key, state: (key === todayKey ? "unchecked" : "missed") as RoomDayState, issues: 0 };
      const cells = sub.cells.filter((c) => c.roomId === room.id && (c.status === "OK" || c.status === "ISSUE"));
      const note = sub.rows.find((r) => r.roomId === room.id)?.note?.trim();
      if (note) notes.push({ key, note });
      if (cells.length === 0) return { key, state: "unchecked" as RoomDayState, issues: 0 };
      daysChecked++;
      let dayIssues = 0;
      for (const c of cells) {
        const it = perItem.get(c.itemId) ?? { issues: 0, checks: 0 };
        it.checks++;
        if (c.status === "ISSUE") {
          it.issues++;
          dayIssues++;
          itemIssueTotals.set(c.itemId, (itemIssueTotals.get(c.itemId) ?? 0) + 1);
        }
        perItem.set(c.itemId, it);
      }
      ok += cells.length - dayIssues;
      issues += dayIssues;
      return { key, state: (dayIssues > 0 ? "issue" : "ok") as RoomDayState, issues: dayIssues };
    });

    totalOk += ok;
    totalIssues += issues;
    const prev = prevByRoom.get(room.id);
    const passRate = rate(ok, issues);
    return {
      roomId: room.id,
      number: room.number,
      name: room.name,
      ok,
      issues,
      passRate,
      prevPassRate: prev ? rate(prev.ok, prev.issues) : null,
      level: perfLevel(passRate),
      daysChecked,
      days,
      items: [...perItem.entries()]
        .map(([itemId, v]) => ({ itemId, text: itemText.get(itemId) ?? "Item", ...v }))
        .sort((a, b) => b.issues - a.issues || b.checks - a.checks),
      notes: notes.reverse().slice(0, 3),
    };
  });

  // Worst first; rooms with nothing checked go last.
  roomPerf.sort((a, b) => (a.passRate ?? 2) - (b.passRate ?? 2) || b.issues - a.issues || a.number.localeCompare(b.number));

  const top = [...itemIssueTotals.entries()].sort((a, b) => b[1] - a[1])[0];
  const columnIds = [...items.map((i) => i.id), ...[...itemText.keys()].filter((id) => !items.some((i) => i.id === id))];

  return {
    range,
    fromKey: dateKey(from),
    toKey: todayKey,
    daysInPeriod: dayKeys.length,
    daysInspected: dayKeys.filter((k) => subByKey.get(k)?.cells.length).length,
    passRate: rate(totalOk, totalIssues),
    issues: totalIssues,
    topItem: top ? { text: itemText.get(top[0]) ?? "Item", issues: top[1] } : null,
    items: columnIds.map((id) => ({ id, text: itemText.get(id) ?? "Item" })),
    rooms: roomPerf,
  };
}
