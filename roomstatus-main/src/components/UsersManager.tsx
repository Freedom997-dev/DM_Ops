"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormState } from "react-dom";
import clsx from "clsx";
import { KeyRound, ShieldCheck, UserPlus, X, Check } from "lucide-react";
import { SubmitButton } from "@/components/forms/SubmitButton";
import {
  createUser,
  resetPassword,
  setUserActive,
  setUserRole,
  type ActionState,
} from "@/lib/actions/users";

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Admin" },
  { value: "MANAGER", label: "Manager" },
  { value: "INSPECTOR", label: "Inspector" },
  { value: "HOUSEKEEPER", label: "Housekeeper" },
] as const;

const EMPTY: ActionState = { ok: false };

type StaffUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  inspections: number;
};

export function UsersManager({
  users,
  currentUserId,
  isAdmin,
}: {
  users: StaffUser[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [resetFor, setResetFor] = useState<StaffUser | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [rolePending, startRole] = useTransition();

  function changeRole(userId: string, role: string) {
    setRoleError(null);
    startRole(async () => {
      const res = await setUserRole(userId, role);
      if (!res.ok) {
        setRoleError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Staff accounts</h1>
          <p className="text-sm text-slate-500">
            Roles: <b>Admin</b> (full control), <b>Manager</b> (run services, manage staff, view activity),
            <b> Inspector</b> (run inspections), <b>Housekeeper</b> (room cleaning).
            {isAdmin ? " Change a role from the dropdown on each row." : " Only admins can change roles."}
          </p>
        </div>
        <button onClick={() => setAdding((a) => !a)} className="btn-primary">
          <UserPlus className="h-4 w-4" />
          Add staff
        </button>
      </div>

      {roleError && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{roleError}</p>
      )}

      {adding && (
        <AddUserForm
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      )}

      <div className="card divide-y divide-slate-100">
        {users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3">
              <div
                className={clsx(
                  "flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold uppercase",
                  u.role === "ADMIN"
                    ? "bg-brand-100 text-brand-700"
                    : "bg-slate-100 text-slate-600",
                )}
              >
                {u.name.slice(0, 2)}
              </div>
              <div>
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  {u.name}
                  {u.role !== "INSPECTOR" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold capitalize text-brand-700">
                      <ShieldCheck className="h-3 w-3" /> {u.role.toLowerCase()}
                    </span>
                  )}
                  {!u.active && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                      Disabled
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400">
                  {u.email} · {u.inspections} inspection{u.inspections === 1 ? "" : "s"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isAdmin && u.id !== currentUserId && (
                <select
                  value={u.role}
                  onChange={(e) => changeRole(u.id, e.target.value)}
                  disabled={rolePending}
                  className="input h-9 w-32 py-0 text-sm"
                  title="Change role"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={() => setResetFor(u)}
                className="btn-secondary px-3 py-2"
                title="Reset password"
              >
                <KeyRound className="h-4 w-4" />
              </button>
              {u.id !== currentUserId && (
                <button
                  onClick={async () => {
                    await setUserActive(u.id, !u.active);
                    router.refresh();
                  }}
                  className="btn-secondary px-3 py-2 text-xs"
                >
                  {u.active ? "Disable" : "Enable"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {resetFor && (
        <ResetPasswordModal
          user={resetFor}
          onClose={() => setResetFor(null)}
          onSaved={() => {
            setResetFor(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function AddUserForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [state, formAction] = useFormState(createUser, EMPTY);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      onSaved();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Add staff member</h2>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
          <X className="h-5 w-5" />
        </button>
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
        <div>
          <label className="label">Role *</label>
          <select name="role" className="input" defaultValue="INSPECTOR">
            <option value="INSPECTOR">Inspector</option>
            <option value="HOUSEKEEPER">Housekeeper</option>
            <option value="MANAGER">Manager</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <div>
          <label className="label">Temporary password *</label>
          <input name="password" type="text" required className="input" placeholder="At least 6 characters" />
        </div>
        {state.error && (
          <p className="sm:col-span-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        )}
        <div className="sm:col-span-2 flex gap-2">
          <SubmitButton pendingText="Adding…">Add staff</SubmitButton>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function ResetPasswordModal({
  user,
  onClose,
  onSaved,
}: {
  user: StaffUser;
  onClose: () => void;
  onSaved: () => void;
}) {
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
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-sm text-slate-500">
          Set a new password for <span className="font-medium">{user.name}</span>.
        </p>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="id" value={user.id} />
          <input name="password" type="text" required className="input" placeholder="New password" autoFocus />
          {state.error && <p className="text-sm text-red-700">{state.error}</p>}
          <div className="flex gap-2">
            <SubmitButton pendingText="Saving…">
              <Check className="h-4 w-4" /> Set password
            </SubmitButton>
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
