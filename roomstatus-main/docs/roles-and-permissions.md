# Roles & permissions

The role union is **`ADMIN | MANAGER | INSPECTOR | HOUSEKEEPER`** (`User.role`, default
`INSPECTOR`). Source of truth: [`src/lib/permissions.ts`](../src/lib/permissions.ts) and
the per-feature helpers in `src/lib/housekeeping.ts`.

## The roles

| Role | Who | Broadly can |
|---|---|---|
| **ADMIN** | Owner / manager | Everything: all services, all settings, checklist, staff, access, audit |
| **MANAGER** | Front-desk / supervisor | Staff + audit + housekeeping management; not PM checklist or room admin |
| **INSPECTOR** | Maintenance inspector | Run PM inspections; review housekeeping |
| **HOUSEKEEPER** | Cleaning staff | Housekeeping tasks (clean, submit, complete) |

## Admin-section matrix (`canAccessAdminSection`)

| Section | ADMIN | MANAGER | INSPECTOR | HOUSEKEEPER |
|---|:--:|:--:|:--:|:--:|
| rooms | ✅ | — | — | — |
| users (staff) | ✅ | ✅ | — | — |
| questions (checklist) | ✅ | — | — | — |
| audit (activity) | ✅ | ✅ | — | — |
| workflows | ✅ | — | — | — |

## Service access

- **Room Condition (PM)** — built-in tile shown to **ADMIN + INSPECTOR**.
- **Housekeeping (HKT)** — shown to **all four roles**; capabilities differ (below).
- **Generic workflows** (Daily Cleanliness, …) — gated per definition via
  `WorkflowDefinition.rolesAllowed` (JSON array), checked by `canRunWorkflow` /
  `requireWorkflowAccess(slug)`.

## Housekeeping capabilities (`src/lib/housekeeping.ts`)

| Capability | Helper | ADMIN | MANAGER | INSPECTOR | HOUSEKEEPER |
|---|---|:--:|:--:|:--:|:--:|
| See the board | `canAccessHousekeeping` | ✅ | ✅ | ✅ | ✅ |
| Check out rooms / create + assign tasks | `canManageHousekeeping` | ✅ | ✅ | — | — |
| Start / submit / complete work | `canSubmitCleaning` | ✅ | ✅ | — | ✅ |
| Approve / reject inspection | `canReviewCleaning` | ✅ | ✅ | ✅ | — |
| Edit settings (status actions, retention) | `canConfigureHousekeeping` | ✅ | — | — | — |

## How it's enforced (defense in depth)

1. **`middleware.ts`** — blocks unauthenticated navigation to `/services|/settings`.
2. **`requireUser()`** — re-checks the session server-side on every protected page render.
3. **`requireManager()` / `requireAdmin()` / `requireWorkflowAccess(slug)`** — role gates
   inside pages and at the top of every mutating server action.

Middleware is the fast first filter; the server-side checks in pages and actions are what
actually enforce access, since a server action can be invoked without passing through
middleware.

## Changing a user's role

Admins/managers manage staff at `/settings/staff` (`src/lib/actions/users.ts`). Role is a
plain string column validated against the `ROLES` enum; there is no separate roles table.
