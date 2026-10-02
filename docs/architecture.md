# Architecture

## Stack

| Layer | Tech | Version | Notes |
|---|---|---|---|
| Framework | Next.js App Router | ^16.3.8 | Server Components by default; `"use client"` opt-in; Turbopack |
| UI runtime | React | 18.3.1 | App Router uses Next's bundled React |
| Language | TypeScript | 5.6 | `strict`; path alias `@/*` → `src/*` |
| Styling | Tailwind CSS | 3.4 | Utility-first; shared classes (`card`, `btn-*`, `input`) in `src/app/globals.css`; `brand-*` palette in `tailwind.config.ts` |
| Icons | lucide-react | 0.456 | |
| ORM | Prisma | 5.22.0 | `postgresql`; `url` = pooled, `directUrl` = direct |
| Database | Postgres 16 | — | Supabase in prod, Docker locally |
| Auth | NextAuth | 4.24.15 | Credentials provider, JWT sessions (7 days), bcrypt(12) |
| Validation | zod | 3.23 | Server-action input parsing |
| File storage | Supabase Storage | supabase-js ^2.108 | Private bucket `inspection-photos`; local FS driver in dev |
| Excel | exceljs | ^4.4 | Report exports |
| IDs | `cuid` (app) / `@default(cuid())` (DB) | | App-side IDs when storage paths need them before the insert |
| Hosting | Vercel | — | Project `dm-ops-production`; cron via `vercel.json` |

