# DM Ops — Divya Motel Operations

A mobile-friendly operations portal for Divya Motel. Staff sign in, see the
services their role allows, and run them:

- **Room Condition V2** — quarterly inspections of every room and common area, repair list, PDF/Excel/WhatsApp reports
- **Housekeeping** — live board for room turnover and daily tasks with assignment, checklists, photo evidence and inspector approval
- **Daily Cleanliness** — rooms × items matrix, one submission per day
- **Settings** — staff, roles & permissions, rooms, services, activity log

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind · Prisma 5 · Postgres
(Supabase) · NextAuth · Supabase Storage · Vercel.
**Production:** https://dm-ops-production.vercel.app (deploys from `main`).

## Quick start

```bash
docker compose up -d                 # Postgres on localhost:5433
npm install
# create .env.local — see docs/getting-started.md
export DATABASE_URL="postgresql://postgres:devpass@localhost:5433/divya?sslmode=disable"
export DIRECT_URL="$DATABASE_URL"
npx prisma db push
npx tsx prisma/seed.ts
npx tsx prisma/seedHousekeeping.ts
npm run dev -- -p 3001               # http://localhost:3001
```

Local login: `admin@divyamotel.com` / `ChangeMe123!`

## Documentation

**All documentation lives in [`docs/`](docs/README.md).** Start there.

- Humans: [docs/README.md](docs/README.md) → reading order
- AI agents: [docs/AI_GUIDE.md](docs/AI_GUIDE.md) first
