"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { ClipboardCheck } from "lucide-react";
import { PMV2_BASE, quarterFromParams, quarterLabel, quarterList } from "@/lib/pmv2";

/** Header for every PM V2 page: title, quarter picker and section tabs. */
export function PmV2Nav({
  hotel,
  issueCounts,
  canReport,
  canSetup,
}: {
  hotel: string;
  issueCounts: Record<string, number>;
  canReport: boolean;
  canSetup: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const q = quarterFromParams(params.get("q") ?? undefined);
  const quarters = quarterList();
  if (!quarters.includes(q)) quarters.push(q);
  const issues = issueCounts[q] ?? 0;

  const tabs = [
    { href: PMV2_BASE, label: "Rooms", active: pathname === PMV2_BASE || pathname.startsWith(`${PMV2_BASE}/inspect`) },
    { href: `${PMV2_BASE}/issues`, label: "Issues", active: pathname.startsWith(`${PMV2_BASE}/issues`), count: issues },
    ...(canReport ? [{ href: `${PMV2_BASE}/report`, label: "Report", active: pathname.startsWith(`${PMV2_BASE}/report`) }] : []),
    ...(canSetup ? [{ href: `${PMV2_BASE}/setup`, label: "Setup", active: pathname.startsWith(`${PMV2_BASE}/setup`) }] : []),
  ];

  function changeQuarter(next: string) {
    const sp = new URLSearchParams(params.toString());
    sp.set("q", next);
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <div className="print:hidden flex flex-wrap items-center gap-x-5 gap-y-3">
      <div className="mr-auto flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <ClipboardCheck className="h-5 w-5" />
        </span>
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            Room Condition <span className="chip-amber">V2 · Beta</span>
          </h1>
          <p className="text-xs text-slate-500">
            {hotel ? `${hotel} · ` : ""}Preventive maintenance
          </p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-500">
        Quarter
        <select
          value={q}
          onChange={(e) => changeQuarter(e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
        >
          {quarters.map((x) => (
            <option key={x} value={x}>
              {quarterLabel(x)}
            </option>
          ))}
        </select>
      </label>

      <nav aria-label="Room Condition sections" className="flex w-full gap-1 rounded-xl bg-slate-100 p-1 sm:w-auto">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={`${t.href}?q=${q}`}
            aria-current={t.active ? "page" : undefined}
            className={clsx(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition sm:flex-none",
              t.active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
            )}
          >
            {t.label}
            {!!t.count && (
              <span className="min-w-[20px] rounded-full bg-orange-100 px-1.5 text-center text-[11px] font-bold tabular-nums text-orange-700">
                {t.count}
              </span>
            )}
          </Link>
        ))}
      </nav>
    </div>
  );
}
