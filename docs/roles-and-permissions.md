# Roles & Permissions

DM Ops uses **database-backed RBAC**. Permission *keys* are defined in code; which
*roles* hold which keys, and which *users* hold which roles, is data that admins
edit at runtime in **Settings → Roles & permissions** (`/settings/access`) and
**Settings → Staff** (`/settings/staff`).

Source files:
- `src/lib/rbac/catalog.ts` — every valid permission key (the `APPS` tree)
- `src/lib/rbac/defaults.ts` — the 5 built-in roles and their *initial* grants
- `src/lib/rbac/can.ts` — pure checks: `can`, `canAny`, `canAll`, `canAccessApp`
- `src/lib/session.ts` — `getCurrentUser` + `require*` guards
- `src/lib/permissions.ts` — workflow-service access (`rolesAllowed`)
- `src/lib/roles.ts` — `ROLE_KEYS`

## Model

```
User ──< UserRole >── Role ──< RolePermission(permission = "app:feature:action")
```

- A user can hold **several roles**; effective permissions are the **union**.
- **`SUPER_ADMIN`** is a wildcard: `isSuperAdmin` short-circuits every check and
  the role stores no permission rows. It cannot be edited.
- Permissions are resolved **from the DB on every request** — changes apply
  immediately, no re-login. The JWT holds only the user id.
- Deactivating a user (`active = false`) blocks sign-in and invalidates existing
  sessions at their next request.

## Permission catalog

Key format: **`app:feature:action`**.

| App (`key`) | Feature | Actions | Guards |
|---|---|---|---|
| **Room Condition V1** (`pm`) | `dashboard` | view | `/services/pm` |
| | `rooms` | view, add, update, delete | rooms pages + `/settings/rooms`; `rooms.ts` actions (delete = archive) |
| | `checklist` | view, add, update, delete | PM settings + `checklist.ts` |
| | `inspections` | view, add, update, delete | inspect/history pages, exports, `saveInspection` (add), `deletePhoto` (update), `deleteInspection` (delete) |
| **Room Condition V2** (`pmv2`) | `board` | view | all `/services/pm-v2` pages |
| | `inspections` | submit | every inspection edit, complete/reopen, mark fixed |
| | `reports` | view | report tab + `/api/exports/pm-v2` |
| | `setup` | configure | setup page + all checklist/area/hotel-name actions |
| **Housekeeping** (`housekeeping`) | `board` | view | board page, HK images |
| | `tasks` | manage | check out rooms, create/delete tasks, assign, auto-assign |
| | `tasks` | submit | start, checklist edits, submit room, complete general task |
| | `cleaning` | review | approve / reject (single + bulk) |
| | `settings` | configure | HK settings page, status actions, templates, checklists, add room, delete photo |
| **Messages** (`comms`) | `announcements` | send | `/messages/announce`, `postAnnouncement` |
| | `messages` | moderate | delete others' messages in groups / announcements / comments (`deleteMessage`) |
| **Administration** (`admin`) | `staff` | view, add, update, delete | `/settings/staff`, `users.ts` (update covers activate/deactivate, roles, password reset; **delete is currently unused** — users are deactivated, never deleted) |
| | `roles` | view, add, update, delete | `/settings/access`, `roles.ts` |
| | `services` | view, manage | Settings hub card; workflow definition/item editing |
| | `audit` | view | Settings hub card (see coarse checks below) |
| | `notifications` | manage | `/settings/notifications` + `setNotificationRule` / `resetNotificationRule` |

