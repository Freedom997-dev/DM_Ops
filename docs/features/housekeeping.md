# Housekeeping Tracking (HKT)

A live housekeeping board for room turnover **and** general daily tasks, with
assignment (manual + automatic), a photo-evidence + inspection flow for rooms,
a per-task activity timeline, and an admin-editable photo retention policy.

Built as a **built-in service** (its own tables + hardcoded role logic, like PM
— not a `WorkflowDefinition`). Route: `/services/housekeeping`.

## Purpose

- Track every room's cleaning status in real time (dashboard, PM-style).
- Track general daily jobs (lobby, laundry, restock…) alongside rooms.
- Assign work to specific housekeepers — by hand or one-click balanced auto-assign.
- Keep a permanent record of who did what, when (activity timeline + audit log).
- Require photo evidence + inspector sign-off before a room is declared rentable.

## Task kinds & lifecycles

A single flexible `HousekeepingTask` has a `kind`:

- **`ROOM_CLEANING`** (linked to a `Room`) — 4-state flow with photos + inspection:
  `READY_TO_CLEAN → IN_PROGRESS → READY_FOR_INSPECTION → READY_TO_RENT`.
  Inspector **reject** loops back to `READY_TO_CLEAN` (note required).
- **`GENERAL`** (a titled job, no room) — simpler flow, no mandatory inspection:
  `TODO → IN_PROGRESS → DONE` (photos optional).

Server enforces every transition and role rule.

## Check-out panel & status actions

Clicking **Check out rooms** opens a panel listing **every room** (rooms already in
cleaning are shown greyed/"busy"), with select-all. A bottom **Update status** bar
shows one button per configured **status action** (default: *Checkout*, *Request for
cleaning*). Applying an action creates a `READY_TO_CLEAN` task for each selected room,
tagged with the action's label as `requestReason` (shown on the tile). An optional
assignee can be set at the same time.

The status-action list is **admin-editable in Housekeeping Settings** (add / rename /
remove — at least one must remain), stored in `HousekeepingStatusAction`.

Likewise, the **New task** panel's quick-picks (Clean lobby, Laundry, Restock…) come from
an admin-editable **task-template** list (`HousekeepingTaskTemplate`); a manager can still
type a custom title. Settings also has an **Add room** control (rooms are shared with PM).
All housekeeping configuration lives on the settings page:

- **Status actions** — check-out panel options.
- **Daily task templates** — "New task" quick-picks.
- **Rooms** — add a room.
- **Retention** — delete-on-approval + retention days + cleaning instructions.

## Subtask checklist & media

Each task carries a **checklist of subtasks** the housekeeper marks
**Done / Not Done / N/A** with an optional **note** per subtask. The checklist is
**admin-defined per task type** (`HousekeepingChecklistItem`): a room-cleaning checklist
(`templateId` null) plus an optional checklist per daily-task template. When a task is
created, the applicable checklist is **snapshotted** into `HousekeepingTaskItem` rows so
history stays accurate even if the checklist is later edited.

Tasks also accept **photos and videos** (`HousekeepingPhoto.mediaType` = IMAGE | VIDEO),
attached at the task level. Images: ≤10 MB; videos: ≤50 MB. Videos run through the same
delete-on-approval + retention sweep as photos, so storage stays bounded. The inspector
reviews the completed checklist + media before approving.

Both the checklist and the daily-task-template checklists are edited in Housekeeping
settings.

## Roles

| Role | Can do |
|---|---|
| ADMIN / MANAGER | Check out rooms, create tasks, assign + auto-assign, everything below; admin also edits settings |
| HOUSEKEEPER | Start, submit rooms for inspection (photos), complete general tasks |
| INSPECTOR | Approve / send-back rooms awaiting inspection (bulk too) |

Roster for assignment = active users with role `HOUSEKEEPER`.

## Assignment

- **Manual** — assign one or many selected tasks to a housekeeper (or on checkout / create).
- **Auto-assign** (`autoAssign`) — distributes open, unassigned tasks across active
  housekeepers using **balanced round-robin** (each next task → whoever currently has
  the fewest open assigned tasks).
- A housekeeper who **starts** an unassigned task self-assigns it.

## Realtime

The dashboard is a client component that **polls** (`router.refresh()` every ~12s),
paused while a drawer/modal is open or an action is in flight. No external realtime
infrastructure — works identically in local Docker and production.

## Routes

- `/services/housekeeping` — the dashboard (board).
- `/services/housekeeping/settings` — admin retention + instructions.
- `/api/cron/housekeeping-cleanup` — daily retention sweep (Bearer `CRON_SECRET`).

## Data model (3 new tables)

- **`HousekeepingTask`** — `kind`, `title?`, `roomId?`, `status`, assignment
  (`assignedHousekeeperId`, `assignedById`, `assignedAt`), `startedAt`, submit/review
  stamps, `reviewNote`, `closedAt`. Indexes on `roomId`, `status`.
- **`HousekeepingPhoto`** — `taskId` (cascade), `storagePath`, dims/bytes, `uploadedById`.
  Index on `createdAt` for the retention sweep.
- **`HousekeepingSetting`** — singleton row: `deleteOnApproval`, `retentionDays`, `instructions`.

See [data-model.md](../data-model.md).

## Photos, storage & retention

- Reuses the storage wrapper (`src/lib/storage.ts`): Supabase Storage in production,
  local filesystem driver in dev. Path: `housekeeping/<YYYY-MM>/<YYYY-MM-DD>/room-<n>/<uuid>.<ext>`
  (room) or `.../task/<uuid>.<ext>` (general).
- **Delete-on-approval** (default on) removes a room's photos the moment it's approved.
- **Daily sweep** deletes any photo older than `retentionDays`. Task records (status,
  who, when, note) are permanent — only pixels are transient.

## Key files

- `src/lib/housekeeping.ts` — kinds, status sets + meta (colors), path builders, permission helpers.
- `src/lib/hk-view.ts` — serializable view types + `buildTimeline`.
- `src/lib/actions/housekeeping.ts` — all server actions (checkout, create, assign, autoAssign,
  start, submit, complete, review, bulkReview, settings, sweep).
- `src/components/HousekeepingDashboard.tsx` — dashboard: summary cards, tiles, toolbar, drawer, modals, polling.
- `src/components/HkTaskPanel.tsx` — task actions + activity timeline.
- `src/components/HousekeepingSettingsForm.tsx` — retention/instructions editor.
- `src/app/(app)/services/housekeeping/**` — pages.
- `src/app/api/cron/housekeeping-cleanup/route.ts` + `vercel.json` — retention cron.

## Out of scope (deferred)

Required-photo checklists per room, per-room housekeeper zones, cleaning templates,
SLA/overdue timers, cross-cycle history beyond the current timeline, Google Drive
archive, booking/checkout integration, notifications, CSV export.

## Change log

- **2026-07-18** — Initial build on branch `HKT`. Flexible task model (room + general),
  4-state room flow + 3-state general flow, manual + balanced auto-assignment,
  PM-style polling dashboard, activity timeline, retention settings + cron sweep.
