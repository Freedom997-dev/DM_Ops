"use client";

import { useState } from "react";
import clsx from "clsx";
import { ChevronDown, User2 } from "lucide-react";
import { ItemStatusBadge, RoomStatusBadge } from "@/components/StatusBadge";
import { type ItemStatus } from "@/lib/status";

type Item = {
  id: string;
  sectionName: string;
  questionText: string;
  status: ItemStatus;
  note: string | null;
};
type Inspection = {
  id: string;
  summary: "OK" | "NEEDS_REPAIR";
  notes: string | null;
  completedAt: string | null;
  inspector: string;
  items: Item[];
};

export function InspectionHistory({ inspections }: { inspections: Inspection[] }) {
  const [open, setOpen] = useState<string | null>(inspections[0]?.id ?? null);

  if (inspections.length === 0) {
    return (
      <div className="card p-8 text-center text-slate-500">
        No inspections recorded yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {inspections.map((insp) => {
        const isOpen = open === insp.id;
        const issues = insp.items.filter((i) => i.status === "NEEDS_REPAIR").length;
        const fixed = insp.items.filter((i) => i.status === "REPAIR_COMPLETED").length;
        return (
          <div key={insp.id} className="card overflow-hidden">
            <button
              onClick={() => setOpen(isOpen ? null : insp.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
            >
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-slate-900">
                  {insp.completedAt
                    ? new Date(insp.completedAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "—"}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                  <User2 className="h-3.5 w-3.5" />
                  {insp.inspector}
                  {issues > 0 && (
                    <span className="ml-1 text-red-600">· {issues} to repair</span>
                  )}
                  {fixed > 0 && (
                    <span className="ml-1 text-blue-600">· {fixed} fixed</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <RoomStatusBadge status={insp.summary} />
                <ChevronDown
                  className={clsx(
                    "h-4 w-4 text-slate-400 transition",
                    isOpen && "rotate-180",
                  )}
                />
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-slate-100 px-4 py-3">
                {insp.notes && (
                  <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    {insp.notes}
                  </p>
                )}
                <ItemList items={insp.items} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ItemList({ items }: { items: Item[] }) {
  const [showAll, setShowAll] = useState(false);
  const flagged = items.filter((i) => i.status !== "OK" && i.status !== "NA");
  const shown = showAll ? items : flagged;

  return (
    <div className="space-y-3">
      {flagged.length > 0 && !showAll && (
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Flagged items
        </p>
      )}
      {shown.length === 0 ? (
        <p className="text-sm text-emerald-700">
          All items marked OK — nothing flagged.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {shown.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 py-2">
              <div>
                <div className="text-sm text-slate-700">{item.questionText}</div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400">
                  {item.sectionName}
                </div>
                {item.note && (
                  <div className="mt-0.5 text-xs italic text-slate-500">
                    “{item.note}”
                  </div>
                )}
              </div>
              <ItemStatusBadge status={item.status} />
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={() => setShowAll((s) => !s)}
        className="text-xs font-medium text-brand-600 hover:underline"
      >
        {showAll ? "Show only flagged" : `Show all ${items.length} items`}
      </button>
    </div>
  );
}
