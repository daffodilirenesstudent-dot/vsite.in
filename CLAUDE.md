# vsite.in — Claude Context

## Product
AI-powered digital menu platform for restaurants and cafés in Tamil Nadu / South India. B2B SaaS, solo-developer build. Core flows: QR-menu scanning by end customers, in-app ordering, KOT/printer output, Razorpay payments, GST-compliant billing, WhatsApp ordering.

## Stack (detected)
- **Framework:** Next.js 14.2.35 (App Router, `src/app/`), React 18.
- **Language:** TypeScript 5, `strict: true` (no emit, `isolatedModules`, `moduleResolution: bundler`). Path alias `@/* → ./src/*`.
- **Database:** Supabase / Postgres via `@supabase/supabase-js`. Server access through `src/lib/supabase-server.ts` (service-role client, `import 'server-only'`). Heavy use of Postgres RPC functions (e.g. `process_order_v2`). **No Prisma, no Drizzle, no migrations folder in repo.** Firebase (`firebase` pkg) is used only for phone-OTP auth.
- **Styling:** Tailwind CSS 3.4 (`tailwind.config.ts`), `clsx` + `tailwind-merge`.
- **Package manager:** npm (`package-lock.json`).
- **Deployment target:** Vercel (Sentry via `@sentry/nextjs` in `next.config.mjs`, `automaticVercelMonitors`, cron routes under `src/app/api/cron/`).

## Project conventions (detected + inferred)
- **API response shape:** App-Router route handlers return `NextResponse.json(...)`. Errors: `NextResponse.json({ error: '<message>' }, { status: 4xx/5xx })`. Success: `NextResponse.json({ success: true, ...data })`. Auth failures use `401 Unauthorized` / `401 Invalid token` / `403 Forbidden`.
- **DB access:** Import `supabaseServer` from `@/lib/supabase-server` in server code only. Prefer existing RPCs for hot paths over multi-query logic. Never import it into a client component (`server-only` makes the build fail by design).
- **Folder layout:** `src/app/` (routes + `api/*/route.ts`), `src/components/`, `src/lib/` (domain logic + integrations), `src/hooks/`, `src/utils/`, `src/types/`, `src/content/`. Middleware in `src/middleware.ts`. Tests in `tests/` (NOT colocated).
- **Naming:** camelCase files in `src/lib/` (e.g. `menuExtractor.ts`, `qrSignature.ts`). Route handlers are always `route.ts`. Tests `*.test.ts` (vitest) and `*.spec.ts` (playwright).
- **i18n:** Tamil + English where user-facing. Pricing/copy stays in INR.

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
5. Implement until GREEN. Re-run full suite after every edit.
6. Refactor with tests green.
7. Update PROGRESS.md every iteration. Append gotchas to AGENTS.md.
8. When all acceptance criteria pass, write `status: DONE` in PROGRESS.md.

## Testing
- **Unit / API / load / security:** Vitest. `npx vitest run` (config `vitest.config.ts`, env `node`, globals on, setup `tests/setup.ts`, includes `tests/**/*.test.ts`, excludes `*.spec.ts`).
- **E2E:** Playwright. `npx playwright test` (config `playwright.config.ts`, `testDir: ./tests/e2e`, baseURL `http://localhost:3000`, chromium, workers: 1). Needs `npm run dev` running.
- **Acceptance tests live in `tests/acceptance/`** (new dir — create on first feature). Vitest currently includes only `tests/**/*.test.ts`; if acceptance tests are Playwright `.spec.ts`, place them under `tests/e2e/` OR widen the playwright `testDir` — note the choice in PLAN.md.
- **Lint:** `npm run lint` (`next lint`). **Run before any commit:** `npx vitest run && npm run lint`.
- ⚠️ There are NO `test`/`typecheck` scripts in `package.json`. Use the explicit commands above. Typecheck via `npx tsc --noEmit`.

## Hooks (enforced — do not bypass)
`.claude/settings.json` runs a **PostToolUse** hook on `Edit|Write|Bash`: `code-review-graph update --skip-flows` (keeps the knowledge graph current). It also runs `code-review-graph status` on SessionStart and `code-review-graph detect-changes --brief` on PreCommit. NOTE: these hooks maintain the review graph — they do NOT run the test/lint/secret-scan suite for you. You must run `npx vitest run && npm run lint` manually before every commit. If a hook fails, fix the cause — do not disable the hook.

## Domain notes
- Users are restaurant/café owners, mostly Tamil Nadu. Low digital literacy assumed for end-customer flows (QR menu scanners).
- Pricing/copy stays in INR (current plans ₹299 / ₹499 / ₹699).
- Menu data is the core asset: protect integrity, never bulk-delete without confirmation.
- Payments: Razorpay (incl. per-restaurant OAuth Partner Connect). GST compliance and WhatsApp ordering are live features — treat `src/lib/server/*`, billing, and webhook code as sensitive.

## When stuck
Log the blocker to AGENTS.md with: symptom, what you tried, hypothesis. Move to next sub-task. Do NOT loop on the same failing approach more than twice. (Ralph loop is capped at **3 loops** for this workflow.)

## Never do
- Don't refactor unrelated code "while you're there".
- Don't generate mock data that looks real (use obvious placeholders).
- Don't auto-format the entire repo.
- Don't write to `/migrations`, `/.env*`, or billing/auth code without explicit goal.

## MCP Tools: code-review-graph
This project has a knowledge graph. Prefer the `code-review-graph` MCP tools when available; fall back to Grep/Glob/Read if they're unavailable, fail, or return nothing. Never block on MCP availability.
- **Exploring code:** `semantic_search_nodes` / `query_graph` instead of Grep.
- **Impact:** `get_impact_radius` instead of manually tracing imports.
- **Review:** `detect_changes` + `get_review_context` instead of reading whole files.
- **Relationships:** `query_graph` with `callers_of` / `callees_of` / `imports_of` / `tests_for`.
- **Architecture:** `get_architecture_overview` + `list_communities`.
