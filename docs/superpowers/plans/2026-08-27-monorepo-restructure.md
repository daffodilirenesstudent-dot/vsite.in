# Monorepo Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Next.js application into a self-contained `apps/web/` that is the sole DigitalOcean build target, archive every non-product folder without deleting anything, and regroup `src/lib` into domain folders — cutting the deploy payload from 106.48 MB to under 15 MB.

**Architecture:** `apps/web/` owns its own `package.json` and `package-lock.json` so DigitalOcean App Platform can set Source Directory = `apps/web` and build in isolation. No npm workspaces and no `packages/` directory — both break App Platform source-dir builds. Everything non-product moves to `archive/`, which stays in git but is never build context.

**Tech Stack:** Next.js 14.2.35 (App Router), React 18, TypeScript 5 strict, Tailwind 3.4, Supabase, Vitest, Playwright, Sentry, npm.

**Spec:** `docs/superpowers/specs/2026-08-27-monorepo-restructure-design.md`

## Global Constraints

- **Nothing is deleted.** Every file is moved with `git mv` (tracked) or `mv` (untracked). Deletion is out of scope entirely.
- **Baseline fingerprint must not change.** `npx vitest run` → **18 failed | 353 passed | 2 skipped (373)** across exactly 3 files: `tests/api/orderStatus.test.ts` (1), `tests/api/routes.test.ts` (11), `tests/unit/middleware.test.ts` (6). `npx tsc --noEmit` → exactly **1 error**, TS2802 at `tests/load/concurrent-orders.test.ts:214`. These are pre-existing; do NOT fix them in this plan.
- **Do not modify test files** to make anything pass (CLAUDE.md hard rule). The only permitted edits to `tests/` are import-path rewrites in Task 6.
- **Do not touch** `/migrations`, `.env*` contents, or auth/billing logic. Moving those files is allowed; editing their contents is not.
- **No `packages/` directory.** No npm workspaces.
- **No `index.ts` barrels** in `src/lib`. Deep import paths only — barrels would leak `server-only` modules into the client graph.
- **Do not apply** `apps/web/.do/app.yaml`. It ships as an unapplied artifact for the owner.
- **No `console.log`** in committed code. TypeScript strict, no `any`.
- Run `npx vitest run && npm run lint` before every commit (CLAUDE.md).

---

### Task 1: Safety branch and recorded baseline

**Files:**
- Create: `docs/superpowers/baseline-2026-08-27.txt`

**Interfaces:**
- Produces: `docs/superpowers/baseline-2026-08-27.txt`, the file every later task diffs against.

- [ ] **Step 1: Create the working branch**

Never do this on `master`.

```bash
git checkout -b chore/monorepo-restructure
git status --porcelain | wc -l
```

Expected: a non-zero count — the tree already has ~40 modified files. Leave them uncommitted and untouched; they are the owner's in-flight work and are not part of this plan.

- [ ] **Step 2: Record the build and lint baseline**

```bash
{
  echo "=== BASELINE 2026-08-27 commit $(git rev-parse --short HEAD) ==="
  echo "--- tsc ---";   npx tsc --noEmit 2>&1
  echo "--- vitest ---"; npx vitest run 2>&1 | grep -E "Test Files|Tests "
  echo "--- lint ---";  npm run lint 2>&1 | tail -30
  echo "--- build ---"; npm run build 2>&1 | tail -30
  echo "--- tracked size ---"
  git ls-tree -r -l HEAD | awk '{t+=$4} END{printf "%.2f MB total\n", t/1048576}'
} > docs/superpowers/baseline-2026-08-27.txt 2>&1
cat docs/superpowers/baseline-2026-08-27.txt
```

Expected in the file: exactly one TS2802 error; `Tests  18 failed | 353 passed | 2 skipped (373)`; `Test Files  3 failed | 10 passed (13)`; a successful build; `106.48 MB total`.

- [ ] **Step 3: Stop if the baseline does not match**

If vitest reports anything other than 18 failed / 353 passed / 2 skipped, STOP and report to the owner. The whole verification strategy depends on this fingerprint being stable.

- [ ] **Step 4: Commit the baseline**

`docs/` is currently in `.gitignore`, so `-f` is required until Task 5 fixes that.

```bash
git add -f docs/superpowers/baseline-2026-08-27.txt docs/superpowers/specs/2026-08-27-monorepo-restructure-design.md docs/superpowers/plans/2026-08-27-monorepo-restructure.md
git commit -m "docs(restructure): record pre-restructure baseline, spec and plan"
```

---

### Task 2: Untrack the duplicated binaries and committed node_modules

Do this BEFORE any move, so the 76 MB of blobs never travels through a rename.

