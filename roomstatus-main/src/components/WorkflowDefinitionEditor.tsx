"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { Archive, ArchiveRestore, Loader2, Plus, Save } from "lucide-react";
import { ROLES, type Role } from "@/lib/permissions";
import {
  archiveWorkflowDefinition,
  archiveWorkflowItem,
  createWorkflowItem,
  updateWorkflowDefinition,
  updateWorkflowItem,
} from "@/lib/actions/workflowAdmin";

type Definition = {
  id: string;
  name: string;
  description: string | null;
  rolesAllowed: Role[];
  archived: boolean;
};

type Item = {
  id: string;
  text: string;
  order: number;
  archived: boolean;
};

type Props = {
  definition: Definition;
  items: Item[];
};

export function WorkflowDefinitionEditor({ definition, items: initialItems }: Props) {
  const [name, setName] = useState(definition.name);
  const [description, setDescription] = useState(definition.description ?? "");
  const [rolesAllowed, setRolesAllowed] = useState<Role[]>(definition.rolesAllowed);
  const [items, setItems] = useState(initialItems);
  const [newItemText, setNewItemText] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggleRole(role: Role) {
    setRolesAllowed((cur) =>
      cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role],
    );
  }

  function saveDefinition() {
    setError(null);
    startTransition(async () => {
      const res = await updateWorkflowDefinition({
        id: definition.id,
        name,
        description,
        rolesAllowed,
      });
      if (!res.ok) setError(res.error);
    });
  }

  function toggleDefArchive() {
    setError(null);
    if (!confirm(definition.archived ? "Restore this workflow?" : "Archive this workflow?")) return;
    startTransition(async () => {
      const res = await archiveWorkflowDefinition(definition.id, !definition.archived);
      if (!res.ok) setError(res.error);
      else location.reload();
    });
  }

  function addItem() {
    if (!newItemText.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await createWorkflowItem({ workflowId: definition.id, text: newItemText.trim() });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setItems((prev) => [
        ...prev,
        { id: res.itemId, text: newItemText.trim(), order: prev.length, archived: false },
      ]);
      setNewItemText("");
    });
  }

  function saveItem(itemId: string, text: string) {
    setError(null);
    startTransition(async () => {
      const res = await updateWorkflowItem({ itemId, text });
      if (!res.ok) setError(res.error);
      else setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, text } : i)));
    });
  }

  function toggleItemArchive(itemId: string, archived: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await archiveWorkflowItem(itemId, archived);
      if (!res.ok) setError(res.error);
      else setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, archived } : i)));
    });
  }

  return (
    <div className="space-y-6">
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Definition fields */}
      <div className="card space-y-3 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">Definition</h2>
        <div className="space-y-1">
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={pending} />
        </div>
        <div className="space-y-1">
          <label className="label">Description</label>
          <textarea
            className="input min-h-[60px] text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={pending}
          />
        </div>
        <div className="space-y-1">
          <label className="label">Roles allowed</label>
          <div className="flex flex-wrap gap-1.5">
            {ROLES.map((role) => {
              const on = rolesAllowed.includes(role);
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleRole(role)}
                  disabled={pending}
                  className={clsx(
                    "rounded-lg border px-2.5 py-1 text-xs font-semibold transition",
                    on
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                  )}
                >
                  {role}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex justify-between gap-2">
          <button type="button" onClick={toggleDefArchive} className="btn-secondary" disabled={pending}>
            {definition.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {definition.archived ? "Restore workflow" : "Archive workflow"}
          </button>
          <button type="button" onClick={saveDefinition} className="btn-primary" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </button>
        </div>
      </div>

      {/* Items */}
      <div className="card space-y-3 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">
          Items ({items.filter((i) => !i.archived).length} active)
        </h2>
        <ul className="divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 py-2">
              <input
                className={clsx("input flex-1 text-sm", item.archived && "opacity-50")}
                defaultValue={item.text}
                onBlur={(e) => {
                  if (e.target.value !== item.text && e.target.value.trim()) {
                    saveItem(item.id, e.target.value.trim());
                  }
                }}
                disabled={pending || item.archived}
              />
              <button
                type="button"
                onClick={() => toggleItemArchive(item.id, !item.archived)}
                disabled={pending}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label={item.archived ? "Restore" : "Archive"}
              >
                {item.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            className="input flex-1 text-sm"
            placeholder="Add a new item…"
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            disabled={pending}
            onKeyDown={(e) => {
              if (e.key === "Enter") addItem();
            }}
          />
          <button type="button" onClick={addItem} className="btn-secondary" disabled={pending || !newItemText.trim()}>
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
