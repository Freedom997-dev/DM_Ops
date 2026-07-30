"use client";

import { useState, useTransition } from "react";
import {
  Loader2, Plus, Trash2, Check, Pencil, X, DoorOpen, ListChecks, Sparkles,
  ClipboardCheck, ChevronDown, ChevronRight,
} from "lucide-react";
import clsx from "clsx";
import {
  createStatusAction, renameStatusAction, archiveStatusAction,
  createTaskTemplate, renameTaskTemplate, archiveTaskTemplate,
  createChecklistItem, renameChecklistItem, archiveChecklistItem,
  hkCreateRoom,
} from "@/lib/actions/housekeeping";
import { HousekeepingSettingsForm } from "@/components/HousekeepingSettingsForm";
import type { HkStatusAction, HkChecklistItem, HkTemplateWithChecklist } from "@/lib/hk-view";

type TabKey = "checkout" | "roomChecklist" | "templates" | "rooms" | "retention";

const TABS: { key: TabKey; label: string }[] = [
  { key: "checkout", label: "Check-out" },
  { key: "roomChecklist", label: "Room checklist" },
  { key: "templates", label: "Task templates" },
  { key: "rooms", label: "Rooms" },
  { key: "retention", label: "Retention" },
];

export function HkConfigManager({
  statusActions,
  taskTemplates,
  roomChecklist,
  roomCount,
  retention,
}: {
  statusActions: HkStatusAction[];
  taskTemplates: HkTemplateWithChecklist[];
  roomChecklist: HkChecklistItem[];
  roomCount: number;
  retention: { deleteOnApproval: boolean; retentionDays: number; instructions: string };
}) {
  const [tab, setTab] = useState<TabKey>("checkout");

  return (
    <div className="space-y-4">
      {/* Tab bar — scrolls horizontally on mobile */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              "whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition",
              tab === t.key ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "checkout" && <StatusActionsCard actions={statusActions} />}
      {tab === "roomChecklist" && <RoomChecklistCard items={roomChecklist} />}
      {tab === "templates" && <TaskTemplatesCard templates={taskTemplates} />}
      {tab === "rooms" && <AddRoomCard roomCount={roomCount} />}
      {tab === "retention" && <HousekeepingSettingsForm initial={retention} />}
    </div>
  );
}

