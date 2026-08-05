"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState } from "react-dom";
import clsx from "clsx";
import { KeyRound, ShieldCheck, UserPlus, Users2, X, Check } from "lucide-react";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { useToast } from "@/components/Toast";
import {
  createUser,
  resetPassword,
  setUserActive,
  setUserRoles,
  type ActionState,
} from "@/lib/actions/users";

const EMPTY: ActionState = { ok: false };
const SUPER_ADMIN_KEY = "SUPER_ADMIN";

type RoleOption = { id: string; key: string; label: string };
type StaffUser = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  inspections: number;
  roles: RoleOption[];
};

export function UsersManager({
  users,
  currentUserId,
  canAdd,
  canUpdate,
  allRoles,
  grantableRoleIds,
}: {
  users: StaffUser[];
  currentUserId: string;
  canAdd: boolean;
  canUpdate: boolean;
  allRoles: RoleOption[];
  // Role ids the current admin may assign; null = Super Admin (all).
  grantableRoleIds: string[] | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [resetFor, setResetFor] = useState<StaffUser | null>(null);
  const [editRolesFor, setEditRolesFor] = useState<StaffUser | null>(null);
  const grantable = grantableRoleIds ? new Set(grantableRoleIds) : null;

  return (
    <div className="space-y-5">
      {canAdd && (
        <div className="flex justify-end">
          <button onClick={() => setAdding((a) => !a)} className="btn-primary">
            <UserPlus className="h-4 w-4" />
            Add staff
          </button>
        </div>
      )}

      {adding && canAdd && (
        <AddUserForm
          allRoles={allRoles}
          grantable={grantable}
          onClose={() => setAdding(false)}
          onSaved={(msg) => { setAdding(false); toast.show(msg); router.refresh(); }}
        />
      )}

      <div className="card divide-y divide-slate-100">
        {users.map((u) => {
          const isSuper = u.roles.some((r) => r.key === SUPER_ADMIN_KEY);
          return (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className={clsx("flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold uppercase", isSuper ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-700")}>
                  {u.name.slice(0, 2)}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                    {u.name}
                    {u.roles.map((r) => (
                      <span key={r.id} className={r.key === SUPER_ADMIN_KEY ? "chip-brand" : "chip-slate"}>
                        {r.key === SUPER_ADMIN_KEY && <ShieldCheck className="h-3 w-3" />}
                        {r.label}
                      </span>
                    ))}
                    {u.roles.length === 0 && <span className="chip-amber">No role</span>}
                    {!u.active && <span className="chip-slate">Disabled</span>}
                  </div>
                  <div className="text-xs text-slate-400">
                    {u.email} · {u.inspections} inspection{u.inspections === 1 ? "" : "s"}
                  </div>
                </div>
              </div>

              {canUpdate && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setEditRolesFor(u)} className="btn-secondary px-3 py-2" title="Edit roles">
                    <Users2 className="h-4 w-4" />
                  </button>
                  <button onClick={() => setResetFor(u)} className="btn-secondary px-3 py-2" title="Reset password">
                    <KeyRound className="h-4 w-4" />
                  </button>
                  {u.id !== currentUserId && (
                    <button
                      onClick={async () => {
                        await setUserActive(u.id, !u.active);
                        toast.show(u.active ? "Account disabled." : "Account enabled.");
                        router.refresh();
                      }}
                      className="btn-secondary px-3 py-2 text-xs"
                    >
                      {u.active ? "Disable" : "Enable"}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {resetFor && (
        <ResetPasswordModal user={resetFor} onClose={() => setResetFor(null)} onSaved={() => { setResetFor(null); toast.show("Password reset."); router.refresh(); }} />
      )}
      {editRolesFor && (
        <EditRolesModal user={editRolesFor} allRoles={allRoles} grantable={grantable} onClose={() => setEditRolesFor(null)} onSaved={() => { setEditRolesFor(null); router.refresh(); }} />
      )}
    </div>
  );
}

function RolePicker({ allRoles, selected, onToggle, name, grantable }: { allRoles: RoleOption[]; selected: Set<string>; onToggle: (id: string) => void; name?: string; grantable?: Set<string> | null; }) {
  return (
    <div className="flex flex-wrap gap-2">
      {allRoles.map((r) => {
        const on = selected.has(r.id);
        // Disable roles the admin can't assign (unless already selected). Server enforces this too.
        const locked = grantable != null && !grantable.has(r.id) && !on;
        return (
          <button
            type="button"
            key={r.id}
            disabled={locked}
            title={locked ? "You can't assign a role more powerful than your own" : undefined}
            onClick={() => onToggle(r.id)}
            className={clsx(
              "chip ring-1 ring-inset transition",
              on ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-600 ring-slate-300 hover:ring-brand-400",
              locked ? "cursor-not-allowed opacity-50" : "cursor-pointer",
            )}
          >
            {on && <Check className="h-3 w-3" />}
            {r.label}
          </button>
        );
      })}
      {name && [...selected].map((id) => <input key={id} type="hidden" name={name} value={id} />)}
    </div>
  );
}

function AddUserForm({ allRoles, grantable, onClose, onSaved }: { allRoles: RoleOption[]; grantable: Set<string> | null; onClose: () => void; onSaved: (message: string) => void; }) {
  const [state, formAction] = useFormState(createUser, EMPTY);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) { ref.current?.reset(); onSaved(state.message ?? "Staff added."); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Add staff member</h2>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
      </div>
      <form ref={ref} action={formAction} className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Full name *</label>
          <input name="name" required className="input" placeholder="Jane Doe" />
        </div>
        <div>
          <label className="label">Email *</label>
          <input name="email" type="email" required className="input" placeholder="jane@divyamotel.com" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Roles *</label>
          <RolePicker allRoles={allRoles} selected={selected} onToggle={toggle} name="roleIds" grantable={grantable} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Temporary password *</label>
          <input name="password" type="text" required className="input" placeholder="At least 6 characters" />
        </div>
        {state.error && <p className="sm:col-span-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
        <div className="sm:col-span-2 flex gap-2">
          <SubmitButton pendingText="Adding…">Add staff</SubmitButton>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  );
}

function EditRolesModal({ user, allRoles, grantable, onClose, onSaved }: { user: StaffUser; allRoles: RoleOption[]; grantable: Set<string> | null; onClose: () => void; onSaved: () => void; }) {
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set(user.roles.map((r) => r.id)));
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    const res = await setUserRoles(user.id, [...selected]);
    setBusy(false);
    if (res.ok) { toast.show(res.message ?? "Roles updated."); onSaved(); }
    else toast.show(res.error ?? "Could not update roles.", "error");
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="card w-full max-w-md p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Edit roles</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-3 text-sm text-slate-500">Roles for <span className="font-medium">{user.name}</span>.</p>
        <RolePicker allRoles={allRoles} selected={selected} onToggle={toggle} grantable={grantable} />
        <div className="mt-5 flex gap-2">
          <button onClick={save} disabled={busy} className="btn-primary">{busy ? "Saving…" : "Save roles"}</button>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordModal({ user, onClose, onSaved }: { user: StaffUser; onClose: () => void; onSaved: () => void; }) {
  const [state, formAction] = useFormState(resetPassword, EMPTY);
  useEffect(() => {
    if (state.ok) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="card w-full max-w-sm p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Reset password</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-3 text-sm text-slate-500">Set a new password for <span className="font-medium">{user.name}</span>.</p>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="id" value={user.id} />
          <input name="password" type="text" required className="input" placeholder="New password" autoFocus />
          {state.error && <p className="text-sm text-red-700">{state.error}</p>}
          <div className="flex gap-2">
            <SubmitButton pendingText="Saving…"><Check className="h-4 w-4" /> Set password</SubmitButton>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
