import Link from "next/link";
import clsx from "clsx";
import { CircleCheck } from "lucide-react";
import { requirePermission, can } from "@/lib/session";
import { issueLines, loadQuarter, type IssueLine } from "@/lib/pmv2-data";
import { PMV2_BASE, STATUS_META, fmtDay, isIssue, quarterFromParams, quarterLabel, type ResultStatus } from "@/lib/pmv2";
import { PmV2FixButton } from "@/components/pmv2/PmV2FixButton";

export const dynamic = "force-dynamic";

type Filter = "open" | "fixed" | "all";

export default async function PmV2Issues({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission("pmv2:board:view");
  const canFix = can(user, "pmv2:inspections:submit");
  const q = quarterFromParams(sp.q);
  const f: Filter = sp.f === "fixed" || sp.f === "all" ? sp.f : "open";

  const data = await loadQuarter(q);
  const lines = issueLines(data);
  const nOpen = lines.filter((l) => isIssue(l.status)).length;
  const nFixed = lines.filter((l) => l.status === "FIXED").length;
  const shown = lines.filter((l) => (f === "open" ? isIssue(l.status) : f === "fixed" ? l.status === "FIXED" : true));

  const byArea: { areaId: string; area: string; date: string; initials: string; list: IssueLine[] }[] = [];
  for (const l of shown) {
    let g = byArea.find((x) => x.areaId === l.areaId);
    if (!g) byArea.push((g = { areaId: l.areaId, area: l.area, date: l.date, initials: l.initials, list: [] }));
    g.list.push(l);
  }

  const chip = (k: Filter, label: string) => (
    <Link
      href={`${PMV2_BASE}/issues?q=${q}${k === "open" ? "" : `&f=${k}`}`}
      aria-current={f === k ? "true" : undefined}
      className={clsx(
        "rounded-full border px-3 py-1 text-sm font-semibold transition",
        f === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-500 hover:text-slate-800",
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="section-heading">{quarterLabel(q)}</div>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">Repair list</h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {chip("open", `Open (${nOpen})`)}
          {chip("fixed", `Fixed (${nFixed})`)}
          {chip("all", "All")}
        </div>
      </div>

      {byArea.length === 0 ? (
        <div className="card empty-state">
          <CircleCheck className="h-10 w-10 text-emerald-400" />
          <p className="font-semibold text-slate-700">
            {f === "fixed" ? "Nothing fixed yet this quarter" : "No open issues"}
          </p>
          <p className="text-sm">Items marked Repair, Replace or Missing during inspections show up here.</p>
        </div>
      ) : (
        byArea.map((g) => (
          <section key={g.areaId} className="card overflow-hidden">
            <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-2.5">
              <Link href={`${PMV2_BASE}/inspect/${g.areaId}?q=${q}`} className="text-lg font-bold text-slate-900 hover:text-brand-600">
                {g.area}
              </Link>
              <span className="text-xs text-slate-500">
                {fmtDay(g.date)}
                {g.initials && ` · ${g.initials}`}
              </span>
            </div>
            <ul className="divide-y divide-slate-100">
              {g.list.map((l) => {
                const meta = STATUS_META[l.status as ResultStatus];
                return (
                  <li
                    key={l.resultId}
                    className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 px-4 py-2.5 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
                  >
                    <span className={clsx("chip uppercase tracking-wide", meta.pill)}>{meta.label}</span>
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{l.item}</div>
                      <div className="text-xs text-slate-500">
                        {l.section}
                        {l.status === "FIXED" && l.fixedOn && ` · fixed ${fmtDay(l.fixedOn)}`}
                      </div>
                      {l.note && <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-slate-700">{l.note}</p>}
                    </div>
                    {isIssue(l.status) && canFix ? (
                      <div className="col-start-2 sm:col-start-auto">
                        <PmV2FixButton resultId={l.resultId} />
                      </div>
                    ) : (
                      <span className="hidden sm:block" />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
