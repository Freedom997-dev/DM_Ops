# Notifications & staff messaging

Sends each event to the person who needs to act on it — in the app (header bell,
`/notifications`) and, on devices where the user turned it on, as a phone
notification through the installed DMO app (Web Push) — and gives staff private
in-app messaging: direct chats, role groups, manager announcements and comments
on housekeeping tasks and rooms.

## Status

| | |
|---|---|
| **Shipped on** | — (phases 1–3 on `feature/notifications`, 2026-10-09) |
| **Live URL path(s)** | `/notifications`, `/settings/notifications`, `/messages`, `/messages/new`, `/messages/announce`, `/messages/[id]`, `GET /api/notifications`, `GET /api/messages/[id]`, `GET /api/messages/thread`, `/api/cron/daily-reminders` |

## How an event reaches people

`notify({ type, actorId, userIds?, title, body, href, entityType, entityId })`
(`src/lib/notifications/notify.ts`) — the only call event sites make:

1. **On?** Admin rule (`NotificationRule`) else the catalog default.
2. **Who?** `direct` events → the `userIds` passed (e.g. the assignee).
   `audience` events → the roles an admin picked, else everyone holding the
   event's `defaultPermission` (Super Admin always counts).
3. **Filter:** never the actor; active users only; skip users who muted it
   (`NotificationMute`) unless the event isn't mutable.
4. **Store** one `Notification` per recipient, then **push** after the response
   (`after()` from `next/server`) via `sendPush` (`push.ts`). Devices the push
   service reports as gone (404/410) are deleted.

`notify()` never throws — a notification failure can't break the action.

## Events

Catalog: `src/lib/notifications/catalog.ts`. Add an event there, then call `notify`.
Audience events go to `defaultPermission` holders or `defaultRoles` unless an
admin picked roles. `collapse: true` replaces the recipient's earlier unread
notification for the same entity (chats, daily reminders).

| Type | Recipients | Fired from |
|---|---|---|
| `hk.task.assigned` | assignee — one per housekeeper per action ("3 tasks assigned to you") | `checkOutRooms`, `createGeneralTask`, `assignTasks`, `autoAssign` |
| `hk.task.submitted` | holders of `housekeeping:cleaning:review` | `submitForInspection` |
| `hk.task.rejected` | assignee (else submitter), with the reason | `reviewTask` / `bulkReview` |
| `hk.task.approved` | assignee (else submitter) | `reviewTask` / `bulkReview` |
| `hk.rooms.unassigned` | holders of `housekeeping:tasks:manage` | `checkOutRooms` with no assignee |
| `account.password.reset` | that user (not mutable) | `resetPassword` (admin) |
| `msg.direct` | the other person (collapsed per chat) | `sendMessage` |
| `msg.group` | group members except those who muted the chat (collapsed) | `sendMessage` |
| `msg.announcement` | the announcement's audience (not mutable) | `postAnnouncement` |
| `msg.comment` | task assignee, assigner, creator + earlier commenters (collapsed) | `postComment` |
| `dc.not_started` | users with a role in the service's `rolesAllowed` | cron 15:00 UTC — `remindNotStarted` |
| `dc.missed` | Super Admin, Admin, Manager | cron 08:00 UTC — `reportYesterday` |
| `dc.issues_summary` (off by default) | Super Admin, Admin, Manager | cron 08:00 UTC — `reportYesterday` |
| `pmv2.repairs_found` | Super Admin, Admin, Manager | `pmv2SetDone` (complete with ≥ 1 Repair/Replace/Missing) |
| `pmv2.repair_fixed` | whoever last recorded the inspection | `pmv2MarkFixed` |

⏳ When `feature/daily-inspection-updates` and `feature/user-account` merge, add
"past day unlocked" and "password / email changed" events the same way.

Links open the right place: housekeeping notifications use
`/services/housekeeping?task=<id>`, which opens that task's panel.

## Permissions

| Permission | Allows | Default roles |
|---|---|---|
| `admin:notifications:manage` | Settings → Notifications (turn events on/off, pick receiving roles) | Admin |
| `comms:announcements:send` | Post announcements (`/messages/announce`) and see "Seen by" on your own | Admin, Manager |
| `comms:messages:moderate` | Delete others' messages in groups, announcements and comments (never direct chats) | Admin |

Everyone signed in has their own `/notifications` page (list, phone-push switch,
mutes). Production roles seeded before this need the key granted once — via
`INTRODUCED_GRANTS` after `feature/daily-inspection-updates` merges, or by hand in
Settings → Roles & permissions; Super Admin has it regardless.

