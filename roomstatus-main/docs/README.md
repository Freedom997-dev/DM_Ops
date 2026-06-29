# Divya Motel — Documentation

Living reference for the Room Condition Program and the wider operations platform it's evolving into.

## Folder structure

```
docs/
├── README.md                  # this file — index + discipline
├── architecture.md            # stack, hosting, deployment, key decisions
├── data-model.md              # Prisma schema reference, relations, cascade behavior
├── features/                  # one file per shipped feature
│   ├── README.md              # feature index
│   ├── _template.md           # template for new feature docs
│   ├── room-condition-inspection.md
│   └── inspection-photos.md
└── superpowers/               # design specs and implementation plans (created during brainstorms)
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

- [Architecture](architecture.md)
- [Data model](data-model.md)
- [Features index](features/README.md)
