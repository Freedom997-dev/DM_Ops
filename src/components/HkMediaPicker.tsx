"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Images, Video, X, AlertTriangle } from "lucide-react";

const MAX_IMAGE = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO = 50 * 1024 * 1024; // 50 MB

type Props = {
  id: string;
  files: File[];
  onChange: (files: File[]) => void;
};

export function HkMediaPicker({ id, files, onChange }: Props) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<{ url: string; video: boolean }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const items = files.map((f) => ({ url: URL.createObjectURL(f), video: f.type.startsWith("video/") }));
    setPreviews(items);
    return () => items.forEach((i) => URL.revokeObjectURL(i.url));
  }, [files]);

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const picked = Array.from(e.target.files ?? []);
    const accepted: File[] = [];
    for (const f of picked) {
      const isImage = f.type.startsWith("image/");
      const isVideo = f.type.startsWith("video/");
      if (!isImage && !isVideo) { setError(`Skipped ${f.name}: not a photo or video.`); continue; }
      if (isImage && f.size > MAX_IMAGE) { setError(`Skipped ${f.name}: over 10 MB.`); continue; }
      if (isVideo && f.size > MAX_VIDEO) { setError(`Skipped ${f.name}: over 50 MB.`); continue; }
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

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {previews.map((p, i) => (
          <div key={p.url} className="relative h-16 w-16 overflow-hidden rounded-md border border-slate-200 bg-slate-900">
            {p.video ? (
              <video src={p.url} className="h-full w-full object-cover" muted />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.url} alt="" className="h-full w-full object-cover" />
            )}
            {p.video && (
              <span className="absolute bottom-0 left-0 bg-black/60 px-1 text-[9px] text-white">
                <Video className="inline h-2.5 w-2.5" />
              </span>
            )}
            <button
              type="button"
              onClick={() => remove(i)}
              className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-bl bg-black/60 text-white hover:bg-black/80"
              aria-label="Remove"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => photoInputRef.current?.click()}
          className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700"
          aria-label={`Take photo for ${id}`}
        >
          <Camera className="h-4 w-4" />
          <span className="text-[11px]">Photo</span>
        </button>
        <button
          type="button"
          onClick={() => videoInputRef.current?.click()}
          className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700"
          aria-label={`Record video for ${id}`}
        >
          <Video className="h-4 w-4" />
          <span className="text-[11px]">Video</span>
        </button>
        <button
          type="button"
          onClick={() => libraryInputRef.current?.click()}
          className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700"
          aria-label={`Add photo or video from library to ${id}`}
        >
          <Images className="h-4 w-4" />
          <span className="text-[11px]">Library</span>
        </button>
        {/* Three separate single-purpose inputs, not one combined picker:
            (1) `capture` + `multiple` together is unreliable on mobile browsers
            (many ignore `capture` and fall back to the file/library chooser), so
            live-capture inputs must not also request multi-select; and
            (2) mixing `accept="image/*,video/*"` on a `capture` input leaves the
            browser unable to pick a capture mode, so it falls back to a chooser
            (gallery included) instead of launching the camera directly — each
            capture input must target exactly one media type. */}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={handlePick}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          capture="environment"
          hidden
          onChange={handlePick}
        />
        <input
          ref={libraryInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={handlePick}
        />
        {files.length > 0 && (
          <span className="text-xs text-slate-500">{files.length} file{files.length === 1 ? "" : "s"}</span>
        )}
      </div>
      {error && (
        <p className="inline-flex items-center gap-1 text-xs text-amber-700">
          <AlertTriangle className="h-3 w-3" /> {error}
        </p>
      )}
    </div>
  );
}
