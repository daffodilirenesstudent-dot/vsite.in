# Design: Industry-Grade Restructure for AI-Agent Development

Date: 2026-08-27
Status: Approved for planning
Author: Claude (pair: repo owner)

## Problem

Two distinct problems share one root cause — the repo has no boundary
between "the product" and "everything else that accumulated around it."

**1. Deploy cost.** DigitalOcean App Platform builds from GitHub, so
git-tracked bytes are the deploy payload. Measured at commit `93d77b4`:

| Tracked path | Size | In the product? |
|---|---|---|
| `public/` | 52.65 MB | Partly |
| `print-bridge/` | 48.85 MB | No |
| `src/` | 2.19 MB | **Yes** |
| `food images 3/` | 1.43 MB | No |
| root config files | 0.56 MB | Yes |
| `tests/` | 0.33 MB | Yes (not at runtime) |
| `supabase/` | 0.20 MB | Yes |
| `kot-station-app/` | 0.13 MB | No |
| `scripts/` | 0.08 MB | Yes (not at runtime) |
| **Total** | **106.48 MB** | ~3.4 MB is the app |

97% of every deploy is not the application. Three specific defects:

- `public/bys-print-bridge-setup.exe` (37.88 MB) and
  `print-bridge/dist/bys-print-bridge.exe` (37.88 MB) are **the same
  binary committed twice** — 75.76 MB.
- `print-bridge/node_modules/` is **committed to git** (~11 MB).
- `food images 3/` is listed in `.gitignore` but was committed before
  the rule existed, so the rule is inert.

**2. AI-agent context cost.** An agent opening this repo faces 15
root-level markdown/rules files with no stated precedence
(`GOAL.md`, `PLAN.md`, `PROGRESS.md`, `FAQ.md`, `GEMINI.md`,
`.cursorrules`, `VSITE_CORE_ARCHITECTURE.md`,
`PRINTER-BRIDGE-ARCHITECTURE.md`, and more), and a flat 25-file
`src/lib/` where `qrSignature.ts`, `gstincheck.ts`, and `notify.ts`
sit side by side with no domain grouping.

## Non-Goals

- **Splitting the five oversized files.** `QRMenuTemplate.tsx` (2110),
  `manage/settings/page.tsx` (1701), `manage/orders/page.tsx` (1624),
  `manage/qr/page.tsx` (1228), `manage/product-inventory/page.tsx`
  (1214). Deferred to a separate reviewed pass: moving files and
  rewriting their internals in one diff makes regressions
  un-bisectable.
- **Rewriting git history.** The duplicate `.exe` blobs stay in
  history. Only `HEAD` is cleaned.
- **Fixing the 18 pre-existing test failures.** Recorded as baseline,
  not repaired here.
- **Applying the cron fix.** Spec'd only — it touches live billing and
  email infrastructure, which CLAUDE.md forbids changing without
  explicit instruction.
- **Deleting anything.** Every file moves; nothing is removed.

## Baseline (measured before any change)

Must be byte-identical after the restructure:

- `npx vitest run` → **18 failed | 353 passed | 2 skipped (373)**,
  3 files failing: `tests/api/orderStatus.test.ts` (1),
  `tests/api/routes.test.ts` (11), `tests/unit/middleware.test.ts` (6).
- `npx tsc --noEmit` → **1 error**: TS2802 in
  `tests/load/concurrent-orders.test.ts:214` (downlevelIteration).
- `npm run lint`, `npm run build` → recorded at plan step 0.

These failures are pre-existing and unrelated to this work. The
success criterion is *no change* to this fingerprint, not a green suite.

## Chosen Approach: self-contained `apps/web`, no `packages/`

DigitalOcean App Platform monorepo support works by setting a
**Source Directory**: it clones the whole repo, then builds inside
that subdirectory. An npm-workspaces layout keeps `package.json` and
`package-lock.json` at the repo root, so `npm ci` inside `apps/web`
finds no lockfile and the build fails. Workspaces and App Platform
source-dir builds are mutually exclusive.

Therefore `apps/web` is **self-contained**: it owns its own
`package.json` and `package-lock.json`. No `packages/` directory is
created — the only two candidate consumers (print-bridge,
kot-station-app) are frozen, and a shared-package directory serving
zero live consumers is ceremony that breaks the deploy. It can be
added later if something real needs sharing.

