# Routes reference

Every page and API route in the app. All `/services/*` and `/settings/*` pages require
a signed-in user (enforced by `middleware.ts` + server-side `requireUser()`); most also
re-check role. See [roles-and-permissions.md](roles-and-permissions.md).

## Pages

| Route | Purpose | Access |
|---|---|---|
| `/` | Redirects to `/services` (or `/login` if signed out) | Public |
| `/login` | Credentials sign-in | Public |
| `/services` | Service catalog (role-filtered tiles) | Any signed-in |
| **Room Condition (PM)** | | |
| `/services/pm` | Room status dashboard (filters, repair breakdown, exports) | ADMIN, INSPECTOR |
| `/services/pm/inspect/[roomId]` | Run an inspection (95-item checklist, carry-forward, search) | ADMIN, INSPECTOR |
| `/services/pm/rooms` | Room list + management | ADMIN, INSPECTOR |
| `/services/pm/rooms/[id]` | Room detail + inspection history | ADMIN, INSPECTOR |
| `/services/pm/settings` | PM service settings | ADMIN |
| `/services/pm/settings/checklist` | Edit sections & questions | ADMIN |
| **Housekeeping (HKT)** | | |
| `/services/housekeeping` | Live board: rooms + daily tasks, assignment | ADMIN, MANAGER, INSPECTOR, HOUSEKEEPER |
| `/services/housekeeping/settings` | Status actions, add room, retention | ADMIN |
| **Generic workflows** (Daily Cleanliness, future) | | |
| `/services/[slug]` | Matrix board for that workflow | Per `WorkflowDefinition.rolesAllowed` |
| `/services/[slug]/history` | Past submissions | Per workflow |
| `/services/[slug]/settings` | Workflow definition editor | ADMIN |
| **Global settings** | | |
| `/settings` | Settings home | ADMIN, MANAGER |
| `/settings/staff` | Staff / users management | ADMIN, MANAGER |
| `/settings/access` | Service access (roles per workflow) | ADMIN |
| `/settings/services` | Service catalog management | ADMIN |
| `/settings/activity` | Audit / activity log | ADMIN, MANAGER |

> Route resolution: the static `/services/pm` and `/services/housekeeping` segments win
> over the dynamic `/services/[slug]`, so those two are the built-in services and any
> other slug maps to a generic workflow.

## API routes

| Route | Method | Purpose | Auth |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | NextAuth (session, callbacks, sign-in/out) | Public (NextAuth) |
| `/api/exports/repairs` | GET | Outstanding repairs as `.xlsx` | Signed-in |
| `/api/exports/status-report` | GET | Full room-status report (multi-sheet `.xlsx`) | Signed-in |
| `/api/local-images/[...path]` | GET | Serves dev filesystem-stored photos | Signed-in (dev only) |
| `/api/cron/housekeeping-cleanup` | GET | Daily photo retention sweep | `Bearer CRON_SECRET` |

## Mutations (server actions, not REST)

Data changes go through `"use server"` functions in `src/lib/actions/*`, called directly
from forms/components — there is no REST write layer. One file per domain:
`rooms`, `checklist`, `users`, `inspections`, `photos`, `workflows`, `workflowAdmin`,
`housekeeping`.
