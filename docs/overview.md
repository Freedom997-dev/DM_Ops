# Product Overview

## What DM Ops is

**DM Ops** (Divya Motel Operations) replaces paper checklists and verbal hand-offs
at Divya Motel with one mobile-friendly web app. Staff use it on phones during
walk-throughs and on the front-desk computer for oversight. Every inspection,
cleaning cycle and configuration change is stored and attributable to a person.

It started (June 2026) as a digital version of the paper *Preventive Maintenance /
Guest Room Checklist* and grew into an **Okta-style service portal**: users sign
in, see the services their role allows, and open one.

- **Production:** https://dm-ops-production.vercel.app
- **Repository:** `Freedom997-dev/DM_Ops` (GitHub), production branch `main`
- **npm package name:** `divya-motel-room-condition` (historical)

## Who uses it

| Person | Typical role | What they do in the app |
|---|---|---|
| Owner / general manager | Super Admin / Admin | Configure services, staff, roles; read reports; approve work |
| Front desk / supervisor | Manager | Check rooms out for cleaning, assign housekeepers, review cleaning, run daily checks |
| Maintenance inspector | Inspector | Quarterly room-condition walk-throughs, mark repairs, review cleaning |
| Housekeeping staff | Housekeeper | See assigned rooms/tasks, work the checklist, submit photo evidence; request someone else's room (manager approves) |

Roles are data, not code — admins can create custom roles and toggle permissions
(see [roles-and-permissions.md](roles-and-permissions.md)).

## Services (what's on the `/services` portal)

| Service | Route | Status | One-line description |
|---|---|---|---|
| **Room Condition V2 (Beta)** | `/services/pm-v2` | Live — the current PM tool | One inspection per room/area per quarter; statuses OK/Repair/Replace/Missing/Fixed/N/A; repair list; PDF/Excel/WhatsApp report. [Doc](features/pm-v2.md) |
| **Housekeeping** | `/services/housekeeping` | Live | Live board for room turnover and daily tasks; assignment, checklist, photo evidence, inspector approval. [Doc](features/housekeeping.md) |
| **Daily Cleanliness Inspection** | `/services/daily-cleanliness` | Live | Generic *workflow* service: rooms × 18 items matrix, one sheet per day. Day list (today on top, missed days shown), past days locked unless a manager unlocks them, "All OK" per room, Performance tab with Excel/PDF export. [Doc](features/platform-foundation.md) |
| **Room Condition (PM V1)** | `/services/pm` | **Hidden** from portal (code + data retained) | Original 95-item per-room inspection with immutable history. [Doc](features/room-condition-inspection.md) |
| **Settings** | `/settings` | Live | Staff, roles & permissions, rooms, service catalog, notifications, activity log |

Always available in the header (not catalog tiles): the **bell** (`/notifications`
— event notifications, phone-push switch, mutes) and **Messages** (`/messages` —
direct chats, role groups, announcements). [Doc](features/notifications.md).
Staff install the portal on their phone as the **DMO** app from `/install`
([user-guide.md](user-guide.md)).

## Core concepts / glossary

| Term | Meaning |
|---|---|
| **Service** | A tile on `/services`. Either *built-in* (PM V1, PM V2, Housekeeping — own tables and code) or a *workflow service* (a `WorkflowDefinition` row rendered by generic pages). |
| **App** (RBAC) | A group of permissions in the catalog: `pm`, `pmv2`, `housekeeping`, `admin`. |
| **Permission key** | `app:feature:action`, e.g. `housekeeping:tasks:submit`. |
| **Role** | A named bundle of permission keys (DB rows). Users can hold several roles. |
| **Super Admin** | Wildcard role — bypasses every check; at least one must always exist. |
| **Room** | Shared physical room record (`Room`), used by PM V1, Housekeeping and workflows; PM V2 areas can link to it. |
| **Area** (PM V2) | Anything inspected in PM V2: a guest room or a common area (lobby, pool…). |
| **Quarter** | PM V2's unit of time, `"YYYY-Qn"`. One inspection per area per quarter. |
| **Checklist** | PM V1: single global Section/Question list. PM V2: many named checklists. Housekeeping: per task type. |
| **Task** (HK) | `HousekeepingTask` — either `ROOM_CLEANING` (room turnover) or `GENERAL` (daily job like laundry). |
| **Status action** (HK) | Admin-defined reason for checking a room out ("Checkout", "Request for cleaning"). |
| **Submission** (workflow) | One day's run of a workflow service (`WorkflowSubmission`, unique per workflow + date). |
| **Day lock** (workflow) | Past days are read-only until a manager **unlocks** that day; today is editable until marked complete. |
| **Performance** (workflow) | Manager tab scoring each room: OK ÷ (OK + Issue) over 7 / 30 / 90 days. |
| **Notification event** | A catalog entry (`hk.task.assigned`, `msg.direct`, …) that `notify()` sends to the right people — bell + phone push. |
| **Conversation** | A messaging thread: direct chat, role group, announcement, or comments on a task/room. |
| **Business date** | A calendar day in the motel's timezone (`America/New_York`), stored as UTC midnight. |
| **Carry-forward** (PM V1) | Repair/Fixed/N/A states copied into the next inspection of the same room. |
| **Snapshot** | Copying a label into a history row at write time so later edits don't rewrite history. |
| **Media rule** (HK) | Admin setting: is a photo/video required to submit a room / complete a daily task. |

## What it deliberately is not

- Not a PMS / booking system — no reservations, guests or payments. Housekeeping
  check-outs are triggered manually, not by a booking feed.
- Not multi-property / multi-tenant — one motel per deployment.
- No realtime sockets — screens poll (Housekeeping board 12 s, notification bell
  30 s, an open chat 5 s). Phone notifications use standard Web Push.
- No app-store app — it's an installable web app (PWA) named **DMO**.
- No email yet — password resets are done by an admin (self-service reset is on
  the unmerged `feature/user-account` branch, waiting for email sending).

## Project timeline (high level)

See [changelog.md](changelog.md) for the dated list. In short: PM V1 (Jun 2026) →
photos (Jun) → platform foundation + Daily Cleanliness (Jul) → Housekeeping (Jul) →
RBAC + security hardening (Aug–Sep) → move to Supabase/Vercel `dm-ops-production`
(Sep) → PM V2 (Sep) → Next.js 16 migration and PM V1 hidden (Sep 2026) → Oct 2026:
timezone fix, installable DMO app, Daily Cleanliness day list / lock / Performance /
export / All OK, notifications + messaging, configurable photo requirement.
