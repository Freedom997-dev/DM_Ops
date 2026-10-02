"use client";

// Formats a timestamp in the viewer's time zone. Server components render on
// Vercel in UTC, so formatting there would show the wrong local time.
export function LocalDateTime({
  iso,
  mode = "datetime",
}: {
  iso: string;
  mode?: "datetime" | "date" | "time";
}) {
  const d = new Date(iso);
  const text =
    mode === "date"
      ? d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })
      : mode === "time"
        ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
        : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  );
}
