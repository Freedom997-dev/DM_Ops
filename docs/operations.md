# Operations (Day-2)

Running, maintaining and troubleshooting production. For shipping changes see
[deployment.md](deployment.md).

## Routine admin tasks (in the app)

| Task | Where | Permission |
|---|---|---|
| Add staff / reset password / deactivate | Settings → Staff | `admin:staff:add` / `:update` |
| Give someone access to a service | Settings → Staff (assign role) or Settings → Roles & permissions (edit role) | `admin:staff:update` / `admin:roles:update` |
| Create a custom role | Settings → Roles & permissions | `admin:roles:add` (Super Admin) |
| Add / archive a room | Settings → Rooms (or HK Settings → Rooms) | `pm:rooms:add` / `housekeeping:settings:configure` |
| Add a PM V2 area or edit checklists | Room Condition V2 → Setup | `pmv2:setup:configure` |
| Change HK check-out reasons, templates, checklists, retention | Housekeeping → Settings | `housekeeping:settings:configure` |
| Change who can run Daily Cleanliness | Service ⚙ → settings → allowed roles | `admin:services:manage` |
| Review who did what | Settings → Activity | Admin/Manager |

**Offboarding:** deactivate the user (never delete — their history references them).
Their session stops working on the next request.

**Locked-out user:** lockout clears itself 15 minutes after the 5th failure. An
admin can't unlock early from the UI; if urgent, delete that email's rows from
`LoginAttempt` in the Supabase SQL editor.

**Lost all Super Admin access:** set `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` to
a new address and redeploy — the seed creates that user as Super Admin. (For an
existing email it re-attaches Super Admin but does **not** reset the password.)

## Scheduled jobs

| Job | Code | What it does | If it doesn't run |
|---|---|---|---|
| Daily task reset | `src/lib/jobs/housekeeping-recurrence.ts` | `recurring` GENERAL tasks not in TODO → TODO, unassigned, all stamps cleared, checklist → PENDING | Yesterday's recurring tasks stay "Done" |

Check them in Vercel → Project → Cron Jobs (last run, status). Trigger manually:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://dm-ops-production.vercel.app/api/cron/housekeeping-daily-reset
```

Both return JSON (`{ ok, deleted }` / `{ ok, reset }`); 401 means `CRON_SECRET` is
missing or wrong.

## Storage

- Single private bucket `inspection-photos`; prefixes: `inspections/`,
  `workflows/`, `housekeeping/` (see [architecture.md](architecture.md#6-pluggable-storage-driver)).
- All media is **kept until someone deletes it** (housekeeping too, since
  2026-10-02 — it backs the room history). Watch Supabase Storage usage: the Free
  plan has 1 GB, and housekeeping videos can be up to 50 MB each.
- PM V2 has no photos.
- Orphans: storage deletes are best-effort (logged, not thrown). Rare orphans can
  be cleaned by listing the bucket against `storagePath` columns.

## Backups

Supabase provides automated daily backups on paid plans (Dashboard → Database →
Backups). Before any risky release, also take a manual dump using the **direct**
connection string:

```bash
pg_dump "postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres" > prod_backup_$(date +%Y%m%d).sql
```

`prod_backup_*` files are git-ignored — they contain password hashes; store them
privately and delete when no longer needed. Storage objects are **not** in
`pg_dump`.

To rehearse a migration: restore the dump into the local Docker DB
(`psql postgresql://postgres:devpass@localhost:5433/divya < dump.sql`), point
`.env.local` at it, run `prisma db push` + seeds, and test.

## Monitoring & logs

- **Vercel → Deployments → Functions / Logs** — server-action and route errors
  (`console.error` from storage, Prisma errors).
- **Vercel → Cron Jobs** — job history.
- **Supabase → Logs / Reports** — DB load, connections, storage size.
- **Settings → Activity** — business-level audit trail (who changed what).

There is no external error tracker or uptime monitor yet.

## Troubleshooting

| Symptom | Likely cause | Action |
|---|---|---|
| Everyone gets signed out / sign-in loops | `NEXTAUTH_URL` wrong or `NEXTAUTH_SECRET` rotated | Fix env var, redeploy |
| "prepared statement already exists" (42P05) | Pooler URL without pgbouncer params | `db.ts` adds them — check `DATABASE_URL` points to the pooler |
| Deploy fails at `prisma db push` | Non-additive schema change, or `DIRECT_URL` missing | Make the change additive / set `DIRECT_URL` |
| Deploy fails at seed | `SEED_ADMIN_PASSWORD` not set in Production | Set it |
| Photos don't upload from phones | Housekeeping uploads go direct to Supabase: check the bucket exists and its size limit/allow-list (synced on deploy). Other forms: Vercel's ~4.5 MB cap | See features/housekeeping.md → Media |
| Images broken on the board | Signed URL expired (board open > 6 h) or object swept | Refresh; check retention days |
| A role can't see a service | Role lacks the catalog key (e.g. `pmv2:*` on older DBs) or not in `rolesAllowed` | Grant in Roles & permissions / service settings |
| Can't assign a person to cleaning | They don't hold the HOUSEKEEPER role or are inactive | Add role in Staff |
| Recurring task didn't reset | Task not flagged `recurring`, or cron 401 | Check task + `CRON_SECRET` |
| "This room just changed — refresh" | Optimistic lock: someone else moved the task | Expected; refresh |
| Check-out panel shows no actions | No `HousekeepingStatusAction` rows | Add in HK Settings → Check-out |
