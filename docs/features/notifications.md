# Notifications

Sends each event to the person who needs to act on it — in the app (header bell,
`/notifications`) and, on devices where the user turned it on, as a phone
notification through the installed DMO app (Web Push). Phase 1 of the
notifications + staff messaging plan; messaging and the Daily Cleanliness /
Room Condition V2 events follow in later phases.

## Status

| | |
|---|---|
| **Shipped on** | — (phase 1 on `feature/notifications`, 2026-10-09) |
| **Live URL path(s)** | `/notifications`, `/settings/notifications`, `GET /api/notifications` |

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

## Events (phase 1)

Catalog: `src/lib/notifications/catalog.ts`. Add an event there, then call `notify`.

| Type | Recipients | Fired from |
|---|---|---|
| `hk.task.assigned` | assignee — one per housekeeper per action ("3 tasks assigned to you") | `checkOutRooms`, `createGeneralTask`, `assignTasks`, `autoAssign` |
| `hk.task.submitted` | holders of `housekeeping:cleaning:review` | `submitForInspection` |
| `hk.task.rejected` | assignee (else submitter), with the reason | `reviewTask` / `bulkReview` |
| `hk.task.approved` | assignee (else submitter) | `reviewTask` / `bulkReview` |
| `hk.rooms.unassigned` | holders of `housekeeping:tasks:manage` | `checkOutRooms` with no assignee |
| `account.password.reset` | that user (not mutable) | `resetPassword` (admin) |

Links open the right place: housekeeping notifications use
`/services/housekeeping?task=<id>`, which opens that task's panel.

## Permissions

| Permission | Allows | Default roles |
|---|---|---|
| `admin:notifications:manage` | Settings → Notifications (turn events on/off, pick receiving roles) | Admin |

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

## Polling

The bell fetches `GET /api/notifications` (unread count) every 30 s while the tab
is visible and on focus; `?list=1` adds the latest 20 when the panel opens. No
websockets. The nightly cron deletes notifications older than 90 days.

## Data model touchpoints

- **New:** `Notification`, `PushSubscription`, `NotificationRule`, `NotificationMute`
  (all additive; cascade from `User`).
- **Reads:** `User`, `UserRole`, `Role`, `RolePermission` (recipient resolution).

## Key files

- `src/lib/notifications/{catalog,notify,push}.ts`
- `src/lib/actions/notifications.ts` — read state, push devices, mutes, admin rules
- `src/app/api/notifications/route.ts`, `src/app/(app)/notifications/page.tsx`,
  `src/app/(app)/settings/notifications/page.tsx`
- `src/components/notifications/*` — bell, list, push toggle, mutes, rules manager
- Hooks: `src/lib/actions/housekeeping.ts`, `src/lib/actions/users.ts`

## Change log

- 2026-10-09 · Phase 1: bell, `/notifications`, phone push, Housekeeping +
  account events, admin rules, user mutes, `?task=` deep link.