## Phone push

- `public/sw.js` — push-only service worker (shows the notification, opens its
  link on tap). **No fetch handler**, so it never caches pages.
- `PushToggle` (`/notifications`) registers it, asks permission and saves the
  subscription (`PushSubscription`, one row per device; the last user to enable a
  device owns it). Each device is turned on separately.
- iPhone: only for DMO added to the home screen (iOS 16.4+). Android Chrome and
  desktop Chrome/Edge work in the browser too.
- Env (Vercel Production, Sensitive): `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:`). Generate once with
  `npx web-push generate-vapid-keys`. Without them push is off and the bell
  still works. **Changing the keys invalidates every saved device.**

## Messaging

`src/lib/messaging/server.ts` holds all access rules — every page, API route and
action calls `canAccess()`:

| Kind | Key | Who can see / post |
|---|---|---|
| Direct | `dm:<a>:<b>` (ids sorted, one per pair) | only those two people; nobody else, including admins |
| Group | `group:ALL`, `group:<ROLE>` | everyone / that role (membership follows role changes; Super Admin can open all groups) |
| Announcement | none; `audienceRoles` JSON | audience read-only; author + Super Admin see **Seen by N of M** |
| Comments | `thread:HK_TASK:<id>`, `thread:ROOM:<id>` | board viewers / managers (room history page); created on the first comment |

- Recipients are re-checked against `canAccess` (comment threads take members
  from history — assignee, earlier commenters — so someone who lost access since
  isn't notified). Group members are computed from current roles; muted chats
  are skipped; nobody is notified about their own message.
- Text only, ≤ 2000 chars; deleting your own message leaves "Message deleted".
  Moderators' deletes are audit-logged.
- `ConversationRead` per user: `lastReadAt` (unread counts, "Seen by") and `muted`.
- An open chat polls `GET /api/messages/[id]?after=` every 5 s; comments poll
  `GET /api/messages/thread`. The header **Messages** badge (unread chats) rides on
  the bell's 30 s poll (`messagesUnread`), broadcast as the `dmo:counts` window event.

## Scheduled jobs (Vercel Cron)

| Route | UTC | Eastern | Does |
|---|---|---|---|
| `/api/cron/housekeeping-daily-reset` | 08:00 | ~4 / 3 AM | recurring tasks reset; `reportYesterday` (missed / issue summary); delete notifications > 90 days |
| `/api/cron/daily-reminders` | 15:00 | ~11 / 10 AM | `remindNotStarted` |

Both require `Authorization: Bearer $CRON_SECRET`. Re-running is safe (collapsed).

## Polling

The bell fetches `GET /api/notifications` (unread count) every 30 s while the tab
is visible and on focus; `?list=1` adds the latest 20 when the panel opens. No
websockets. The nightly cron deletes notifications older than 90 days.

## Data model touchpoints

- **New:** `Notification`, `PushSubscription`, `NotificationRule`, `NotificationMute`,
  `Conversation`, `ConversationRead`, `Message` (all additive).
- **Reads:** `User`, `UserRole`, `Role`, `RolePermission` (recipient resolution).

## Key files

- `src/lib/notifications/{catalog,notify,push}.ts`
- `src/lib/actions/notifications.ts` — read state, push devices, mutes, admin rules
- `src/app/api/notifications/route.ts`, `src/app/(app)/notifications/page.tsx`,
  `src/app/(app)/settings/notifications/page.tsx`
- `src/components/notifications/*` — bell, list, push toggle, mutes, rules manager
- `src/lib/messaging/{server,dto}.ts`, `src/lib/actions/messages.ts`,
  `src/app/(app)/messages/**`, `src/app/api/messages/**`, `src/components/messages/*`
  (`MessageThread` is shared by chats and comments)
- `src/lib/jobs/daily-reminders.ts`, `src/app/api/cron/daily-reminders/route.ts`
- Hooks: `src/lib/actions/{housekeeping,users,pmv2}.ts`, `HkTaskPanel.tsx`,
  `src/app/(app)/settings/rooms/[id]/page.tsx`

## Change log

- 2026-10-09 · Phase 1: bell, `/notifications`, phone push, Housekeeping +
  account events, admin rules, user mutes, `?task=` deep link.
- 2026-10-09 · Phase 2: messaging — direct chats, role groups, announcements with
  "Seen by", per-chat mute, Messages badge.
- 2026-10-09 · Phase 3: comments on housekeeping tasks and rooms; Daily
  Cleanliness reminders (not started / missed / issue summary) with a new cron;
  Room Condition V2 repairs-found / repair-fixed.
