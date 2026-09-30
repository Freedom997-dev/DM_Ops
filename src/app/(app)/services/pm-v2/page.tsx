import Link from "next/link";
import clsx from "clsx";
import { Share2, DoorOpen, Settings } from "lucide-react";
import { requirePermission, can } from "@/lib/session";
import { loadQuarter, type AreaRow } from "@/lib/pmv2-data";
import { PMV2_BASE, quarterFromParams, quarterLabel, shortName } from "@/lib/pmv2";
import { ProgressBar } from "@/components/pmv2/ProgressBar";

export const dynamic = "force-dynamic";

type Kind = "all" | "room" | "area";

export default async function PmV2Board({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission("pmv2:board:view");
  const q = quarterFromParams(sp.q);
  const kind: Kind = sp.kind === "room" || sp.kind === "area" ? sp.kind : "all";
  const { rows } = await loadQuarter(q);

  if (!rows.length) {
    return (
      <div className="card empty-state">
        <DoorOpen className="h-10 w-10 text-slate-300" />
        <p className="font-semibold text-slate-700">No rooms or areas yet</p>
        <p className="text-sm">Add your rooms and other areas in Setup to start inspecting.</p>
        {can(user, "pmv2:setup:configure") && (
          <Link href={`${PMV2_BASE}/setup?tab=areas&q=${q}`} className="btn-primary">
            <Settings className="h-4 w-4" /> Go to Setup
          </Link>
        )}
      </div>
    );
  }

  const c = { done: 0, prog: 0, todo: 0, iss: 0 };
  rows.forEach((r) => {
    c[r.state]++;
    c.iss += r.iss;
  });
  const pct = Math.round((c.done / rows.length) * 100);
  const nRooms = rows.filter((r) => r.area.type === "ROOM").length;

  const shown = rows.filter(
    (r) => kind === "all" || (kind === "room" ? r.area.type === "ROOM" : r.area.type !== "ROOM"),
  );
  const groups: { name: string; rows: AreaRow[] }[] = [];
  for (const r of shown) {
    const g = r.area.group || "Other";
    let grp = groups.find((x) => x.name === g);
    if (!grp) groups.push((grp = { name: g, rows: [] }));
    grp.rows.push(r);
  }

  const chip = (k: Kind, label: string) => (
    <Link
      href={`${PMV2_BASE}?q=${q}${k === "all" ? "" : `&kind=${k}`}`}
      aria-current={kind === k ? "true" : undefined}
      className={clsx(
        "rounded-full border px-3 py-1 text-sm font-semibold transition",
        kind === k
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-500 hover:text-slate-800",
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-5">
      {/* Summary */}
      <section className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="min-w-[280px] flex-1">
          <div className="section-heading">{quarterLabel(q)}</div>
          <h2 className="mb-3 mt-1 text-2xl font-bold text-slate-900">
            {c.done} of {rows.length} inspections complete
          </h2>
          <ProgressBar pct={pct} className="h-2.5" />
        </div>
        <div className="flex flex-wrap items-stretch gap-2">
          <Kpi label="In progress" value={c.prog} />
          <Kpi label="Not started" value={c.todo} />
          <Kpi label="Open issues" value={c.iss} tone="issue" />
          {can(user, "pmv2:reports:view") && (
            <Link href={`${PMV2_BASE}/report?q=${q}`} className="btn-primary">
              <Share2 className="h-4 w-4" /> Share report
            </Link>
          )}
        </div>
      </section>

      {/* Filters + legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap gap-1.5">
          {chip("all", `All (${rows.length})`)}
          {chip("room", `Guest rooms (${nRooms})`)}
          {chip("area", `Other areas (${rows.length - nRooms})`)}
        </div>
        <div className="ml-auto flex flex-wrap gap-3 text-xs text-slate-500">
          <Legend className="border border-slate-300 bg-white">Not started</Legend>
          <Legend className="border-2 border-brand-500 bg-white">In progress</Legend>
          <Legend className="bg-emerald-100">Complete</Legend>
          <Legend className="bg-orange-600">Open issues</Legend>
        </div>
      </div>

      {groups.map((g) => {
        const wide = g.rows.some((r) => r.area.type !== "ROOM");
        const doneN = g.rows.filter((r) => r.state === "done").length;
        return (
          <section key={g.name}>
            <h3 className="mb-2 flex items-baseline gap-2 text-lg font-bold text-slate-900">
              {g.name}
              <span className="text-sm font-medium text-slate-500">
                {doneN}/{g.rows.length} complete
              </span>
            </h3>
            <div
              className={clsx(
                "grid gap-2",
                wide
                  ? "grid-cols-[repeat(auto-fill,minmax(170px,1fr))]"
                  : "grid-cols-[repeat(auto-fill,minmax(96px,1fr))]",
              )}
            >
              {g.rows.map((r) => (
                <Tile key={r.area.id} row={r} q={q} wide={wide} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Tile({ row, q, wide }: { row: AreaRow; q: string; wide: boolean }) {
  const pct = row.total ? Math.round((row.ans / row.total) * 100) : 0;
  const sub =
    row.state === "done" ? "Complete" : row.state === "prog" ? `${row.ans}/${row.total} checked` : "Not started";
  return (
    <Link
      href={`${PMV2_BASE}/inspect/${row.area.id}?q=${q}`}
      aria-label={`${row.area.name}: ${sub}${row.iss ? `, ${row.iss} open issues` : ""}`}
      className={clsx(
        "relative flex min-h-[84px] flex-col gap-1.5 rounded-xl border p-2.5 text-left transition hover:border-brand-500 hover:shadow-sm",
        row.state === "done" && "border-transparent bg-emerald-50",
        row.state === "prog" && "border-2 border-brand-500 bg-white",
        row.state === "todo" && "border-slate-200 bg-white",
      )}
    >
      <span className={clsx("font-bold leading-tight text-slate-900 tabular-nums", wide ? "text-base" : "text-xl")}>
        {shortName(row.area)}
      </span>
      <span
        className={clsx(
          "mt-auto text-xs tabular-nums",
          row.state === "done" ? "font-semibold text-emerald-700" : "text-slate-500",
        )}
      >
        {sub}
      </span>
      <ProgressBar pct={pct} tone={row.state === "done" ? "ok" : "brand"} />
      {row.iss > 0 && (
        <span className="absolute right-2 top-2 rounded-full bg-orange-600 px-1.5 text-[11px] font-bold tabular-nums text-white">
          {row.iss}
        </span>
      )}
    </Link>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "issue" }) {
  return (
    <div className="card min-w-[96px] px-3.5 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={clsx("text-2xl font-bold tabular-nums", tone === "issue" && value ? "text-orange-600" : "text-slate-900")}>
        {value}
      </div>
    </div>
  );
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className={clsx("inline-block h-2.5 w-2.5 rounded-[3px]", className)} />
      {children}
    </span>
  );
}
