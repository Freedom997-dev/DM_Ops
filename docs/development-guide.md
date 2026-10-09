# Development Guide

Conventions used across the codebase, and step-by-step recipes for the changes
that come up most often. Follow the surrounding code's style — this doc
describes what that style is.

## Workflow

1. Branch from `main` (`feature/<name>`, `fix/<name>`, `chore/<name>`).
2. Run locally on **:3001** ([getting-started.md](getting-started.md)).
3. Make the change + update docs in the same branch.
4. `npx tsc --noEmit` and `npm run build` must pass.
5. Verify in the browser **as each affected role** (Super Admin hides permission bugs).
6. Push → preview build green → merge to `main` (= production).

Commit messages follow Conventional Commits: `feat(scope): …`, `fix(…)`,
`chore(…)`, `docs(…)`. Scopes in use: `pm`, `pmv2`, `housekeeping`, `workflow`,
`rooms`, `services`, `auth`, `deploy`, `seed`, `next16`, `security`.

## Conventions

### Server vs. client
- Pages are **server components** that load data with Prisma and pass plain,
  serializable props (Dates → ISO strings) to client components.
- Client components start with `"use client"` and live in `src/components/`
  (domain subfolder for larger domains, e.g. `components/pmv2/`).
- Never import `@/lib/db`, `@/lib/storage`, `@/lib/session` or `@/lib/*-data.ts`
  from a client component. Client-safe helpers are kept in separate modules
  (`pmv2.ts` vs `pmv2-data.ts`; `hk-view.ts` types).

### Pages
```tsx
export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }: {
  params: Promise<{ id: string }>;                       // Next 16: Promises
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const user = await requirePermission("app:feature:view");
  const { id } = await params;
  // prisma queries…
  return <ClientThing data={…} canEdit={can(user, "app:feature:update")} />;
}
```

### Server actions
```ts
"use server";

type Result = { ok: true } | { ok: false; error: string };

export async function doThing(input: unknown): Promise<Result> {
  const user = await requirePermission("app:feature:update"); // 1. authorize FIRST
  const p = schema.safeParse(input);                          // 2. validate (zod)
  if (!p.success) return { ok: false, error: "Invalid input." };
  // 3. business rules → return { ok:false, error } for expected failures
  // 4. storage upload (if any) BEFORE the transaction
  // 5. prisma write (transaction / optimistic-lock updateMany)
  await logAudit({ userId: user.id, action: "UPDATE", entity: "Thing", entityId: id, details: {…} });
  revalidatePath("/services/thing");                          // 6. refresh affected pages
  return { ok: true };
}
```
- Prefer `requirePermission(key)`; use `requireUser()` + `can()` when you want to
  *return* `"Not allowed."` instead of redirecting (Housekeeping does this).
- Error messages are user-facing sentences ("Enter a room number.").
- Trim and `.slice()` free-text inputs to a max length.

### Client calling an action
Use `useTransition` (or a local `busy` flag), show the result with the toast,
then `router.refresh()` if the page needs new server data:
```tsx
const { show } = useToast();
startTransition(async () => {
  const r = await doThing(payload);
  show(r.ok ? "Saved." : r.error, r.ok ? "success" : "error");
});
```
Forms using `<form action>` use `SubmitButton` (`useFormStatus`) for pending state.

### Styling
Tailwind utilities + shared component classes in `src/app/globals.css`: `card`,
`btn`, `btn-primary`, `btn-secondary`, `btn-danger`, `btn-ghost`, `input`. Brand
colour scale is `brand-*` (`tailwind.config.ts`). Status colours are centralised in
meta tables (`ITEM_STATUS_META`, `HK_STATUS_META`, PM V2 `STATUS_META`) — reuse
them, don't hard-code colours per screen. Mobile-first; touch targets ≥ 40 px.

### Comments
Comments explain **why**, not what — constraints, past bugs, trade-offs. Fixes
from the Housekeeping QA reference their finding id (`(F3)`, `(F6)`) so the
history in [history/2026-09-housekeeping-qa-status.md](history/2026-09-housekeeping-qa-status.md) is traceable.

### Naming
- Actions: verb-first (`checkOutRooms`, `setUserRoles`); PM V2 actions prefixed `pmv2`.
- Status/kind values: `UPPER_SNAKE` strings.
- Prisma models: PascalCase, domain-prefixed (`Housekeeping*`, `PmV2*`, `Workflow*`).

---

## Recipes

