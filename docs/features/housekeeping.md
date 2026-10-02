# Housekeeping (HKT)

A live housekeeping board for **room turnover** and **general daily tasks**:
check rooms out for cleaning, assign housekeepers (manually or balanced
auto-assign), work a per-task checklist, submit photo/video evidence, and have an
inspector approve the room as ready to rent. Every step is time-stamped and
attributed.

Built-in service (own tables, RBAC app `housekeeping`) — not a `WorkflowDefinition`.

## Status

| | |
|---|---|
| **Shipped** | 2026-07-30 (`2cf43f7`); QA fixes 2026-09-11 (`3ce2d0d`) |
| **Design spec** | [`superpowers/specs/2026-07-14-housekeeping-design.md`](../superpowers/specs/2026-07-14-housekeeping-design.md) (frozen) |
| **Plan** | [`superpowers/plans/2026-07-14-housekeeping.md`](../superpowers/plans/2026-07-14-housekeeping.md) (frozen) |
| **QA record** | [`history/2026-09-housekeeping-qa-status.md`](../history/2026-09-housekeeping-qa-status.md) |
| **Routes** | `/services/housekeeping`, `/services/housekeeping/settings`, `/api/cron/housekeeping-cleanup`, `/api/cron/housekeeping-daily-reset` |

## Task kinds & lifecycles

One flexible model, `HousekeepingTask`, with a `kind`:

**`ROOM_CLEANING`** (linked to a `Room`):
```
READY_TO_CLEAN ──start──► IN_PROGRESS ──submit (checklist done + ≥1 media)──► READY_FOR_INSPECTION
      ▲                                                                           │
      └──────────────── reject (note required; media deleted) ◄────────────────────┤
                                                                                  └─approve──► READY_TO_RENT (closed)
```
Submitting directly from READY_TO_CLEAN is allowed (`startedAt` is back-filled).

**`GENERAL`** (titled job, no room): `TODO → IN_PROGRESS → DONE` — media optional,
no inspection. If `recurring`, the nightly job resets it to `TODO`, unassigned,
with its checklist back to `PENDING`.

"Open" = any status other than `READY_TO_RENT` / `DONE`. A room can have only one
open cleaning task (check-out skips busy rooms).

## Permissions

| Permission | Allows | Default roles |
|---|---|---|
| `housekeeping:board:view` | See the board and its media | Admin, Manager, Inspector, Housekeeper |
| `housekeeping:tasks:manage` | Check out rooms, create/delete tasks, assign, auto-assign | Admin, Manager |
| `housekeeping:tasks:submit` | Start, edit checklist, submit room, complete general task | Admin, Manager, Housekeeper |
| `housekeeping:cleaning:review` | Approve / reject (single + bulk) | Admin, Manager, Inspector |
| `housekeeping:settings:configure` | Settings page, delete individual photos | Admin |

**Assignment roster** = active users holding the **HOUSEKEEPER** role (dropdown,
`assignTasks`, `autoAssign` all agree). The board computes a `caps` object
(`manage/submit/review/admin`) from these permissions to show/hide controls.

## Board (`/services/housekeeping`)

- Summary cards: counts per status, plus open daily tasks.
- Tiles for every open task + anything closed in the last 24 h.
- Toolbar (managers): **Check out rooms**, **New task**, **Auto-assign**, bulk
  select → assign / approve / reject.
- Task drawer (`HkTaskPanel`): checklist with Done / Not done / N/A + note per
  item, media picker (camera photo, camera video, library), actions for the
  current status, and an **activity timeline** (`buildTimeline`: created →
  assigned → started → submitted → approved/sent back).
- **Polling**: `router.refresh()` every **12 s**, paused while a drawer/modal is
  open or an action is running. No websockets.
- Signed media URLs are generated with a **6 h** TTL so a long-open drawer
  doesn't show broken images; thumbnails have `onError` fallbacks.

## Check-out & status actions

"Check out rooms" lists every room (busy ones greyed). The bottom bar shows one
button per **status action** (`HousekeepingStatusAction`, default *Checkout*,
*Request for cleaning*). Applying one creates a READY_TO_CLEAN task per selected
room with `requestReason` = the action label, optionally pre-assigned, and
snapshots the **room-cleaning checklist** onto the task.

## Daily tasks & templates

"New task" offers quick-pick **templates** (`HousekeepingTaskTemplate`: Clean
lobby, Laundry, Restock supplies, Pool area, Corridors) or a custom title, an
optional assignee, and a **recurring** flag. A template's own checklist items are
snapshotted onto the task.

## Checklists

`HousekeepingChecklistItem` rows with `templateId = null` form the room-cleaning
checklist; rows with a `templateId` belong to that daily-task template. At task
creation they are copied into `HousekeepingTaskItem` (label snapshot), so editing
the checklist later never changes existing tasks.

Rules:
- Items are editable only while the task is `READY_TO_CLEAN`, `IN_PROGRESS` or `TODO`.
- **A room can't be submitted for inspection until every item is DONE or NA** (F1).

## Media (photos & videos)

