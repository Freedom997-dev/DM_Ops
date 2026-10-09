# Features

One living doc per feature: purpose, permissions, routes, data touchpoints, key
files, behaviour notes and a change log.

## Live

| Feature | Doc | Status |
|---|---|---|
| Room Condition V2 (Beta) | [pm-v2.md](pm-v2.md) | Live on portal — current PM tool |
| Housekeeping (HKT) | [housekeeping.md](housekeeping.md) | Live |
| Platform Foundation + Daily Cleanliness | [platform-foundation.md](platform-foundation.md) | Live — `/services`, `/settings`, workflow matrix |
| RBAC & Security | [rbac-and-security.md](rbac-and-security.md) | Live |
| Notifications | [notifications.md](notifications.md) | Phase 1 built (bell, phone push, Housekeeping + account events) |

## Retained but hidden (PM V1)

| Feature | Doc | Status |
|---|---|---|
| Room Condition Inspection | [room-condition-inspection.md](room-condition-inspection.md) | Hidden from portal since 2026-09-30; routable |
| Inspection Photo Evidence | [inspection-photos.md](inspection-photos.md) | Part of PM V1 |
| PM Inspect — Item Search | [pm-item-search.md](pm-item-search.md) | Part of PM V1 |

## Backlog / ideas

- Direct-to-storage uploads for large media (known-issues P1)
- PM V2: photos, quarter-to-quarter carry-forward, per-room history
- Retire PM V1 ([checklist](pm-v2.md#removing-v1-later))
- Create workflow services from the UI; Excel export for workflow submissions
- Per-room status timeline across services (the chatty per-cell audit entries were designed to feed it)
- Notifications (e.g. room ready to inspect)

## Authoring a new feature doc

1. Copy [`_template.md`](_template.md) to `<feature-name>.md` and fill every section that applies.
2. Add a row above and a line in [../changelog.md](../changelog.md).
3. Update [../routes.md](../routes.md), [../data-model.md](../data-model.md) and
   [../roles-and-permissions.md](../roles-and-permissions.md) as needed.
4. Link from [../architecture.md](../architecture.md) if it introduces a new pattern.
