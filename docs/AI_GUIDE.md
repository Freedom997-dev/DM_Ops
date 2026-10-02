# AI Agent Guide

Dense, rule-first context for AI coding agents working on DM Ops. Humans are
welcome too — this is the "everything that bites" page. Read this fully before
editing code; then open only the reference docs your task needs.

---

## 1. Project in one paragraph

DM Ops is a **Next.js 16 (App Router) + TypeScript + Prisma 5 + Postgres** web app
for a single motel (Divya Motel). Staff sign in (NextAuth credentials, JWT
sessions) and land on `/services`, a catalog of tiles filtered by permission.
Services: **Room Condition V2** (quarterly per-area inspections, `/services/pm-v2`),
**Housekeeping** (live cleaning board, `/services/housekeeping`), and generic
**workflow services** such as **Daily Cleanliness** (rooms × items matrix,
`/services/[slug]`). **PM V1** (`/services/pm`) still exists in code but is hidden
from the portal. Global admin lives at `/settings`. Access is **DB-backed RBAC**
with permission keys `app:feature:action`. Production = Vercel + Supabase
(Postgres + Storage); local = Docker Postgres + filesystem storage.

---

## 2. Hard rules (do not break)

1. **Never `git commit` or `git push`.** Leave all changes uncommitted; the owner
   reviews, commits and pushes. Never add `Co-Authored-By` / AI attribution
   trailers. Branch/merge only when explicitly asked.
2. **`main` is production.** Every push to `main` auto-deploys to
   https://dm-ops-production.vercel.app and runs `prisma db push` against the
   production database.
