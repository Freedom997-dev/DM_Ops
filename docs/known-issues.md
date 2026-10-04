# Known Issues, Tech Debt & Pending Decisions

Living list. Add items when found; strike them (move to *Resolved*) with the date
and commit when fixed. Severity: 🔴 high · 🟠 medium · 🟢 low.

_Last reviewed: 2026-10-01._

## Open — functional

| ID | Sev | Issue | Detail / suggested fix |
|---|---|---|---|
| **P1** | ✅ | Large uploads fail in production | **Fixed 2026-10-02 for Housekeeping**: media uploads straight to Supabase via signed URLs (see features/housekeeping.md → Media). The Daily Cleanliness row photos and PM V1 inspection photos still go through Server Actions; they compress photos client-side and refuse batches over 4 MB with a clear message. |
| **HEIC** | ✅ | iPhone HEIC photos rejected in prod | **Fixed 2026-10-02**: `image/heic`/`image/heif` added to the bucket allow-list, and `ensure-storage-bucket.ts` now syncs limits on every production deploy. Browsers that can decode HEIC (Safari) also convert it to JPEG during compression. |
| **TZ-1** | ✅ | Daily Cleanliness dates off by one day | **Fixed 2026-10-03**: History showed every date one day early (UTC midnight rendered in the browser's US timezone), and "today" flipped at UTC midnight (~8 PM Eastern). Both now go through `src/lib/business-date.ts` (motel timezone `America/New_York`; display in UTC). Submissions created after ~8 PM Eastern before the fix are stored under the next day. |
| **EMAIL-1** | 🟠 | Password-reset emails need Resend set up before they reach anyone | Until `RESEND_API_KEY` and a verified `EMAIL_FROM` domain are set in Vercel Production, "Forgot password" links and "Change password" codes are only written to the function log. Staff also need real, reachable emails — fix placeholders in Settings → Staff. |
| **HK-SEED** | 🟠 | Housekeeping defaults not created on deploy | `prisma/seedHousekeeping.ts` is not called by `prisma/seed.ts`, so a fresh production DB has no status actions / templates / room checklist (check-out panel shows no buttons; room tasks get no checklist). Fix: call it from `seed.ts` (it's idempotent). |
| **PMV2-PERMS** | 🟠 | PM V2 may be invisible to Admin/Inspector in prod | The seed never edits permissions of existing roles; `pmv2:*` keys were added after prod roles existed. Grant them in Settings → Roles & permissions. |
| **P2** | 🟢 | Upload path not validated against real Supabase on a deployed build since the body-limit fix | Validate a phone upload on production after the next deploy. |
| **TZ-2** | 🟢 | PM V2 default quarter uses server time | `quarterFromParams` falls back to `quarterOf(new Date())` on the server (UTC); for a few hours around a quarter boundary the default may differ from the inspector's local quarter. Writes use the client's date, so data is correct. |
| **DEV-IMG** | 🟢 | Local dev only: workflow row photos need `pm:inspections:view` | `/api/local-images` maps every non-`housekeeping/` path to `pm:inspections:view`, so a Manager running Daily Cleanliness locally can't see row photos. Production uses Supabase signed URLs and is unaffected. Add a `workflows/` branch to the route. |
| **F12** | 🟢 | Seeded daily-task templates don't imply recurring tasks | Product decision (see below). |

## Open — security / ops

| ID | Sev | Issue | Detail |
|---|---|---|---|
| **SEC-1** | 🔴 | Rotate credentials from the 2026-08-31 env-backup leak | Backups were purged from git history (`2e22a72`), but rotate Supabase DB password + service-role key, `NEXTAUTH_SECRET`, `CRON_SECRET`; delete local `.env.local.bak` / `.env.local.production-backup`. |
| **SEC-2** | 🟠 | Dependabot alerts on `main` | Many cleared by the Next 16 migration; re-check GitHub → Security. Don't use `npm audit fix --force`; verify bumps on a preview. |
| **P4** | 🟠 | `CRON_SECRET` must exist in Vercel Production | Otherwise both crons 401 silently. Confirm after any env change. |
| **OPS-1** | 🟢 | No error tracking / uptime monitoring | Consider Vercel Observability or Sentry. |
| **OPS-2** | 🟢 | `AuditLog` and `LoginAttempt` grow forever | Failed attempts for emails that never succeed are never cleared. Add a periodic purge (e.g. >90 days) as a cron job. |

## Tech debt

| ID | Item | Notes |
|---|---|---|
| **TD-1** | `npm run lint` runs `next lint`, which was removed in Next.js 16 | Replace with an ESLint flat config + `eslint .` script, or remove the script. |
| **TD-2** | Coarse role-key checks | `isAdmin` / `isManager` gate `/settings`, `/settings/activity`, `/settings/services`, workflow reopen/mark-complete/image-delete. Custom roles can't reach these via catalog permissions. Migrate to `can(user, "admin:audit:view")`, `admin:services:manage`, etc. |
| **TD-3** | `markSubmissionComplete` is gated only by workflow access server-side | The "Mark complete" button is manager-only in the UI, but any user allowed to run the workflow could call the action. Add an explicit server check. |
| **TD-4** | Dead pre-RBAC code | `User.role` column; `canAccessHousekeeping`/`canManageHousekeeping`/`canSubmitCleaning`/`canReviewCleaning`/`canConfigureHousekeeping` in `src/lib/housekeeping.ts`; `statusLabelForStatus` in `hk-view.ts`; unused `admin:staff:delete` key. Remove code (keep the column until a deliberate drop). |
| **TD-5** | PM V1 still shipped | Hidden from the portal (`PM_V1_ON_PORTAL = false`) but routable, with its own tables, exports and `pm` permissions. Retire per [features/pm-v2.md](features/pm-v2.md#removing-v1-later) once V2 is proven. |
| **TD-6** | `prisma db push` in the deploy build | Fine for a single maintainer; move to `prisma migrate` with committed migrations if the team grows. |
| **TD-7** | No automated tests | Add Playwright E2E per role (login, HK cycle, PM V2 inspect, workflow cell). |
| **TD-8** | `prisma/manual-migrations/*.sql` | Historical only; could move to `docs/history/`. |
| **TD-9** | Auto-assign and check-out loop row-by-row | Fine at motel scale (tens of rooms); batch if it grows. |

## Pending owner decisions

These were implemented with a reasonable default during the Housekeeping QA
(Sep 2026) and need explicit confirmation from the business owner:

| ID | Current behaviour | Alternative |
|---|---|---|
| **F1** | Hard gate: a room can't be submitted until every checklist item is Done or N/A | Warn only |
| **F3** | Only HOUSEKEEPER-role users can be assigned cleaning | Allow managers too |
| **F6** | Rejecting a room deletes the submitted photos (fresh evidence on re-submit) | Keep rejected photos, labelled |
| **F12** | Seeded daily tasks are one-time unless flagged recurring | Make seeded daily templates recurring by default |

<!-- OWNER: record decisions here, e.g. "F1 — confirmed hard gate (Latesh, 2026-10-xx)". -->

## Resolved (recent)

| Date | Item | Commit |
|---|---|---|
| 2026-09-30 | PM V1 hidden from portal; shared `/settings/rooms` page | `07435e7`, `0c0b5e7` |
| 2026-09-30 | Next.js 16 migration (async params, `proxy.ts`, Turbopack trace hints) | `4134d11` |
| 2026-09-29 | Daily Cleanliness created on prod deploy (manual SQL had never been applied) | `49e2343` |
| 2026-09-29 | DB provisioning gated to production; preview builds tolerate no `DATABASE_URL` | `aa64836` |
| 2026-09-11 | Housekeeping QA fixes F1–F11, mobile upload body limit, cron hour | `3ce2d0d` — see [history](history/2026-09-housekeeping-qa-status.md) |