// --- Generic checklist editor (subtasks for a task type; templateId null = rooms) ---
function ChecklistEditor({ templateId, items }: { templateId: string | null; items: HkChecklistItem[] }) {
  const [newLabel, setNewLabel] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add() {
    setError(null);
    if (!newLabel.trim()) return;
    start(async () => {
      const res = await createChecklistItem(templateId, newLabel);
      if (!res.ok) { setError(res.error); return; }
      setNewLabel("");
    });
  }
  function saveEdit(id: string) {
    start(async () => {
      const res = await renameChecklistItem(id, editLabel);
      if (!res.ok) { setError(res.error); return; }
      setEditing(null);
    });
  }
  function remove(id: string) {
    setError(null);
    start(async () => {
      const res = await archiveChecklistItem(id);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div>
      <ul className="mb-3 divide-y divide-slate-100">
        {items.length === 0 && <li className="py-2 text-sm text-slate-400">No subtasks yet.</li>}
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-2 py-2">
            {editing === it.id ? (
              <>
                <input className="input flex-1" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} autoFocus />
                <button onClick={() => saveEdit(it.id)} disabled={pending} className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50" aria-label="Save"><Check className="h-4 w-4" /></button>
                <button onClick={() => setEditing(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Cancel"><X className="h-4 w-4" /></button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-slate-800">{it.label}</span>
                <button onClick={() => { setEditing(it.id); setEditLabel(it.label); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Rename"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => remove(it.id)} disabled={pending} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="Add a subtask (e.g. Sanitize bathroom)"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button onClick={add} disabled={pending || !newLabel.trim()} className="btn-primary">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

// --- Room-cleaning checklist (templateId null) ---
function RoomChecklistCard({ items }: { items: HkChecklistItem[] }) {
  return (
    <div className="card p-6">
      <div className="mb-1 flex items-center gap-2">
        <ClipboardCheck className="h-5 w-5 text-brand-600" />
        <h2 className="text-lg font-bold text-slate-900">Room cleaning checklist</h2>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Subtasks a housekeeper ticks off (Done / Not Done / N/A + note) on every room-cleaning task.
      </p>
      <ChecklistEditor templateId={null} items={items} />
    </div>
  );
}

// --- Status actions: the check-out panel's bottom-bar options ---
function StatusActionsCard({ actions }: { actions: HkStatusAction[] }) {
  const [newLabel, setNewLabel] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add() {
    setError(null);
    if (!newLabel.trim()) return;
    start(async () => {
      const res = await createStatusAction(newLabel);
      if (!res.ok) { setError(res.error); return; }
      setNewLabel("");
    });
  }
  function saveEdit(id: string) {
    start(async () => {
      const res = await renameStatusAction(id, editLabel);
      if (!res.ok) { setError(res.error); return; }
      setEditing(null);
    });
  }
  function remove(id: string) {
    setError(null);
    start(async () => {
      const res = await archiveStatusAction(id);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="card p-6">
      <div className="mb-1 flex items-center gap-2">
        <ListChecks className="h-5 w-5 text-brand-600" />
        <h2 className="text-lg font-bold text-slate-900">Status actions</h2>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        The buttons shown at the bottom of the “Check out rooms” panel. Applying one sends the
        selected rooms to cleaning, tagged with its label.
      </p>

      <ul className="mb-4 divide-y divide-slate-100">
        {actions.map((a) => (
          <li key={a.id} className="flex items-center gap-2 py-2">
            {editing === a.id ? (
              <>
                <input
                  className="input flex-1"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  autoFocus
                />
                <button onClick={() => saveEdit(a.id)} disabled={pending} className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50" aria-label="Save">
                  <Check className="h-4 w-4" />
                </button>
                <button onClick={() => setEditing(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Cancel">
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm font-medium text-slate-800">{a.label}</span>
                <button onClick={() => { setEditing(a.id); setEditLabel(a.label); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Rename">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => remove(a.id)} disabled={pending} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove">
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="Add a status action (e.g. Deep clean)"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button onClick={add} disabled={pending || !newLabel.trim()} className="btn-primary">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

// --- Task templates: the "New task" panel's quick-picks + per-template checklist ---
function TaskTemplatesCard({ templates }: { templates: HkTemplateWithChecklist[] }) {
  const [newLabel, setNewLabel] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add() {
    setError(null);
    if (!newLabel.trim()) return;
    start(async () => {
      const res = await createTaskTemplate(newLabel);
      if (!res.ok) { setError(res.error); return; }
      setNewLabel("");
    });
  }
  function saveEdit(id: string) {
    start(async () => {
      const res = await renameTaskTemplate(id, editLabel);
      if (!res.ok) { setError(res.error); return; }
      setEditing(null);
    });
  }
  function remove(id: string) {
    setError(null);
    start(async () => {
      const res = await archiveTaskTemplate(id);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="card p-6">
      <div className="mb-1 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-brand-600" />
        <h2 className="text-lg font-bold text-slate-900">Daily task templates</h2>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Quick-pick buttons in the “New task” panel. A manager can still type a custom title.
      </p>

      <ul className="mb-4 divide-y divide-slate-100">
        {templates.length === 0 && <li className="py-2 text-sm text-slate-400">No templates yet.</li>}
        {templates.map((t) => (
          <li key={t.id} className="py-2">
            <div className="flex items-center gap-2">
              {editing === t.id ? (
                <>
                  <input className="input flex-1" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} autoFocus />
                  <button onClick={() => saveEdit(t.id)} disabled={pending} className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50" aria-label="Save"><Check className="h-4 w-4" /></button>
                  <button onClick={() => setEditing(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Cancel"><X className="h-4 w-4" /></button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                    className="flex flex-1 items-center gap-1.5 text-left text-sm font-medium text-slate-800"
                  >
                    {expanded === t.id ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                    {t.label}
                    <span className="text-xs font-normal text-slate-400">· {t.checklist.length} subtask{t.checklist.length === 1 ? "" : "s"}</span>
                  </button>
                  <button onClick={() => { setEditing(t.id); setEditLabel(t.label); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Rename"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => remove(t.id)} disabled={pending} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                </>
              )}
            </div>
            {expanded === t.id && (
              <div className="mt-2 rounded-xl bg-slate-50 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Checklist for “{t.label}”</div>
                <ChecklistEditor templateId={t.id} items={t.checklist} />
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="Add a task template (e.g. Window cleaning)"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button onClick={add} disabled={pending || !newLabel.trim()} className="btn-primary">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

// --- Add room (rooms are shared with PM) ---
function AddRoomCard({ roomCount }: { roomCount: number }) {
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add() {
    setError(null); setMsg(null);
    if (!number.trim()) { setError("Enter a room number."); return; }
    start(async () => {
      const res = await hkCreateRoom({ number, name });
      if (!res.ok) { setError(res.error); return; }
      setMsg(`Room ${number} added.`);
      setNumber(""); setName("");
    });
  }

  return (
    <div className="card p-6">
      <div className="mb-1 flex items-center gap-2">
        <DoorOpen className="h-5 w-5 text-brand-600" />
        <h2 className="text-lg font-bold text-slate-900">Rooms</h2>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        {roomCount} room{roomCount === 1 ? "" : "s"}. Add a new room (shared with Room Condition).
      </p>
      <div className="flex flex-wrap gap-2">
        <input className="input w-28" placeholder="Number" value={number} onChange={(e) => setNumber(e.target.value)} />
        <input className="input flex-1" placeholder="Name (optional, e.g. King Suite)" value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={add} disabled={pending || !number.trim()} className="btn-primary">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add room
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {msg && <p className="mt-2 text-sm text-emerald-700">{msg}</p>}
    </div>
  );
}
