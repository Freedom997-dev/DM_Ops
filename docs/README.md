# DM Ops — Documentation

The single source of documentation for **DM Ops** (Divya Motel Operations): a
Next.js web app that runs the motel's day-to-day operations — room condition
inspections, housekeeping, daily cleanliness checks — with role-based access for
every staff member.

Everything needed to understand, run, change, deploy, or hand over this project
lives in this folder. The root `README.md` is only a short landing page.

> **Last full review:** 2026-10-01, against `main` @ `0c0b5e7`
> (Next.js 16.3, Prisma 5.22, RBAC v2, PM V2 live, PM V1 hidden from the portal).

---

## Reading order

### New human contributor

1. [overview.md](overview.md) — what the product is, who uses it, glossary
2. [getting-started.md](getting-started.md) — run it locally in ~10 minutes
3. [architecture.md](architecture.md) — how the code is put together
4. [roles-and-permissions.md](roles-and-permissions.md) — who can do what, and how it's enforced
5. The feature doc for whatever you're touching ([features/](features/README.md))
6. [development-guide.md](development-guide.md) — recipes + conventions before you change code
7. [deployment.md](deployment.md) — how `main` reaches production

### AI agent (Claude, Copilot, etc.)

Read **[AI_GUIDE.md](AI_GUIDE.md) first** — it is a dense, rule-oriented brief:
hard constraints, invariants that must not be broken, where each concern lives,
and a pre-flight checklist. Then open only the reference docs relevant to the task.

---

## Folder map

```
docs/
├── README.md                  ← you are here (index + update discipline)
├── AI_GUIDE.md                ← start here if you are an AI agent
├── overview.md                ← product, users, services, glossary
├── getting-started.md         ← local setup (Docker Postgres, seeds, logins, gotchas)
├── architecture.md            ← stack, layout, request lifecycle, core patterns
├── data-model.md              ← every Prisma model, relations, cascades, invariants
├── routes.md                  ← every page / API route / server action + required permission
├── roles-and-permissions.md   ← RBAC catalog, default grants, guardrails, login security
├── development-guide.md       ← conventions + step-by-step recipes for common changes
├── deployment.md              ← Vercel + Supabase pipeline, env vars, cron, rollback
├── operations.md              ← day-2 ops: storage, retention, backups, troubleshooting
├── known-issues.md            ← open bugs, tech debt, pending decisions
├── changelog.md               ← dated history of what shipped
├── features/                  ← one doc per feature (living)
│   ├── README.md
│   ├── _template.md
│   ├── pm-v2.md                       ← Room Condition V2 (current PM)
│   ├── housekeeping.md                ← Housekeeping board (HKT)
│   ├── platform-foundation.md         ← /services catalog, workflows, Daily Cleanliness
│   ├── rbac-and-security.md           ← roles, permissions, lockout, password policy
│   ├── room-condition-inspection.md   ← PM V1 (hidden from portal, code retained)
│   ├── inspection-photos.md           ← PM V1 photo evidence
│   └── pm-item-search.md              ← PM V1 Ctrl+F on the inspect form
├── history/                   ← frozen point-in-time records (do not edit)
│   ├── 2026-09-rbac-release-runbook.md
│   └── 2026-09-housekeeping-qa-status.md
└── superpowers/               ← original design specs + implementation plans (frozen)
    ├── specs/
    └── plans/
```

**Living vs. frozen.** Everything at the top level and under `features/` is
*living* — it must match the code. `history/` and `superpowers/` are *frozen*
snapshots of decisions at the time they were made; they may be out of date and
must not be edited to match new behaviour (update the living doc instead).

---

## Update discipline

Docs are part of the change, not an afterthought. In the **same** change as the code:

| If you… | Update |
|---|---|
| Add/rename/remove a page, API route or server action | [routes.md](routes.md) + the feature doc |
| Change `prisma/schema.prisma` | [data-model.md](data-model.md) (+ [deployment.md](deployment.md) if not purely additive) |
| Add/rename a permission key or change default grants | [roles-and-permissions.md](roles-and-permissions.md) |
| Add an env var, cron, dependency category or hosting change | [architecture.md](architecture.md) + [deployment.md](deployment.md) |
| Ship a new feature | new `features/<name>.md` from `_template.md`, row in `features/README.md`, line in [changelog.md](changelog.md) |
| Change user-visible behaviour of a feature | that feature doc's *Behavior notes* + *Change log* |
| Find / fix a bug or take on debt | [known-issues.md](known-issues.md) |
| Change how AI agents should work on the repo | [AI_GUIDE.md](AI_GUIDE.md) |

Rule of thumb: *does this change user-visible behaviour, the data shape, or who
can do what?* If yes, a doc needs a line. Pure internal refactors don't.

Bump the **Last full review** line above when you re-verify the whole set.
