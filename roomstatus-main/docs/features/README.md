# Features

Index of shipped features. Each feature has its own doc with purpose, roles, routes, data model touchpoints, key files, and behavior notes.

## Shipped

| Feature | Doc | Status |
|---|---|---|
| Room Condition Inspection | [room-condition-inspection.md](room-condition-inspection.md) | Live |
| Inspection Photo Evidence | [inspection-photos.md](inspection-photos.md) | Live |

## In design

| Feature | Spec | Status |
|---|---|---|
| Platform Foundation refactor | (in progress — `dev` branch) | Brainstorming |

## Backlog (committed but deferred)

- **Per-room status timeline** — append-only, tamper-evident log of every room status transition with SHA-256 hash chaining.
- **Downloadable inspection report** — per-room or per-inspection PDF/CSV with photos embedded.
- **Daily Cleanliness Inspection workflow** — Managers + Inspectors.
- **Room Cleaning Form workflow** — Housekeepers, per room.

## Authoring a new feature doc

1. Copy [`_template.md`](_template.md) to `<feature-name>.md`.
2. Fill in every section. Leave a section out only if it genuinely doesn't apply.
3. Add a row to the table above.
4. Cross-link from `architecture.md` if the feature introduces a new architectural pattern.
5. Update this README's table when the feature ships.
