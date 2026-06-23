"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState } from "react-dom";
import { ListChecks, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { SubmitButton } from "@/components/forms/SubmitButton";
import {
  createSection,
  createQuestion,
  updateQuestion,
  setQuestionArchived,
  setSectionArchived,
  type ActionState,
} from "@/lib/actions/checklist";

const EMPTY: ActionState = { ok: false };

type Question = { id: string; text: string };
type Section = { id: string; name: string; questions: Question[] };

export function ChecklistManager({ sections }: { sections: Section[] }) {
  const router = useRouter();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <ListChecks className="h-6 w-6 text-brand-600" />
          Inspection checklist
        </h1>
        <p className="text-sm text-slate-500">
          Add sections and questions. Changes apply to future inspections; past
          records keep the wording they were inspected with.
        </p>
      </div>

      <AddSection onSaved={() => router.refresh()} />

      {sections.length === 0 ? (
        <div className="card p-8 text-center text-slate-500">
          No sections yet. Add one above to start building the checklist.
        </div>
      ) : (
        sections.map((section) => (
          <SectionCard key={section.id} section={section} onChange={() => router.refresh()} />
        ))
      )}
    </div>
  );
}

function AddSection({ onSaved }: { onSaved: () => void }) {
  const [state, formAction] = useFormState(createSection, EMPTY);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      onSaved();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="card flex flex-wrap items-end gap-3 p-4">
      <div className="flex-1 min-w-[220px]">
        <label className="label">New section</label>
        <input name="name" className="input" placeholder="e.g. Heating & Cooling System" required />
      </div>
      <SubmitButton pendingText="Adding…">
        <Plus className="h-4 w-4" /> Add section
      </SubmitButton>
      {state.error && <p className="w-full text-sm text-red-700">{state.error}</p>}
    </form>
  );
}

function SectionCard({ section, onChange }: { section: Section; onChange: () => void }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">
          {section.name}
          <span className="ml-2 font-normal lowercase text-slate-400">
            ({section.questions.length})
          </span>
        </h2>
        <button
          onClick={async () => {
            if (confirm(`Archive the "${section.name}" section and its questions?`)) {
              await setSectionArchived(section.id, true);
              onChange();
            }
          }}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-red-600"
          title="Archive section"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <ul className="divide-y divide-slate-100">
        {section.questions.map((q) => (
          <QuestionRow key={q.id} question={q} onChange={onChange} />
        ))}
        {section.questions.length === 0 && (
          <li className="px-4 py-3 text-sm text-slate-400">No questions yet.</li>
        )}
      </ul>

      <AddQuestion sectionId={section.id} onSaved={onChange} />
    </div>
  );
}

function AddQuestion({ sectionId, onSaved }: { sectionId: string; onSaved: () => void }) {
  const [state, formAction] = useFormState(createQuestion, EMPTY);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      onSaved();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">
      <input type="hidden" name="sectionId" value={sectionId} />
      <input name="text" className="input" placeholder="Add a checklist question…" required />
      <SubmitButton className="btn-secondary whitespace-nowrap" pendingText="…">
        <Plus className="h-4 w-4" /> Add
      </SubmitButton>
    </form>
  );
}

function QuestionRow({ question, onChange }: { question: Question; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useFormState(updateQuestion, EMPTY);
  useEffect(() => {
    if (state.ok) {
      setEditing(false);
      onChange();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (editing) {
    return (
      <li className="px-4 py-2.5">
        <form action={formAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={question.id} />
          <input name="text" defaultValue={question.text} className="input" required autoFocus />
          <SubmitButton className="btn-primary px-3 py-2">
            <Check className="h-4 w-4" />
          </SubmitButton>
          <button type="button" onClick={() => setEditing(false)} className="btn-secondary px-3 py-2">
            <X className="h-4 w-4" />
          </button>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="text-sm text-slate-700">{question.text}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setEditing(true)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
          title="Edit"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={async () => {
            if (confirm("Remove this question from the checklist?")) {
              await setQuestionArchived(question.id, true);
              onChange();
            }
          }}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
          title="Remove"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