**Files:**
- Modify: `.gitignore`
- Untrack: `public/bys-print-bridge-setup.exe`, `print-bridge/dist/bys-print-bridge.exe`, `print-bridge/node_modules/**`, `food images 3/**`

**Interfaces:**
- Consumes: the branch from Task 1.
- Produces: a HEAD whose `apps/web` payload can reach the <15 MB target in Task 9.

- [ ] **Step 1: Confirm the two .exe files are byte-identical**

```bash
md5sum "public/bys-print-bridge-setup.exe" "print-bridge/dist/bys-print-bridge.exe"
```

Expected: two identical hashes. If they differ, STOP and report — they are different builds and only the `public/` one is user-facing.

- [ ] **Step 2: Untrack the blobs, keeping the files on disk**

`--cached` removes from the index only. The files stay in the working tree.

```bash
git rm --cached -q "public/bys-print-bridge-setup.exe"
git rm --cached -q "print-bridge/dist/bys-print-bridge.exe"
git rm -r --cached -q "print-bridge/node_modules"
git rm -r --cached -q "food images 3"
```

- [ ] **Step 3: Verify the files still exist on disk**

```bash
ls -la "public/bys-print-bridge-setup.exe" "print-bridge/dist/bys-print-bridge.exe" && ls "food images 3" | wc -l
```

Expected: both `.exe` files listed at ~37.88 MB, and `16` files in `food images 3`. If any are gone, `git checkout` them back immediately — `--cached` should never remove from disk.

- [ ] **Step 4: Add ignore rules**

```bash
cat >> .gitignore <<'EOF'

# Large binaries — distributed via Supabase Storage, never committed
*.exe
print-bridge/node_modules/
EOF
```

- [ ] **Step 5: Verify the payload dropped**

```bash
git add -A .gitignore
git ls-files | wc -l
```

Expected: file count drops by roughly 1,300 (the `print-bridge/node_modules` tree plus the 16 seed images plus 2 binaries).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(repo): untrack duplicated print-bridge binaries and committed node_modules"
```

---

### Task 3: Create archive/ and move every non-product folder

**Files:**
- Create: `archive/README.md`
- Move: `print-bridge/`, `kot-station-app/`, `netlify/`, `netlify.toml`, `vercel.json`, `design/`, `design_system/`, `Mobile kiosk  UI desgin/`, `vsite logos/`, all `food image*` folders

**Interfaces:**
- Consumes: untracked blobs from Task 2.
- Produces: `archive/` containing every frozen sub-app and design asset.

- [ ] **Step 1: Create the archive directories**

```bash
mkdir -p archive/seed-assets archive/docs
```

- [ ] **Step 2: Move the tracked frozen sub-apps with git mv**

`git mv` preserves history as a rename. Vercel and Netlify are both fully retired — owner confirmed DigitalOcean is the only target.

```bash
git mv print-bridge archive/print-bridge
git mv kot-station-app archive/kot-station-app
git mv netlify archive/netlify
git mv netlify.toml archive/netlify.toml
git mv vercel.json archive/vercel.json
```

- [ ] **Step 3: Move the untracked design and asset folders with plain mv**

These are gitignored or untracked, so `git mv` would fail. Note the two-space typo in `Mobile kiosk  UI desgin` is intentional — match it exactly.

```bash
mv "design" archive/design
mv "design_system" archive/design-system
mv "Mobile kiosk  UI desgin" archive/mockups
mv "vsite logos" archive/logos
mv "Food images 6" archive/seed-assets/food-images-6
mv "food image 5" archive/seed-assets/food-images-5
mv "food images 4" archive/seed-assets/food-images-4
mv "food images 3" archive/seed-assets/food-images-3
mv "food images" archive/seed-assets/food-images-1
```

Renaming to lowercase-hyphenated targets sidesteps the Windows case-insensitivity hazard: these are moves into a new parent, never case-only renames in place.

- [ ] **Step 4: Verify nothing was lost**

```bash
ls archive/ archive/seed-assets/
find archive/seed-assets -type f | wc -l
```

Expected: `archive/` lists 11 entries. Seed-asset file count should be `16+57+166+95+<food-images-1 count>` — at minimum 334 files.

- [ ] **Step 5: Write the archive README**

```bash
cat > archive/README.md <<'EOF'
# archive/

Frozen products and non-code assets. **Tracked in git, never built.**

DigitalOcean App Platform builds only `apps/web/` (Source Directory =
`apps/web`), so nothing here is deploy context or affects build cost.

