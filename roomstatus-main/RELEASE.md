# Release Runbook — RBAC + Security Hardening

Stack: **Next.js on Vercel** · **Supabase Postgres** (DB) · **Supabase Storage** (media) · production = `main`.

This change is **additive and reversible**: it adds tables (`Role`, `RolePermission`,
`UserRole`, `LoginAttempt`) and **keeps the old `User.role` column**, so the previous
code still runs if you roll back. Because it's additive, you can migrate the DB while
the current site keeps running — no hard downtime required.

## Two working directories
- **Git commands** → repo root: `roomstatus2.0/`
- **npm / prisma commands** → app folder: `roomstatus2.0/roomstatus-main/`

## The one rule
Run the **DB migration (schema + seed) BEFORE deploying the new code**. The new code
reads permissions from the DB; a user with no roles yet has no access until the seed
maps them. Old code tolerates the new tables, so migrating first is safe.

---

## Phase A — Commit & PR (your GitHub account)

1. Confirm the build is clean (app folder):
   ```bash
   npm run build
   ```
2. Make sure git is authenticated as an account that can push to the repo
   (the CLI here is signed into a different account):
   ```bash
   gh auth switch      # or: gh auth login
   ```
3. Commit (repo root):
   ```bash
   git add -A roomstatus-main/src roomstatus-main/prisma
   git commit -m "feat(auth): RBAC + security hardening for DM Operations"
   ```
4. Push + open PR (repo root); review the diff before merging:
   ```bash
   git push -u origin HKT
   gh pr create --base main --head HKT --title "RBAC + security hardening"
   ```
   NOTE: opening the PR triggers a Vercel **Preview** build. That preview uses the
   **production** Supabase DB unless you set preview env vars — so don't click around
   the preview until AFTER Phase C migration (or ignore the preview entirely).

---

## Phase B — Optional dry-run (recommended, avoids surprises)
No staging DB exists, so simulate on a copy:
1. Dump production and restore into a scratch Postgres (local Docker is fine):
   ```bash
   pg_dump "<PROD_DATABASE_URL>" > prod_dump.sql
   # restore into a local/scratch DB, then point DATABASE_URL at it
   ```
2. Run the migration against the copy (app folder):
   ```bash
   npx prisma db push
   npx tsx prisma/seed.ts
   npm run dev
   ```
3. Verify: existing users still have access, roles matrix loads, an inspector is blocked
   from `/api/exports/repairs`. Then discard the scratch DB.

---

## Phase C — Migrate the PRODUCTION database

1. **Back up prod first.** Either Supabase Dashboard → Database → Backups, or:
   ```bash
   pg_dump "<PROD_DATABASE_URL>" > prod_backup_$(date +%Y%m%d).sql
   ```
2. **Confirm Vercel prod env vars** (Project → Settings → Environment Variables → Production):
   `DATABASE_URL`, `NEXTAUTH_SECRET` (strong), `NEXTAUTH_URL`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `CRON_SECRET`.
3. **Run the migration against prod** (app folder). ⚠️ Supabase gotcha: `prisma db push`
   does DDL and must use the **DIRECT connection (port 5432)**, NOT the pooler
   (port 6543 / `...pooler.supabase.com`), which breaks migrations. Get the direct
   string from Supabase → Project Settings → Database → Connection string → **URI (direct)**.
   ```bash
   # temporarily export the DIRECT prod connection string:
   export DATABASE_URL="postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres"

   npx prisma db push        # adds Role, RolePermission, UserRole, LoginAttempt (additive)
   npx tsx prisma/seed.ts    # creates 5 roles; seed admin -> Super Admin; maps existing users
   ```
   The seed is idempotent and will NOT add sample rooms/checklist to a populated DB.

---

## Phase D — Deploy the code
Merge the PR into `main`. Vercel auto-builds and promotes `main` to production
(the runtime `DATABASE_URL` should be the **pooler** connection — that's already
configured; only the migration above needs the direct one).

---

## Phase E — Smoke test in production (~5 min)
1. Sign in as your admin → you are **Super Admin**.
2. **Settings → Roles & permissions** → matrix loads, 5 roles present.
3. A normal staff member can still sign in and use their app (**migration worked**).
4. As a non-PM user, open `/api/exports/repairs` → blocked; as admin → downloads.
5. Create a user with password `pass1` → rejected (policy). Housekeeper photo upload
   still works (Supabase Storage unaffected).

---

## Rollback (if needed)
- **Code:** Vercel → Deployments → previous deployment → **Instant Rollback**.
  Safe because the migration was additive and `User.role` is retained.
- **Data:** restore the `pg_dump` backup from Phase C1.

---

## Post-release
- In **Roles & permissions** / **Staff**, review roles and assign any custom ones.
- Tell staff: accounts lock after **5 wrong passwords** (15 min); new passwords need
  **8+ chars with a letter and a number**.
- Optional: rotate `NEXTAUTH_SECRET` to force a one-time re-login for everyone.

## What's in this release
- RBAC: App→Feature→Action permissions, DB-backed roles, multi-role users, per-request
  resolution, roles matrix UI, per-service (workflow) access preserved.
- Security: API routes authorized by permission; no-privilege-escalation guardrails;
  login lockout + password policy; session lifetime 30d → 7d.
- Deferred (safe): dropping the vestigial `User.role` column.
