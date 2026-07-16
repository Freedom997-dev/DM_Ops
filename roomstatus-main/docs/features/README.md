# Features

Index of shipped features. Each feature has its own doc with purpose, roles, routes, data model touchpoints, key files, and behavior notes.

## Shipped (Live in production)

| Feature | Doc | Status |
|---|---|---|
| Room Condition Inspection | [room-condition-inspection.md](room-condition-inspection.md) | Live (now under `/services/pm/*`) |
| Inspection Photo Evidence | [inspection-photos.md](inspection-photos.md) | Live |
| Platform Foundation + Daily Cleanliness | [platform-foundation.md](platform-foundation.md) | Live — Okta-style `/services` + `/settings`, matrix, RBAC, reopen, print-to-PDF |

## In development

| Feature | Doc | Status |
|---|---|---|
| Housekeeping (HK) | [housekeeping.md](housekeeping.md) *(created when built)* | Starting on the `HK` branch — scope TBD from user instructions |

## Backlog (deferred)

- **Per-room status timeline** — append-only, tamper-evident log of every room status transition (SHA-256 hash chaining). Would consume the chatty `WorkflowCell` audit entries.
- **CSV/Excel export** of submissions (print-to-PDF already shipped).

## Authoring a new feature doc

1. Copy [`_template.md`](_template.md) to `<feature-name>.md`.
2. Fill in every section. Leave a section out only if it genuinely doesn't apply.
3. Add a row to the table above.
4. Cross-link from `architecture.md` if the feature introduces a new architectural pattern.
5. Update this README's table when the feature ships.
