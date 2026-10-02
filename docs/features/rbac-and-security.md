# RBAC & Security Hardening

Database-backed roles and permissions replacing the original hard-coded
`ADMIN | MANAGER | INSPECTOR | HOUSEKEEPER` role string, plus sign-in hardening.
The full reference (catalog, default grants, guardrails) lives in
[roles-and-permissions.md](../roles-and-permissions.md) — this page records the
feature itself.

## Status

| | |
|---|---|
| **Shipped** | 2026-08-05 (`6b1a417`) |
| **Release runbook** | [history/2026-09-rbac-release-runbook.md](../history/2026-09-rbac-release-runbook.md) (frozen; written for the old `roomstatus` repo layout) |
| **Routes** | `/settings/access` (roles matrix), `/settings/staff` (role assignment), `/login` |

## What it added

- **Models:** `Role`, `RolePermission`, `UserRole`, `LoginAttempt`. `User.role`
  kept (deprecated) so the migration was additive and rollback-safe.
- **Permission catalog** in code (`src/lib/rbac/catalog.ts`): App → Feature →
  Action, keys `app:feature:action`. Admins toggle grants per role at runtime.
- **Multi-role users;** permissions = union of their roles, resolved per request.
- **Super Admin** wildcard role; at least one must always exist.
- **Roles matrix UI** (`RolesManager.tsx`): create custom roles, toggle
  permissions per app/feature/action, delete unused custom roles.
- **Anti-escalation:** grant only what you hold; no self role edits; Super Admin
  managed only by Super Admins.
- **API routes** authorized by permission (exports, local images).
- **Login lockout:** 5 failures / 15 min per email, enumeration-safe.
- **Password policy:** 8–72 chars, letter + number, common-password blocklist.
- **Sessions:** JWT lifetime 30 → 7 days; JWT carries only the user id.

## Migration behaviour (seed)

`prisma/seed.ts` creates any missing built-in role with its default grants and
maps every user who has **no** `UserRole` rows from their legacy `User.role`
string (unknown → Inspector). It never modifies the grants of existing roles.

## Key files

`src/lib/rbac/{catalog,defaults,can}.ts`, `src/lib/session.ts`,
`src/lib/permissions.ts`, `src/lib/roles.ts`, `src/lib/auth.ts`,
`src/lib/login-attempts.ts`, `src/lib/password.ts`, `src/lib/actions/{users,roles}.ts`,
`src/components/{RolesManager,UsersManager}.tsx`, `src/app/login/page.tsx`.

## Follow-ups

See [known-issues.md](../known-issues.md): TD-2 (coarse `isAdmin`/`isManager`
checks), TD-3, TD-4 (legacy helpers/column), OPS-2 (attempt cleanup).

## Change log

- 2026-08-05 · Initial ship.
- 2026-09-28 · `pmv2` app added to the catalog.
- 2026-09-30 · Next 16: `middleware.ts` renamed to `proxy.ts`.
