# Features

Index of shipped features. Each feature has its own doc with purpose, roles, routes, data model touchpoints, key files, and behavior notes.

## Shipped (Live in production)

| Feature | Doc | Status |
|---|---|---|
| Room Condition Inspection | [room-condition-inspection.md](room-condition-inspection.md) | Live (now under `/services/pm/*`) |
| Inspection Photo Evidence | [inspection-photos.md](inspection-photos.md) | Live |
| Platform Foundation + Daily Cleanliness | [platform-foundation.md](platform-foundation.md) | Live — Okta-style `/services` + `/settings`, matrix, RBAC, reopen, print-to-PDF |
| PM Inspect — Item Search | [pm-item-search.md](pm-item-search.md) | Live — Ctrl+F "find on page" for the 95-item inspect form |
| Housekeeping Tracking (HKT) | [housekeeping.md](housekeeping.md) | Built on `HKT` — flexible room + daily tasks, assignment (manual + auto), photo/inspection flow, activity timeline, configurable status actions + task templates, retention |

## In development

| Feature | Doc | Status |
|---|---|---|
| _(none)_ | | |

## Backlog (deferred)

- **Per-room status timeline** — append-only, tamper-evident log of every room status transition (SHA-256 hash chaining). Would consume the chatty `WorkflowCell` audit entries.
- **CSV/Excel export** of submissions (print-to-PDF already shipped).

## Authoring a new feature doc

1. Copy [`_template.md`](_template.md) to `<feature-name>.md`.
2. Fill in every section. Leave a section out only if it genuinely doesn't apply.
3. Add a row to the table above.
4. Cross-link from `architecture.md` if the feature introduces a new architectural pattern.
5. Update this README's table when the feature ships.
