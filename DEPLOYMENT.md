# Deploying Divya Motel

Production runs on **Vercel** (hosting) + **Supabase** (Postgres + Storage).

- Live URL: https://dm-ops-production.vercel.app
- Vercel project: `dm-ops-production`
- GitHub repo: `Freedom997-dev/DM_Ops` — the `main` branch is connected, so
  **every push to `main` deploys to production automatically.**

---

## How a deploy works

`vercel.json` pins the framework and points the build at `npm run build:deploy`:

```
prisma generate
  && prisma db push                          # sync schema to Supabase
  && prisma db seed                          # roles, checklist, admin (idempotent)
  && tsx scripts/ensure-storage-bucket.ts    # create the private photo bucket
  && next build
```

Every step is idempotent, so redeploys are safe:

- `prisma db push` errors rather than dropping data when the schema would lose
  columns. There is no `migrations/` directory — this project uses push, not
  migrate.
- The seed only creates what is missing (guarded by `findUnique` / `count() === 0`).
- The bucket script no-ops once `inspection-photos` exists.

`npm run build` (without `:deploy`) stays database-free for local use.

> **Note:** running `db push` and the seed inside the build is convenient for a
> single-app project but is not a general best practice — it couples schema
> changes to deploys. If this grows a team, move to `prisma migrate` with
> committed migrations and drop those two steps from `build:deploy`.

## Environment variables (Vercel → Production)

Managed automatically by the **Supabase integration** — do not edit by hand:

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`,
`SUPABASE_JWT_SECRET`, `POSTGRES_*`, `NEXT_PUBLIC_SUPABASE_*`

Set manually:

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Supabase **pooled** (pgbouncer) URL — runtime queries |
| `DIRECT_URL` | Supabase **non-pooling** URL — Prisma DDL (`db push`) |
| `NEXTAUTH_SECRET` | NextAuth session signing key |
| `NEXTAUTH_URL` | Must match the live origin exactly, or sign-in redirects break |
| `SEED_ADMIN_EMAIL` | Super Admin login created by the seed |
| `SEED_ADMIN_PASSWORD` | Required in production — the seed refuses to run without it |
| `CRON_SECRET` | Bearer token Vercel Cron sends to `/api/cron/*` |

Both `DATABASE_URL` and `DIRECT_URL` are needed because Supabase's transaction
pooler cannot execute DDL; `schema.prisma` routes migrations to `directUrl`.

To add or change one:

```bash
vercel env add <NAME> production --sensitive
vercel env ls
```

Sensitive values cannot be read back — only overwritten.

## Scheduled jobs

Defined in `vercel.json`, authenticated with `CRON_SECRET`:

| Path | Schedule (UTC) |
|---|---|
| `/api/cron/housekeeping-cleanup` | `0 3 * * *` |
| `/api/cron/housekeeping-daily-reset` | `0 8 * * *` |

## Storage

Photos and videos go to the **private** Supabase bucket `inspection-photos`,
served through short-lived signed URLs (`src/lib/storage.ts`). The bucket is
created on deploy with a 50 MB ceiling and a JPEG/PNG/WebP/MP4/WebM/MOV allow
list, mirroring the per-upload limits in `src/lib/actions/*`.

With no Supabase credentials present, `storage.ts` falls back to a local
filesystem driver under `.local-storage/` so development needs no cloud account.

## Local development

```bash
docker compose up -d      # Postgres on :5433
npm install
npm run db:push
npm run db:seed
npm run dev
```

`.env.local` holds local values only. Set `DIRECT_URL` to the same value as
`DATABASE_URL` locally — there is no pooler in front of the Docker database.

---

## Security checklist

- [x] `.gitignore` / `.vercelignore` block every `.env*` file
- [x] The seed refuses a production deploy without `SEED_ADMIN_PASSWORD`
- [x] The seed no longer prints the admin password into build logs
- [x] `inspection-photos` is private — access only via signed URLs
- [x] `SUPABASE_SERVICE_ROLE_KEY` is referenced only from server-side code
- [ ] Change the seeded admin password after first sign-in
- [ ] Give every staff member their own account so the Activity log stays useful
- [ ] Review the Dependabot alerts on the repo
