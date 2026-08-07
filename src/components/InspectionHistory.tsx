"use client";

import { useState } from "react";
import clsx from "clsx";
import { ChevronDown, User2 } from "lucide-react";
import { ItemStatusBadge, RoomStatusBadge } from "@/components/StatusBadge";
import { PhotoLightbox, type LightboxImage } from "@/components/PhotoLightbox";
import { type ItemStatus } from "@/lib/status";

type Image = { id: string; url: string; width: number | null; height: number | null };
type Item = {
  id: string;
  sectionName: string;
  questionText: string;
  status: ItemStatus;
  note: string | null;
  images: Image[];
};
type Inspection = {
  id: string;
  summary: "OK" | "NEEDS_REPAIR";
  notes: string | null;
  completedAt: string | null;
  inspector: string;
  items: Item[];
};

export function InspectionHistory({
  inspections: initial,
  isAdmin,
}: {
  inspections: Inspection[];
  isAdmin: boolean;
}) {
  const [inspections, setInspections] = useState(initial);
  const [open, setOpen] = useState<string | null>(initial[0]?.id ?? null);
  const [lightbox, setLightbox] = useState<{
    images: LightboxImage[];
    startIndex: number;
    inspectionId: string;
    itemId: string;
  } | null>(null);

  if (inspections.length === 0) {
    return (
      <div className="card p-8 text-center text-slate-500">
        No inspections recorded yet.
      </div>
    );
  }

  function openLightbox(inspectionId: string, itemId: string, images: Image[], idx: number) {
    setLightbox({
      images: images.map((img) => ({
        id: img.id,
        url: img.url,
        width: img.width,
        height: img.height,
      })),
      startIndex: idx,
      inspectionId,
      itemId,
    });
  }

  function handleDeleted(imageId: string) {
    setInspections((prev) =>
      prev.map((insp) =>
        insp.id !== lightbox?.inspectionId
          ? insp
          : {
              ...insp,
              items: insp.items.map((it) =>
                it.id !== lightbox.itemId
                  ? it
                  : { ...it, images: it.images.filter((img) => img.id !== imageId) },
              ),
            },
      ),
    );
    setLightbox((lb) =>
      lb ? { ...lb, images: lb.images.filter((img) => img.id !== imageId) } : null,
    );
  }

  return (
    <>
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
                  <ItemList
                    items={insp.items}
                    onOpenLightbox={(itemId, images, idx) =>
                      openLightbox(insp.id, itemId, images, idx)
                    }
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {lightbox && (
        <PhotoLightbox
          images={lightbox.images}
          startIndex={lightbox.startIndex}
          isAdmin={isAdmin}
          onClose={() => setLightbox(null)}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}

function ItemList({
  items,
  onOpenLightbox,
}: {
  items: Item[];
  onOpenLightbox: (itemId: string, images: Image[], idx: number) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const flagged = items.filter((i) => i.status !== "OK" && i.status !== "NA");
  const itemsWithPhotos = items.filter((i) => i.images.length > 0);
  const shown = showAll
    ? items
    : Array.from(new Set([...flagged, ...itemsWithPhotos]));

  return (
    <div className="space-y-3">
      {!showAll && shown.length > 0 && (
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Flagged items and items with photos
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
              <div className="flex-1">
                <div className="text-sm text-slate-700">{item.questionText}</div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400">
                  {item.sectionName}
                </div>
                {item.note && (
                  <div className="mt-0.5 text-xs italic text-slate-500">
                    &ldquo;{item.note}&rdquo;
                  </div>
                )}
                {item.images.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {item.images.map((img, idx) => (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() => onOpenLightbox(item.id, item.images, idx)}
                        className="h-14 w-14 overflow-hidden rounded-md border border-slate-200 hover:opacity-80"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
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
        {showAll ? "Show only flagged + photos" : `Show all ${items.length} items`}
      </button>
    </div>
  );
}
