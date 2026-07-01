"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Loader2, MessageSquarePlus, Save } from "lucide-react";
import { saveInspection } from "@/lib/actions/inspections";
import { ITEM_STATUS_META, type ItemStatus } from "@/lib/status";
import { PhotoPicker } from "@/components/PhotoPicker";

type Question = { id: string; text: string };
type Section = { id: string; name: string; questions: Question[] };

const CHOICES: ItemStatus[] = ["OK", "NEEDS_REPAIR", "REPAIR_COMPLETED", "NA"];

export function InspectForm({
  roomId,
  roomNumber,
  sections,
}: {
  roomId: string;
  roomNumber: string;
  sections: Section[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const allQuestions = useMemo(
    () => sections.flatMap((s) => s.questions),
    [sections],
  );

  const [statuses, setStatuses] = useState<Record<string, ItemStatus>>(() =>
    Object.fromEntries(allQuestions.map((q) => [q.id, "OK" as ItemStatus])),
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [openNote, setOpenNote] = useState<Record<string, boolean>>({});
  const [generalNotes, setGeneralNotes] = useState("");
  const [photos, setPhotos] = useState<Record<string, File[]>>({});

  const counts = useMemo(() => {
    const c = { OK: 0, NEEDS_REPAIR: 0, REPAIR_COMPLETED: 0, NA: 0 } as Record<ItemStatus, number>;
    for (const q of allQuestions) c[statuses[q.id]]++;
    return c;
  }, [statuses, allQuestions]);

  const totalPhotos = useMemo(
    () => Object.values(photos).reduce((n, arr) => n + arr.length, 0),
    [photos],
  );

  function setStatus(id: string, status: ItemStatus) {
    setStatuses((prev) => ({ ...prev, [id]: status }));
    if (status !== "OK") setOpenNote((p) => ({ ...p, [id]: true }));
  }

  function submit() {
    setError(null);
    const payload = {
      roomId,
      notes: generalNotes || null,
      responses: allQuestions.map((q) => ({
        questionId: q.id,
        status: statuses[q.id],
        note: notes[q.id] || null,
      })),
    };

    const form = new FormData();
    form.set("payload", JSON.stringify(payload));
    for (const [questionId, files] of Object.entries(photos)) {
      files.forEach((file, i) => {
        form.append(`image-${questionId}-${i}`, file, file.name);
      });
    }

    startTransition(async () => {
      const res = await saveInspection(form);
      if (!res.ok) {
        setError(res.error ?? "Could not save inspection.");
        return;
      }
      router.push(`/services/pm/rooms/${roomId}?saved=1`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5 pb-28">
      {sections.map((section) => (
        <div key={section.id} className="card overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">
              {section.name}
            </h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {section.questions.map((q) => {
              const current = statuses[q.id];
              const showNote = openNote[q.id];
              return (
                <li key={q.id} className="px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm text-slate-700">{q.text}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {CHOICES.map((choice) => {
                        const meta = ITEM_STATUS_META[choice];
                        const active = current === choice;
                        return (
                          <button
                            key={choice}
                            type="button"
                            onClick={() => setStatus(q.id, choice)}
                            className={clsx(
                              "rounded-lg border px-2.5 py-1 text-xs font-semibold transition",
                              active
                                ? meta.activeBtn
                                : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                            )}
                          >
                            {meta.short}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {(showNote || notes[q.id]) && (
                    <input
                      type="text"
                      className="input mt-2 text-sm"
                      placeholder="Add a note (optional)…"
                      value={notes[q.id] ?? ""}
                      onChange={(e) =>
                        setNotes((p) => ({ ...p, [q.id]: e.target.value }))
                      }
                    />
                  )}
                  {!showNote && !notes[q.id] && (
                    <button
                      type="button"
                      onClick={() => setOpenNote((p) => ({ ...p, [q.id]: true }))}
                      className="mt-1 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" />
                      Note
                    </button>
                  )}

                  <PhotoPicker
                    questionId={q.id}
                    files={photos[q.id] ?? []}
                    onChange={(files) =>
                      setPhotos((p) => ({ ...p, [q.id]: files }))
                    }
                  />
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="card p-4">
        <label className="label">Overall notes for this inspection</label>
        <textarea
          className="input min-h-[80px]"
          placeholder={`Anything else to record about Room ${roomNumber}…`}
          value={generalNotes}
          onChange={(e) => setGeneralNotes(e.target.value)}
        />
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium">
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> {counts.OK} OK
            </span>
            <span className="inline-flex items-center gap-1 text-red-700">
              <span className="h-2 w-2 rounded-full bg-red-500" /> {counts.NEEDS_REPAIR} Repair
            </span>
            <span className="hidden items-center gap-1 text-blue-700 sm:inline-flex">
              <span className="h-2 w-2 rounded-full bg-blue-500" /> {counts.REPAIR_COMPLETED} Fixed
            </span>
            <span className="hidden items-center gap-1 text-slate-500 sm:inline-flex">
              <span className="h-2 w-2 rounded-full bg-slate-300" /> {counts.NA} N/A
            </span>
            {totalPhotos > 0 && (
              <span className="inline-flex items-center gap-1 text-slate-600">
                📷 {totalPhotos}
              </span>
            )}
          </div>
          <button onClick={submit} disabled={pending} className="btn-primary">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {pending ? "Saving…" : "Save inspection"}
          </button>
        </div>
      </div>
    </div>
  );
}
