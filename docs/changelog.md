# Changelog

What shipped, newest first. Dates are commit dates on `main` (production since
the `dm-ops-production` move). Add an entry with every feature or notable fix.

## 2026-10 — Notifications

- **2026-10-09** · Notifications phase 1: header bell + `/notifications`, phone
  notifications through the DMO app (Web Push), Housekeeping events (assigned,
  ready for inspection, sent back, approved, rooms waiting for assignment) and
  "your password was reset". Admins choose events and receiving roles in
  Settings → Notifications; staff can mute types. See
  [features/notifications.md](features/notifications.md).
- **2026-10-09** · Staff messaging (phase 2): direct chats, automatic role groups,
  manager announcements with "Seen by", per-chat mute and a Messages badge.
- **2026-10-09** · Phase 3: comments on housekeeping tasks and rooms; Daily
  Cleanliness reminders ("not started" ~11 AM ET, "missed yesterday", optional
  issue summary) on a new daily cron; Room Condition V2 "repairs found" and
  "repair marked fixed".

## 2026-10 — Daily Cleanliness day list & locking

- **2026-10-09** · Performance tab **Export**: Excel download (summary, rooms, problem map, issue log) and Print / Save as PDF.
- **v4.8.0 · 2026-10-08** · Tapping the Daily Cleanliness card opens a **day list**:
  today pinned on top, every earlier day below, missed days as blank sheets. The
  sheet shows a big date with Today / Past date, ◀ / ▶ and a date picker. Past
  days are **locked** until a manager unlocks them; then anyone with access can
  edit. The card shows today's date. Fixes taps on an empty past day being saved
  into today's inspection.
- **v4.8.0 · 2026-10-08** · **Performance** tab (replaces "By room") for managers:
  room scoreboard with scores, trends and top problems, a room detail view and a
  rooms × checklist problem map, over 7 / 30 / 90 days. New permission
  `workflows:performance:view`, given to Admin and Manager automatically once.

## 2026-10 — Mobile app install

- **v4.7.6 · 2026-10-06** · App versioning starts at **4.7.6**, shown in the page
  footer; bump rules in [deployment.md](deployment.md#versioning). Home-screen
  app name is **DMO**.
- **2026-10-06** · App icon (favicon, iPhone and Android home-screen icons) and web
  app manifest; installable full-screen from the phone's browser.
- **2026-10-06** · `/install` instructions page, install prompt on the login and
  Services pages, staff guide [user-guide.md](user-guide.md).

## 2026-09 — Platform hardening, new hosting, PM V2, Next 16

- **2026-09-30** · Shared room management page at `/settings/rooms` (`0c0b5e7`).
- **2026-09-30** · PM V1 card hidden from `/services` in favour of PM V2; V1 code,
  routes and data kept (`07435e7`).
- **2026-09-30** · **Next.js 16** migration: async `params`/`searchParams`,
  `middleware.ts` → `proxy.ts`, Turbopack file-trace hints in `storage.ts`
  (`212dfb8`, `4134d11`).
- **2026-09-29** · Daily Cleanliness service now created by the deploy seed
  (`49e2343`).
- **2026-09-29** · DB provisioning gated to `VERCEL_ENV=production`; builds tolerate
  a missing `DATABASE_URL` (`aa64836`).
- **2026-09-28** · **Room Condition V2 (beta)** — quarterly per-area inspections,
  multiple checklists, repair list, report (PDF / Excel / WhatsApp), setup, data
  import from the Claude artifact (`15066d6`). See [features/pm-v2.md](features/pm-v2.md).
- **2026-09-15** · Moved to Vercel project `dm-ops-production` + Supabase via the
  native integration; deploy-time schema push, seed and bucket creation
  (`e7c045d`, `d5d1fb2`, `f02f1ea`).
- **2026-09-11** · Housekeeping QA fixes F1–F11: checklist gate, roster-only
  assignment, optimistic locking, reject clears photos, mobile upload limit
  (55 MB Server Action body), cron moved to 08:00 UTC (`3ce2d0d`).
- **2026-09-11** · Dependency updates; service-card accessibility (`38a1cb5`).

## 2026-08 — RBAC, recurring tasks, repo cleanup

- **2026-08-31** · Purged committed env backups from git history; hardened
  `.gitignore` (`2e22a72`).
- **2026-08-07** · App promoted from `roomstatus-main/` to the repo root (`4099fd8`).
- **2026-08-06** · Recurring daily tasks + nightly reset cron (`1e6b424`); separate
  photo/video capture inputs (`66f165c`, `af9422a`).
- **2026-08-05** · **RBAC + security hardening**: DB roles/permissions, multi-role
  users, roles matrix, anti-escalation rules, login lockout, password policy,
  7-day sessions (`6b1a417`). See [features/rbac-and-security.md](features/rbac-and-security.md).
- **2026-08-05** · Housekeeping photo-sweep moved out of server actions into a job
  module (`e6d42e0`).

## 2026-07 — Foundation, Housekeeping, PM improvements

- **2026-07-30** · **Housekeeping (HKT)** — live board, room + general tasks,
  assignment, checklists, photo/video evidence, inspection, retention
  (`2cf43f7`). See [features/housekeeping.md](features/housekeeping.md).
- **2026-07-19** · PM inspect "find on page" item search (`9d2ba86`); footer.
- **2026-07-18** · PM: dashboard status filters, "Fixed – verify" status,
  repair carry-forward, Excel exports, local filesystem storage driver, Docker
  Postgres (`6de1a3b`, `a301dbe`).
- **2026-07-13/14** · Workflow matrix print-to-PDF; pinned header/room column (`b056cc8`, `724b567`).
- **2026-07-01/02** · Okta-style IA (`/services`, per-service settings, global
  `/settings`); PM moved under `/services/pm`; single cycling checkbox cells;
  admin reopen; inline notes column (`edf4f48`, `e4b1c99`, `7b56539`, `e95cfe5`).

## 2026-06 — Launch

- **2026-06-30** · Platform foundation: generic `Workflow*` tables + **Daily
  Cleanliness Inspection** (`4d877b1`, `0603f4a`).
- **2026-06-24** · Per-item **inspection photo evidence** on Supabase Storage;
  pgbouncer-safe Prisma (`971f341`, `8fb63bf`).
- **2026-06-23** · Initial **Room Condition (PM)** app: rooms, 95-item checklist,
  inspections, dashboard, staff, audit log.
