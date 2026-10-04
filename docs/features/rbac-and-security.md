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
| **Routes** | `/settings/access` (roles matrix), `/settings/staff` (staff & role assignment), `/login`, `/forgot-password`, `/reset-password`, `/account` |

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

## Account management & password reset (2026-10)

- **Edit staff (admin):** Settings → Staff → pencil edits name and sign-in email
  (`updateUserProfile`). Same guard as password reset — `admin:staff:update` and
  `targetManageableBy` (only a Super Admin can edit a Super Admin). An email
  change applies immediately, signs the user out everywhere, and emails a
  notice to the old and new address.
- **Forgot password (signed out):** `/forgot-password` emails a single-use link
  to `/reset-password` (30 min). The reply is identical for unknown or disabled
  emails. Rate limits: 3 / 15 min per email, 10 / 15 min per IP. A successful
  reset clears login lockout and sends a "password changed" notice.
- **Change password (signed in):** `/account` emails a 6-digit code (10 min,
  5 wrong tries, 3 codes / 15 min) to the user's own address, then sets the
  new password.
- **Sign out other devices:** `User.sessionVersion` is copied into the JWT at
  sign-in; `getCurrentUser()` rejects mismatches. Every password change/reset
  and email change bumps it. The device that made its own change gets a
  re-issued cookie server-side (`src/lib/session-refresh.ts`) — not a
  client-triggered NextAuth `update()`, which a stale device could replay.
- **Tokens:** only SHA-256 hashes stored (`AuthToken`); the reset page sends
  `Referrer-Policy: no-referrer`; links use `APP_URL`/`NEXTAUTH_URL`, never the
  request Host header.
- **Email:** `src/lib/email.ts` via Resend; without `RESEND_API_KEY` emails are
  printed to the server console (local dev).

Files: `src/lib/{email,auth-tokens,session-refresh}.ts`,
`src/lib/actions/password-reset.ts`, `src/app/{forgot-password,reset-password}/`,
`src/app/(app)/account/`, `src/components/auth/*`.

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
- 2026-10-04 · Admin edit of name/email; forgot-password link and signed-in
  change-password with email code; `sessionVersion` sign-out; Resend email.
