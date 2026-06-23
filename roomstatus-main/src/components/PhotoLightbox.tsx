"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import { deletePhoto } from "@/lib/actions/photos";

export type LightboxImage = {
  id: string;
  url: string;
  width?: number | null;
  height?: number | null;
};

type Props = {
  images: LightboxImage[];
  startIndex: number;
  isAdmin: boolean;
  onClose: () => void;
  onDeleted: (imageId: string) => void;
};

export function PhotoLightbox({ images, startIndex, isAdmin, onClose, onDeleted }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.min(images.length - 1, i + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, onClose]);

  if (images.length === 0) return null;
  const safeIndex = Math.min(index, images.length - 1);
  const current = images[safeIndex];

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deletePhoto(current.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDeleted(current.id);
      setConfirming(false);
      if (images.length <= 1) {
        onClose();
      } else if (safeIndex === images.length - 1) {
        setIndex(safeIndex - 1);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>

      {isAdmin && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(true);
          }}
          className="absolute left-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-red-600"
          aria-label="Delete photo"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      )}

      {safeIndex > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIndex(safeIndex - 1);
          }}
          className="absolute left-2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
          aria-label="Previous"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {safeIndex < images.length - 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIndex(safeIndex + 1);
          }}
          className="absolute right-2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
          aria-label="Next"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      <div
        className="relative max-h-full max-w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt=""
          className="max-h-[90vh] max-w-[90vw] object-contain"
        />
        <p className="mt-2 text-center text-xs text-white/60">
          {safeIndex + 1} of {images.length}
        </p>
      </div>

      {confirming && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/80"
          onClick={(e) => {
            e.stopPropagation();
            if (!pending) setConfirming(false);
          }}
        >
          <div
            className="rounded-xl bg-white p-5 max-w-sm space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-semibold text-slate-900">Delete this photo?</p>
            <p className="text-sm text-slate-600">
              This removes the file from storage and the database. It cannot be undone.
            </p>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {pending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
