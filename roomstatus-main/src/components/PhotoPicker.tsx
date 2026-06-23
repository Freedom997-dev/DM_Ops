"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X, AlertTriangle } from "lucide-react";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const SOFT_WARN_AT = 20;

type Props = {
  questionId: string;
  files: File[];
  onChange: (files: File[]) => void;
};

export function PhotoPicker({ questionId, files, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;

    const accepted: File[] = [];
    for (const f of picked) {
      if (!f.type.startsWith("image/")) {
        setError(`Skipped ${f.name}: not an image.`);
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        setError(`Skipped ${f.name}: over 10 MB.`);
        continue;
      }
      accepted.push(f);
    }
    onChange([...files, ...accepted]);
    e.target.value = "";
  }

  function remove(index: number) {
    const next = files.slice();
    next.splice(index, 1);
    onChange(next);
  }

  const showSoftWarning = files.length >= SOFT_WARN_AT;

  return (
    <div className="mt-1.5 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {previews.map((url, i) => (
          <div key={url} className="relative h-12 w-12 overflow-hidden rounded-md border border-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => remove(i)}
              className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-bl bg-black/60 text-white hover:bg-black/80"
              aria-label="Remove photo"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700"
          aria-label={`Add photo to ${questionId}`}
        >
          <Camera className="h-4 w-4" />
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={handlePick}
        />
        {files.length > 0 && (
          <span className="text-xs text-slate-500">{files.length} photo{files.length === 1 ? "" : "s"}</span>
        )}
      </div>
      {showSoftWarning && (
        <p className="inline-flex items-center gap-1 text-xs text-amber-700">
          <AlertTriangle className="h-3 w-3" />
          That&apos;s a lot of photos for one item. Sure?
        </p>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