- `HousekeepingPhoto` with `mediaType` IMAGE | VIDEO. Images ≤ 10 MB, videos ≤ 50 MB
  (server-validated; `media-*`/`image-*` FormData keys).
- Paths: `housekeeping/<YYYY-MM>/<YYYY-MM-DD>/room-<n>/<cuid>.<ext>` or `…/task/<cuid>.<ext>`.
- Upload-then-transact with rollback; transition uses an optimistic status lock.
- Lifecycle — media is evidence, not an archive:
  - **Reject** → the submission's media is deleted (fresh evidence on re-submit) (F6).
  - **Approve** → deleted if `deleteOnApproval` (default on).
  - **Nightly sweep** → anything older than `retentionDays` (default 7).
  - Admin can delete a single item from the lightbox.
- Production limit: Vercel's ~4.5 MB request cap — see known-issues **P1**.

## Assignment

- **Manual**: pick tasks → housekeeper (or unassign). Rejects non-housekeepers (F3).
- **Auto-assign**: targets the selected tasks, or all open unassigned tasks
  (oldest first). Each goes to the housekeeper with the fewest open assigned tasks
  at that moment (greedy least-loaded).
- **Self-assign**: starting an unassigned task assigns it to the starter; a room
  submitted while unassigned is attributed to the submitter.

## Concurrency

Every transition (`startTask`, submit, complete, approve, reject) uses
`updateMany({ where: { id, status: <expected> } })`. If 0 rows change, the user
sees "This room just changed — refresh and try again." (F9).

## Settings (`/services/housekeeping/settings`)

Tabs (admin only):

| Tab | Edits |
|---|---|
| Check-out | Status actions (add / rename / remove; ≥1 must remain) |
| Room checklist | Room-cleaning checklist items |
| Templates | Daily-task templates and each template's checklist |
| Rooms | Add a room (shared `Room` table) |
| Retention | `deleteOnApproval`, `retentionDays`, cleaning **instructions** shown to housekeepers |

The tab strip scrolls horizontally on mobile with the active tab scrolled into view (F8).

## Scheduled jobs

| Route | UTC | Job module |
|---|---|---|
| `/api/cron/housekeeping-cleanup` | `0 3 * * *` | `src/lib/jobs/housekeeping-sweep.ts` |
| `/api/cron/housekeeping-daily-reset` | `0 8 * * *` (~3–4 AM Eastern) | `src/lib/jobs/housekeeping-recurrence.ts` |

Both require `Authorization: Bearer $CRON_SECRET`. Job code is deliberately *not*
in a `"use server"` file so it can't be invoked from a browser.

## Data model

`HousekeepingTask`, `HousekeepingTaskItem`, `HousekeepingPhoto`,
`HousekeepingSetting` (singleton), `HousekeepingStatusAction`,
`HousekeepingTaskTemplate`, `HousekeepingChecklistItem`. Details in
[data-model.md](../data-model.md#housekeeping-hkt).

## Seeding

`prisma/seedHousekeeping.ts` (idempotent) creates the settings singleton, 2 status
actions, 5 templates and a 7-item room checklist. **It is not run by the deploy
seed** — see known-issues **HK-SEED**.

## Key files

- `src/lib/housekeeping.ts` — kinds, status sets, `HK_STATUS_META` colours, `isOpenStatus`, `taskLabel`, storage path builders. (Its `can*Housekeeping(role)` helpers are legacy/unused.)
- `src/lib/hk-view.ts` — serializable view types (`HkTaskView`, `HkCaps`…) + `buildTimeline`.
- `src/lib/actions/housekeeping.ts` — all mutations (see [routes.md](../routes.md#housekeepingts)).
- `src/lib/jobs/housekeeping-*.ts` — cron bodies.
- `src/app/(app)/services/housekeeping/page.tsx` — loads tasks/rooms/roster/settings, signs URLs.
- `src/components/HousekeepingDashboard.tsx` — board, toolbar, modals, polling.
- `src/components/HkTaskPanel.tsx` — drawer: checklist, actions, timeline.
- `src/components/HkMediaPicker.tsx`, `PhotoLightbox.tsx` — capture + viewing.
- `src/components/HkConfigManager.tsx`, `HousekeepingSettingsForm.tsx` — settings tabs.

## Out of scope / ideas

Booking/PMS-driven checkouts, notifications, SLA/overdue timers, per-housekeeper
zones, long-term photo archive, CSV export, direct-to-storage upload (P1).

## Change log

- **2026-07-18/30** · Initial build: room + general tasks, 4-state/3-state flows, manual + auto assign, polling board, timeline, retention + sweep.
- **2026-07** · Configurable status actions, task templates, per-type subtask checklists, video support.
- **2026-08-05** · Permissions moved to RBAC (`housekeeping:*`); sweep moved to `src/lib/jobs`.
- **2026-08-06** · Recurring daily tasks + nightly reset; separate photo/video/library inputs.
- **2026-09-11** · QA fixes F1–F11 (checklist gate, roster-only assignment, edit window, image fallbacks, reject clears media, daily-task count, mobile tabs, optimistic locks, bulk-review guard, larger labels); upload body limit; reset cron → 08:00 UTC.
