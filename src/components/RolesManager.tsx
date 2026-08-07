"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormState } from "react-dom";
import clsx from "clsx";
import {
  ClipboardCheck,
  BedDouble,
  Settings,
  ShieldCheck,
  Lock,
  Plus,
  Trash2,
  Check,
  ChevronDown,
  X,
  type LucideIcon,
} from "lucide-react";
import { APPS, permissionsForApp } from "@/lib/rbac/catalog";
import { ROLE_KEYS } from "@/lib/roles";
import { useToast } from "@/components/Toast";
import { createRole, deleteRole, setRolePermissions, type ActionState } from "@/lib/actions/roles";

type Role = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
};

const APP_ICONS: Record<string, LucideIcon> = {
  ClipboardCheck,
  BedDouble,
  Settings,
};

const EMPTY: ActionState = { ok: false };

export function RolesManager({
  roles,
  canAdd,
  canUpdate,
  canDelete,
  grantable,
}: {
  roles: Role[];
  canAdd: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  // Permission keys the current admin may grant; null = Super Admin (all).
  grantable: string[] | null;
}) {
  const grantableSet = grantable ? new Set(grantable) : null;
  const canGrant = (permission: string) =>
    grantableSet === null || grantableSet.has(permission);
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();

  const [grants, setGrants] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(roles.map((r) => [r.id, new Set(r.permissions)])),
  );
  const [selectedId, setSelectedId] = useState<string>(roles[0]?.id ?? "");
  const [creating, setCreating] = useState(false);

  const selected = roles.find((r) => r.id === selectedId) ?? roles[0];
  const isSuper = selected?.key === ROLE_KEYS.SUPER_ADMIN;
  const readOnly = !canUpdate || isSuper;

  function persist(role: Role, next: Set<string>) {
    setGrants((prev) => ({ ...prev, [role.id]: next }));
    startTransition(async () => {
      const res = await setRolePermissions(role.id, [...next]);
      if (!res.ok) {
        toast.show(res.error ?? "Could not save.", "error");
        setGrants((prev) => ({ ...prev, [role.id]: new Set(role.permissions) }));
      }
      router.refresh();
    });
  }

  function toggle(role: Role, permission: string) {
    const next = new Set(grants[role.id]);
    if (next.has(permission)) next.delete(permission);
    else next.add(permission);
    persist(role, next);
  }

  function setAppPermissions(role: Role, appKey: string, on: boolean) {
    const next = new Set(grants[role.id]);
    for (const p of permissionsForApp(appKey)) {
      // Only add permissions the admin is allowed to grant; removals are always ok.
      if (on) {
        if (canGrant(p)) next.add(p);
      } else next.delete(p);
    }
    persist(role, next);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Roles &amp; permissions</h1>
          <p className="text-sm text-slate-500">
            Control what each role can see and do across every app.
          </p>
        </div>
        {canAdd && (
          <button onClick={() => setCreating(true)} className="btn-primary">
            <Plus className="h-4 w-4" />
            New role
          </button>
        )}
      </div>

      {creating && canAdd && (
        <CreateRoleForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); router.refresh(); }} />
      )}

      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        {/* Left rail */}
        <div className="space-y-2">
          {roles.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              active={role.id === selected?.id}
              grantedCount={grants[role.id]?.size ?? 0}
              onSelect={() => setSelectedId(role.id)}
            />
          ))}
        </div>

        {/* Matrix */}
        {selected && (
          <div className="space-y-4">
            <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <RoleAvatar role={selected} />
                <div>
                  <div className="flex items-center gap-2 font-semibold text-slate-900">
                    {selected.label}
                    {selected.isSystem && (
                      <span className="chip-slate"><Lock className="h-3 w-3" /> Built-in</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">{selected.description ?? "—"}</p>
                </div>
              </div>
              {canDelete && !selected.isSystem && (
                <DeleteRoleButton
                  role={selected}
                  onDeleted={() => {
                    setSelectedId(roles.find((r) => r.id !== selected.id)?.id ?? "");
                    router.refresh();
                  }}
                />
              )}
            </div>

            {isSuper ? (
              <div className="card empty-state">
                <ShieldCheck className="h-10 w-10 text-brand-500" />
                <p className="font-medium text-slate-700">Super Admin has full, unrestricted access.</p>
                <p className="text-sm text-slate-500">This role is a wildcard and cannot be edited.</p>
              </div>
            ) : (
              APPS.map((app) => (
                <AppPanel
                  key={app.key}
                  app={app}
                  icon={APP_ICONS[app.icon] ?? Settings}
                  granted={grants[selected.id] ?? new Set()}
                  readOnly={readOnly}
                  canGrant={canGrant}
                  onToggle={(perm) => toggle(selected, perm)}
                  onSetApp={(on) => setAppPermissions(selected, app.key, on)}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RoleAvatar({ role }: { role: Role }) {
  const isSuper = role.key === ROLE_KEYS.SUPER_ADMIN;
  return (
    <span
      className={clsx(
        "flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold uppercase",
        isSuper ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-700",
      )}
    >
      {isSuper ? <ShieldCheck className="h-5 w-5" /> : role.label.slice(0, 2)}
    </span>
  );
}

function RoleCard({ role, active, grantedCount, onSelect }: { role: Role; active: boolean; grantedCount: number; onSelect: () => void; }) {
  const isSuper = role.key === ROLE_KEYS.SUPER_ADMIN;
  return (
    <button
      onClick={onSelect}
      className={clsx("card flex w-full items-center gap-3 p-3 text-left transition hover:shadow-md", active && "ring-2 ring-brand-500")}
    >
      <RoleAvatar role={role} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-slate-900">{role.label}</div>
        <div className="text-xs text-slate-500">
          {role.userCount} member{role.userCount === 1 ? "" : "s"} · {isSuper ? "Full access" : `${grantedCount} permissions`}
        </div>
      </div>
      {role.isSystem && <Lock className="h-3.5 w-3.5 shrink-0 text-slate-300" />}
    </button>
  );
}

function AppPanel({
  app,
  icon: Icon,
  granted,
  readOnly,
  canGrant,
  onToggle,
  onSetApp,
}: {
  app: (typeof APPS)[number];
  icon: LucideIcon;
  granted: Set<string>;
  readOnly: boolean;
  canGrant: (permission: string) => boolean;
  onToggle: (permission: string) => void;
  onSetApp: (on: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  const all = permissionsForApp(app.key);
  const grantedInApp = all.filter((p) => granted.has(p)).length;
  const allOn = grantedInApp === all.length && all.length > 0;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <button onClick={() => setOpen((o) => !o)} className="flex flex-1 items-center gap-3 text-left">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Icon className="h-5 w-5" />
          </span>
          <span>
            <span className="flex items-center gap-2 font-semibold text-slate-900">
              {app.label}
              <ChevronDown className={clsx("h-4 w-4 text-slate-400 transition-transform", !open && "-rotate-90")} />
            </span>
            <span className="text-xs text-slate-500">{app.description} · {grantedInApp}/{all.length} granted</span>
          </span>
        </button>
        {!readOnly && (
          <button onClick={() => onSetApp(!allOn)} className="btn-ghost px-2.5 py-1.5 text-xs">
            {allOn ? "Clear all" : "Select all"}
          </button>
        )}
      </div>

      {open && (
        <div className="divide-y divide-slate-50">
          {app.features.map((f) => (
            <div key={f.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="w-32 shrink-0 text-sm font-medium text-slate-700">{f.label}</div>
              <div className="flex flex-wrap gap-1.5">
                {f.actions.map((a) => {
                  const permission = `${app.key}:${f.key}:${a.key}`;
                  const on = granted.has(permission);
                  // Disable toggles the admin can't grant (unless already on, so
                  // they can still see/remove it). Server enforces this too.
                  const locked = readOnly || (!on && !canGrant(permission));
                  return (
                    <button
                      key={a.key}
                      role="switch"
                      aria-checked={on}
                      aria-label={`${f.label} ${a.label}`}
                      disabled={locked}
                      title={!readOnly && !canGrant(permission) ? "You can't grant a permission you don't hold" : undefined}
                      onClick={() => onToggle(permission)}
                      className={clsx(
                        "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition",
                        on
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "border-slate-200 bg-white text-slate-500 hover:border-brand-400",
                        locked && "cursor-not-allowed opacity-60",
                      )}
                    >
                      {on && <Check className="h-3 w-3" />}
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeleteRoleButton({ role, onDeleted }: { role: Role; onDeleted: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  if (confirm) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-500">Delete “{role.label}”?</span>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const res = await deleteRole(role.id);
            setBusy(false);
            if (res.ok) { toast.show(res.message ?? "Role deleted."); onDeleted(); }
            else { toast.show(res.error ?? "Could not delete.", "error"); setConfirm(false); }
          }}
          className="btn-danger px-3 py-1.5 text-xs"
        >
          Confirm
        </button>
        <button onClick={() => setConfirm(false)} className="btn-secondary px-3 py-1.5 text-xs">Cancel</button>
      </div>
    );
  }
  return (
    <button onClick={() => setConfirm(true)} className="btn-ghost px-3 py-2 text-red-600 hover:bg-red-50" title="Delete role">
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function CreateRoleForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [state, formAction] = useFormState(createRole, EMPTY);

  useEffect(() => {
    if (state.ok) { toast.show(state.message ?? "Role created."); onSaved(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Create a role</h2>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
      </div>
      <form action={formAction} className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Role name *</label>
          <input name="label" required className="input" placeholder="Front Desk" />
        </div>
        <div>
          <label className="label">Description</label>
          <input name="description" className="input" placeholder="What this role is for" />
        </div>
        {state.error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{state.error}</p>}
        <div className="flex gap-2 sm:col-span-2">
          <button type="submit" className="btn-primary">Create role</button>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  );
}
