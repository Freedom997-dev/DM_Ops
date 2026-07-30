# Divya Motel — Documentation

Living reference for the Room Condition Program and the wider operations platform it's evolving into.

## Folder structure

```
docs/
├── README.md                  # this file — index + discipline
├── getting-started.md         # run locally (Docker Postgres + local storage), scripts, logins
├── architecture.md            # stack, hosting, deployment, key patterns
├── data-model.md              # Prisma schema reference, relations, cascade behavior
├── routes.md                  # every page & API route + who can access
├── roles-and-permissions.md   # roles, admin matrix, per-feature capabilities, enforcement
├── features/                  # one file per shipped feature
│   ├── README.md              # feature index
│   ├── _template.md           # template for new feature docs
│   ├── room-condition-inspection.md
│   ├── inspection-photos.md
│   ├── pm-item-search.md      # Ctrl+F on the inspect form
│   ├── platform-foundation.md # Okta-style services + Daily Cleanliness
│   └── housekeeping.md        # Housekeeping Tracking (HKT)
└── superpowers/               # design specs and implementation plans (frozen at design time)
    ├── specs/
    └── plans/
```

## Update discipline

Documentation is part of the work, not an afterthought. The rules:

1. **Every shipped feature gets a file in `features/`.** Copy `_template.md`, fill it in, link it from `features/README.md`.
2. **Modify the feature doc whenever the feature changes.** New decision, new behavior, new file — update the doc in the same change.
3. **Update `architecture.md` when stack or hosting changes.** New dependency category, new env var, new service.
4. **Update `data-model.md` when the Prisma schema changes.** New model, new field, new index, new cascade.
5. **Specs in `superpowers/specs/` are frozen at design time.** They capture the design as it was decided. Don't retro-edit them when behavior drifts — update the feature doc instead.

## When you're updating

If you're editing code in a feature folder, ask: *does this change the user-visible behavior or the data shape?* If yes, the feature doc needs a line too. If only internal refactor, the doc stays.

## Quick links

- [Getting started](getting-started.md) — run it locally
- [Architecture](architecture.md)
- [Data model](data-model.md)
- [Routes](routes.md)
- [Roles & permissions](roles-and-permissions.md)
- [Features index](features/README.md)
