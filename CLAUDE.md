# vsite.in — Claude Context

Repository-wide rules only. Area-specific conventions live in the per-feature
files listed under [Feature instructions](#feature-instructions); Claude loads
each one on demand when it reads files in that directory.

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

**Doc precedence:** `CLAUDE.md` (this file) is authoritative.
`AGENTS.md` holds cross-tool gotchas. `docs/GOAL.md`, `docs/PLAN.md`,
`docs/PROGRESS.md` drive the feature workflow. Anything in `archive/docs/`
is superseded — do not act on it.

**Deployment:** DigitalOcean App Platform, Source Directory = `apps/web`.
Vercel and Netlify are retired; their configs are in `archive/`.

## Feature instructions

Detailed conventions, the per-feature test command, and local gotchas live next
to the code. Read the relevant one before working in that area.

| Area | File |
|---|---|
| Onboarding (signup → first menu) | `apps/web/src/app/onboarding/CLAUDE.md` |
| Dashboard (`/manage`: analytics, inventory, settings) | `apps/web/src/app/manage/CLAUDE.md` |
| Shop (`/shop/[slug]` — the QR menu customers scan) | `apps/web/src/app/shop/CLAUDE.md` |
| Payments / subscription (sensitive) | `apps/web/src/lib/payments/CLAUDE.md` |

Areas without their own file inherit this one: marketing/SEO landing pages
(`app/<keyword>/`), policies (`app/privacy`, `app/terms`), auth, and blog.

## Product

AI-powered digital menu platform for restaurants and cafés in Tamil Nadu /
South India. B2B SaaS, solo-developer build.

**vsite sells exactly one product: the Smart QR Menu (`qr_menu`, ₹299/mo).**
The customer scans a QR code and reads the menu. That is the whole product.

Live: QR-menu scanning, AI menu extraction, AI food photos, Tamil/English
menus, real-time menu edits, sold-out toggles, menu analytics, GST-compliant
billing fields, and Razorpay for the owner's own ₹299 subscription.

Users are restaurant/café owners, mostly Tamil Nadu. Assume low digital
literacy for end-customer flows. Pricing and copy stay in INR.
**Menu data is the core asset** — protect its integrity, never bulk-delete
without confirmation.

### The ordering freeze (applies everywhere)

**vsite takes no orders, by any method.** In-app ordering, the counter/token
flow, table checkout, bill requests, KOT output and WhatsApp order-taking are
all frozen behind `ORDERING_FROZEN` in `src/lib/platform/productFlags.ts`, and
every order route returns 403 via `frozenResponse()`. Staff take orders exactly
as they did before. **Do not add an ordering path.**

Two suites guard this and must both stay green:
`tests/acceptance/ordering-frozen.test.ts` asserts every order route is gated;
`tests/security/paymentAttacks.test.ts` forces `ORDERING_FROZEN: false` so the
payment defences behind the freeze stay covered for the day it is lifted.

`/api/subscription/verify-payment` is the revenue path and is **never** frozen.

### How content may talk about ordering

Never as available. Always fine as coming soon — the owner wants the roadmap
public. Ordering with UPI payment is publicly promised as forthcoming, at no
extra cost, inside the same ₹299. The canonical strings live in
`src/content/roadmap.ts` (`ORDERING_COMING_SOON`,
`SMART_QR_MENU_LIVE_SINCE = 'March 2026'`) — reuse them rather than writing a
new phrasing, and revisit whatever imports them when ordering ships.
`tests/acceptance/ordering-roadmap-copy.test.ts` enforces both halves: it fails
if content claims ordering works today, and it also fails if ordering is
scrubbed out of the content entirely.

## Stack
- **Framework:** Next.js 14.2.35 (App Router, `src/app/`), React 18.
- **Language:** TypeScript 5, `strict: true` (no emit, `isolatedModules`,
  `moduleResolution: bundler`). Path alias `@/* → ./src/*`.
- **Database:** Supabase / Postgres via `@supabase/supabase-js`. Server access
  through `src/lib/supabase-server.ts` (service-role client,
  `import 'server-only'`). Heavy use of Postgres RPC functions (e.g.
  `process_order_v2`). **No Prisma, no Drizzle, no migrations folder in repo.**
  Firebase (`firebase` pkg) is used only for phone-OTP auth.
- **Styling:** Tailwind CSS 3.4 (`tailwind.config.ts`), `clsx` + `tailwind-merge`.
- **Package manager:** npm (`package-lock.json`).
- **Errors:** Sentry via `@sentry/nextjs` in `next.config.mjs`; cron routes
  under `src/app/api/cron/`.

## Project conventions
- **API response shape:** App-Router route handlers return
  `NextResponse.json(...)`. Errors:
  `NextResponse.json({ error: '<message>' }, { status: 4xx/5xx })`. Success:
  `NextResponse.json({ success: true, ...data })`. Auth failures use
  `401 Unauthorized` / `401 Invalid token` / `403 Forbidden`.
- **DB access:** Import `supabaseServer` from `@/lib/supabase-server` in server
  code only. Prefer existing RPCs for hot paths over multi-query logic. Never
  import it into a client component (`server-only` makes the build fail by
  design).
- **Folder layout:** `src/app/` (routes + `api/*/route.ts`), `src/components/`,
  `src/lib/` (domain logic + integrations), `src/hooks/`, `src/utils/`,
  `src/types/`, `src/content/`. Middleware in `src/middleware.ts`.
  Tests in `tests/` (NOT colocated).
- **Naming:** camelCase files in `src/lib/` (e.g. `menuExtractor.ts`,
  `qrSignature.ts`). Route handlers are always `route.ts`. Tests `*.test.ts`
  (vitest) and `*.spec.ts` (playwright).
- **i18n:** Tamil + English where user-facing.

## Hard rules
- TypeScript strict. No `any`. No `console.log` in committed code.
- Every new feature ships via TDD: failing test committed first, then implementation.
- DO NOT modify tests to make them pass. Fix the implementation.
- DO NOT add dependencies without writing the reason in PROGRESS.md and asking.
- DO NOT touch migrations, `.env` files, or auth/billing code without explicit instruction.
- DO NOT commit secrets. Use `process.env`.

## Feature workflow (mandatory)
1. Read GOAL.md.
2. Write failing acceptance test in `tests/acceptance/<feature>.spec.ts`.
3. Run it. Confirm RED. Commit: `test(<feature>): failing acceptance`.
4. Write PLAN.md: numbered tasks with file paths.
5. Implement until GREEN. Re-run the affected suite after every edit.
6. Refactor with tests green.
7. Update PROGRESS.md every iteration. Append gotchas to AGENTS.md.
8. When all acceptance criteria pass, write `status: DONE` in PROGRESS.md.

## Testing

**Scope the run to what you touched.** Each feature file above names the
command for its area. Use the full suite before a merge, not after every edit.

- **Full unit / API / load / security:** `npx vitest run` (config
  `vitest.config.ts`, env `node`, globals on, setup `tests/setup.ts`, includes
  `tests/**/*.test.ts`, excludes `*.spec.ts`).
- **Single file:** `npx vitest run tests/<path>.test.ts`
- **E2E:** Playwright. `npx playwright test` (config `playwright.config.ts`,
  `testDir: ./tests/e2e`, baseURL `http://localhost:3000`, chromium,
  workers: 1). Needs `npm run dev` running.
- **Acceptance tests live in `tests/acceptance/`** as vitest `*.test.ts`.
  Vitest includes only `tests/**/*.test.ts`; if an acceptance test must be
  Playwright `*.spec.ts`, place it under `tests/e2e/` and note the choice in
  PLAN.md.
- **Typecheck:** `npx tsc --noEmit` • **Lint:** `npm run lint` (`next lint`)
- **Before any commit:** `npx vitest run && npm run lint`

⚠️ There are NO `test`/`typecheck` scripts in `package.json`. Use the explicit
commands above.

## Hooks (enforced — do not bypass)
`.claude/settings.json` runs a **PostToolUse** hook on `Edit|Write|Bash`:
`code-review-graph update --skip-flows` (keeps the knowledge graph current). It
also runs `code-review-graph status` on SessionStart. There is no commit-time
hook — Claude Code has no `PreCommit` event, so run
`code-review-graph detect-changes --brief` by hand if you want it. NOTE: these
hooks maintain the review graph — they do NOT run the test/lint/secret-scan
suite for you. You must run `npx vitest run && npm run lint` manually before
every commit. If a hook fails, fix the cause — do not disable the hook.

## When stuck
Log the blocker to AGENTS.md with: symptom, what you tried, hypothesis. Move to
next sub-task. Do NOT loop on the same failing approach more than twice. (Ralph
loop is capped at **3 loops** for this workflow.)

## Never do
- Don't refactor unrelated code "while you're there".
- Don't generate mock data that looks real (use obvious placeholders).
- Don't auto-format the entire repo.
- Don't write to `/migrations`, `/.env*`, or billing/auth code without explicit goal.

## MCP Tools: code-review-graph
This project has a knowledge graph. Prefer the `code-review-graph` MCP tools
when available; fall back to Grep/Glob/Read if they're unavailable, fail, or
return nothing. Never block on MCP availability.
- **Exploring code:** `semantic_search_nodes` / `query_graph` instead of Grep.
- **Impact:** `get_impact_radius` instead of manually tracing imports.
- **Review:** `detect_changes` + `get_review_context` instead of reading whole files.
- **Relationships:** `query_graph` with `callers_of` / `callees_of` / `imports_of` / `tests_for`.
- **Architecture:** `get_architecture_overview` + `list_communities`.