**Rejected — true npm workspaces:** forces DO Source Directory back to
repo root, meaning `npm ci` installs every workspace and the entire
repo becomes build context. That reintroduces the exact cost problem,
and clawing the isolation back needs a Dockerfile on a platform not
being used with Docker.

**Rejected — quarantine only:** fixes deploy cost but leaves the
15-file doc sprawl and flat `src/lib`, so half the stated problem
survives.

## Target Structure

```
vsite/
├── README.md CLAUDE.md AGENTS.md
├── apps/web/                        ← DO Source Directory
│   ├── package.json package-lock.json
│   ├── next.config.mjs tsconfig.json tailwind.config.ts
│   ├── postcss.config.mjs vitest.config.ts playwright.config.ts
│   ├── sentry.server.config.ts sentry.edge.config.ts
│   ├── next-env.d.ts .eslintrc.json
│   ├── src/ public/ tests/ supabase/ scripts/
│   └── .do/app.yaml
├── archive/
│   ├── print-bridge/ kot-station-app/ netlify/
│   ├── design/ design_system/ mockups/ logos/
│   ├── seed-assets/
│   └── docs/
├── docs/adr/
└── delete/
```

### Why `@/*` imports do not change

`tsconfig.json` moves **together with** `src/`, so the alias
`"@/*": ["./src/*"]` resolves identically from the new location. The
same holds for `vitest.config.ts` (`path.resolve(__dirname, './src')`)
and `tailwind.config.ts` content globs. **No app import statement is
rewritten by the folder move.** Import churn comes only from the
`src/lib` domain regrouping, which is separately verifiable.

### `src/lib` domain regrouping

25 flat files → 6 domains. **No `index.ts` barrels** — imports use deep
paths (`@/lib/platform/db/supabase-server`). An earlier draft specified
barrels; that is wrong here. `supabase-server.ts`, `paymentsCrypto.ts`,
and `razorpayOAuth.ts` all carry `import 'server-only'`, and a barrel
that re-exports them is a live hazard: any client component importing
one unrelated symbol from the barrel would pull `server-only` into the
client graph and fail the build by design. Deep paths keep the
server/client boundary greppable and cost nothing.

| Domain | Files |
|---|---|
| `platform/` | `auditLog` `brand` `currency` `dateRange` `fileValidation` `frozenResponse` `htmlEscape` `productFlags` `rateLimit` |
| `platform/db/` | `supabase-server` `supabase` |
| `auth/` | `firebase` `verifyFirebaseToken` `provisionUser` |
| `payments/` | `gstincheck` `server/paymentsCrypto` `server/razorpayOAuth` |
| `menu/` | `defaultImages` `fuzzyMatch` `imageCompress` `menuEngineering` `menuExtractor` `sarvamVision` |
| `orders/` | `qrSignature` |
| `notifications/` | `notify` `orderEmail` `email/planEmails` `email/sendZeptoMail` |

Import-rewrite volume, measured by importer count:
`supabase-server` 60, `verifyFirebaseToken` 45, `productFlags` 29,
`frozenResponse` 19, `supabase` 17, `rateLimit` 13, `firebase` 13,
`orderEmail` 10, `auditLog` 10, remainder ≤5 each. **~250 import
statements across `src/` and `tests/`.** Rewrites are mechanical
(one sed per moved file); `tsc --noEmit` is the completeness check —
any missed path is a compile error, not a silent runtime break.

`src/lib/server/` is retained as `payments/server/` so the
`import 'server-only'` boundary stays explicit and greppable.

## Migration Mechanics

1. **Every move uses `git mv`**, so history follows each file and the
   move is visible as a rename, not add+delete.
2. **`.exe` handling.** `git rm --cached` both copies, `git mv` the
   `print-bridge/dist` copy into `archive/`, add both paths to
   `.gitignore`. The public download link is repointed at Supabase
   Storage; until the binary is uploaded there the link is broken, so
   this is flagged in `PROGRESS.md` as a release blocker.
3. **`print-bridge/node_modules/`** — `git rm -r --cached`, add ignore rule.
4. **`food images 3/`** — `git rm -r --cached`; the folder moves to
   `archive/seed-assets/` alongside the untracked sibling folders.
   Verified safe: all 311 slugs declared across the four seed scripts
   are present in the live `default_images` table (353 rows).
   **Loose end:** `Food images 6/` holds 95 files but seeds 74, and
   `food images 3/` holds 16 but seeds 14 — 23 images were never wired
   into any seed script. Recorded in `PROGRESS.md`, not resolved here.
