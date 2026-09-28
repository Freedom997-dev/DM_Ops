import clsx from "clsx";

export function ProgressBar({
  pct,
  className,
  tone = "brand",
}: {
  pct: number;
  className?: string;
  tone?: "brand" | "ok";
}) {
  return (
    <span className={clsx("block h-1.5 overflow-hidden rounded-full bg-slate-100", className)}>
      <span
        className={clsx("block h-full rounded-full", tone === "ok" ? "bg-emerald-500" : "bg-brand-600")}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}
