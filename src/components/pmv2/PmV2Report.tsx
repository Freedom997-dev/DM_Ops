"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import clsx from "clsx";
import { FileSpreadsheet, FileText, MessageSquareText, Settings } from "lucide-react";
import type { ReportDTO } from "@/lib/pmv2-data";
import { detailedMessage, shortMessage, stampOf } from "@/lib/pmv2-messages";
import { PMV2_BASE, STATUS_META, fmtDay, type ResultStatus } from "@/lib/pmv2";

/**
 * Report tab: share panel (PDF via the browser's Save-as-PDF, Excel download,
 * copyable WhatsApp message) + a print-only full report that the PDF uses.
 */
export function PmV2Report({ report: R }: { report: ReportDTO }) {
  const [detail, setDetail] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const pre = useRef<HTMLPreElement>(null);
  const text = detail ? detailedMessage(R) : shortMessage(R);

  if (!R.total) {
    return (
      <div className="card empty-state">
        <p className="font-semibold text-slate-700">No rooms or areas yet</p>
        <p className="text-sm">Add your rooms in Setup, then come back here to share the report.</p>
        <Link href={`${PMV2_BASE}/setup?tab=areas&q=${R.quarter}`} className="btn-primary">
          <Settings className="h-4 w-4" /> Go to Setup
        </Link>
      </div>
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setMsg({ text: "Message copied. Paste it into WhatsApp, a text or an email." });
    } catch {
      setMsg({ text: "Couldn’t copy automatically. The message below is selected – copy it from there.", err: true });
      if (pre.current) {
        const r = document.createRange();
        r.selectNodeContents(pre.current);
        const sel = getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
      }
    }
  }

  return (
    <>
      <div className="no-print space-y-4">
        <div>
          <div className="section-heading">{R.quarterLabel}</div>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">Condition report</h2>
        </div>

        <section className="card space-y-3 p-4 ring-1 ring-brand-200">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Share the hotel&apos;s current condition</h3>
            <p className="max-w-[70ch] text-sm text-slate-500">
              Pick a format. The report shows {R.quarterLabel} as it stands right now. Change the quarter at the top
              to report on a different one.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <ShareBtn primary onClick={() => window.print()} icon={<FileText className="h-4 w-4" />} title="PDF report" sub="Print or Save as PDF" />
            <ShareBtn
              href={`/api/exports/pm-v2?q=${R.quarter}`}
              icon={<FileSpreadsheet className="h-4 w-4" />}
              title="Excel report"
              sub="Rooms, open issues, fixed items"
            />
            <ShareBtn
              onClick={copy}
              icon={<MessageSquareText className="h-4 w-4" />}
              title={`Copy ${detail ? "detailed" : "short"} message`}
              sub="Paste into WhatsApp or a text"
            />
          </div>

          <p aria-live="polite" className={clsx("min-h-[1.25rem] text-sm", msg?.err ? "text-red-600" : "text-emerald-700")}>
            {msg?.text}
          </p>

          <div role="group" aria-label="Message length" className="flex flex-wrap gap-1.5">
            {[
              [false, "Short message"],
              [true, "Detailed (every issue)"],
            ].map(([d, label]) => (
              <button
                key={String(d)}
                type="button"
                aria-pressed={detail === d}
                onClick={() => {
                  setDetail(d as boolean);
                  setMsg(null);
                }}
                className={clsx(
                  "rounded-full border px-3 py-1 text-sm font-semibold transition",
                  detail === d ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-500 hover:text-slate-800",
                )}
              >
                {label as string}
              </button>
            ))}
          </div>

          <pre
            ref={pre}
            suppressHydrationWarning // date/time is formatted in the viewer's timezone
            className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 font-mono text-[13px] leading-relaxed text-slate-800"
          >
            {text}
          </pre>
        </section>
      </div>

      <PrintReport R={R} />
    </>
  );
}

