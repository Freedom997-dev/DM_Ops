# Architecture

## Stack

| Layer | Tech | Notes |
|---|---|---|
| Framework | Next.js 14 (App Router) | Server Components default; client components opt-in with `"use client"` |
| Language | TypeScript 5.6 | `strict` config |
| Styling | Tailwind CSS 3.4 | Utility-first, no custom CSS framework |
| Icons | lucide-react | |
| ORM | Prisma 5.22 | `provider = "postgresql"` |
| DB | Supabase Postgres | Transaction pooler URL with `?pgbouncer=true&connection_limit=1` |
| Storage | Supabase Storage | Private bucket `inspection-photos`; signed URLs (1h) for read |
| Auth | NextAuth 4.24 | Credentials provider; JWT sessions; bcrypt(12) password hashes |
| ID generation | `cuid` | App-side; passed to Prisma `create` so we know IDs before DB writes |
| Hosting | Vercel (Hobby) | Auto-deploys on push to `main` |

## Hosting & deployment

- **Production URL:** `https://roomstatus-theta.vercel.app`
- **GitHub repo:** `https://github.com/dharmik097/roomstatus`
- **Vercel project ID:** `prj_h3MNoOJwghqTXNKOD5UrhD8x9qe8`
- **Vercel team:** `team_VZu8aqJaiw5sQga7G23sc6H1` (dharmik097's projects)
- **Root Directory:** `roomstatus-main` (package.json is one folder deep inside the repo)
- **Build:** `prisma generate && next build`
- **Auto-deploy:** every commit to `main` triggers a production build.
- **Branches besides main:** preview deploys (separate URLs).

## Environment variables

| Variable | Purpose | Scope |
|---|---|---|
| `DATABASE_URL` | Postgres connection string (Supabase pooler URL) | Production + Preview |
| `NEXTAUTH_SECRET` | JWT signing key | Production + Preview |
| `NEXTAUTH_URL` | Public base URL for NextAuth cookies | Production + Preview |
| `SUPABASE_URL` | `https://gufddccguumpbtzxsbpj.supabase.co` | Production + Preview |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase key for Storage writes | Production + Preview |

`SUPABASE_SERVICE_ROLE_KEY` must never appear in client code. Imported only inside `src/lib/storage.ts` which is server-only.

## Key architectural patterns

### Three-layer auth defense
1. `middleware.ts` blocks unauthenticated browser navigation to `/services|/settings`.
2. `requireUser()` in route group layouts re-checks server-side on every page render.
3. `requireManager()` / `requireAdmin()` / `requireWorkflowAccess(slug)` are called inside pages and server actions for role-gated logic.

Middleware is the fast first filter; server-side checks are what actually enforce security since middleware can be bypassed by direct server-action invocation.

### Snapshot-on-write for history
When an inspection is saved, the `questionText` and `sectionName` are *copied* into each `InspectionItem` row. If an admin later edits or archives a question, historical inspections still show the wording the inspector saw. The `Question.id` FK stays for joining; the snapshot text is the source of truth for history.

### Server actions over REST
Mutations live in `src/lib/actions/*` as `"use server"` functions called directly from forms. No `/api` REST layer.

### Upload-then-transact (storage + DB)
For photo uploads: upload to Supabase Storage *before* the Prisma transaction, then write DB rows referencing the storage paths. If DB write fails, best-effort delete the uploaded objects. Holding a DB connection during Storage I/O is an anti-pattern.

### PgBouncer-safe Prisma
`src/lib/db.ts` appends `?pgbouncer=true&connection_limit=1` to `DATABASE_URL` at runtime if missing. Required because Supabase's Transaction pooler rotates Postgres connections per transaction, which breaks Prisma's default prepared-statement caching.

### Platform Foundation pattern (parallel to PM)
The app supports two parallel data shapes:
- **PM Room Condition Inspection** — original tables (`Section`/`Question`/`Inspection`/`InspectionItem`/`InspectionItemImage`). Per-room deep form.
- **Generic Workflow** — `WorkflowDefinition`/`WorkflowItem`/`WorkflowSubmission`/`WorkflowRow`/`WorkflowCell`/`WorkflowRowImage`. Matrix grid (rows = rooms, cols = items). Daily Cleanliness Inspection is the first instance.

Both patterns coexist on the same database, sharing only `Room`, `User`, `AuditLog`. New workflows use the generic Foundation pattern; PM keeps its bespoke tables for now. See [`features/platform-foundation.md`](features/platform-foundation.md).

### Okta-style service catalog + role-based home
Authenticated users land at `/services` — a catalog of service tiles filtered by role (`WorkflowDefinition.rolesAllowed`, plus a built-in PM tile for ADMIN/INSPECTOR). Each service is self-contained under `/services/<slug>/…` with its own home, history, and `/settings`. One global `/settings` area (staff, access, service catalog, activity) lives outside services. The role union is `ADMIN | MANAGER | INSPECTOR | HOUSEKEEPER`. See [`features/platform-foundation.md`](features/platform-foundation.md) for the full route map.

Route resolution: `/services/pm` (static) wins over `/services/[slug]` (dynamic), so `pm` maps to the built-in PM pages and any other slug maps to the generic workflow pages.

## Project layout

```
roomstatus-main/
├── prisma/
│   ├── schema.prisma          # data models
│   └── seed.ts                # admin + checklist + sample rooms (used for local dev only)
├── src/
│   ├── app/
│   │   ├── (app)/             # auth-protected route group (shared layout)
│   │   │   ├── services/
│   │   │   │   ├── page.tsx           # service catalog (landing)
│   │   │   │   ├── pm/                # built-in PM service (home, rooms, inspect, settings)
│   │   │   │   └── [slug]/            # generic workflow service (matrix, history, settings)
│   │   │   └── settings/              # global settings (staff, access, services, activity)
│   │   ├── api/auth/[...nextauth]/
│   │   └── login/
│   ├── components/            # UI components (Nav, forms, Workflow*, badges, etc.)
│   ├── lib/
│   │   ├── actions/           # server actions (one file per domain incl. workflows, workflowAdmin)
│   │   ├── auth.ts            # NextAuth options
│   │   ├── session.ts         # requireUser / requireManager / requireAdmin / requireWorkflowAccess
│   │   ├── permissions.ts     # role matrix + can* helpers
│   │   ├── audit.ts           # AuditLog writer
│   │   ├── storage.ts         # Supabase Storage wrapper
│   │   ├── db.ts              # Prisma singleton
│   │   └── status.ts          # status color/label tables, summary derivation
│   └── types/                 # TypeScript declaration extensions
├── middleware.ts              # route-level auth gate (/services, /settings)
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

## Local development (offline from Supabase)

Because the Supabase Transaction pooler port can be unreachable from some networks (and to keep production untouched during feature work), local dev runs against a **Docker Postgres** container:

```bash
docker run --name divya-pg -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=divya -p 5433:5432 -d postgres:16
# .env.local → DATABASE_URL="postgresql://postgres:devpass@localhost:5433/divya?sslmode=disable"
npx prisma db push          # create all tables locally
npx tsx prisma/seed.ts      # admin + PM checklist + sample rooms
npx tsx prisma/seedWorkflows.ts   # Daily Cleanliness workflow + items
npm run dev
```

The real Supabase `DATABASE_URL` is preserved in `.env.local.production-backup`. Storage-dependent features (photo upload) won't work locally unless `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` point at the real bucket. `.env.local` is gitignored — production reads its own Vercel env vars.
