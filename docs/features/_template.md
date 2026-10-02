# <Feature Name>

One-paragraph summary: what it does and why it exists.

## Status

| | |
|---|---|---|
| **Shipped on** | YYYY-MM-DD |
| **Design spec** | `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` |
| **Implementation plan** | `docs/superpowers/plans/YYYY-MM-DD-<topic>.md` |
| **Live URL path(s)** | `/example` |

## Permissions

Which RBAC permission keys (`app:feature:action`) gate this feature, and which default roles hold them.

| Permission | Allows | Default roles |
|---|---|---|
| `app:feature:view` | … | Admin, … |

## Routes

| URL | Component / handler | Purpose |
|---|---|---|
| `/example` | `src/app/(app)/example/page.tsx` | … |

## Data model touchpoints

Which Prisma models this feature reads/writes. Mention any new tables or columns introduced.

- **Reads from:** Model A, Model B
- **Writes to:** Model A (status field), Model C (new)

## Key files

Files where the bulk of this feature's logic lives.

- `src/lib/actions/example.ts` — server action(s)
- `src/components/ExampleForm.tsx` — main UI
- `src/lib/example-helper.ts` — domain logic

## Behavior notes

Non-obvious behaviors a future reader should know:

- Defaults to X unless Y
- Validates input at boundaries A and B
- On error, does Z

## Auth gates

Which guard each page and action uses (`requirePermission`, `requireWorkflowAccess`, …). Every server action must re-check.

## Storage / external services

If this feature touches Supabase Storage, external APIs, or anything outside the DB, document the path/contract/quota here.

## Out of scope (deferred)

What this feature *doesn't* do — explicit non-goals.

## Change log

Append a line for each material change. Date · what changed · which commit.

- YYYY-MM-DD · Initial ship · `<sha>`