5. **Seed scripts** move to `apps/web/scripts/`; their
   `path.join(ROOT, 'Food images 6')` constants are repointed at
   `archive/seed-assets/`, keeping re-seeding functional.
6. **`.gitignore`** is rewritten for the new layout. The current
   `docs/` ignore rule is removed — `docs/` holds tracked specs and
   will hold ADRs, so ignoring it is wrong and currently forces
   `git add -f`.

## Documentation Consolidation

`CLAUDE.md` becomes the single authoritative index and gains a
"Repository Map" section stating what lives where and which docs are
authoritative. Disposition of the other 14:

- **Stay at root:** `README.md`, `AGENTS.md`.
- **To `docs/`:** `GOAL.md`, `PLAN.md`, `PROGRESS.md` — active
  workflow files that the CLAUDE.md feature workflow references.
- **To `docs/adr/`:** `VSITE_CORE_ARCHITECTURE.md`,
  `PRINTER-BRIDGE-ARCHITECTURE.md`, `vsite_menu_engineering_algo.md`,
  reframed as decision records.
- **To `archive/docs/`:** `FAQ.md`, `GEMINI.md`, `.cursorrules`,
  `Vsite_SEO_GEO_AEO_Strategy_2026.md`, `home.html`,
  `src/components/home/HOMEPAGE_CONTENT.md`.

`.cursorrules` and `GEMINI.md` are archived rather than kept because
three competing agent-rules files with no precedence order is the
documented failure mode being fixed. `AGENTS.md` survives as the
cross-tool standard.

## Cron Restoration (spec only, not applied)

`vercel.json` declares three crons and `netlify.toml` declares a
scheduled function. **DigitalOcean App Platform reads neither**, so on
DO these have never fired: `process-emails` (every minute),
`cleanup` (every 5 min), `expiry-reminder` (daily 03:30 UTC).

`apps/web/.do/app.yaml` will declare them as DO Scheduled Jobs calling
the existing `/api/cron/*` routes with a `Bearer $CRON_SECRET` header.
No route code changes: those handlers are already transport-agnostic
by design (documented in `netlify/functions/expiry-reminder.mts`).

**Owner confirmed: DigitalOcean is the only deploy target.** Vercel and
Netlify are both fully retired. Therefore `vercel.json`,
`netlify.toml`, and `netlify/` all move to `archive/`.

Related dead config: `next.config.mjs` passes
`automaticVercelMonitors: true` to `withSentryConfig`. That option only
does anything on Vercel, so it is set to `false` as part of this work —
a one-line change in a file that is moving anyway, with no runtime
effect off-Vercel.

This section ships as a written spec and an unapplied `app.yaml` for
the owner to review and deploy. The `app.yaml` is **not** applied here.

## Verification

Run before and after; the two fingerprints must match:

1. `npx tsc --noEmit` — expect the same single TS2802 error.
2. `npx vitest run` — expect 18 failed / 353 passed / 2 skipped, same
   3 files.
3. `npm run lint` — expect no new findings.
4. `npm run build` — must succeed.
5. **Move audit:** `git status --porcelain` shows only renames (`R`),
   cached-removals, and the new config/doc files. Zero unexplained
   deletions.
6. **File-count conservation:** total file count under
   `apps/web/ + archive/ + docs/ + delete/` >= pre-move count.
7. **Deploy-payload check:** `git ls-tree -r -l HEAD -- apps/web`
   totals under 15 MB (from 106.48 MB).

Playwright E2E is excluded from the gate: it needs a running dev
server and its baseline is unestablished.

## Risks

| Risk | Mitigation |
|---|---|
| Missed import after `src/lib` regroup | `tsc --noEmit` is exhaustive; runs after every domain |
| Windows case-only renames (`Food images 6`) | Move to a differently-named archive path, never a case-only rename |
| DO Source Directory not set → build fails at root | Owner sets it in the DO console before the next deploy; called out in PROGRESS.md as a deploy blocker |
| Print-bridge download link breaks | Flagged as release blocker; owner uploads binary to Supabase |
| Sentry source-map paths shift | `next.config.mjs` moves with the app; verified by `npm run build` |
