"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { PMV2_BASE } from "@/lib/pmv2";
import {
  pmv2AddItem,
  pmv2AddSection,
  pmv2CreateChecklist,
  pmv2DeleteChecklist,
  pmv2DeleteItem,
  pmv2DeleteSection,
  pmv2Move,
  pmv2RenameChecklist,
  pmv2RenameItem,
  pmv2RenameSection,
  type PmV2Result,
} from "@/lib/actions/pmv2";

type List = {
  id: string;
  name: string;
  used: number;
  sections: { id: string; name: string; items: { id: string; label: string }[] }[];
};

export function PmV2ChecklistSetup({ lists, selected, q }: { lists: List[]; selected: string | null; q: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [armed, setArmed] = useState<string | null>(null); // two-tap delete confirm
  const l = lists.find((x) => x.id === selected) ?? null;

  const run = (fn: () => Promise<PmV2Result<unknown>>, after?: (r: PmV2Result<unknown>) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.show(r.error, "error");
      else after?.(r);
    });

  // Commit a text field when it loses focus, if it changed and isn't blank.
  const onCommit =
    (before: string, save: (v: string) => Promise<PmV2Result<unknown>>) => (e: React.FocusEvent<HTMLInputElement>) => {
      const v = e.target.value.trim();
      if (!v) e.target.value = before;
      else if (v !== before) run(() => save(v));
    };

  const arm = (key: string, fn: () => void) => {
    if (armed !== key) return setArmed(key);
    setArmed(null);
    fn();
  };

  const listHref = (id: string) => `${PMV2_BASE}/setup?q=${q}&list=${id}`;

  const chips = (
    <div className="flex flex-wrap gap-1.5">
      {lists.map((x) => (
        <Link
          key={x.id}
          href={listHref(x.id)}
          className={clsx(
            "rounded-full border px-3 py-1 text-sm font-semibold transition",
            x.id === selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-500 hover:text-slate-800",
          )}
        >
          {x.name}
        </Link>
      ))}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          run(pmv2CreateChecklist, (r) => r.ok && r.data && router.push(listHref((r.data as { id: string }).id)))
        }
        className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-sm font-semibold text-slate-500 hover:text-slate-800"
      >
        + New checklist
      </button>
    </div>
  );

  if (!l)
    return (
      <div className="space-y-3">
        {chips}
        <div className="card empty-state">
          <p className="font-semibold text-slate-700">No checklists yet</p>
          <p className="text-sm">Create one to start.</p>
        </div>
      </div>
    );

  const itemCount = l.sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className={clsx("space-y-3", pending && "opacity-70")}>
      {chips}
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[240px] flex-1">
            <span className="label">Checklist name</span>
            <input
              key={`${l.id}-${l.name}`}
              defaultValue={l.name}
              onBlur={onCommit(l.name, (v) => pmv2RenameChecklist(l.id, v))}
              className="input text-base font-semibold"
            />
          </label>
          <span className="pb-2.5 text-sm text-slate-500">
            Used by {l.used} area{l.used === 1 ? "" : "s"} · {itemCount} items
          </span>
        </div>
        <p className="max-w-[68ch] text-sm text-slate-500">
          Changes apply to every room using this checklist, including inspections already in progress. Removing an item
          hides it from checklists but keeps past results on the repair list.
        </p>

        {l.sections.map((s, si) => (
          <div key={s.id} className="overflow-hidden rounded-xl border border-slate-200">
            <div className="flex items-center gap-1.5 bg-slate-50 p-2">
              <input
                key={`${s.id}-${s.name}`}
                defaultValue={s.name}
                aria-label="Section name"
                onBlur={onCommit(s.name, (v) => pmv2RenameSection(s.id, v))}
                className="input min-w-0 flex-1 py-2 font-bold"
              />
              <Mini label="Move section up" disabled={si === 0} onClick={() => run(() => pmv2Move("section", s.id, -1))}>
                <ArrowUp className="h-3.5 w-3.5" />
              </Mini>
              <Mini
                label="Move section down"
                disabled={si === l.sections.length - 1}
                onClick={() => run(() => pmv2Move("section", s.id, 1))}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Mini>
              <Mini
                label="Delete section"
                armed={armed === `s:${s.id}`}
                onClick={() => arm(`s:${s.id}`, () => run(() => pmv2DeleteSection(s.id)))}
              >
                {armed === `s:${s.id}` ? "Delete section?" : <X className="h-3.5 w-3.5" />}
              </Mini>
            </div>
            <ol>
              {s.items.map((it, ii) => (
                <li key={it.id} className="flex items-center gap-1.5 border-t border-slate-100 px-2 py-1 first:border-t-0">
                  <span className="w-6 text-right text-xs tabular-nums text-slate-400">{ii + 1}</span>
                  <input
                    key={`${it.id}-${it.label}`}
                    defaultValue={it.label}
                    aria-label="Item"
                    onBlur={onCommit(it.label, (v) => pmv2RenameItem(it.id, v))}
                    className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm hover:border-slate-200 focus:border-brand-500 focus:bg-white focus:outline-none"
                  />
                  <Mini label="Move up" disabled={ii === 0} onClick={() => run(() => pmv2Move("item", it.id, -1))}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Mini>
                  <Mini
                    label="Move down"
                    disabled={ii === s.items.length - 1}
                    onClick={() => run(() => pmv2Move("item", it.id, 1))}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Mini>
                  <Mini
                    label="Remove item"
                    armed={armed === `i:${it.id}`}
                    onClick={() => arm(`i:${it.id}`, () => run(() => pmv2DeleteItem(it.id)))}
                  >
                    {armed === `i:${it.id}` ? "Remove?" : <X className="h-3.5 w-3.5" />}
                  </Mini>
                </li>
              ))}
            </ol>
            <AddRow placeholder={`New item for ${s.name}`} button="Add item" onAdd={(v) => run(() => pmv2AddItem(s.id, v))} />
          </div>
        ))}

        <AddRow
          bare
          placeholder="New section, e.g. Mini fridge & microwave"
          button="Add section"
          onAdd={(v) => run(() => pmv2AddSection(l.id, v))}
        />

        {l.used ? (
          <p className="text-sm text-slate-500">
            To delete this checklist, first move its {l.used} area{l.used === 1 ? "" : "s"} to another checklist.
          </p>
        ) : (
          <button
            type="button"
            onClick={() =>
              arm(`l:${l.id}`, () => run(() => pmv2DeleteChecklist(l.id), () => router.push(`${PMV2_BASE}/setup?q=${q}`)))
            }
            className={armed === `l:${l.id}` ? "btn-danger" : "btn-secondary text-red-600"}
          >
            {armed === `l:${l.id}` ? "Click again to delete this checklist" : "Delete checklist"}
          </button>
        )}
      </div>
    </div>
  );
}

function Mini({
  label,
  disabled,
  armed,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  armed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "flex h-8 shrink-0 items-center justify-center rounded-lg border text-xs transition disabled:cursor-default disabled:opacity-35",
        armed
          ? "border-red-600 bg-red-600 px-2 font-semibold text-white"
          : "w-8 border-slate-200 bg-white text-slate-500 hover:border-brand-500 hover:text-slate-900",
      )}
    >
      {children}
    </button>
  );
}

export function AddRow({
  placeholder,
  button,
  onAdd,
  bare,
}: {
  placeholder: string;
  button: string;
  onAdd: (v: string) => void;
  bare?: boolean;
}) {
  const [v, setV] = useState("");
  const submit = () => {
    const t = v.trim();
    if (!t) return;
    onAdd(t);
    setV("");
  };
  return (
    <div className={clsx("flex flex-wrap gap-2", bare ? "" : "border-t border-slate-100 p-2.5")}>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        className="input min-w-[200px] flex-1 py-2"
      />
      <button type="button" onClick={submit} className="btn-secondary py-2">
        <Plus className="h-4 w-4" /> {button}
      </button>
    </div>
  );
}
