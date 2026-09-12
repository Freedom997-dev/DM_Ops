# Housekeeping (HKT) — QA Bug Status

Snapshot of every bug/finding raised during the Housekeeping mobile QA, with fix
status. Companion to the visual report:
https://claude.ai/code/artifact/881cde3f-1485-48d0-9dd1-7c7159b73d52

- **Last updated:** 2026-09-11 (Rev 3 — fixes verified)
- **Fixes commit:** `3ce2d0d` on `feature/housekeeping-improvements`
- **Verified on:** local `localhost:3001` (Docker Postgres, filesystem storage driver)

---

## ✅ Fixed / explained (13)

| ID | Severity | Bug | Fix | Verified |
|----|----------|-----|-----|----------|
| **UPLOAD** | 🔴 Critical | **Photos won't upload from mobile.** Upload runs through a Next.js Server Action; Next 14 rejects Server-Action bodies >1 MB by default and `bodySizeLimit` was unset, so real phone photos (2–8 MB) were rejected by the framework with no visible error. | `next.config.mjs` → `experimental.serverActions.bodySizeLimit: "55mb"`. | **Live** — a real 1.93 MB / 4032×3024 JPEG uploaded, stored (`bytes:2023645`), and rendered, signed in as a real housekeeper. |
| **RECURRING** | 🟠 Medium | **Daily-repeat tasks reset at the wrong time.** The reset *function* works (verified live: hitting `/api/cron/housekeeping-daily-reset` reset "Laundry" from Done → TODO/unassigned), but the cron ran at `0 0 * * *` = **midnight UTC ≈ 7–8 PM US-Eastern** — a recurring task would flip back to "To Do" during the evening shift. | Changed `vercel.json` schedule to `0 8 * * *` (08:00 UTC = 3 AM EDT / 4 AM EST — overnight year-round). **Takes effect on next Vercel deploy.** | Reset verified live end-to-end (Bearer auth → job → DB). New UTC hour computed for local overnight. |
| **HYDRATION** | 🔵 Low | Dev-only "Hydration failed… / error while hydrating this Suspense boundary" overlay on the board. **Not an app bug** — the **Grammarly** browser extension injects attributes (`data-gr-ext-installed`, `data-new-gr-c-s-check-loaded`) + a `<grammarly-desktop-integration>` element onto `<body>` before React hydrates. App code on the board render path has no time/window/random and the nav is CSS-responsive (hydration-safe). | Added `suppressHydrationWarning` to `<body>` in `src/app/layout.tsx` (standard mitigation for extension-injected body attributes). | Board reloads with no error overlay. Definitive check: reproduce in Incognito / with Grammarly disabled → gone. Production never showed the overlay (dev-only). |
| **F1** | 🟠 Medium | Checklist not enforced — a room could be submitted with all items still pending, making the checklist advisory. | Server gate in `submitForInspection`: refuse unless every item is `DONE`/`NA`. | **Live** — blocked with pending items; allowed once all resolved. |
| **F2** | 🟠 Medium | "Start cleaning" skippable → `startedAt` null, "Cleaning started" missing from timeline. | `submitForInspection` stamps `startedAt: task.startedAt ?? new Date()`. | Code |
| **F3** | 🟠 Medium | A non-housekeeper (e.g. a Manager) could be assigned cleaning, mismatching the roster/auto-assign. | `assignTasks` rejects anyone not on the HOUSEKEEPER roster. | Code + prior session |
| **F4** | 🔵 Low | Checklist editable on any task in any status (even closed/Ready-to-Rent). | `saveTaskItems` rejects edits unless `READY_TO_CLEAN`/`IN_PROGRESS`/`TODO`. | Code |
| **F5** | 🔵 Low | Missing/expired photos rendered as a broken `<img>` with no fallback. | `onError` fallbacks on thumbnails in `HkTaskPanel` + `PhotoLightbox`. | Code + live (real JPEGs render) |
| **F6** | 🔵 Low | Rejected room kept its old photo → a Ready-to-Clean room still showed "1 photo". | Rejecting a room now deletes the prior submission's photos. | Code + prior session |
| **F7** | 🔵 Low | "Daily Tasks" summary card counted `DONE` tasks, so it never reflected open work. | Count is now `GENERAL && status !== "DONE"`. | Code |
| **F8** | 🔵 Low | Settings tab strip overflowed on mobile; later tabs off-screen, active tab not scrolled into view. | Active tab now `scrollIntoView`s (centered) in the scrollable strip. | Code |
| **F9** | 🔵 Low | No optimistic locking — concurrent transitions (approve/delete/submit) had a TOCTOU window. | Status precondition added to every update `where` clause, so stale transitions no-op. | Code |
| **F10** | 🔵 Low | `bulkReview` had no top-level permission check; unauthorized callers got `{ok:true,count:0}` instead of a clear denial. | Top-level `can(user,"housekeeping:cleaning:review")` added. | Code |
| **F11** | 🔵 Low | 9–10 px tile/badge text strained outdoor mobile legibility. | Smallest labels enlarged. | Code |

---

## ⏳ Pending / open

| ID | Priority | Item | What's needed |
|----|----------|------|---------------|
| **P1** | 🟠 Medium | **Large video upload still fails on Vercel.** Vercel caps serverless request bodies at ~4.5 MB, independent of the Next.js limit — so videos (client allows up to 50 MB) and large multi-photo submits won't reach the function. | Build a **direct-to-Supabase upload**: browser requests a signed upload URL (`createSignedUploadUrl`), PUTs the file straight to Supabase Storage, then records the path via a small action. Bypasses both the 1 MB and 4.5 MB limits. |
| **P2** | 🟢 Low | **Production validation of the upload fix.** It was verified locally with the *filesystem* storage driver. The `bodySizeLimit` fix is framework-level (identical on Vercel), but the real **Supabase upload path** + Vercel body cap haven't been exercised on a deployed build. | Validate photo upload on a **Vercel preview deployment** (real Supabase Storage) before closing this out for production. |
| **P3** | 🟢 Low | **F3 / F6 live verification.** Both are fixed in code and were verified by the prior session, but not click-tested this round (need a MANAGER + INSPECTOR login; only `admin` and `sam` exist locally now). | Create/reset a Manager and Inspector login and live-test assign-rejection (F3) and reject-deletes-photos (F6). |
| **P4** | 🟠 Medium | **`CRON_SECRET` must be set in Vercel** — the reset (and photo-sweep) endpoints return `401` without it, and Vercel only sends the auth header when the env var exists. If unset in production, the nightly reset silently never runs. | Confirm `CRON_SECRET` is set in Vercel → Settings → Environment Variables (Production). Ties into the pending credential rotation. |
| **F12** | 🟢 Low | **Seed hygiene.** Seeded daily tasks aren't flagged `recurring` by the seed script (though the feature itself works when a task *is* flagged — verified via "Laundry"). | Product decision: if seeded daily tasks are meant to repeat, set `recurring: true` in `prisma/seedHousekeeping.ts`. |

---

## 📋 Separately tracked (not part of the HKT module work)

These predate the QA and are operational, not code bugs — listed for completeness:

- **Rotate leaked Supabase / NextAuth credentials** (from the 2026-08-31 env-backup leak) and delete the stale `.env.local.*.bak` files.
- **46 Dependabot vulnerabilities** flagged on GitHub (2 critical, 19 high). Approach: stay on Next 14.2.x, no `--force`, verify on a preview before merging to main.
