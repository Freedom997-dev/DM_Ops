/** "just now", "5 min ago", "3 h ago", "Yesterday", else a short date. */
export function timeAgo(iso: string | Date, now = Date.now()): string {
  const t = new Date(iso).getTime();
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  if (h < 48) return "Yesterday";
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