Adding an app/feature/action = append to `APPS` in `catalog.ts`; the roles matrix
UI, seed and `sanitizePermissions` all read from it. See
[development-guide.md](development-guide.md#add-a-permission).

## Built-in roles & default grants

These are the grants created **when a role is first seeded** on an empty DB.
The seed **never changes the permissions of an existing role** (it only refreshes
label/description), so production may differ — check `/settings/access` for truth.

| Permission | Super Admin | Admin | Manager | Inspector | Housekeeper |
|---|:-:|:-:|:-:|:-:|:-:|
| `pm:*` (all 13) | ✱ | ✅ | — | dashboard:view, rooms:view, inspections:view, inspections:add | — |
| `pmv2:board:view` | ✱ | ✅ | — | ✅ | — |
| `pmv2:inspections:submit` | ✱ | ✅ | — | ✅ | — |
| `pmv2:reports:view` | ✱ | ✅ | — | ✅ | — |
| `pmv2:setup:configure` | ✱ | ✅ | — | — | — |
| `housekeeping:board:view` | ✱ | ✅ | ✅ | ✅ | ✅ |
| `housekeeping:tasks:manage` | ✱ | ✅ | ✅ | — | — |
| `housekeeping:tasks:submit` | ✱ | ✅ | ✅ | — | ✅ |
| `housekeeping:cleaning:review` | ✱ | ✅ | ✅ | ✅ | — |
| `housekeeping:settings:configure` | ✱ | ✅ | — | — | — |
| `admin:staff:view` | ✱ | ✅ | ✅ | — | — |
| `admin:staff:add/update/delete` | ✱ | ✅ | — | — | — |
| `admin:roles:view`, `admin:roles:update` | ✱ | ✅ | — | — | — |
| `admin:roles:add`, `admin:roles:delete` | ✱ | — | — | — | — |
| `admin:services:view/manage` | ✱ | ✅ | — | — | — |
| `admin:audit:view` | ✱ | ✅ | ✅ | — | — |
| `admin:notifications:manage` | ✱ | ✅ | — | — | — |
| `comms:announcements:send` | ✱ | ✅ | ✅ | — | — |
| `comms:messages:moderate` | ✱ | ✅ | — | — | — |

✱ = wildcard bypass. All five are `isSystem` (cannot be deleted). Custom roles can
be created by holders of `admin:roles:add` (Super Admin by default).

> **Production note:** PM V2 permissions were added to the catalog after the
> production roles were seeded. If Admins/Inspectors can't see Room Condition V2,
> grant the `pmv2:*` keys in Settings → Roles & permissions.

## Workflow-service access (separate mechanism)

Generic workflow services (Daily Cleanliness, future ones) are **not** in the
catalog. Each `WorkflowDefinition.rolesAllowed` is a JSON array of role keys. A
user can open/run it if Super Admin or any of their role keys is listed
(`requireWorkflowAccess(slug)`; catalog tile filter `canRunWorkflow`). Edit the
list in the service's settings (`/services/[slug]/settings`). Daily Cleanliness
defaults to `["ADMIN","MANAGER","INSPECTOR"]`.

Within a workflow page: **Mark complete** is shown to managers+ (`isManager`),
**Reopen** and **delete row image** require `isAdmin` (server-enforced).

## Coarse role-key checks (not catalog-driven)

A few places check role **keys** instead of catalog permissions. These are
intentional shortcuts but matter when you create custom roles:

| Check | Meaning | Used for |
|---|---|---|
| `isAdmin(user)` | Super Admin or holds `ADMIN` role key | `/settings/services` page, `reopenSubmission`, `deleteRowImage`, workflow page admin UI |
| `isManager(user)` | `isAdmin` or holds `MANAGER` key | Nav "Settings" link, `/settings` hub, `/settings/activity`, workflow "Mark complete" button |

So a custom role granted `admin:audit:view` still can't open the activity log
unless it also has the `MANAGER`/`ADMIN` key. Tracked in
[known-issues.md](known-issues.md).

## Enforcement layers

1. **`proxy.ts`** — unauthenticated requests to `/services/*`, `/settings/*` → `/login`.
2. **`(app)/layout.tsx` → `requireUser()`** — valid session + active user.
3. **Page guard** — `requirePermission(key)` / `requireAnyPermission([...])` /
   `requireWorkflowAccess(slug)`; denied → redirect to `/services`.
4. **Action/route guard** — every server action and API route re-checks.
   Actions return `{ ok:false, error:"Not allowed." }` or redirect; API routes
   return 401/404.

Layer 4 is the real boundary — server actions are callable directly.
UI hiding (`can()` in JSX) is convenience only.

## Anti-escalation guardrails

Enforced in `src/lib/actions/users.ts` and `roles.ts`:

- A non-Super-Admin may **grant or remove a role only if they hold every
  permission that role carries**, and may never grant/remove `SUPER_ADMIN`.
- `setRolePermissions`: a non-Super-Admin may only grant keys they hold.
  `SUPER_ADMIN` cannot be edited.
- Non-Super-Admins **cannot change their own roles** (no self-escalation/lockout).
- **Password reset**: cannot reset a Super Admin unless you are one; cannot reset
  anyone holding permissions you lack.
- At least one Super Admin must always exist (role removal and deactivation of
  the last one are refused). You can't deactivate yourself.
- System roles can't be deleted; a role still assigned to users can't be deleted.

## Sign-in security

| Control | Value | Where |
|---|---|---|
| Password hashing | bcrypt, cost 12 | `users.ts`, `seed.ts` |
| Password policy | 8–72 chars, ≥1 letter, ≥1 number, not in a common-password blocklist | `src/lib/password.ts` |
| Lockout | 5 failed attempts per email in a 15-min sliding window → `TOO_MANY_ATTEMPTS` | `src/lib/login-attempts.ts`, `auth.ts` |
| Enumeration resistance | Missing/inactive users fail identically; attempts recorded for any typed email | `auth.ts` |
| Session | JWT, 7-day max age | `auth.ts` |
| Cron endpoints | `Authorization: Bearer $CRON_SECRET` | `src/app/api/cron/*` |
| Media | Private bucket + signed URLs; local route 404s if unauthorized | `storage.ts`, `local-images` route |

## Housekeeping assignment roster

Only **active users holding the `HOUSEKEEPER` role** can be assigned cleaning
(manual assign, auto-assign and the dropdown all use this). Managers who also
clean need the Housekeeper role added.

## Legacy

`User.role` (single string) and the helpers `canAccessHousekeeping`,
`canManageHousekeeping`, etc. in `src/lib/housekeeping.ts` are from the pre-RBAC
design and are **no longer used** for authorization. Don't use them in new code.
