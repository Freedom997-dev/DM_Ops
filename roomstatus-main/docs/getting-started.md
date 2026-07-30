# Getting Started (local development)

How to run the whole app on your machine. Local dev uses **Docker Postgres** and a
**local filesystem** for photos, so you never touch production or need Supabase
credentials.

## Prerequisites

- Node.js 20+
- Docker Desktop (for the local Postgres container)

## 1. Start the database

From `roomstatus-main/`:

```bash
docker compose up -d      # Postgres 16 on localhost:5433 (see docker-compose.yml)
```

The container `divya-motel-db` exposes `postgres:devpass@localhost:5433/divya`.

## 2. Configure environment

Create `roomstatus-main/.env.local` (gitignored). For local dev:

```bash
DATABASE_URL="postgresql://postgres:devpass@localhost:5433/divya?sslmode=disable"
NEXTAUTH_SECRET="dev-secret-do-not-use-in-prod"
NEXTAUTH_URL="http://localhost:3000"
# Leave Supabase as placeholders — the local filesystem storage driver kicks in:
SUPABASE_URL="http://localhost-not-used"
SUPABASE_SERVICE_ROLE_KEY="local-not-used"
SEED_ADMIN_EMAIL="admin@divyamotel.com"
SEED_ADMIN_PASSWORD="ChangeMe123!"
# Optional — only needed to test the housekeeping retention cron locally:
CRON_SECRET="devsecret"
```

> **Storage in dev:** `src/lib/storage.ts` auto-selects a **local filesystem driver**
> whenever `SUPABASE_URL` isn't a real `https://…supabase.co` URL. Uploaded photos land
> in `roomstatus-main/.local-storage/` (gitignored) and are served by the auth-guarded
> `/api/local-images/[...path]` route. No Supabase needed to test photo upload locally.

## 3. Create tables & seed data

```bash
npm install
npx prisma db push                 # create every table locally
npx tsx prisma/seed.ts             # admin user + PM checklist + sample rooms
npx tsx prisma/seedWorkflows.ts    # Daily Cleanliness workflow + items
npx tsx prisma/seedHousekeeping.ts # housekeeping settings + default status actions
```

## 4. Run

```bash
npm run dev        # http://localhost:3000
```

**Default admin login:** `admin@divyamotel.com` / `ChangeMe123!`

## npm scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | `prisma generate && next build` |
| `npm start` | Run the production build |
| `npm run lint` | Next.js lint |
| `npm run db:push` | `prisma db push` (sync schema → DB) |
| `npm run db:seed` | `tsx prisma/seed.ts` |
| `npm run db:reset` | **Wipe** DB (`db push --force-reset`) and re-seed |
| `npm run db:studio` | Prisma Studio (visual DB browser) |

## Common gotchas

- **`prisma generate` fails with EPERM (locked DLL)** on Windows — stop the dev server
  first (it holds the Prisma query-engine file), then generate.
- **Prisma reads `.env`, not `.env.local`** for CLI commands. When running `prisma`
  directly, prefix with the URL:
  `DATABASE_URL="postgresql://postgres:devpass@localhost:5433/divya?sslmode=disable" npx prisma db push`.
- **Schema changed?** Re-run `npx prisma db push` (and restart the dev server so the
  regenerated client loads).

## Where to go next

- [architecture.md](architecture.md) — stack, patterns, hosting.
- [routes.md](routes.md) — every page & API route.
- [roles-and-permissions.md](roles-and-permissions.md) — who can do what.
- [features/](features/README.md) — one doc per shipped feature.
