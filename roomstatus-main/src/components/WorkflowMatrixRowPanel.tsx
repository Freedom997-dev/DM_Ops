"use client";

import { useState, useTransition } from "react";
import { Loader2, Save, X } from "lucide-react";
import { PhotoPicker } from "@/components/PhotoPicker";
import { saveRow, deleteRowImage } from "@/lib/actions/workflows";

export type RowImage = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
};

type Props = {
  submissionId: string;
  roomId: string;
  initialNote: string | null;
  initialImages: RowImage[];
  isAdmin: boolean;
  disabled?: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export function WorkflowMatrixRowPanel({
  submissionId,
  roomId,
  initialNote,
  initialImages,
  isAdmin,
  disabled,
  onClose,
  onSaved,
}: Props) {
  const [note, setNote] = useState(initialNote ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [images, setImages] = useState<RowImage[]>(initialImages);
  const [pending, startTransition] = useTransition();
  const [pendingDelete, startDeleteTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    const form = new FormData();
    form.set("submissionId", submissionId);
    form.set("roomId", roomId);
    form.set("note", note);
    files.forEach((file, i) => {
      form.append(`image-${i}`, file, file.name);
    });

    startTransition(async () => {
      const res = await saveRow(form);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFiles([]);
      onSaved();
    });
  }

  function deleteImage(imageId: string) {
    if (!isAdmin) return;
    if (!confirm("Delete this photo? Cannot be undone.")) return;
    setError(null);
    startDeleteTransition(async () => {
      const res = await deleteRowImage(imageId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setImages((prev) => prev.filter((img) => img.id !== imageId));
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-1">
          <label className="label">Notes for this room</label>
          <textarea
            className="input min-h-[64px] text-sm"
            placeholder="Anything to record about this room…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={disabled || pending}
            maxLength={1000}
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1.5 text-slate-400 hover:bg-slate-200"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Existing saved images */}
      {images.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Existing photos</span>
          <div className="flex flex-wrap gap-1.5">
            {images.map((img) => (
              <div key={img.id} className="relative h-16 w-16 overflow-hidden rounded-md border border-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className="h-full w-full object-cover" />
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => deleteImage(img.id)}
                    disabled={pendingDelete}
                    className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-bl bg-black/60 text-white hover:bg-red-600 disabled:opacity-50"
                    aria-label="Delete photo"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New file picker */}
      <div className="space-y-1">
        <span className="text-xs font-medium text-slate-500">Add photos</span>
        <PhotoPicker questionId={roomId} files={files} onChange={setFiles} />
      </div>

      {error && <p className="text-xs text-red-700">{error}</p>}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={disabled || pending}
          className="btn-primary"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {pending ? "Saving…" : "Save row"}
        </button>
      </div>
    </div>
  );
}