### Add a permission
1. Add the action to the feature in `APPS` (`src/lib/rbac/catalog.ts`). Reuse a
   canonical action from `A` or add one.
2. If built-in roles should get it on **fresh** installs, add it to
   `src/lib/rbac/defaults.ts`.
3. Guard the page/action with the new key.
4. Existing databases (production!): the seed won't add it to existing roles by
   itself. To grant it automatically on the next deploy, add it to
   `INTRODUCED_GRANTS` in `defaults.ts` — applied **once**, later removals stick
   ([details](roles-and-permissions.md#introducing-a-permission-to-existing-roles)).
   Otherwise grant it in **Settings → Roles & permissions** after deploy, and say so in the PR.
5. Update [roles-and-permissions.md](roles-and-permissions.md).

### Add a field or model
1. Edit `prisma/schema.prisma` — **additive only** (nullable or `@default`).
2. `npx prisma db push` (with `DATABASE_URL`/`DIRECT_URL` exported) → restart dev server.
3. If audited, add the model name to the `entity` union in `src/lib/audit.ts`.
4. If it carries history, add `archived Boolean @default(false)` rather than
   allowing deletes; snapshot labels into history rows.
5. Update [data-model.md](data-model.md). Production picks it up on the next
   `main` deploy via `db push`.

### Add a page to an existing service
1. Create `src/app/(app)/services/<service>/<page>/page.tsx` (pattern above).
2. Guard with the service's permission; add a nav link (`PmV2Nav`, etc.).
3. Add the row to [routes.md](routes.md).

### Add a new built-in service (new app)
1. Catalog: append an `AppDef` (key, label, icon, features/actions).
2. Defaults: grant to the right built-in roles in `defaults.ts`.
3. Schema: domain-prefixed models + back-relations on `User`/`Room`.
4. Code: `src/lib/<domain>.ts` (client-safe constants), `src/lib/<domain>-data.ts`
   (server loaders), `src/lib/actions/<domain>.ts`, `src/components/<domain>/`.
5. Pages under `src/app/(app)/services/<slug>/` (static segment).
6. Tile: add a `ServiceCard` in `src/app/(app)/services/page.tsx` gated by
   `can(user, "<app>:<feature>:view")`.
7. Docs: `features/<name>.md`, routes, data model, roles, changelog.

### Add a new workflow (matrix) service
No UI exists to create a definition yet. Add an idempotent seed function like
`seedDailyCleanliness` in `prisma/seedWorkflows.ts` (unique `slug`, `shape:
"MATRIX"`, `rolesAllowed` JSON, items) and call it from `prisma/seed.ts` so the
production deploy creates it. Slug must not be `pm`, `pm-v2` or `housekeeping`.
Items/roles can then be edited at `/services/<slug>/settings`.

### Add a file upload
1. Validate type + size server-side (10 MB images / 50 MB video conventions).
2. Build a storage path under a domain prefix; generate ids with `cuid()`.
3. `uploadImage` **before** the DB transaction; on failure `deleteImages(paths)`.
4. Display with `getSignedUrl(path, ttl)` from the server component.
5. If the prefix is new, map it to a permission in
   `src/app/api/local-images/[...path]/route.ts`.
6. Remember production limits: Vercel ~4.5 MB request body; bucket MIME allow-list
   in `scripts/ensure-storage-bucket.ts` (existing buckets aren't updated by it).

### Add a cron job
1. Put the logic in `src/lib/jobs/<name>.ts` — a plain module, **not** `"use server"`.
2. Add `src/app/api/cron/<name>/route.ts` copying the `CRON_SECRET` bearer check,
   `dynamic = "force-dynamic"`, `runtime = "nodejs"`.
3. Add the schedule (UTC) to `vercel.json` `crons`.
4. Document in [operations.md](operations.md) and [deployment.md](deployment.md).

### Add an Excel export
Follow `src/app/api/exports/pm-v2/route.ts`: guard with `requirePermission`, load
via the same server loader the page uses (so numbers match), build with `exceljs`,
return with `Content-Disposition: attachment`.

### Retire PM V1
See the checklist in [features/pm-v2.md](features/pm-v2.md#removing-v1-later).
Back up first; drop tables only in a dedicated, deliberate release.

---

## Testing

There is **no automated test suite** in the repo today (a Playwright login/role
test existed briefly in history, commit `a38b863`, but is not present now).
Verification is: type-check, production build, and manual browser testing per
role. When adding tests, prefer Playwright end-to-end flows per role against the
local Docker DB, and document how to run them here.
