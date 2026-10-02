# Deployment

Production runs on **Vercel** (hosting, cron) + **Supabase** (Postgres + Storage).

| | |
|---|---|
| Live URL | https://dm-ops-production.vercel.app |
| Vercel project | `dm-ops-production` (team "FCG's projects") |
| GitHub repo | `Freedom997-dev/DM_Ops` |
| Production branch | **`main`** — every push auto-deploys to production |
| Other branches | Preview deploys (build validation only — see below) |

> History: until Sep 2026 the app lived at `roomstatus-theta.vercel.app`
> (repo `dharmik097/roomstatus`, app in a `roomstatus-main/` subfolder). Those
> references in older docs/specs are obsolete.

---

## How a deploy works

`vercel.json` pins `framework: nextjs`, `installCommand: npm install`, and
`buildCommand: npm run build:deploy`:

```
npm install            → postinstall: prisma generate
npm run build:deploy   → prisma generate
                       → node scripts/provision-db.mjs
                       → next build
```

`scripts/provision-db.mjs` checks `VERCEL_ENV`:

| `VERCEL_ENV` | What runs |
|---|---|
| `production` | `prisma db push` → `prisma db seed` (`prisma/seed.ts`) → `tsx scripts/ensure-storage-bucket.ts` |
| anything else (preview, local) | Nothing — logs a skip line and continues to `next build` |

Each step is idempotent:
- `prisma db push` syncs the schema to Supabase via `DIRECT_URL`. It **refuses**
  changes that would lose data unless forced (the script never forces) — a
  destructive schema change therefore **fails the deploy** rather than dropping data.
- `seed.ts` only creates missing rows: roles (never alters existing role
  permissions), Super Admin, PM V1 checklist/rooms if empty, the Daily
  Cleanliness workflow if missing, PM V2 config if empty.
- The bucket script no-ops once `inspection-photos` exists.

**Not run on deploy:** `prisma/seedHousekeeping.ts`. Housekeeping defaults (status
actions, templates, room checklist) must be created in HK Settings or by running
that script once against prod. See [known-issues.md](known-issues.md).

## Preview deployments

Production env vars exist **only** in the Production environment, so preview
builds compile but **don't work at runtime** (no DB, no auth secret) and sit
behind Vercel Deployment Protection. Use them to validate that a branch builds.
`src/lib/db.ts` tolerates the missing `DATABASE_URL` during `next build`.

To get working previews later: create a separate Supabase project for previews and
add its env vars to the Preview environment (never point previews at prod data).

## Environment variables (Vercel → Production)

Injected by the **Vercel–Supabase integration** (don't edit by hand):
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`,
`SUPABASE_JWT_SECRET`, `POSTGRES_*`, `NEXT_PUBLIC_SUPABASE_*`.

Set manually:

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Supabase **pooled** (pgbouncer, port 6543) URL — runtime |
| `DIRECT_URL` | Supabase **direct** (port 5432) URL — `prisma db push` (the pooler can't run DDL) |
| `NEXTAUTH_SECRET` | Session signing key (long random) |
| `NEXTAUTH_URL` | Exactly `https://dm-ops-production.vercel.app` |
| `SEED_ADMIN_EMAIL` | Super Admin login created by the seed |
| `SEED_ADMIN_PASSWORD` | **Required** — seed throws in production without it |
| `CRON_SECRET` | Bearer token Vercel Cron sends; without it the cron routes return 401 and jobs silently never run |

```bash
vercel env ls
vercel env add <NAME> production --sensitive   # sensitive values can't be read back, only replaced
```

## Scheduled jobs (Vercel Cron, UTC)

| Path | Schedule | Local time (US Eastern) | Job |
|---|---|---|---|
| `/api/cron/housekeeping-daily-reset` | `0 8 * * *` | ~4 AM / 3 AM | Reset recurring daily tasks to TODO, unassigned |

Hobby-plan crons may fire any time within the scheduled hour.

## Storage

Private Supabase bucket **`inspection-photos`** (one bucket for all domains;
prefixes separate them). Created on deploy with a 50 MB per-file limit and an
allow-list of `image/jpeg|png|webp`, `video/mp4|webm|quicktime`. Access only via
signed URLs generated server-side with the service-role key.

> `image/heic` is accepted by the app's validators but **not** in the bucket
> allow-list, so iPhone HEIC uploads would be rejected by Supabase in production.
> See [known-issues.md](known-issues.md).

---

## Release procedure (routine change)

1. Work on a feature branch. Locally: `npx tsc --noEmit` and `npm run build`.
2. Exercise the change at `localhost:3001` **as the affected roles**.
3. If the schema changed: confirm it is **additive** ([data-model.md](data-model.md#schema-change-rules)).
4. Update docs in the same branch.
5. Push the branch → Vercel preview must build green.
6. Back up production if the change touches schema or data (see
   [operations.md](operations.md#backups)).
7. Merge to `main` → production build runs provisioning + build → live.
8. Smoke test production (below). Watch Vercel logs for errors.

### Production smoke test (~5 min)

- [ ] Sign in as admin → `/services` shows expected tiles.
- [ ] Open Housekeeping → board loads, images render (signed URLs work).
- [ ] Open Room Condition V2 → board loads for current quarter; change one status
      on a test area and revert it.
- [ ] Open Daily Cleanliness → today's matrix loads.
- [ ] Settings → Roles & permissions matrix loads.
- [ ] Sign in as a non-admin role and confirm it sees only its services.

## Rollback

- **Code:** Vercel → Deployments → previous production deployment → **Instant
  Rollback**. Safe as long as the schema change was additive (old code ignores new
  columns/tables).
- **Data:** restore from a Supabase backup / your `pg_dump` (see operations.md).
- Never "fix forward" by dropping columns on `main`.

## Larger / risky releases

For releases that migrate data or change access control, write a dated runbook in
`docs/history/` first. Example: [history/2026-09-rbac-release-runbook.md](history/2026-09-rbac-release-runbook.md)
(backup → migrate → deploy → smoke test → rollback plan).

## Security checklist

- [x] `.gitignore` / `.vercelignore` block every `.env*` file and prod backups
- [x] Seed refuses a production run without `SEED_ADMIN_PASSWORD` and never logs it
- [x] Bucket is private; signed URLs only
- [x] `SUPABASE_SERVICE_ROLE_KEY` referenced only in server code
- [x] DB provisioning gated to production builds
- [ ] Rotate credentials exposed in the 2026-08-31 env-backup incident and delete
      local `.env.local.*` backup files (see known-issues)
- [ ] Change the seeded admin password after first sign-in; give every staff
      member their own account
- [ ] Work through open Dependabot alerts