| Path | What | Status |
|---|---|---|
| `print-bridge/` | Windows thermal-printer bridge (Node + NSIS installer) | Frozen |
| `kot-station-app/` | Android KOT station (Gradle) | Frozen |
| `netlify/`, `netlify.toml` | Netlify functions + config | Retired — DigitalOcean only |
| `vercel.json` | Vercel cron declarations | Retired — DigitalOcean only |
| `design/`, `design-system/`, `mockups/`, `logos/` | Design source files | Reference |
| `seed-assets/` | Source images for `scripts/seed-food-images-*.mjs` | Already uploaded to Supabase |
| `docs/` | Superseded documentation | Reference |

## seed-assets

All 311 slugs declared across the four seed scripts are already present
in the live `default_images` table (353 rows, bucket `default-images`).
These local folders are the upload source, kept for re-seeding.

**Known gap:** `food-images-6/` holds 95 files but only 74 are wired
into a seed script; `food-images-3/` holds 16 with 14 wired. 23 images
have never been seeded.

## Binaries

`*.exe` is gitignored. `print-bridge/dist/bys-print-bridge.exe` exists
on disk but is not tracked. Distribute it via Supabase Storage.
EOF
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(repo): move frozen sub-apps and design assets into archive/"
```

---

### Task 4: Move the application into apps/web

The highest-risk task. `tsconfig.json` must travel **with** `src/` so the `@/*` alias keeps resolving.

**Files:**
- Move into `apps/web/`: `src/`, `public/`, `tests/`, `supabase/`, `scripts/`, and all build configs
- Modify: `package.json` (scripts unchanged; this is a location move)

**Interfaces:**
- Consumes: the cleaned root from Task 3.
- Produces: `apps/web/` as a self-contained buildable Next.js app.

- [ ] **Step 1: Create the app directory**

```bash
mkdir -p apps/web
```

- [ ] **Step 2: Move the tracked source and asset trees**

```bash
git mv src apps/web/src
git mv public apps/web/public
git mv tests apps/web/tests
git mv supabase apps/web/supabase
git mv scripts apps/web/scripts
```

- [ ] **Step 3: Move every tracked build config**

All of these are path-relative to the app root, so they must move together.

```bash
git mv package.json apps/web/package.json
git mv package-lock.json apps/web/package-lock.json
git mv next.config.mjs apps/web/next.config.mjs
git mv tsconfig.json apps/web/tsconfig.json
git mv tailwind.config.ts apps/web/tailwind.config.ts
git mv postcss.config.mjs apps/web/postcss.config.mjs
git mv vitest.config.ts apps/web/vitest.config.ts
git mv playwright.config.ts apps/web/playwright.config.ts
git mv sentry.server.config.ts apps/web/sentry.server.config.ts
git mv sentry.edge.config.ts apps/web/sentry.edge.config.ts
git mv .eslintrc.json apps/web/.eslintrc.json
git mv .env.example apps/web/.env.example
```

- [ ] **Step 4: Move the untracked local files**

`.env.local` holds live secrets and is gitignored — move it, never commit it. `next-env.d.ts` is gitignored but required by Next.

```bash
mv .env.local apps/web/.env.local
mv next-env.d.ts apps/web/next-env.d.ts
mv .firebaserc apps/web/.firebaserc 2>/dev/null || true
```

- [ ] **Step 5: Move node_modules to avoid a full reinstall**

Dependencies are unchanged, so relocating the tree is faster than `npm ci`. Windows `.bin` shims use relative paths, so this normally works.

```bash
mv node_modules apps/web/node_modules
```

- [ ] **Step 6: Verify the toolchain still resolves**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | tail -5
```

Expected: exactly one TS2802 error at `tests/load/concurrent-orders.test.ts:214` — identical to baseline. If instead you see "cannot find module" errors, the moved `node_modules` is broken: `rm -rf node_modules && npm ci` and re-run.

- [ ] **Step 7: Verify tests match baseline exactly**

```bash
cd apps/web && npx vitest run 2>&1 | grep -E "Test Files|Tests "
```

Expected: `Tests  18 failed | 353 passed | 2 skipped (373)` and `Test Files  3 failed | 10 passed (13)`. Any deviation means the move broke something — STOP and diagnose before continuing.

- [ ] **Step 8: Verify the production build**

```bash
cd apps/web && npm run build 2>&1 | tail -20
```

Expected: build succeeds. This is the real proof that Next.js, Tailwind content globs, and Sentry all resolve from the new root.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(repo): move Next.js app into apps/web as a self-contained package"
```

---

### Task 5: Consolidate documentation and rewrite .gitignore

**Files:**
- Create: `docs/adr/`, root `README.md` section
- Modify: `CLAUDE.md` (add Repository Map), `.gitignore` (full rewrite)
- Move: 12 root docs to `docs/`, `docs/adr/`, or `archive/docs/`

**Interfaces:**
- Consumes: `apps/web/` from Task 4.
- Produces: a root holding exactly 3 markdown files.

- [ ] **Step 1: Move active workflow docs into docs/**

```bash
mkdir -p docs/adr
git mv GOAL.md docs/GOAL.md
git mv PLAN.md docs/PLAN.md
git mv PROGRESS.md docs/PROGRESS.md
```

- [ ] **Step 2: Move architecture docs into docs/adr/**

```bash
git mv VSITE_CORE_ARCHITECTURE.md docs/adr/0001-core-architecture.md 2>/dev/null || mv VSITE_CORE_ARCHITECTURE.md docs/adr/0001-core-architecture.md
git mv PRINTER-BRIDGE-ARCHITECTURE.md docs/adr/0002-printer-bridge.md
git mv vsite_menu_engineering_algo.md docs/adr/0003-menu-engineering-algorithm.md
```

`VSITE_CORE_ARCHITECTURE.md` is untracked, hence the `||` fallback.

- [ ] **Step 3: Archive superseded and competing docs**

`.cursorrules` and `GEMINI.md` are archived because three competing agent-rules files with no precedence order is the exact failure mode this restructure fixes. `AGENTS.md` stays as the cross-tool standard.

```bash
git mv FAQ.md archive/docs/FAQ.md
git mv GEMINI.md archive/docs/GEMINI.md
git mv .cursorrules archive/docs/cursorrules.md
git mv home.html archive/docs/home.html
mv Vsite_SEO_GEO_AEO_Strategy_2026.md archive/docs/ 2>/dev/null || true
git mv apps/web/src/components/home/HOMEPAGE_CONTENT.md archive/docs/HOMEPAGE_CONTENT.md
```

- [ ] **Step 4: Move stray logs and scratch files to delete/**

```bash
mkdir -p delete/stray-root-files
mv devserver.log prodserver.log .devport .mcp.json.bak tsconfig.tsbuildinfo delete/stray-root-files/ 2>/dev/null || true
mv test-results delete/stray-root-files/test-results 2>/dev/null || true
```

- [ ] **Step 5: Verify exactly 3 markdown files remain at root**

```bash
ls *.md
```

Expected exactly: `AGENTS.md`, `CLAUDE.md`, `README.md`.

- [ ] **Step 6: Rewrite .gitignore for the new layout**

Critically, the old `docs/` rule is dropped — `docs/` holds tracked specs and ADRs, and ignoring it forced `git add -f`.

```bash
cat > .gitignore <<'EOF'
# dependencies
node_modules/
.pnp
.pnp.js
.yarn/install-state.gz

# next.js
.next/
out/
build/
next-env.d.ts
*.tsbuildinfo

# env — never commit secrets
.env
.env.local
.env*.local

# testing
coverage/
test-results/
playwright-report/

# large binaries — distributed via Supabase Storage
*.exe

# seed image sources (already uploaded to Supabase Storage)
archive/seed-assets/

# design binaries
archive/design/
archive/design-system/
archive/mockups/
archive/logos/

# agent tooling
.claude/
.mcp.json
.code-review-graph/
.superpowers/

# staged for manual deletion
delete/

# misc
.DS_Store
*.pem
*.log
.vercel
.firebaserc
EOF
```

- [ ] **Step 7: Add the Repository Map to CLAUDE.md**

Insert immediately after the `# vsite.in — Claude Context` heading.

```markdown
## Repository Map (read this first)

**The application is `apps/web/`. Run every command from there.**

| Path | What | Build context? |
|---|---|---|
| `apps/web/` | The Next.js app — the ONLY thing DigitalOcean builds | **Yes** |
| `apps/web/src/` | Application source; `@/*` resolves here | Yes |
| `apps/web/tests/` | Vitest + Playwright suites | Yes |
| `apps/web/supabase/` | SQL migrations — do not edit without instruction | Yes |
| `apps/web/.do/app.yaml` | DigitalOcean app spec incl. cron jobs | Config |
| `archive/` | Frozen sub-apps and design assets — never built | No |
| `docs/` | GOAL, PLAN, PROGRESS, specs, plans | No |
| `docs/adr/` | Architecture decision records | No |
| `delete/` | Staged for manual deletion | No |

**Doc precedence:** `CLAUDE.md` (this file) is authoritative.
`AGENTS.md` holds cross-tool gotchas. `docs/GOAL.md`,
`docs/PLAN.md`, `docs/PROGRESS.md` drive the feature workflow.
Anything in `archive/docs/` is superseded — do not act on it.

**Deployment:** DigitalOcean App Platform, Source Directory = `apps/web`.
Vercel and Netlify are retired; their configs are in `archive/`.
```

- [ ] **Step 8: Verify and commit**

```bash
cd apps/web && npx vitest run 2>&1 | grep -E "Tests " && npm run lint 2>&1 | tail -5
cd .. && cd .. && git add -A
git commit -m "docs(repo): consolidate 15 root docs into CLAUDE.md index, docs/ and archive/"
```

Expected: unchanged `Tests  18 failed | 353 passed | 2 skipped (373)`.

---

### Task 6: Regroup src/lib into domain folders

Highest import churn: ~250 statements. Do one domain at a time and run `tsc` after each — it catches every missed path as a compile error.

**Files:**
- Move: 25 files under `apps/web/src/lib/`
- Modify: every importer across `apps/web/src/` and `apps/web/tests/`

**Interfaces:**
- Consumes: `apps/web/` from Task 4.
- Produces: `@/lib/{platform,platform/db,auth,payments,menu,orders,notifications}/*`. No barrels — deep paths only, so `server-only` modules never leak into the client graph.

- [ ] **Step 1: Create domain directories**

```bash
cd apps/web/src/lib && mkdir -p platform/db auth payments/server menu orders notifications/email
```

- [ ] **Step 2: Write the reusable move-and-rewrite helper**

One function, used for every file below. `git mv` moves it; `sed` rewrites every importer; the `\b` guard stops `supabase` from also matching `supabase-server`.

```bash
cat > /tmp/relib.sh <<'EOF'
#!/usr/bin/env bash
# relib <old-relative-path> <new-relative-path>   (both relative to src/lib)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)/apps/web"
old="$1"; new="$2"
git mv "src/lib/$old.ts" "src/lib/$new.ts"
grep -rl "@/lib/$old['\"]" --include=*.ts --include=*.tsx src tests 2>/dev/null \
  | xargs -r sed -i "s#@/lib/$old\(['\"]\)#@/lib/$new\1#g"
echo "moved $old -> $new"
EOF
chmod +x /tmp/relib.sh
```

- [ ] **Step 3: Move the platform domain (cross-cutting primitives)**

```bash
for f in auditLog brand currency dateRange fileValidation frozenResponse htmlEscape productFlags rateLimit; do
  /tmp/relib.sh "$f" "platform/$f"
done
/tmp/relib.sh supabase-server platform/db/supabase-server
/tmp/relib.sh supabase        platform/db/supabase
```

- [ ] **Step 4: Verify platform compiles**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | tail -10
```

Expected: still exactly one TS2802 error. Any `TS2307 Cannot find module '@/lib/...'` means a missed rewrite — fix that path and re-run before continuing.

- [ ] **Step 5: Move the remaining domains**

```bash
/tmp/relib.sh firebase            auth/firebase
/tmp/relib.sh verifyFirebaseToken auth/verifyFirebaseToken
/tmp/relib.sh provisionUser       auth/provisionUser

/tmp/relib.sh gstincheck            payments/gstincheck
/tmp/relib.sh server/paymentsCrypto payments/server/paymentsCrypto
/tmp/relib.sh server/razorpayOAuth  payments/server/razorpayOAuth

for f in defaultImages fuzzyMatch imageCompress menuEngineering menuExtractor sarvamVision; do
  /tmp/relib.sh "$f" "menu/$f"
done

/tmp/relib.sh qrSignature orders/qrSignature

/tmp/relib.sh notify              notifications/notify
/tmp/relib.sh orderEmail          notifications/orderEmail
/tmp/relib.sh email/planEmails    notifications/email/planEmails
/tmp/relib.sh email/sendZeptoMail notifications/email/sendZeptoMail
```

- [ ] **Step 6: Clean up the now-empty legacy directories**

```bash
cd apps/web && rmdir src/lib/server src/lib/email 2>/dev/null || true
ls src/lib/
```

Expected exactly: `auth  menu  notifications  orders  payments  platform`. Any leftover `.ts` file at this level is a file the plan missed — report it.

- [ ] **Step 7: Catch relative-path imports the sed missed**

Files that imported siblings via `./` rather than `@/lib/` will now be wrong.

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -c "TS2307" || echo "0 module-resolution errors"
```

Expected: `0 module-resolution errors`. If not, fix each reported path.

- [ ] **Step 8: Verify the full fingerprint**

```bash
cd apps/web && npx vitest run 2>&1 | grep -E "Test Files|Tests " && npm run lint 2>&1 | tail -5 && npm run build 2>&1 | tail -10
```

Expected: `Tests  18 failed | 353 passed | 2 skipped (373)`, same 3 files, no new lint findings, successful build.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(lib): regroup 25 flat lib files into 6 domain folders"
```

---

### Task 7: Repoint the seed scripts at archive/seed-assets

**Files:**
- Modify: `apps/web/scripts/seed-food-images-3.mjs:21`, `-4.mjs:21`, `-5.mjs:21`, `-6.mjs`

**Interfaces:**
- Consumes: `archive/seed-assets/` from Task 3.
- Produces: seed scripts that still resolve their image folders from the new app root.

- [ ] **Step 1: Understand the path change**

Each script does `const ROOT = path.join(__dirname, '..')`. From `apps/web/scripts/`, `ROOT` is now `apps/web/`, but the images live at `<repo>/archive/seed-assets/`. Both the `ROOT` base and the folder name must change.

- [ ] **Step 2: Repoint ROOT to the repository root**

```bash
cd apps/web/scripts
sed -i "s#const ROOT = path.join(__dirname, '..');#const ROOT = path.join(__dirname, '..', '..', '..');#" seed-food-images-*.mjs
```

- [ ] **Step 3: Repoint each FOLDER constant**

```bash
sed -i "s#path.join(ROOT, 'food images 3')#path.join(ROOT, 'archive', 'seed-assets', 'food-images-3')#" seed-food-images-3.mjs
sed -i "s#path.join(ROOT, 'food images 4')#path.join(ROOT, 'archive', 'seed-assets', 'food-images-4')#" seed-food-images-4.mjs
sed -i "s#path.join(ROOT, 'food image 5')#path.join(ROOT, 'archive', 'seed-assets', 'food-images-5')#"  seed-food-images-5.mjs
sed -i "s#path.join(ROOT, 'Food images 6')#path.join(ROOT, 'archive', 'seed-assets', 'food-images-6')#" seed-food-images-6.mjs
```

- [ ] **Step 4: Verify every path resolves without uploading anything**

This checks the folders exist. It does NOT run the seeders — they would re-upload to live Supabase and burn OpenAI credits.

```bash
cd apps/web/scripts
for n in 3 4 5 6; do
  node -e "
    const p=require('path'), fs=require('fs');
    const ROOT=p.join(process.cwd(),'..','..','..');
    const dirs={3:'food-images-3',4:'food-images-4',5:'food-images-5',6:'food-images-6'};
    const d=p.join(ROOT,'archive','seed-assets',dirs[$n]);
    console.log('$n', fs.existsSync(d)?'OK '+fs.readdirSync(d).length+' files':'MISSING '+d);
  "
done
```

Expected: `3 OK 16 files`, `4 OK 57 files`, `5 OK 166 files`, `6 OK 95 files`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(scripts): repoint seed scripts at archive/seed-assets"
```

---

### Task 8: Write the DigitalOcean app spec and fix the print-bridge link

The `app.yaml` is written but **NOT applied** — it declares cron jobs against live billing and email infrastructure, which CLAUDE.md forbids changing without explicit instruction.

**Files:**
- Create: `apps/web/.do/app.yaml`, `apps/web/.do/README.md`
- Modify: `apps/web/next.config.mjs` (disable `automaticVercelMonitors`), `apps/web/src/app/manage/settings/page.tsx:1037`

**Interfaces:**
- Consumes: `apps/web/` from Task 4.
- Produces: an unapplied DO app spec restoring the three dead crons.

- [ ] **Step 1: Disable the dead Vercel-only Sentry option**

`automaticVercelMonitors` only does anything on Vercel, which is retired.

```bash
cd apps/web && sed -i 's/automaticVercelMonitors: true,/automaticVercelMonitors: false,/' next.config.mjs
grep -n "automaticVercelMonitors" next.config.mjs
```

Expected: `automaticVercelMonitors: false,`.

- [ ] **Step 2: Write the DO app spec**

```bash
mkdir -p apps/web/.do && cat > apps/web/.do/app.yaml <<'EOF'
# DigitalOcean App Platform spec for vsite.in
#
# NOT APPLIED. Review before running:
#   doctl apps update <APP_ID> --spec apps/web/.do/app.yaml
#
# In the DO console, Source Directory MUST be set to `apps/web`.
# Without it the build runs at the repo root, finds no package.json,
# and fails.
name: vsite-web
region: blr

services:
  - name: web
    source_dir: apps/web
    github:
      repo: daffodilirenesstudent-dot/vsite.in
      branch: master
      deploy_on_push: true
    build_command: npm ci && npm run build
    run_command: npm run start
    http_port: 3000
    instance_count: 1
    instance_size_slug: basic-xxs
    routes:
      - path: /

# The three crons below were declared in vercel.json and netlify.toml.
# DigitalOcean App Platform reads NEITHER file, so on DO they have never
# fired. Each job calls the existing /api/cron/* route, which already
# authenticates with Bearer CRON_SECRET and is transport-agnostic by
# design — no route code changes are needed.
jobs:
  - name: cron-process-emails
    kind: PRE_DEPLOY
    source_dir: apps/web
    github:
      repo: daffodilirenesstudent-dot/vsite.in
      branch: master
    run_command: >-
      curl -fsS -X POST -H "authorization: Bearer $CRON_SECRET"
      "$NEXT_PUBLIC_BASE_URL/api/cron/process-emails"
    instance_size_slug: basic-xxs

  - name: cron-cleanup
    kind: PRE_DEPLOY
    source_dir: apps/web
    github:
      repo: daffodilirenesstudent-dot/vsite.in
      branch: master
    run_command: >-
      curl -fsS -X POST -H "authorization: Bearer $CRON_SECRET"
      "$NEXT_PUBLIC_BASE_URL/api/cron/cleanup"
    instance_size_slug: basic-xxs

  - name: cron-expiry-reminder
    kind: PRE_DEPLOY
    source_dir: apps/web
    github:
      repo: daffodilirenesstudent-dot/vsite.in
      branch: master
    run_command: >-
      curl -fsS -X POST -H "authorization: Bearer $CRON_SECRET"
      "$NEXT_PUBLIC_BASE_URL/api/cron/expiry-reminder"
    instance_size_slug: basic-xxs
EOF
```

- [ ] **Step 3: Document the cron caveat honestly**

App Platform `jobs` run on deploy, not on a wall-clock schedule. This is a real limitation the owner must decide on.

```bash
cat > apps/web/.do/README.md <<'EOF'
# DigitalOcean deployment

## Required console setting

**Source Directory = `apps/web`.** Without it the build runs at the repo
root, finds no `package.json`, and fails.

## The cron problem — READ THIS

`vercel.json` and `netlify.toml` declared three scheduled tasks.
**DigitalOcean App Platform reads neither file.** On DO these have
never run:

| Job | Intended schedule | Route |
|---|---|---|
| process-emails | every minute | `/api/cron/process-emails` |
| cleanup | every 5 minutes | `/api/cron/cleanup` |
| expiry-reminder | daily 03:30 UTC | `/api/cron/expiry-reminder` |

Outbound email and plan-expiry reminders are affected.

**App Platform `jobs` run on deploy events, not on a wall-clock
schedule** — so `app.yaml` alone does NOT fully restore this. Pick one:

1. **DigitalOcean Functions** with a scheduled trigger (closest to
   Vercel Cron; needs a separate Functions namespace).
2. **An external cron service** (cron-job.org, EasyCron) POSTing to
   each route with the `CRON_SECRET` bearer token. Fastest to restore.
3. **A dedicated Worker component** running a scheduler process.

The routes already authenticate via `Bearer $CRON_SECRET` and are
transport-agnostic, so any of the three works without code changes.

## Not applied

`app.yaml` is a reviewed artifact, not live config. Applying it touches
live billing and email infrastructure. Apply deliberately:

```
doctl apps update <APP_ID> --spec apps/web/.do/app.yaml
```
EOF
```

- [ ] **Step 4: Repoint the print-bridge download link**

The 37.88 MB `.exe` is no longer tracked, so `/bys-print-bridge-setup.exe` will 404 after deploy. Read the current line first.

```bash
cd apps/web && sed -n '1030,1045p' src/app/manage/settings/page.tsx
```

- [ ] **Step 5: Point it at Supabase Storage**

The `downloads` bucket must exist and the binary must be uploaded — until then this link is broken either way, but it now fails against the correct final URL.

```bash
cd apps/web && sed -i 's#href="/bys-print-bridge-setup.exe"#href={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/downloads/bys-print-bridge-setup.exe`}#' src/app/manage/settings/page.tsx
grep -n "bys-print-bridge-setup" src/app/manage/settings/page.tsx
```

- [ ] **Step 6: Verify the build still passes**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | tail -5 && npm run build 2>&1 | tail -10
```

Expected: one TS2802 error, successful build.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(deploy): add DigitalOcean app spec and rehost print-bridge installer"
```

---

### Task 9: Final verification against baseline

**Files:**
- Create: `docs/superpowers/verification-2026-08-27.txt`
- Modify: `docs/PROGRESS.md`, `AGENTS.md`

**Interfaces:**
- Consumes: everything from Tasks 1-8.
- Produces: proof the fingerprint is unchanged and the payload target is met.

- [ ] **Step 1: Confirm no file was lost**

```bash
cd "$(git rev-parse --show-toplevel)"
echo "tracked now: $(git ls-files | wc -l)"
git log --diff-filter=D --name-only --oneline chore/monorepo-restructure ^master -- | grep -v "^[0-9a-f]\{7\} " | sort -u | head -20
```

Expected: the deletion list contains ONLY paths under `print-bridge/node_modules/`, the two `.exe` files, and `food images 3/` — all intentionally untracked in Task 2. Any other deletion is a bug: STOP and restore it.

- [ ] **Step 2: Run the full fingerprint**

```bash
cd apps/web
{
  echo "=== VERIFICATION $(git rev-parse --short HEAD) ==="
  echo "--- tsc ---";   npx tsc --noEmit 2>&1
  echo "--- vitest ---"; npx vitest run 2>&1 | grep -E "Test Files|Tests "
  echo "--- lint ---";  npm run lint 2>&1 | tail -30
  echo "--- build ---"; npm run build 2>&1 | tail -20
} > ../../docs/superpowers/verification-2026-08-27.txt 2>&1
cat ../../docs/superpowers/verification-2026-08-27.txt
```

- [ ] **Step 3: Diff against baseline**

```bash
cd "$(git rev-parse --show-toplevel)"
diff <(grep -E "Test Files|Tests |error TS" docs/superpowers/baseline-2026-08-27.txt) \
     <(grep -E "Test Files|Tests |error TS" docs/superpowers/verification-2026-08-27.txt) \
  && echo "FINGERPRINT UNCHANGED"
```

Expected: `FINGERPRINT UNCHANGED`. Any difference must be explained before this branch merges.

- [ ] **Step 4: Confirm the deploy payload target**

```bash
git ls-tree -r -l HEAD -- apps/web | awk '{t+=$4} END{printf "apps/web payload: %.2f MB\n", t/1048576}'
git ls-tree -r -l HEAD | awk '{t+=$4} END{printf "repo total: %.2f MB\n", t/1048576}'
```

Expected: `apps/web payload` under 15 MB, down from 106.48 MB.

- [ ] **Step 5: Record outcomes and blockers in PROGRESS.md**

Append verbatim:

```markdown
## 2026-08-27 — Monorepo restructure

status: DONE (restructure) / BLOCKED (owner actions below)

Deploy payload 106.48 MB -> <15 MB. App now lives in `apps/web/`.
Test fingerprint unchanged: 18 failed / 353 passed / 2 skipped.

### Owner actions required before next deploy
1. **Set Source Directory = `apps/web`** in the DigitalOcean console.
   The build FAILS at repo root without it.
2. **Upload `archive/print-bridge/dist/bys-print-bridge.exe`** to the
   Supabase `downloads` bucket. The settings-page download link is
   broken until then.
3. **Restore the three crons.** They have never run on DigitalOcean —
   `vercel.json` and `netlify.toml` are both ignored by App Platform.
   Outbound email and expiry reminders are affected. See
   `apps/web/.do/README.md` for three options.

### Known pre-existing issues (NOT caused by this work)
- 18 failing tests: `tests/api/routes.test.ts` (11),
  `tests/unit/middleware.test.ts` (6), `tests/api/orderStatus.test.ts` (1).
- TS2802 at `tests/load/concurrent-orders.test.ts:214`.
- 23 seed images never wired into a seed script (`food-images-6/` has
  95 files, seeds 74; `food-images-3/` has 16, seeds 14).
- Five files over 1200 lines still need splitting — deferred by design.
```

- [ ] **Step 6: Append gotchas to AGENTS.md**

```markdown
## Repo layout gotchas (2026-08-27)

- **Run everything from `apps/web/`.** `npm`, `npx vitest`, `npx tsc`,
  and `npm run lint` all fail at the repo root — there is no
  `package.json` there by design.
- **`@/*` still means `apps/web/src/*`.** `tsconfig.json` moved with
  `src/`, so the alias is unchanged.
- **`src/lib` has no barrels, deliberately.** Import deep paths
  (`@/lib/platform/db/supabase-server`). A barrel re-exporting a
  `server-only` module would break any client component importing an
  unrelated symbol from it.
- **`archive/` is never build context.** Do not import from it.
- **`*.exe` is gitignored.** Binaries go to Supabase Storage.
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs(restructure): record verification, blockers and layout gotchas"
```

- [ ] **Step 8: Report to the owner — do NOT merge or push**

Merging and pushing are the owner's calls. Summarize: fingerprint result, payload before/after, and the three blocking owner actions.

---

## Self-Review

**Spec coverage:** Deploy cost → Tasks 2, 3, 4, 9. Agent context → Tasks 5, 6. Doc consolidation → Task 5. `src/lib` domains → Task 6. Cron restoration → Task 8. Seed-script repointing → Task 7. Verification → Tasks 1, 9. `automaticVercelMonitors` → Task 8. Every spec section maps to a task.

**Placeholder scan:** No TBDs. Every command is literal and runnable.

**Type consistency:** No new types are introduced — this is a move-and-rename plan. The `relib.sh` helper defined in Task 6 Step 2 is used consistently in Steps 3 and 5.

**Known deviation from the spec:** the spec's `src/lib` section originally specified `index.ts` barrels. That was corrected in the spec during planning — barrels would leak `server-only` modules into the client graph. This plan implements the corrected no-barrel design.
