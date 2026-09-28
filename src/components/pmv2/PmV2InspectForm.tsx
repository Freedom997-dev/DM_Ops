"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ArrowLeft, ArrowRight, ChevronDown, Plus } from "lucide-react";
import { useToast } from "@/components/Toast";
import { ProgressBar } from "@/components/pmv2/ProgressBar";
import {
  PMV2_BASE,
  RESULT_STATUSES,
  STATUS_META,
  fmtDay,
  isIssue,
  quarterLabel,
  shortName,
  todayISO,
  type ResultStatus,
} from "@/lib/pmv2";
import {
  pmv2AddExtra,
  pmv2MarkSectionOk,
  pmv2RemoveExtra,
  pmv2SetDone,
  pmv2SetMeta,
  pmv2SetNote,
  pmv2SetStatus,
  type PmV2Result,
} from "@/lib/actions/pmv2";

type R = { status: string | null; note: string };
type Extra = R & { id: string; label: string };
type AreaRef = { id: string; name: string; type: string };

export type InspectData = {
  quarter: string;
  area: AreaRef;
  checklistName: string | null;
  sections: { id: string; name: string; items: { id: string; label: string }[] }[];
  results: Record<string, R>;
  extras: Extra[];
  meta: {
    date: string | null;
    initials: string;
    notes: string;
    done: boolean;
    completedOn: string | null;
    updatedAt: string | null;
    updatedBy: string | null;
  };
  prev: AreaRef | null;
  next: AreaRef | null;
};

// ---------------------------------------------------------------------------
// Auto-save: each change is sent right away (taps) or after a short pause
// (typing). Pending typed saves are flushed if the user navigates away.
// ---------------------------------------------------------------------------
function useAutoSave() {
  const toast = useToast();
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(false);
  const [, bump] = useState(0); // re-render when the timer map changes
  const timers = useRef(new Map<string, { t: ReturnType<typeof setTimeout>; fn: () => void }>());

  const run = useCallback(
    async (fn: () => Promise<PmV2Result<unknown>>) => {
      setPending((n) => n + 1);
      try {
        const res = await fn();
        if (!res.ok) {
          setFailed(true);
          toast.show(res.error, "error");
        } else setFailed(false);
        return res;
      } catch {
        setFailed(true);
        toast.show("Not saved – check your connection.", "error");
        return { ok: false as const, error: "network" };
      } finally {
        setPending((n) => n - 1);
      }
    },
    [toast],
  );

  const debounce = useCallback(
    (key: string, fn: () => Promise<PmV2Result<unknown>>, ms = 900) => {
      const prev = timers.current.get(key);
      if (prev) clearTimeout(prev.t);
      const fire = () => {
        timers.current.delete(key);
        bump((n) => n + 1);
        void run(fn);
      };
      timers.current.set(key, { t: setTimeout(fire, ms), fn: fire });
      bump((n) => n + 1); // show "Saving…" while waiting
    },
    [run],
  );

  useEffect(() => {
    const map = timers.current;
    const warn = (e: BeforeUnloadEvent) => {
      if (map.size) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      // Leaving the page (e.g. "Next room"): send anything still waiting.
      map.forEach(({ t, fn }) => {
        clearTimeout(t);
        fn();
      });
    };
  }, []);

  const busy = pending > 0 || timers.current.size > 0;
  return { run, debounce, label: busy ? "Saving…" : failed ? "Not saved" : "All saved", failed: failed && !busy };
}