function ShareBtn({
  primary,
  onClick,
  href,
  icon,
  title,
  sub,
}: {
  primary?: boolean;
  onClick?: () => void;
  href?: string; // plain anchor: triggers a file download, not a client nav
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  const Tag = href ? "a" : "button";
  return (
    <Tag
      {...(href ? { href } : { type: "button" as const, onClick })}
      className={clsx(
        "flex min-w-[180px] flex-1 items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition",
        primary ? "border-brand-600 bg-brand-600 text-white hover:bg-brand-700" : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
      )}
    >
      <span className="mt-0.5">{icon}</span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className={clsx("block text-xs", primary ? "text-brand-100" : "text-slate-500")}>{sub}</span>
      </span>
    </Tag>
  );
}

// ---------------------------------------------------------------------------
// Print-only report (what "PDF report" saves). Uses the global .print-area rules.
// ---------------------------------------------------------------------------
function PrintReport({ R }: { R: ReportDTO }) {
  const boxes: [string, string, boolean?][] = [
    ["Complete", `${R.counts.done} / ${R.total}`],
    ["In progress", String(R.counts.prog)],
    ["Not started", String(R.counts.todo)],
    ["Open issues", String(R.open.length), R.open.length > 0],
    ["Fixed", String(R.fixed.length)],
  ];
  const th = "border-b border-brand-700 bg-brand-700 px-2 py-1.5 text-left font-semibold text-white";
  const td = "border-b border-slate-200 px-2 py-1 align-top";
  return (
    <div className="print-area print-only text-[11px] text-slate-900">
      <h1 className="text-xl font-bold">{R.hotel}</h1>
      <h2 className="text-sm font-bold">Room condition report</h2>
      <p className="mb-3 text-slate-500" suppressHydrationWarning>
        {R.quarterLabel} · Generated {stampOf(new Date(R.generated))}
      </p>

      <div className="mb-4 grid grid-cols-5 gap-2">
        {boxes.map(([l, v, hot]) => (
          <div key={l} className="rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5">
            <div className="text-[10px] text-slate-500">{l}</div>
            <div className={clsx("text-base font-bold", hot && "text-orange-700")}>{v}</div>
          </div>
        ))}
      </div>

      <h3 className="mb-1 text-sm font-bold">Open issues ({R.open.length})</h3>
      {R.open.length ? (
        <table className="mb-4 w-full border-collapse">
          <thead>
            <tr>
              {["Room / area", "Section", "Item", "Status", "Note", "Inspected"].map((h) => (
                <th key={h} className={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {R.open.map((o) => (
              <tr key={o.resultId} className="break-inside-avoid">
                <td className={clsx(td, "font-bold")}>{o.area}</td>
                <td className={td}>{o.section}</td>
                <td className={td}>{o.item}</td>
                <td className={td}>{STATUS_META[o.status as ResultStatus].label}</td>
                <td className={td}>{o.note}</td>
                <td className={td}>{fmtDay(o.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mb-4">No open issues.</p>
      )}

      {R.fixed.length > 0 && (
        <>
          <h3 className="mb-1 text-sm font-bold">Fixed this quarter ({R.fixed.length})</h3>
          <table className="mb-4 w-full border-collapse">
            <thead>
              <tr>
                {["Room / area", "Item", "Note", "Fixed on"].map((h) => (
                  <th key={h} className={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {R.fixed.map((o) => (
                <tr key={o.resultId} className="break-inside-avoid">
                  <td className={clsx(td, "font-bold")}>{o.area}</td>
                  <td className={td}>{o.item}</td>
                  <td className={td}>{o.note}</td>
                  <td className={td}>{fmtDay(o.fixedOn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h3 className="mb-1 text-sm font-bold">All rooms &amp; areas ({R.total})</h3>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {["Room / area", "Group", "Status", "Checked", "Open issues", "Inspected", "Initials"].map((h) => (
              <th key={h} className={th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {R.rooms.map((r) => (
            <tr key={r.id} className="break-inside-avoid">
              <td className={clsx(td, "font-bold")}>{r.name}</td>
              <td className={td}>{r.group}</td>
              <td className={td}>{r.status}</td>
              <td className={td}>
                {r.ans}/{r.total}
              </td>
              <td className={td}>{r.iss || ""}</td>
              <td className={td}>{fmtDay(r.date)}</td>
              <td className={td}>{r.initials}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
