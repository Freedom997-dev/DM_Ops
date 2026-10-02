# Getting Started (local development)

Run the whole app on your machine against a **Docker Postgres** and a **local
filesystem** for photos — no Supabase account, no contact with production.

## Prerequisites

- Node.js 20+ and npm
- Docker Desktop
- Git

## Folder layout on disk

```
DM_Ops/                         ← workspace folder (not a git repo)
├── .claude/launch.json         ← Claude Code preview config (dm-ops-dev on :3001)
├── pmv2-artifact-export/       ← one-off PM V2 data export used by prisma/pmv2Import.ts
└── DM_Ops_project/             ← THE GIT REPO / app root — run every command here
```

## 1. Install

```bash
npm install          # also runs `prisma generate` (postinstall)
```

## 2. Start Postgres

```bash
docker compose up -d
```

Starts container `divya-motel-db` (Postgres 16) on **localhost:5433**
(`postgres` / `devpass`, database `divya`). Data persists in the
`divya_pg_data` volume across restarts.

## 3. Create `.env.local`

`.env.local` is git-ignored. Minimal local values:

```bash
DATABASE_URL="postgresql://postgres:devpass@localhost:5433/divya?sslmode=disable"
DIRECT_URL="postgresql://postgres:devpass@localhost:5433/divya?sslmode=disable"
NEXTAUTH_SECRET="dev-secret-do-not-use-in-prod"
NEXTAUTH_URL="http://localhost:3001"

# Leave Supabase as placeholders → the local filesystem storage driver is used.
SUPABASE_URL="http://localhost-not-used"
SUPABASE_SERVICE_ROLE_KEY="local-not-used"

# Super Admin created by the seed
SEED_ADMIN_EMAIL="admin@divyamotel.com"
SEED_ADMIN_PASSWORD="ChangeMe123!"

# Only needed to call the cron endpoints locally
CRON_SECRET="devsecret"
```

`DIRECT_URL` is required because `schema.prisma` declares `directUrl`; locally it
is the same as `DATABASE_URL` (there is no pooler in front of Docker).

## 4. Create tables and seed

**Prisma's CLI reads `.env`, not `.env.local`.** Export the URLs in your shell first:

```bash
export DATABASE_URL="postgresql://postgres:devpass@localhost:5433/divya?sslmode=disable"
export DIRECT_URL="$DATABASE_URL"

npx prisma db push                  # create every table
npx tsx prisma/seed.ts              # roles, Super Admin, PM V1 checklist, sample rooms,
                                    # Daily Cleanliness workflow, PM V2 checklists + 66 areas
npx tsx prisma/seedHousekeeping.ts  # HK settings, status actions, task templates, room checklist
```

(PowerShell: `$env:DATABASE_URL="..."; $env:DIRECT_URL=$env:DATABASE_URL`.)

All seeds are idempotent — they only create what is missing. `seedWorkflows.ts`
can also be run alone but `seed.ts` already calls it.

## 5. Run

```bash
npm run dev -- -p 3001       # http://localhost:3001
```

Port **3001** is the convention (Docker Desktop often holds 3000); `NEXTAUTH_URL`
must match the port or sign-in redirects break. In Claude Code, the preview
config `dm-ops-dev` starts exactly this.

**Login:** `admin@divyamotel.com` / `ChangeMe123!` → Super Admin.

To test real role behaviour, create users in **Settings → Staff** (e.g. one
Housekeeper, one Inspector, one Manager). Super Admin bypasses every permission
check, so admin-only testing hides bugs.

## npm scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next dev server (Turbopack) |
| `npm run build` | `prisma generate && next build` — no DB needed |
| `npm run build:deploy` | Vercel build: generate → `scripts/provision-db.mjs` (prod only) → build |
| `npm start` | Serve the production build |
| `npm run lint` | `next lint` — **removed in Next 16**, see [known-issues.md](known-issues.md) |
| `npm run db:push` | `prisma db push` |
| `npm run db:seed` | `tsx prisma/seed.ts` |
| `npm run db:reset` | ⚠️ wipes DB (`db push --force-reset`) then `seed.ts` — run `seedHousekeeping.ts` after |
| `npm run db:studio` | Prisma Studio (visual DB browser) |
| `npm run storage:ensure-bucket` | Create the Supabase bucket (no-op locally) |

Type-check without building: `npx tsc --noEmit`.

## Local storage

`src/lib/storage.ts` uses a filesystem driver whenever `SUPABASE_URL` is not a
real `https://` URL. Files land in `.local-storage/inspection-photos/…`
(git-ignored) and are served by the auth-guarded `/api/local-images/[...path]`
route. Upload, preview and delete all work exactly as in production.

## Testing the cron jobs locally

```bash
curl -H "Authorization: Bearer devsecret" http://localhost:3001/api/cron/housekeeping-cleanup
curl -H "Authorization: Bearer devsecret" http://localhost:3001/api/cron/housekeeping-daily-reset
```

## Common gotchas

| Symptom | Cause / fix |
|---|---|
| `prisma generate` fails with **EPERM** (Windows) | Dev server holds the engine DLL — stop it first |
| `Environment variable not found: DATABASE_URL` / `DIRECT_URL` | Prisma CLI ignores `.env.local` — export both in the shell |
| `Cannot read properties of undefined (reading 'findMany')` after a schema change | PrismaClient cached on `globalThis` — restart the dev server |
| Sign-in loops back to `/login` | `NEXTAUTH_URL` port ≠ the port you're using |
| "Too many attempts" on login | 5 failures in 15 min locks that email; wait, or `DELETE FROM "LoginAttempt"` locally |
| Housekeeping check-out panel has no buttons | `seedHousekeeping.ts` not run (no status actions) — run it or add actions in HK Settings |
| Hydration error overlay | Browser extension (e.g. Grammarly) — try incognito |
| Can't reach the DB | `docker compose ps`; port is **5433**, not 5432 |

## Next steps

- [architecture.md](architecture.md) — how the code fits together
- [development-guide.md](development-guide.md) — conventions and recipes
- [features/](features/README.md) — per-feature behaviour
