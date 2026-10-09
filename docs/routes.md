# Routes, API & Server Actions

Every page, HTTP endpoint and server action, with the permission that guards it.
Permission keys are explained in [roles-and-permissions.md](roles-and-permissions.md).
All `/services/*` and `/settings/*` pages also pass `proxy.ts` (signed in) and
`requireUser()` in `(app)/layout.tsx`. A failed page guard redirects to `/services`.

## Pages

| Route | Purpose | Guard |
|---|---|---|
| `/` | Redirect → `/services` (signed in) or `/login` | — |
| `/login` | Credentials sign-in; shows lockout message; "Install the app" link | Public |
| `/notifications` | My notifications (latest 100), phone-push switch for this device, per-type mutes | signed in |
| `/settings/notifications` | Turn events on/off; pick receiving roles for audience events | `admin:notifications:manage` |
| `/messages` | Conversation list (announcements first, groups, direct chats, comment threads you're in) | signed in |
| `/messages/new` | Pick a staff member to message | signed in |
| `/messages/announce` | Post an announcement to all staff or chosen roles | `comms:announcements:send` |
| `/messages/[id]` | A conversation; "Seen by" for an announcement's author | `canAccess` (see features/notifications.md) |
| `/install` | How to add the portal to a phone's home screen (one-tap Install on Android Chrome when offered) | Public |
| `/services` | Service catalog — tiles filtered by permission; HK tile shows live counts; workflow tiles show today's status | signed in |
| **Room Condition V2** | | |
| `/services/pm-v2` | Board of all areas for a quarter (`?q=YYYY-Qn`, default current) with progress/issue counts | `pmv2:board:view` (layout) |
| `/services/pm-v2/inspect/[areaId]` | Inspect one area for a quarter; auto-save; read-only without submit | `pmv2:board:view` (+ `pmv2:inspections:submit` to edit) |
| `/services/pm-v2/issues` | Repair list — open issues + fixed; "Mark fixed" | `pmv2:board:view` (+ submit to fix) |
| `/services/pm-v2/report` | Quarter report: print/PDF, Excel, WhatsApp short/detailed message | `pmv2:reports:view` |
| `/services/pm-v2/setup` | Hotel name, checklists/sections/items, rooms & areas | `pmv2:setup:configure` |
| **Housekeeping** | | |
| `/services/housekeeping` | Live board: room tasks + daily tasks, toolbar, drawers, polling | `housekeeping:board:view` |
| `/services/housekeeping/settings` | Tabs: status actions, daily-task templates + checklists, room checklist, rooms, retention & instructions | `housekeeping:settings:configure` (else → board) |
| **Workflow services** | | |
| `/services/[slug]` | Sheet for today or `?date=YYYY-MM-DD` (future → today); date bar ◀ / ▶ / picker; print; mark complete; unlock / lock (manager); reopen (admin) | `requireWorkflowAccess(slug)` (`rolesAllowed`) |
| `/services/[slug]/history` | **Day list** (the card's target): today pinned on top, then every past day incl. missed ones. `?view=performance&range=7\|30\|90` → Performance tab (scoreboard, room detail, problem map) | `requireWorkflowAccess(slug)`; Performance also `workflows:performance:view` |
| `/services/[slug]/settings` | Name, description, allowed roles, items | `admin:services:manage` |
| **Room Condition V1** (hidden from catalog, still routable) | | |
| `/services/pm` | Room status dashboard, filters (`?view=`), repair breakdown, exports | `pm:dashboard:view` |
| `/services/pm/rooms` | Room list / manager (`?add`, `?edit`) | `pm:rooms:view` (edit UI: `pm:rooms:update`) |
| `/services/pm/rooms/[id]` | Room detail + inspection history + photos | `pm:rooms:view` |
| `/services/pm/inspect/[roomId]` | New inspection (carry-forward, item search, photos) | `pm:inspections:view` (save needs `:add`) |
| `/services/pm/settings` | PM settings landing | `pm:checklist:view` |
| `/services/pm/settings/checklist` | Sections & questions editor | `pm:checklist:view` |
| **Global settings** | | |
| `/settings` | Settings hub (cards shown per permission) | `isManager` (Admin/Manager key) |
| `/settings/staff` | Users: create, roles, activate/deactivate, reset password | `admin:staff:view` (+ add/update for edits) |
| `/settings/access` | Roles & permissions matrix; create/delete roles | `admin:roles:view` (+ add/update/delete) |
| `/settings/rooms` | Shared room management (used by HK, workflows, V1) | `pm:rooms:view` (edit: `pm:rooms:update`) |
| `/settings/services` | Workflow service catalog admin | `isAdmin` |
| `/settings/rooms/[id]` | **Room history** — one timeline per room: cleanings (every round from the audit log, photos), Daily Cleanliness results, Room Condition findings, room edits, deleted tasks. Filters: type + period | `isManager` |
| `/settings/activity` | Audit log viewer | `isManager` |

Static segments `pm`, `pm-v2`, `housekeeping` take precedence over `[slug]`, so a
workflow must never use those slugs.

## HTTP API routes

| Route | Method | Purpose | Auth |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | NextAuth (sign-in, session, sign-out) | NextAuth |
| `/api/exports/pm-v2?q=YYYY-Qn` | GET | PM V2 quarter workbook (Summary, Rooms, Open issues, Fixed) | `pmv2:reports:view` |
| `/api/exports/workflow-performance/[slug]?range=7\|30\|90` | GET | Daily Cleanliness performance workbook (Summary, Rooms, Problem map, Issue log) | workflow access + `workflows:performance:view` (404 otherwise) |
| `/api/exports/repairs` | GET | PM V1 open repairs `.xlsx` | `pm:inspections:view` |
| `/api/exports/status-report` | GET | PM V1 full status workbook (Summary, Rooms, Repairs, Awaiting verification) | `pm:inspections:view` |
| `/api/local-images/[...path]` | GET | Dev-only file server for the FS storage driver; **404 when Supabase is configured** | `housekeeping:board:view` for `housekeeping/*`, else `pm:inspections:view`; 404 on deny |
| `/api/cron/housekeeping-daily-reset` | GET | Reset recurring GENERAL tasks to TODO/unassigned; Daily Cleanliness missed / issue summary for yesterday; delete notifications older than 90 days | `Bearer CRON_SECRET` (401 otherwise) |
| `/api/notifications` | GET | `{ unread, messagesUnread }` for the header; `?list=1` adds the latest 20 | signed in (401 otherwise) |
| `/api/messages/[id]` | GET | Messages of a conversation; `?after=<ISO>` for new ones (polled every 5 s) | `canAccess` (404 otherwise) |
| `/api/messages/thread` | GET | Comments for `?type=HK_TASK\|ROOM&id=` (+ `after`) | board viewers / managers |
| `/api/cron/daily-reminders` | GET | Daily Cleanliness "not started" reminder | `Bearer CRON_SECRET` |
| `/api/local-uploads/[...path]` | PUT | Dev-only stand-in for a Supabase signed upload URL (direct uploads); **404 when Supabase is configured** | signed-in + valid upload token |

Cron schedules live in `vercel.json` (UTC): cleanup `0 3 * * *`, reset `0 8 * * *`.

## Server actions (`src/lib/actions/*`)

All are `"use server"`. Each re-checks auth itself. Return shape is
`{ ok: true, ... } | { ok: false, error }` unless noted.

### `pmv2.ts` — Room Condition V2
| Action | Guard | Notes |
|---|---|---|
| `pmv2SetStatus`, `pmv2SetNote`, `pmv2SetMeta`, `pmv2MarkSectionOk`, `pmv2AddExtra`, `pmv2RemoveExtra` | `pmv2:inspections:submit` | Auto-save; upserts the area+quarter inspection; **not** audit-logged |
| `pmv2SetDone` | submit | Complete / reopen; audited |
| `pmv2MarkFixed` | submit | From the repair list; sets `FIXED` + `fixedOn`; audited |
| `pmv2SetHotelName` | `pmv2:setup:configure` | |
| `pmv2CreateChecklist`, `pmv2RenameChecklist`, `pmv2DeleteChecklist` | configure | Delete = archive; refused while active areas use it |
| `pmv2AddSection`, `pmv2RenameSection`, `pmv2DeleteSection` | configure | Delete archives section + its items |
| `pmv2AddItem`, `pmv2RenameItem`, `pmv2DeleteItem` | configure | Delete = archive |
| `pmv2Move(kind, id, dir)` | configure | Reorder section/item; renumbers 1..n |
| `pmv2BulkAddRooms`, `pmv2AddArea`, `pmv2UpdateArea`, `pmv2RemoveArea` | configure | Bulk ≤200; links to `Room` by number; remove = archive |

### `housekeeping.ts`
| Action | Guard | Notes |
|---|---|---|
| `checkOutRooms(roomIds, assignee?, reason?)` | `housekeeping:tasks:manage` | Creates READY_TO_CLEAN tasks; skips busy rooms; snapshots room checklist |
| `createGeneralTask({title, assignee?, templateId?, recurring?…})` | manage | Snapshots the template's checklist |
| `deleteHousekeepingTask` | manage | Deletes media then row |
| `assignTasks(ids, hkId\|null)` | manage | Assignee must be an active HOUSEKEEPER |
| `autoAssign(ids?)` | manage | Balanced least-loaded distribution |
| `startTask` | `housekeeping:tasks:submit` | → IN_PROGRESS; self-assigns if unassigned |
| `saveTaskItems(taskId, items)` | submit | Only while READY_TO_CLEAN / IN_PROGRESS / TODO |
| `submitForInspection(FormData)` | submit | Requires all items DONE/NA + ≥1 media; → READY_FOR_INSPECTION |
| `completeGeneralTask(FormData)` | submit | → DONE; media optional |
| `reviewTask(id, APPROVE\|REJECT, note?)` | `housekeeping:cleaning:review` | Reject needs note, deletes media; approve may delete media |
| `bulkReview(ids, outcome, note?)` | review | Loops `reviewTask` |
| `deleteHousekeepingPhoto` | `housekeeping:settings:configure` | |
| `updateHousekeepingSettings` | configure | instructions |
| `requestHkMediaUploads(taskId, files)` | `housekeeping:tasks:submit` | Signed upload URLs + tickets for direct-to-storage media |
| `create/rename/archiveStatusAction` | configure | Keeps ≥1 active |
| `create/rename/archiveTaskTemplate` | configure | |
| `create/rename/archiveChecklistItem(templateId\|null, …)` | configure | null = room checklist |
| `hkCreateRoom` | configure | Shared `Room` |

### `workflows.ts` / `workflowAdmin.ts`
| Action | Guard |
|---|---|
| `getOrCreateSubmission(slug, day)`, `updateCell`, `saveRow` (photos), `saveRowNote`, `markSubmissionComplete` | `requireWorkflowAccess(slug)` — refused unless the day is editable (today, or a past day while unlocked; never once COMPLETED) |
| `unlockDay(slug, day)`, `lockDay(submissionId)` | `requireWorkflowAccess(slug)` + `isManager`; past days only |
| `reopenSubmission`, `deleteRowImage` | `requireAdmin()` |
| `createWorkflowItem`, `updateWorkflowItem`, `archiveWorkflowItem`, `updateWorkflowDefinition`, `archiveWorkflowDefinition` | `admin:services:manage` |

### `users.ts` / `roles.ts`
| Action | Guard |
|---|---|
| `createUser` | `admin:staff:add` (+ password policy, ≥1 grantable role) |
| `setUserActive`, `setUserRoles`, `resetPassword` | `admin:staff:update` (+ anti-escalation rules) |
| `createRole` | `admin:roles:add` |
| `setRolePermissions` | `admin:roles:update` |
| `deleteRole` | `admin:roles:delete` |

### PM V1 — `inspections.ts`, `photos.ts`, `checklist.ts`, `rooms.ts`
| Action | Guard |
|---|---|
| `saveInspection(FormData)` | `pm:inspections:add` |
| `deletePhoto` | `pm:inspections:update` |
| `deleteInspection` | `pm:inspections:delete` (no UI) |
| `createSection`, `createQuestion` | `pm:checklist:add` |
| `renameSection`, `updateQuestion` | `pm:checklist:update` |
| `setSectionArchived`, `setQuestionArchived` | `pm:checklist:delete` |
| `createRoom` / `updateRoom` / `setRoomArchived` | `pm:rooms:add` / `:update` / `:delete` |

## Cache revalidation

Actions call `revalidatePath` for affected pages: HK → `/services/housekeeping`
(+ `/settings`); PM V2 → `/services/pm-v2` with `"layout"` scope; workflows →
`/services/<slug>` (+ `/history`, `/settings`); rooms → `/services/pm`,
`/services/pm/rooms`, `/settings/rooms`; roles/staff → `/settings/access`,
`/settings/staff`. Data pages are `force-dynamic` anyway.