3. **Schema changes must be additive.** There is no migrations folder — prod uses
   `prisma db push`. Renaming or dropping a column/table = data loss on the next
   deploy. Add new nullable/defaulted columns; deprecate instead of drop
   (see `User.role`, kept but unused). See [data-model.md](data-model.md#schema-change-rules).
4. **Every mutation re-checks permission server-side.** Server actions are
   publicly callable endpoints. First line of every action:
   `requirePermission("app:feature:action")` or `requireUser()` + `can(...)`.
   UI hiding is cosmetic only.
5. **Permission keys come from the code catalog** `src/lib/rbac/catalog.ts`.
   Never invent a key in a `can()` call without adding it to the catalog.
6. **Never put secrets in client code.** `SUPABASE_SERVICE_ROLE_KEY`,
   `NEXTAUTH_SECRET`, `CRON_SECRET` are server-only. `src/lib/storage.ts`,
   `src/lib/db.ts`, `src/lib/session.ts` are server-only modules.
7. **Never put cron/maintenance logic in a `"use server"` file.** Anything in
   `src/lib/actions/*` is exposed to clients. Background jobs live in
   `src/lib/jobs/*` and are called only from `CRON_SECRET`-guarded API routes.
8. **Don't touch real env files.** `.env.local`, `.env.local.bak`,
   `.env.local.production-backup` hold credentials — don't read, print, copy or
   commit them.
9. **Stay on the current major versions** unless the owner asks for an upgrade
   (Next 16.x, Prisma 5.22, React 18.3, NextAuth 4.24). Never run
   `npm audit fix --force`. Verify dependency bumps on a Vercel preview first.

---

## 3. Where things live

| Concern | Location |
|---|---|
| Pages (server components) | `src/app/(app)/**/page.tsx` — the `(app)` group is the signed-in shell |
| Login | `src/app/login/page.tsx` |
| Route gate (unauthenticated → `/login`) | `proxy.ts` (Next 16's renamed `middleware.ts`) |
| Mutations | `src/lib/actions/<domain>.ts` (`"use server"`) — no REST write layer |
| Read-only HTTP endpoints | `src/app/api/**/route.ts` (exports, cron, dev image server, NextAuth) |
| Current user + guards | `src/lib/session.ts` → `getCurrentUser`, `requireUser`, `requirePermission`, `requireAnyPermission`, `requireWorkflowAccess`, `requireAdmin`, `requireManager` |
| Pure permission checks | `src/lib/rbac/can.ts` → `can`, `canAny`, `canAll`, `canAccessApp` |
| Permission catalog | `src/lib/rbac/catalog.ts` (`APPS`) |
| Default role grants (seed) | `src/lib/rbac/defaults.ts` |
| Role keys | `src/lib/roles.ts` (`ROLE_KEYS`) |
| NextAuth config, lockout | `src/lib/auth.ts`, `src/lib/login-attempts.ts` |
| Password policy | `src/lib/password.ts` |
| Prisma client singleton | `src/lib/db.ts` |
| Audit log writer | `src/lib/audit.ts` (`logAudit`) — extend its `entity` union for new models |
| File storage (Supabase / local FS) | `src/lib/storage.ts` |
| PM V2 domain | `src/lib/pmv2.ts` (client-safe), `src/lib/pmv2-data.ts` (server loaders), `src/lib/pmv2-messages.ts`, `src/lib/actions/pmv2.ts`, `src/components/pmv2/*` |
| Housekeeping domain | `src/lib/housekeeping.ts`, `src/lib/hk-view.ts`, `src/lib/actions/housekeeping.ts`, `src/components/Hk*.tsx`, `HousekeepingDashboard.tsx` |
| Workflows (Daily Cleanliness) | `src/lib/actions/workflows.ts`, `workflowAdmin.ts`, `src/components/Workflow*.tsx` |
| PM V1 | `src/lib/actions/{inspections,photos,checklist,rooms}.ts`, `src/lib/status.ts`, `src/lib/reports.ts`, `src/components/{InspectForm,InspectionHistory,ChecklistManager,...}.tsx` |
| Cron jobs | `src/lib/jobs/*` + `src/app/api/cron/*` + `vercel.json` |
| Schema | `prisma/schema.prisma` |
| Seeds | `prisma/seed.ts` (main; runs on prod deploy), `prisma/seedHousekeeping.ts`, `prisma/seedWorkflows.ts`, `prisma/pmv2Import.ts` + `prisma/pmv2-seed.json` |
| Deploy provisioning | `scripts/provision-db.mjs`, `scripts/ensure-storage-bucket.ts`, `vercel.json` |

---

## 4. Invariants & patterns you must preserve

- **Request-time permission resolution.** The JWT holds only `user.id`. Roles and
  permissions are loaded from the DB on every request (`getCurrentUser`, memoised
  with React `cache`). Don't put roles in the token.
- **Super Admin is a wildcard.** `isSuperAdmin` bypasses all `can()` checks and has
  zero stored permission rows. Guardrails keep at least one Super Admin.
- **No privilege escalation.** Non-Super-Admins can only grant roles/permissions
  they themselves hold (`users.ts` `roleGrantableBy`, `targetManageableBy`;
  `roles.ts` `setRolePermissions`). Preserve these checks in any new admin action.
- **Workflow services use `WorkflowDefinition.rolesAllowed`** (JSON array of role
  keys), not the catalog. Check with `requireWorkflowAccess(slug)`.
- **Snapshot-on-write.** History rows copy labels at write time
  (`InspectionItem.questionText/sectionName`, `WorkflowCell.itemText`,
  `HousekeepingTaskItem.label`). Never join back to live labels for history.
- **Archive, don't delete,** for config entities with history (rooms, questions,
  sections, workflow items, PM V2 checklists/sections/items/areas, HK templates).
- **Upload-then-transact.** Upload files to storage *before* the DB transaction;
  on DB failure, `deleteImages(uploadedPaths)`. Never hold a transaction open
  during storage I/O. DB cascades do **not** delete storage objects — delete
  storage paths explicitly first.
- **Optimistic locking on status transitions** (Housekeeping): use
  `updateMany({ where: { id, status: <expected> } })` and treat `count === 0` as
  "changed underneath you — refresh". Keep this for any new transition.
- **Server-action result shape:** return `{ ok: true, ... } | { ok: false, error }`
  for expected failures; don't throw to the client. Call `revalidatePath(...)`
  for every page that shows the changed data.
- **Audit every meaningful mutation** with `logAudit`. Exceptions by design: PM V2
  per-tap auto-saves (only milestones are logged).
- **PM V2 dates are client-local strings** (`"YYYY-MM-DD"`, quarter `"YYYY-Qn"`),
  sent by the browser so "today" is the inspector's day. Workflow submission dates
  are **UTC midnight** `DateTime`s. Don't mix the two conventions.
- **`src/lib/db.ts`** appends `pgbouncer=true&connection_limit=1` and only sets a
  datasource override when `DATABASE_URL` exists (preview builds have no DB). Don't
  make the override unconditional.
- **Next 16 async APIs:** `params` and `searchParams` are `Promise`s — `await` them.
- **Pages are `export const dynamic = "force-dynamic"`.** Keep it on data pages.

---

## 5. Pre-flight checklist for a change

- [ ] Which permission gates this? Is it in the catalog? Is it checked in the
      **action** (not just the page/UI)?
- [ ] Schema change? Additive only? `data-model.md` updated? Restart dev server
      after `prisma db push` (cached client on `globalThis`).
- [ ] New audited entity? Add it to the `entity` union in `src/lib/audit.ts`.
- [ ] New storage path prefix? Update the domain→permission mapping in
      `src/app/api/local-images/[...path]/route.ts`.
- [ ] Uploads: within the 10 MB image / 50 MB video limits, and remember Vercel's
      ~4.5 MB request-body cap in production (see [known-issues.md](known-issues.md)).
- [ ] `revalidatePath` for every affected page.
- [ ] `npx tsc --noEmit` passes; `npm run build` passes.
- [ ] Verified in the browser at `http://localhost:3001` as the right role (not
      only as Super Admin — Super Admin bypasses every check).
- [ ] Docs updated per the table in [README.md](README.md#update-discipline).
- [ ] Left uncommitted, with a summary of changed files for the owner.

---

## 6. Local environment facts

- Dev server: **port 3001** (`npm run dev -- -p 3001`; the Claude preview config
  `../.claude/launch.json` is named `dm-ops-dev`). `NEXTAUTH_URL` must match.
- DB: Docker container `divya-motel-db`, Postgres 16 on **localhost:5433**,
  `postgres:devpass@localhost:5433/divya`.
- **Prisma CLI reads `.env`, not `.env.local`** — export `DATABASE_URL` and
  `DIRECT_URL` in the shell before running `prisma` / `tsx` scripts directly.
- Storage falls back to `.local-storage/` automatically when `SUPABASE_URL` isn't
  a real `https://…supabase.co` URL.
- Windows: stop the dev server before `prisma generate` (EPERM on the locked engine DLL).
- Local logins (dev DB only): `admin@divyamotel.com` / `ChangeMe123!` (Super Admin).
  Create role-specific test users in **Settings → Staff** to test non-admin paths.

---

## 7. Common traps

| Trap | Why it happens | Fix |
|---|---|---|
| `Cannot read properties of undefined (reading 'findMany')` after schema change | Dev server kept the old PrismaClient on `globalThis` | Restart dev server |
| Feature works as admin, broken for staff | Super Admin bypasses `can()` | Test as a real role |
| New user sees nothing / can't be assigned cleaning | Code reads `UserRole`, not deprecated `User.role` | Assign roles via Settings → Staff |
| Upload silently fails | Server Action body limit (set to 55 MB in `next.config.mjs`) or Vercel 4.5 MB cap | See known-issues P1 |
| Preview deploy 500s | Previews have no DB env vars by design | Use previews for build validation only |
| `next lint` errors | `next lint` was removed in Next 16 | See known-issues |
| Hydration warning overlay in dev | Browser extensions (Grammarly) mutate `<body>` | Already suppressed; test in incognito |