`package.json` `overrides` pins `uuid` ^11.1.1 (security fix for exceljs' transitive dep).

## Repository layout

```
DM_Ops_project/
├── proxy.ts                      # Next 16 "proxy" (ex-middleware): auth gate for /services, /settings
├── next.config.mjs               # serverActions.bodySizeLimit = 55mb
├── vercel.json                   # framework, build command, cron schedules
├── docker-compose.yml            # local Postgres 16 on :5433
├── prisma/
│   ├── schema.prisma             # all models (see data-model.md)
│   ├── seed.ts                   # roles, admin, PM V1 checklist, rooms, Daily Cleanliness, PM V2
│   ├── seedHousekeeping.ts       # HK defaults (not run on deploy)
│   ├── seedWorkflows.ts          # Daily Cleanliness definition + 18 items (called by seed.ts)
│   ├── pmv2Import.ts             # PM V2 config seed + one-off artifact import
│   ├── pmv2-seed.json            # PM V2 checklists + 66 areas
│   └── manual-migrations/        # historical SQL (2026-06-30 foundation) — superseded by db push
├── scripts/
│   ├── provision-db.mjs          # deploy-time: db push + seed + bucket, ONLY when VERCEL_ENV=production
│   └── ensure-storage-bucket.ts  # idempotent private bucket creation
├── src/
│   ├── app/
│   │   ├── layout.tsx            # <html>/<body>, metadata, Providers, Footer
│   │   ├── providers.tsx         # NextAuth SessionProvider
│   │   ├── page.tsx              # "/" → /services or /login
│   │   ├── login/page.tsx        # credentials form (+ lockout message)
│   │   ├── (app)/                # signed-in shell: layout.tsx runs requireUser(), renders Nav + Toast
│   │   │   ├── services/
│   │   │   │   ├── page.tsx              # service catalog
│   │   │   │   ├── pm/…                  # PM V1 (hidden from catalog)
│   │   │   │   ├── pm-v2/…               # PM V2 (board, inspect, issues, report, setup)
│   │   │   │   ├── housekeeping/…        # HK board + settings
│   │   │   │   └── [slug]/…              # generic workflow service (matrix, history, settings)
│   │   │   └── settings/…                # staff, access (roles), rooms, services, activity
│   │   └── api/
│   │       ├── auth/[...nextauth]/       # NextAuth handler
│   │       ├── cron/…                    # CRON_SECRET-guarded jobs
│   │       ├── exports/…                 # .xlsx downloads
│   │       └── local-images/[...path]/   # dev-only file server (404 in prod)
│   ├── components/               # UI; client components marked "use client"
│   │   └── pmv2/                 # PM V2 UI
│   ├── lib/
│   │   ├── actions/              # "use server" mutations, one file per domain
│   │   ├── jobs/                 # cron job bodies (NOT server actions)
│   │   ├── rbac/                 # catalog, defaults, pure can() helpers
│   │   ├── session.ts            # getCurrentUser + require* guards
│   │   ├── auth.ts               # NextAuth options
│   │   ├── db.ts, storage.ts, audit.ts, password.ts, login-attempts.ts, roles.ts, permissions.ts
│   │   ├── housekeeping.ts, hk-view.ts            # HK domain
│   │   ├── pmv2.ts, pmv2-data.ts, pmv2-messages.ts # PM V2 domain
│   │   └── status.ts, reports.ts                   # PM V1 domain
│   └── types/next-auth.d.ts      # session.user.id typing
└── docs/                         # this documentation
```

## Request lifecycle

```
Browser ──► proxy.ts (withAuth)                       fast gate: no session cookie → /login
             matcher: /services/:path*, /settings/:path*
        ──► (app)/layout.tsx  requireUser()           JWT → user id → DB load (roles + permissions)
        ──► page.tsx          requirePermission(...)  per-page gate → redirect /services if denied
             prisma queries, getSignedUrl(...)        server-rendered, force-dynamic
        ──► client components render, call server actions
Server action ──► requireUser()/requirePermission()   ALWAYS re-checked (actions are public endpoints)
              ──► zod validation → storage upload → prisma.$transaction → logAudit → revalidatePath
              ──► returns { ok, error? } to the client (toast)
```

`getCurrentUser()` (`src/lib/session.ts`) is wrapped in React `cache`, so the
user+roles+permissions query runs once per request regardless of how many guards
call it. Because permissions are read from the DB every request, role edits take
effect immediately without re-login. A deactivated user (`active=false`) resolves
to `null` and is bounced to `/login` on their next request.

## Key patterns

### 1. Defense-in-depth authorization
1. `proxy.ts` — blocks unauthenticated navigation (cheap, cookie-only).
2. `requireUser()` in `(app)/layout.tsx` — real session + active-user check.
3. `requirePermission(key)` / `can(user, key)` in every page **and** at the top of
   every server action / API route.

Only layer 3 is a security boundary; layers 1–2 are UX. See
[roles-and-permissions.md](roles-and-permissions.md).

### 2. Server actions instead of a REST API
All writes are `"use server"` functions in `src/lib/actions/*`, invoked from client
components (often via `useTransition`) or `<form action>`. They return a typed
result object; expected errors are values, not exceptions. `src/app/api/*` is used
only where a plain HTTP response is needed: file downloads, cron, NextAuth, and
the dev image server.

### 3. Snapshot-on-write history
Labels are copied into history rows when written (`InspectionItem.questionText`,
`WorkflowCell.itemText`, `HousekeepingTaskItem.label`). Editing or archiving the
source later never rewrites history.

### 4. Archive instead of delete
Configuration with history (rooms, checklist entries, workflow items, PM V2
areas/checklists, HK templates/actions/checklist items) has an `archived` flag.
Deleting is either blocked by FKs or would orphan history.

### 5. Upload-then-transact
Files go to storage *first*, then one Prisma transaction writes the rows; on DB
failure the uploaded paths are deleted. IDs are minted up-front with `cuid()` when
the storage path must embed them (PM V1 inspections). DB cascades never touch
storage — code deletes storage objects explicitly before deleting rows.

### 6. Pluggable storage driver
`src/lib/storage.ts` exposes `uploadImage`, `getSignedUrl`, `deleteImages`,
`readLocalImage`, `isLocalStorage`. It selects **Supabase** when `SUPABASE_URL`
starts with `https://` (and isn't the placeholder) and a service-role key exists;
otherwise the **local filesystem** (`.local-storage/`, path-traversal guarded).
Callers never know which is active.

| Storage prefix | Written by | Local-route permission |
|---|---|---|
| `inspections/<inspectionId>/<itemId>/<cuid>.<ext>` | PM V1 | `pm:inspections:view` |
| `workflows/<slug>/<submissionId>/<rowId>/<cuid>.<ext>` | Workflows | `pm:inspections:view` (default branch) |
| `housekeeping/<YYYY-MM>/<YYYY-MM-DD>/room-<n>/<cuid>.<ext>` | HK room tasks | `housekeeping:board:view` |
| `housekeeping/<YYYY-MM>/<YYYY-MM-DD>/task/<cuid>.<ext>` | HK general tasks | `housekeeping:board:view` |

Signed-URL TTLs: 1 h default; Housekeeping board uses 6 h so an open drawer
doesn't show expired images.

### 7. Optimistic locking for state machines
Housekeeping transitions use `updateMany({ where: { id, status: expected } })`;
`count === 0` means someone else moved the task, and the user is told to refresh.

### 8. PgBouncer-safe Prisma
`src/lib/db.ts` appends `pgbouncer=true&connection_limit=1` to `DATABASE_URL`
(Supabase's transaction pooler breaks Prisma's prepared statements otherwise) and
only overrides the datasource when the variable exists, so `next build` works on
preview builds without a DB. The client is cached on `globalThis` in development.

### 9. Built-in services vs. workflow services
- **Built-in** (PM V1, PM V2, Housekeeping): own tables, own pages under a static
  route segment, permissions in the RBAC catalog.
- **Workflow services**: one `WorkflowDefinition` row + generic pages at
  `/services/[slug]`; access via `rolesAllowed`. Only shape today: `MATRIX`.

Static segments (`pm`, `pm-v2`, `housekeeping`) win over the dynamic `[slug]`.

### 10. Polling instead of realtime
The Housekeeping board calls `router.refresh()` every 12 s (paused while a drawer
or modal is open or an action is running). PM V2 auto-saves each tap and
revalidates. No websockets or Supabase Realtime.

## Environment variables

| Variable | Used by | Required | Notes |
|---|---|---|---|
| `DATABASE_URL` | Prisma runtime | Yes | Prod: Supabase **pooled** URL |
| `DIRECT_URL` | Prisma CLI (`db push`) | Yes | Prod: Supabase **direct** URL; local: same as `DATABASE_URL` |
| `NEXTAUTH_SECRET` | NextAuth JWT signing | Yes | Rotate to force everyone to re-login |
| `NEXTAUTH_URL` | NextAuth callbacks | Yes | Must equal the public origin exactly |
| `SUPABASE_URL` | `storage.ts`, bucket script | Prod | Placeholder locally → FS driver |
| `SUPABASE_SERVICE_ROLE_KEY` | `storage.ts`, bucket script | Prod | Server-only |
| `CRON_SECRET` | `/api/cron/*` | Prod | Vercel sends `Authorization: Bearer <value>` |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | `prisma/seed.ts` | Password required in prod | Seed refuses to run in prod without a password |
| `VERCEL_ENV` | `provision-db.mjs`, seed | Set by Vercel | Gates DB provisioning to `production` |
| `LOCAL_STORAGE_DIR` | `storage.ts` | Optional | Override local storage folder |
| `SUPABASE_ANON_KEY`, `POSTGRES_*`, `NEXT_PUBLIC_SUPABASE_*` | — | — | Injected by the Vercel–Supabase integration; unused by the app |

## Configuration files worth knowing

- **`next.config.mjs`** — `experimental.serverActions.bodySizeLimit: "55mb"` so phone
  photos/videos pass the default 1 MB Server Action limit.
- **`vercel.json`** — `buildCommand: npm run build:deploy`; crons at `0 3 * * *`
  (photo sweep) and `0 8 * * *` (daily task reset, ≈ 3–4 AM US Eastern).
- **`proxy.ts`** — `withAuth` from `next-auth/middleware`, sign-in page `/login`.
- **`.vercelignore` / `.gitignore`** — block every `.env*`, `.local-storage/`,
  `prod_backup_*`, `*.local.md`.

## Deployment topology

```
GitHub main ──push──► Vercel build (npm run build:deploy)
                        ├─ prisma generate
                        ├─ provision-db.mjs  (VERCEL_ENV=production only)
                        │    ├─ prisma db push   ──► Supabase Postgres (DIRECT_URL)
                        │    ├─ prisma db seed   (idempotent)
                        │    └─ ensure-storage-bucket ──► Supabase Storage
                        └─ next build
                      ► Serverless functions ──► Supabase Postgres (pooled DATABASE_URL)
                                            └──► Supabase Storage (service-role key)
Vercel Cron ──► /api/cron/housekeeping-cleanup, /api/cron/housekeeping-daily-reset
```

Details: [deployment.md](deployment.md).
