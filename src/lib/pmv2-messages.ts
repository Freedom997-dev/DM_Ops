// PM V2 — share-message text for WhatsApp / SMS. Client-safe (runs in the
// browser so times use the viewer's local timezone, as in the artifact).
import type { IssueLine, ReportDTO } from "@/lib/pmv2-data";

const LABEL: Record<string, string> = { REPAIR: "Repair", REPLACE: "Replace", MISSING: "Missing", FIXED: "Fixed" };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function stampOf(d: Date) {
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Every open issue, grouped by room — the "Detailed" message. */
export function detailedMessage(R: ReportDTO): string {
  const L = [
    `${R.hotel} – Room condition report`,
    `${R.quarterLabel} · as of ${stampOf(new Date(R.generated))}`,
    "",
    `Inspections: ${R.counts.done} of ${R.total} complete, ${R.counts.prog} in progress, ${R.counts.todo} not started`,
    `Open issues: ${R.open.length} in ${R.withIssues} room${R.withIssues === 1 ? "" : "s"}/area${R.withIssues === 1 ? "" : "s"} (Repair ${R.byStatus.REPAIR}, Replace ${R.byStatus.REPLACE}, Missing ${R.byStatus.MISSING})`,
    `Fixed this quarter: ${R.fixed.length}`,
  ];
  if (R.open.length) {
    L.push("", "OPEN ISSUES");
    const g = new Map<string, IssueLine[]>();
    R.open.forEach((o) => g.set(o.area, [...(g.get(o.area) ?? []), o]));
    g.forEach((list, area) => {
      L.push("", `${area} (${list.length})`);
      list.forEach((o) => L.push(`• ${o.item} – ${LABEL[o.status]}${o.note ? `: ${o.note}` : ""}`));
    });
  }
  return L.join("\n");
}

/** Headline numbers + worst rooms — the "Short" message. */
export function shortMessage(R: ReportDTO): string {
  const d = new Date(R.generated).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const counts = new Map<string, number>();
  R.open.forEach((o) => counts.set(o.area, (counts.get(o.area) ?? 0) + 1));
  const worst = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const L = [
    `${R.hotel} – ${R.quarterLabel.split(" · ")[0]} condition update (${d})`,
    `Inspected: ${R.counts.done}/${R.total} done, ${R.counts.prog} in progress, ${R.counts.todo} not started`,
    `Open issues: ${R.open.length}${R.open.length ? ` in ${plural(R.withIssues, "room")}` : ""} · Fixed: ${R.fixed.length}`,
  ];
  if (worst.length)
    L.push(
      `Needs attention: ${worst
        .slice(0, 8)
        .map(([a, n]) => `${a} (${n})`)
        .join(", ")}${worst.length > 8 ? `, +${worst.length - 8} more` : ""}`,
    );
  return L.join("\n");
}