export function PmV2InspectForm({ data, canWrite }: { data: InspectData; canWrite: boolean }) {
  const { quarter, area } = data;
  const [results, setResults] = useState(data.results);
  const [extras, setExtras] = useState(data.extras);
  const [meta, setMeta] = useState(data.meta);
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [armed, setArmed] = useState<string | null>(null);
  const [newExtra, setNewExtra] = useState("");
  const [touched, setTouched] = useState(false);
  const save = useAutoSave();

  const base = { areaId: area.id, quarter, today: todayISO() };
  const q = `?q=${quarter}`;

  // ---- derived progress (same rules as the board) ----
  const allItems = data.sections.flatMap((s) => s.items);
  const total = allItems.length + extras.length;
  const ans =
    allItems.filter((i) => results[i.id]?.status).length + extras.filter((e) => e.status).length;
  const iss =
    allItems.filter((i) => isIssue(results[i.id]?.status)).length +
    extras.filter((e) => isIssue(e.status)).length;
  const pct = total ? Math.round((ans / total) * 100) : 0;

  // ---- mutations ----
  function setStatus(key: { itemId?: string; resultId?: string }, current: string | null, s: ResultStatus) {
    const next = current === s ? null : s; // tapping the active status clears it
    setTouched(true);
    if (key.itemId) {
      const id = key.itemId;
      setResults((r) => ({ ...r, [id]: { note: r[id]?.note ?? "", status: next } }));
    } else {
      setExtras((xs) => xs.map((x) => (x.id === key.resultId ? { ...x, status: next } : x)));
    }
    void save.run(() => pmv2SetStatus({ ...base, ...key, status: next }));
  }

  function setNote(key: { itemId?: string; resultId?: string }, note: string) {
    setTouched(true);
    if (key.itemId) {
      const id = key.itemId;
      setResults((r) => ({ ...r, [id]: { status: r[id]?.status ?? null, note } }));
    } else {
      setExtras((xs) => xs.map((x) => (x.id === key.resultId ? { ...x, note } : x)));
    }
    save.debounce(`note:${key.itemId ?? key.resultId}`, () => pmv2SetNote({ ...base, ...key, note }));
  }

  function setMetaField(field: "date" | "initials" | "notes", value: string) {
    setTouched(true);
    setMeta((m) => ({ ...m, [field]: field === "initials" ? value.toUpperCase() : value }));
    save.debounce(`meta:${field}`, () => pmv2SetMeta({ ...base, [field]: value }), field === "date" ? 200 : 900);
  }

  function markSectionOk(sectionId: string) {
    const sec = data.sections.find((s) => s.id === sectionId)!;
    setTouched(true);
    setResults((r) => {
      const n = { ...r };
      for (const it of sec.items) if (!n[it.id]?.status) n[it.id] = { note: n[it.id]?.note ?? "", status: "OK" };
      return n;
    });
    void save.run(() => pmv2MarkSectionOk({ ...base, sectionId }));
  }

  async function addExtra() {
    const label = newExtra.trim();
    if (!label) return;
    setNewExtra("");
    const res = await save.run(() => pmv2AddExtra({ ...base, label }));
    if (res.ok && res.data) {
      const { id } = res.data as { id: string };
      setExtras((xs) => [...xs, { id, label, status: null, note: "" }]);
    }
  }

  function removeExtra(id: string) {
    if (armed !== `x:${id}`) return setArmed(`x:${id}`);
    setArmed(null);
    setExtras((xs) => xs.filter((x) => x.id !== id));
    void save.run(() => pmv2RemoveExtra(id));
  }

  function setDone(isDone: boolean) {
    setMeta((m) => ({ ...m, done: isDone, completedOn: isDone ? todayISO() : null }));
    void save.run(() => pmv2SetDone({ ...base, done: isDone }));
  }

  const toggle = (set: Set<string>, id: string) => {
    const n = new Set(set);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  };

  // ---- rendering helpers ----
  const row = (key: { itemId?: string; resultId?: string }, label: string, r: R | undefined, extraId?: string) => {
    const id = (key.itemId ?? key.resultId)!;
    const s = (r?.status ?? null) as ResultStatus | null;
    const open = openNotes.has(id);
    return (
      <div
        key={id}
        className={clsx(
          "grid grid-cols-1 items-center gap-x-4 gap-y-2 border-l-4 border-t border-t-slate-100 px-3 py-2.5 first:border-t-0 lg:grid-cols-[minmax(0,1fr)_auto]",
          s ? STATUS_META[s].border : "border-l-transparent",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 text-sm text-slate-800">{label}</span>
          {extraId && canWrite && (
            <button
              type="button"
              onClick={() => removeExtra(extraId)}
              className={clsx(
                "rounded-lg px-2 py-0.5 text-xs",
                armed === `x:${extraId}` ? "bg-red-600 text-white" : "text-slate-400 hover:text-slate-700",
              )}
            >
              {armed === `x:${extraId}` ? "Remove?" : "Remove"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpenNotes((n) => toggle(n, id))}
            aria-expanded={open}
            className={clsx(
              "whitespace-nowrap rounded-lg border px-2 py-0.5 text-xs",
              r?.note
                ? "border-brand-500 font-semibold text-brand-600"
                : "border-dashed border-slate-300 text-slate-500 hover:text-slate-700",
            )}
          >
            {r?.note ? "Note" : "+ Note"}
          </button>
        </div>

        <div role="group" aria-label="Status" className="flex gap-1">
          {RESULT_STATUSES.map((k) => (
            <button
              key={k}
              type="button"
              disabled={!canWrite}
              aria-pressed={s === k}
              onClick={() => setStatus(key, s, k)}
              className={clsx(
                "min-h-[34px] flex-1 rounded-lg border px-0 py-1 text-[11.5px] font-semibold transition disabled:cursor-default disabled:opacity-60 lg:w-[62px] lg:flex-none lg:text-xs",
                s === k ? STATUS_META[k].on : "border-slate-200 bg-white text-slate-500 hover:border-slate-400",
              )}
            >
              {STATUS_META[k].label}
            </button>
          ))}
        </div>

        {open ? (
          <textarea
            autoFocus
            rows={2}
            disabled={!canWrite}
            value={r?.note ?? ""}
            onChange={(e) => setNote(key, e.target.value)}
            placeholder="Details, e.g. filter clogged – replaced, part on order"
            className="input col-span-full min-h-[56px] resize-y text-sm"
          />
        ) : (
          r?.note && (
            <p
              onClick={() => setOpenNotes((n) => toggle(n, id))}
              className="col-span-full cursor-text whitespace-pre-wrap break-words rounded-lg bg-brand-50 px-2.5 py-1.5 text-[13px] text-slate-700"
            >
              {r.note}
            </p>
          )
        )}
      </div>
    );
  };

  const remaining = total - ans;

  return (
    <div className="space-y-4 pb-10">
      <Link href={`${PMV2_BASE}${q}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> All rooms
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="section-heading">
            {data.checklistName ?? "No checklist"} · {quarterLabel(quarter)}
          </div>
          <h2 className="mt-1 flex flex-wrap items-center gap-2 text-3xl font-bold text-slate-900">
            {area.name}
            {meta.done && <span className="chip bg-emerald-100 text-emerald-700">Complete</span>}
          </h2>
        </div>
        <div className="flex gap-1.5">
          <NavBtn to={data.prev} q={q} dir="prev" />
          <NavBtn to={data.next} q={q} dir="next" />
        </div>
      </div>

      {/* Meta */}
      <div className="card flex flex-wrap items-end gap-x-4 gap-y-3 p-3">
        <label className="text-xs font-semibold text-slate-500">
          Date
          <input
            type="date"
            disabled={!canWrite}
            value={meta.date ?? todayISO()}
            onChange={(e) => setMetaField("date", e.target.value)}
            className="input mt-1 py-2"
          />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Initials
          <input
            type="text"
            maxLength={6}
            disabled={!canWrite}
            value={meta.initials}
            onChange={(e) => setMetaField("initials", e.target.value)}
            placeholder="e.g. JM"
            className="input mt-1 w-24 py-2 uppercase"
          />
        </label>
        <div className="min-w-[200px] flex-1 text-sm text-slate-500">
          <b className="text-slate-900 tabular-nums">{ans}</b> of <b className="text-slate-900 tabular-nums">{total}</b>{" "}
          items checked
          {iss > 0 && (
            <>
              {" "}· <b className="text-orange-600 tabular-nums">{iss}</b> need attention
            </>
          )}
          <ProgressBar pct={pct} className="mt-1.5" />
        </div>
        <div
          aria-live="polite"
          className={clsx("w-full text-xs sm:w-auto", save.failed ? "text-red-600" : "text-slate-400")}
        >
          {touched ? save.label : meta.updatedAt ? `Last saved ${fmtDay(meta.updatedAt)}${meta.updatedBy ? ` by ${meta.updatedBy}` : ""}` : ""}
        </div>
      </div>

      {!canWrite && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          You can view this inspection but not change it. Ask an admin for inspection access.
        </p>
      )}

      {!data.checklistName && (
        <div className="card empty-state">
          <p className="font-semibold text-slate-700">This area has no checklist</p>
          <p className="text-sm">Pick a checklist for it in Setup → Rooms &amp; areas.</p>
        </div>
      )}

      {/* Checklist sections */}
      {data.sections.map((sec) => {
        const closed = collapsed.has(sec.id);
        const n = sec.items.filter((it) => results[it.id]?.status).length;
        const sIss = sec.items.filter((it) => isIssue(results[it.id]?.status)).length;
        return (
          <section key={sec.id} className="card overflow-hidden">
            <div className="flex items-center gap-2 bg-slate-50 px-2 py-1.5">
              <button
                type="button"
                onClick={() => setCollapsed((c) => toggle(c, sec.id))}
                aria-expanded={!closed}
                className="flex flex-1 items-center gap-2 px-1.5 py-1.5 text-left"
              >
                <ChevronDown className={clsx("h-4 w-4 text-slate-400 transition", closed && "-rotate-90")} />
                <span className="text-sm font-bold uppercase tracking-wide text-slate-700">{sec.name}</span>
                <span className="text-xs tabular-nums text-slate-500">
                  {n}/{sec.items.length}
                  {sIss > 0 && ` · ${sIss} issue${sIss > 1 ? "s" : ""}`}
                </span>
              </button>
              {canWrite && n < sec.items.length && (
                <button
                  type="button"
                  onClick={() => markSectionOk(sec.id)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-brand-500"
                >
                  Mark rest OK
                </button>
              )}
            </div>
            {!closed && sec.items.map((it) => row({ itemId: it.id }, it.label, results[it.id]))}
          </section>
        );
      })}

      {/* One-off items for this room */}
      <section className="card overflow-hidden">
        <div className="bg-slate-50 px-3.5 py-2.5 text-sm font-bold uppercase tracking-wide text-slate-700">
          Added for this {area.type === "ROOM" ? "room" : "area"}{" "}
          <span className="text-xs font-normal normal-case tracking-normal text-slate-500">
            {extras.length} item{extras.length === 1 ? "" : "s"}
          </span>
        </div>
        {extras.map((e) => row({ resultId: e.id }, e.label, e, e.id))}
        {canWrite && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 p-3">
            <input
              value={newExtra}
              onChange={(e) => setNewExtra(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addExtra();
                }
              }}
              placeholder="Add something else to check here, e.g. Mini fridge seal"
              className="input min-w-[200px] flex-1 py-2"
            />
            <button type="button" onClick={() => void addExtra()} className="btn-secondary py-2">
              <Plus className="h-4 w-4" /> Add item
            </button>
          </div>
        )}
      </section>

      <label className="block">
        <span className="label">General notes for this inspection</span>
        <textarea
          disabled={!canWrite}
          value={meta.notes}
          onChange={(e) => setMetaField("notes", e.target.value)}
          placeholder="Anything else the next person should know"
          className="input min-h-[80px]"
        />
      </label>

      {/* Finish */}
      <div className="card flex flex-wrap items-center gap-x-4 gap-y-2.5 p-4">
        {meta.done ? (
          <>
            <p className="min-w-[240px] flex-1 text-sm text-slate-500">
              Marked complete{meta.completedOn ? ` on ${fmtDay(meta.completedOn)}` : ""}. You can still change items;
              reopen it if more work is needed.
            </p>
            <button type="button" disabled={!canWrite} onClick={() => setDone(false)} className="btn-secondary">
              Reopen
            </button>
          </>
        ) : (
          <>
            <p className="min-w-[240px] flex-1 text-sm text-slate-500">
              {remaining ? `${remaining} item${remaining > 1 ? "s" : ""} not checked yet.` : "Every item is checked."} Mark
              it complete when the walk-through is finished.
            </p>
            <button type="button" disabled={!canWrite} onClick={() => setDone(true)} className="btn-primary">
              Mark inspection complete
            </button>
          </>
        )}
        {data.next && (
          <Link href={`${PMV2_BASE}/inspect/${data.next.id}${q}`} className="btn-secondary">
            Next: {data.next.name} <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
}

function NavBtn({ to, q, dir }: { to: AreaRef | null; q: string; dir: "prev" | "next" }) {
  const cls = "btn-secondary px-3 py-2";
  const label = to ? shortName(to) : dir === "prev" ? "Prev" : "Next";
  const body =
    dir === "prev" ? (
      <>
        <ArrowLeft className="h-4 w-4" /> {label}
      </>
    ) : (
      <>
        {label} <ArrowRight className="h-4 w-4" />
      </>
    );
  if (!to)
    return (
      <span className={clsx(cls, "pointer-events-none opacity-50")} aria-disabled>
        {body}
      </span>
    );
  return (
    <Link href={`${PMV2_BASE}/inspect/${to.id}${q}`} className={cls}>
      {body}
    </Link>
  );
}

