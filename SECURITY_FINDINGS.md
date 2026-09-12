# vsite.in — Offensive Security Assessment

**Scope:** `apps/web/` (Next.js 14 App Router, Supabase/Postgres service-role, Firebase phone-OTP auth, Razorpay, OpenAI, ZeptoMail).
**Branch:** `chore/monorepo-restructure` @ `01bef40`
**Date:** 2026-09-12
**Deployment assumed:** DigitalOcean App Platform, `apps/web` source dir, `instance_count: 1`, `basic-xxs`. Vercel/Netlify retired (per `CLAUDE.md` and `apps/web/.do/app.yaml`). **Several findings below depend on this** — the code still defends as if it were on Vercel.

---

## ✅ REMEDIATION STATUS — all 14 fixed, 2026-09-12

Phase 3 is complete. Every finding below is closed, in severity order, each with
a failing test committed before the fix. Verification: `npx vitest run` **834
passed / 1 skipped** across 37 files (baseline was 752/2 across 32),
`npx tsc --noEmit` **clean**, `npm run lint` **0 errors**.

New suites: `tests/security/subscriptionReplay.test.ts`, `cronAuth.test.ts`,
`aiCostAbuse.test.ts`, `publicEndpoints.test.ts`, `configHardening.test.ts`.

| # | Finding | Status |
|---|---|---|
| 1 | Subscription replay | **Fixed** — activation is conditional on `razorpay_status='created'`; consumed order id nulled |
| 2 | `x-vercel-cron` bypass | **Fixed** — header ignored; shared `authorizeCron`, fail-closed, constant-time |
| 3 | `bulk-import/insert` cost abuse | **Fixed** — rate limited; metered by work units; compare-and-swap reservation *before* spend |
| 4 | `gst/verify` paid-API drain | **Frozen** — `verify`/`complete`/`reset` return `frozenResponse()`; read path stays open |
| 5 | `cron/cleanup` fails open | **Fixed** — shared gate; `POST` added for the app-spec verb |
| 6 | `authorized` payments activate | **Fixed** — 202 `PAYMENT_PENDING`; order-id and amount now asserted |
| 7 | Unbounded request bodies | **Fixed** — `Content-Length` gate before `formData()`, plus a post-parse recheck |
| 8 | Spoofable rate-limit key | **Fixed** — shared `getClientIp` (rightmost XFF); added a per-site bucket |
| 9 | `X-User-Email` invoice injection | **Fixed** — header dropped from the recipient set |
| 10 | `orders/[id]/status` DoS | **Fixed** — throttled *before* the 800 ms pad |
| 11 | Sentry debug route | **Fixed** — route and page deleted |
| 12 | Rate limiter durability | **Fixed** — money now metered in Postgres; stale platform docs corrected |
| 13 | CSP `unsafe-eval` | **Fixed** — removed (⚠ smoke-test signup + checkout) |
| 14 | Upstream error text leaked | **Fixed** — Postgres and ZeptoMail detail logged, not returned |

**Four items could not be closed from the repo** and need action on the
infrastructure — see the end of this document and `AGENTS.md`.

Original assessment follows unchanged, for the record.

---

## Phase 1 — Attack surface map

### Trust levels

| Actor | How they get in | Cost to become one |
|---|---|---|
| Anonymous internet | Public menu `/shop/[slug]`, public API routes | Free |
| Authenticated owner | Firebase phone OTP → 7-day free trial, up to 2 trial stores | One phone number |
| Paying owner | ₹299/mo | ₹299 |
| Razorpay / cron | HMAC-signed webhook, `CRON_SECRET` bearer | — |

**The important one is the authenticated free-trial owner.** Signup costs one phone number and yields an immediately-valid Firebase ID token. Every "authenticated" rate limit below is therefore really a *per-phone-number* limit, and all the AI cost paths sit behind exactly that.

### Entry points → sink

| Entry point | Auth | Rate limit | Sink |
|---|---|---|---|
| `POST /api/auth/session` | none (sets cookie) | IP 30/min | Firebase JWKS verify → HttpOnly cookie |
| `POST /api/track-menu-scan` | **none** | IP 30/min (**spoofable**) | service-role INSERT `menu_scans` |
| `GET /api/orders/[id]/status` | **none** (by design) | **none** | service-role REST read of `orders` |
| `GET /api/shop/payment-options` | none | none | frozen (403) |
| `GET /api/sentry-example-api` | **none** | **none** | `throw` → Sentry event |
| `GET /api/cron/cleanup` | `CRON_SECRET`, **fails open** | none | RPC `cleanup_hardening_tables` + bulk DELETE |
| `GET\|POST /api/cron/expiry-reminder` | `CRON_SECRET` **or `x-vercel-cron` header** | none | ZeptoMail sends + `site_subscriptions` UPDATE |
| `GET /api/cron/process-emails` | `CRON_SECRET`, fails closed ✅ | none | ZeptoMail sends |
| `POST /api/webhooks/razorpay` | HMAC ✅ | none | subscription activation, `billing_history` |
| `POST /api/webhooks/razorpay/oauth` | HMAC ✅ | none | `orders`, `site_payment_integrations` |
| `POST /api/subscription/create-subscription` | Firebase | uid 5/hr | Razorpay order create |
| `POST /api/subscription/verify-payment` | Firebase | uid 10/hr | **plan activation, billing, invoice email** |
| `POST /api/onboarding/extract` | Firebase | uid 10/hr | **GPT-4o vision ×N + Sarvam OCR** |
| `POST /api/onboarding/complete` | Firebase | uid 5/hr | OpenAI embeddings + bulk product INSERT |
| `POST /api/bulk-import/extract` | Firebase | uid 20/hr | **GPT-4o vision + OCR** |
| `POST /api/bulk-import/insert` | Firebase | **none** | **GPT-4o-mini ×6 + embeddings** |
| `POST /api/images/match` | Firebase cookie | uid 30/min | OpenAI embedding + gpt-4o-mini rerank |
| `POST /api/manage/sites/[id]/gst/verify` | Firebase + owner ✅ | **none** | **paid gstincheck.co.in API** |
| `POST /api/manage/qr-card-request` | Firebase | uid 5/hr | ZeptoMail send |
| `/api/manage/**` (rest) | Firebase + `.eq('user_id', userId)` ✅ | none | scoped reads/writes |
| `/api/orders/**`, `/api/bill-request`, `table-checkout` | frozen 403 ✅ | — | — |

### Money/compute per call

1. **OpenAI** — `onboarding/extract`, `bulk-import/extract` (GPT-4o vision, `detail:'high'`), `bulk-import/insert` (GPT-4o-mini ×6 batches), `onboarding/complete` + `images/match` (embeddings).
2. **Sarvam Vision OCR** — the fallback leg of both extract routes.
3. **gstincheck.co.in** — pay-per-lookup, `gst/verify`.
4. **ZeptoMail** — 10k/month free tier; `qr-card-request`, `verify-payment`, `cron/expiry-reminder`, `cron/process-emails`.
5. **Supabase** — every service-role write; free-tier row and egress limits.

### Systemic notes

- **Every rate limit is `src/lib/platform/rateLimit.ts`** — an in-process `Map`. It does not survive a restart, a redeploy, or horizontal scaling, and there is no distributed backing. The file documents this honestly. It is the *only* throttle anywhere in the app.
- **`supabaseServer` is the service-role client and bypasses RLS everywhere.** Tenant isolation is enforced purely by `.eq('user_id', userId)` in application code. I checked every `/api/manage/**` route: **all of them do it correctly.** No IDOR found.
- Crypto is consistently good: `jose` JWKS verification, `timingSafeEqual` on every HMAC comparison, AES-256-GCM for OAuth tokens at rest, `ORDER_EMAIL_SECRET` throws in production if unset. **No hardcoded secrets. No SQL/command/path injection.** Supabase's query builder is parameterised throughout; no raw SQL string concatenation exists.
- `dangerouslySetInnerHTML` appears 40× but every instance is either a static CSS string or `JSON.stringify` of server-constructed JSON-LD built from a static content module. `/digital-menu/[city]` and `/vs/[competitor]` are `dynamicParams = false` over a fixed list. **No XSS found.** The owner's brand colour — the one untrusted value that reaches a style block — is validated by regex at the API, again by a CHECK constraint in migration 052, and again in `themeCssVars`.

---

## Phase 2 — Findings, ranked

---

# Finding 1 — Subscription replay: unlimited 30-day extensions for one ₹299 payment

- **Location:** `apps/web/src/app/api/subscription/verify-payment/route.ts:104-109`, `:200-208`, `:214-224`
- **Category:** E (business logic abuse) — with A (idempotency) contributing
- **Severity:** **CRITICAL**

### The vulnerability

The route's own header comment (line 11) promises: *"razorpay_payment_id has never been recorded before (replay protection)"*. That check was deliberately removed. Lines 104-109 say so:

```
// NOTE: We no longer abort on "billing_history already has this
// payment". ... Dedup happens at insert time (unique constraint on
// razorpay_payment_id), and the subscription update below is
// idempotent.
```

Both halves of that reasoning are wrong.

The unique constraint does fire — and at line 202-208 the handler **explicitly swallows the `23505` and carries on to activate**. So the constraint deduplicates the *billing row* while doing nothing at all about the *subscription*.

And the update is not idempotent. It is additive:

```ts
const isUpgrade = existingSub.store_plan && existingSub.store_plan !== paidPlan;
const currentExpiryMs = existingSub.store_expires_at ? new Date(...).getTime() : 0;
const baseMs = isUpgrade ? Date.now() : Math.max(Date.now(), currentExpiryMs);
const expiresAt = new Date(baseMs + 30 * 24 * 60 * 60 * 1000).toISOString();
```

Every replay takes the *current* expiry and adds another 30 days.

Nothing upstream stops the second call:

- The Razorpay signature is a static HMAC over `order_id|payment_id` — it never expires, and the attacker holds it: Razorpay Checkout hands it to their own browser.
- `razorpay.payments.fetch()` keeps returning `captured` forever.
- The order-binding check (`existingSub.razorpay_subscription_id !== razorpay_order_id`) still passes, because the activation update at line 214 **never clears `razorpay_subscription_id`**. It clears `pending_plan` only.
- On replay `pending_plan` is now `null`, so `rawPlan` falls back to `'qr_menu'` (line 163) — which equals `store_plan`, so `isUpgrade` is `false` and the carry-over branch is taken. The replay path is the *favourable* one.

The Razorpay webhook — `webhooks/razorpay/route.ts:153` — gets this exactly right:

```ts
.eq('razorpay_status', 'created')  // belt-and-suspenders: only activate from 'created' state
```

`verify-payment` has no equivalent. And `tests/security/paymentAttacks.test.ts:349` is an `it.skip` asserting the guard that only the webhook actually has:

```
it.skip('documented in threat report — verify-payment is idempotent against
billing_history (23505) and only activates from razorpay_status=created via
the webhook safety net', ...)
```

That test is skipped, and its claim about `verify-payment` is false.

### Proof of concept

Pay ₹299 once, legitimately. Capture the Checkout success callback body. Then:

```bash
for i in $(seq 1 10); do
  curl -s -X POST https://vsite.in/api/subscription/verify-payment \
    -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{
      "razorpay_payment_id": "pay_QxxxxxxxxxxxxX",
      "razorpay_order_id":   "order_QxxxxxxxxxxxxX",
      "razorpay_signature":  "<the signature Razorpay already gave you>",
      "siteId":              "<your own site uuid>"
    }'
done
```

Each response returns `{"success":true,"expiresAt":...}` 30 days further out than the last. The rate limit is 10/hour per uid, so **one ₹299 payment buys 300 days per hour, indefinitely** — and since `rateLimit` state is per-process and in-memory, a redeploy or restart resets even that.

### Impact

Complete bypass of the only revenue mechanism in the product. One customer pays ₹299 once and keeps the ₹299/mo Smart QR Menu forever. `billing_history` shows a single payment, so the subscription page and any revenue reporting show the store as legitimately paid — the fraud is invisible without a direct query comparing `store_expires_at` against payment count.

### Fix

Make `verify-payment` activate only from the pre-payment state, exactly as the webhook does, and make the payment single-use:

1. Add `.eq('razorpay_status', 'created')` to the `site_subscriptions` update at line 214 and `.select('site_id')` on it. If zero rows come back, this order was already activated — return the existing `store_expires_at` with `{ success: true, alreadyActive: true }` rather than 200-with-extension.
2. Restore the pre-flight replay check that lines 104-109 removed, but make it decisive rather than advisory: a `billing_history` row for this `razorpay_payment_id` whose `site_id` is already active means return `alreadyPaid` and stop. Keep the `23505`-tolerant insert for the genuine webhook race, but only when the subscription row is still `created`.
3. Clear `razorpay_subscription_id` (or move it to a `last_order_id` column) on activation, so a consumed order cannot be presented again.
4. Un-skip `tests/security/paymentAttacks.test.ts:349` and make it assert the real behaviour: two identical `verify-payment` calls must leave `store_expires_at` unchanged after the first.

---

# Finding 2 — Unauthenticated cron trigger via a forged `x-vercel-cron` header

- **Location:** `apps/web/src/app/api/cron/expiry-reminder/route.ts:41-48`
- **Category:** D (authentication bypass) → B (paid email), plus data mutation
- **Severity:** **HIGH**

### The vulnerability

```ts
function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // Vercel Cron sets this header automatically and the platform validates it.
  if (req.headers.get('x-vercel-cron')) return true;
  ...
}
```

The presence of an arbitrary request header is treated as proof of identity. On Vercel that is *approximately* defensible, because Vercel's edge strips the header from inbound external requests.

**This app is not on Vercel.** `CLAUDE.md` states "Vercel and Netlify are retired; their configs are in `archive/`", and `apps/web/.do/app.yaml` is a DigitalOcean App Platform spec. DigitalOcean's ingress passes `x-vercel-cron` through untouched, like any other header. The comment describes a protection that no longer exists.

`CRON_SECRET` is never consulted, because the header check short-circuits before it.

Worth noting alongside this: the three jobs in `.do/app.yaml` are declared `kind: PRE_DEPLOY`, which runs them once per deploy, not on a schedule — and `cron-cleanup` issues `-X POST` against a route that only exports `GET` (405). So on DigitalOcean this route is effectively **not being invoked by anything except an attacker**.

### Proof of concept

```bash
curl -X POST https://vsite.in/api/cron/expiry-reminder -H 'x-vercel-cron: 1'
```

Response:

```json
{"ok":true,"scanned":14,"sent":9,"skipped":5,"failures":["<site-uuid>: <error>"]}
```

### Impact

1. **Unauthenticated paid email sends.** Each call fans out one ZeptoMail send per expiring subscription, against a 10k/month free tier.
2. **Unauthenticated writes to `site_subscriptions`.** Every processed row gets `expiry_reminder_sent_at` stamped — including the `recipients.length === 0` branch at line 84, which marks the row sent *without sending anything*. An attacker who calls this at the right moment can cause a store to be permanently marked "reminded" for a cycle in which no reminder was ever delivered, so owners silently lose their T-3 expiry warning and their menus go dark unannounced.
3. **Business intelligence disclosure.** The JSON response hands an anonymous caller the count of active subscriptions expiring in the next 3 days and the UUIDs of any store whose send failed. Polled daily, that is a live read on vsite's subscriber base and churn.

### Fix

Delete the `x-vercel-cron` branch entirely — it is dead weight on a platform that has been retired — and fail closed like `cron/process-emails` already does:

```ts
function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron/expiry-reminder] CRON_SECRET is not set — rejecting');
    return false;
  }
  const auth = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  return auth.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
}
```

Separately, stop returning `scanned`/`sent`/`failures` in the body — log them and return `{ ok: true }`. And fix the job wiring in `.do/app.yaml`: `PRE_DEPLOY` is not a schedule, and `cron-cleanup` needs `GET`.

---

# Finding 3 — `bulk-import/insert`: unbounded OpenAI spend behind a quota that cannot hold

- **Location:** `apps/web/src/app/api/bulk-import/insert/route.ts:284-351`, `:447-450`
- **Category:** B (cost abuse) + A (race condition)
- **Severity:** **HIGH**

### The vulnerability

This is the only AI route in the app with **no `rateLimit()` call at all**. Its sole defence is a 15-photos/day quota, and that quota has three independent defects.

**(a) The quota meters the wrong thing.** What gets charged is `photosCount` — a number the client sends in the JSON body, constrained only to 1–5 (line 305). What actually costs money is `generateDescriptions(items)` over up to `MAX_ITEMS = 300` items, batched `DESCRIBE_BATCH_SIZE = 50` per call, **in parallel** — six concurrent GPT-4o-mini completions — plus a batched embedding call and up to 10 concurrent pgvector RPCs. `photosCount` has no causal relationship to any of it. `{"photosCount": 1, "items": [300 items with empty descriptions]}` is charged one photo.

**(b) The spend happens before the meter moves.** The LLM work runs at line ~355. The quota write is the *last* thing the handler does, at line 447 — and only on the success path. The `products` insert failing (line ~440) returns 500 after the OpenAI bill has already been incurred and before the counter is touched. Simply aborting the TCP connection mid-request has the same effect.

**(c) The increment is a read-modify-write.**

```ts
// Update quota — upsert is safe on concurrent retry
await supabaseServer.from('bulk_import_usage').upsert(
  { user_id: userId, month: day, photos_used: photosUsed + photosCount },
  { onConflict: 'user_id,month' }
);
```

`photosUsed` was read at line 340, hundreds of milliseconds and several OpenAI round-trips earlier. This writes an absolute value computed from a stale read. The comment says it is "safe on concurrent retry" — it is safe against *duplicate* retries and against nothing else. Twenty concurrent requests all read `photos_used = 0`, all pass the check, all do the work, and the last writer leaves the counter at 5.

### Proof of concept

```bash
# 300 items, all with empty descriptions, photosCount=1
python3 -c '
import json
print(json.dumps({"siteId":"<your own site uuid>","photosCount":1,
  "items":[{"name":f"Dish {i}","price":100,"description":"",
            "item_type":"single","food_type":"veg"} for i in range(300)]}))' > payload.json

# fire 20 in parallel — all read photos_used=0 and all pass the check
for i in $(seq 1 20); do
  curl -s -X POST https://vsite.in/api/bulk-import/insert \
    -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
    -H 'Content-Type: application/json' \
    --data-binary @payload.json &
done; wait

# bulk_import_usage.photos_used is now 1. Repeat forever.
```

Each wave is 20 × (6 GPT-4o-mini completions over 50 items each + 1 embedding call + 300 pgvector RPCs) = 120 chat completions and 6,000 RPCs, charged as one photo of a fifteen-photo daily allowance.

### Impact

An attacker holding one phone number (free 7-day trial) can drive OpenAI spend without bound, and the DB writes are real products in their own store so nothing looks anomalous in the data. `OPENAI_API_KEY` is a single shared org key: exhausting its rate limit or spend cap takes down AI menu extraction — the product's headline feature — for every paying customer simultaneously.

### Fix

1. **Add a rate limit.** This route has none:
   ```ts
   const rl = rateLimit(`bulk-insert:${userId}`, { limit: 10, windowMs: 60 * 60_000 });
   if (!rl.allowed) return NextResponse.json({ error: 'Too many imports' },
     { status: 429, headers: { 'Retry-After': ... } });
   ```
2. **Meter the real unit and charge it first.** Count items needing description generation, not `photosCount`, and reserve that against the quota *before* calling OpenAI — refund on failure rather than charging on success.
3. **Make the increment atomic.** Replace the read-modify-write upsert with a Postgres RPC doing `INSERT ... ON CONFLICT (user_id, month) DO UPDATE SET photos_used = bulk_import_usage.photos_used + EXCLUDED.photos_used RETURNING photos_used`, and have it return the post-increment value so the handler can reject over-limit atomically instead of check-then-act.
4. Ignore `photosCount` from the body entirely, or bound the work by `items.length` explicitly.

**Question for you before I implement:** what is a legitimate ceiling on bulk imports per owner per hour? I picked 10 above as a placeholder, but I do not know your real usage distribution and I would rather not guess a number that breaks a genuine 300-item onboarding.

---

# Finding 4 — `gst/verify`: unmetered calls to a pay-per-lookup third-party API

- **Location:** `apps/web/src/app/api/manage/sites/[siteId]/gst/verify/route.ts:33-106`
- **Category:** B (cost abuse)
- **Severity:** **HIGH**

### The vulnerability

The route calls `verifyGstin()` → `https://sheet.gstincheck.co.in/check` with `GSTINCHECK_API_KEY`. This is a **paid, per-lookup** API. The route has **no rate limit**.

Its stated defence is a 24-hour cache (line 9: *"The cache shields us against repeated wizard submissions on a paid third-party API"*). It shields against exactly that — the honest case — and nothing else, because the cache key is `(site_id, gstin)`:

```ts
.eq('site_id', params.siteId)
.eq('gstin', gstin)
```

Vary the GSTIN and every request is a miss. The only gate on the GSTIN is a format regex (`src/lib/payments/gstincheck.ts:29`):

```
/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/
```

That admits on the order of 10^18 syntactically valid strings. There is no checksum validation, and no requirement that the GSTIN bear any relationship to the caller. Ownership of `siteId` is checked (correctly), but the attacker uses their own site.

### Proof of concept

```bash
while :; do
  G="33$(tr -dc 'A-Z' </dev/urandom|head -c5)$(tr -dc '0-9' </dev/urandom|head -c4)$(tr -dc 'A-Z' </dev/urandom|head -c1)1Z5"
  curl -s -X POST "https://vsite.in/api/manage/sites/$MY_SITE_ID/gst/verify" \
    -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"gstin\":\"$G\",\"pincode\":\"600001\",\"state\":\"Tamil Nadu\"}"
done
```

Every iteration is a cache miss and a paid upstream call. Concurrency is bounded only by the attacker's bandwidth.

### Impact

Direct, uncapped financial drain on the gstincheck account, plus quota exhaustion that breaks GST onboarding for real merchants. Secondary effect: every non-`unavailable` result writes a row to `gst_verification_cache` (line 92), so the same loop also grows a Supabase table without bound.

### Fix

1. Rate-limit hard — this is a wizard step a real owner touches perhaps twice in a store's lifetime:
   ```ts
   const rl = rateLimit(`gst-verify:${userId}`, { limit: 10, windowMs: 24 * 60 * 60_000 });
   ```
   Add a second, tighter bucket per `(userId, siteId)` if a single owner with five stores needs headroom.
2. Validate the GSTIN **checksum** (the 15th character is a mod-36 check digit over the first 14), not just its shape. That alone removes ~97% of randomly-generated candidates before any paid call.
3. Cross-check the GSTIN's leading two digits (the state code) against the `state` field already in the body, and reject a mismatch locally.
4. Make the cache negative as well as positive: currently `unavailable` results are not cached (line 91), so an upstream outage turns every retry into another paid attempt.

---

# Finding 5 — `cron/cleanup` fails **open** when `CRON_SECRET` is unset

- **Location:** `apps/web/src/app/api/cron/cleanup/route.ts:12-16`, `:26`
- **Category:** D (authorization) + F (error disclosure)
- **Severity:** **MEDIUM** (becomes **HIGH** if `CRON_SECRET` is absent in the DO environment — worth checking before triaging)

### The vulnerability

```ts
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;          // ← open to the world
  return req.headers.get('Authorization') === `Bearer ${secret}`;
}
```

A missing environment variable disables authentication. The sibling route gets this right and documents why — `cron/process-emails/route.ts:22-31`: *"Fail CLOSED when secret is missing — never allow open access in production."* These two functions sit in adjacent directories and disagree.

The exposed operation is destructive: `cleanup_hardening_tables` plus an unconditional bulk `DELETE` on `bill_requests` (line 32-39). And when the RPC errors, line 26 returns the raw Postgres message to the caller:

```ts
return NextResponse.json({ error: 'Cleanup failed', detail: error.message }, { status: 500 });
```

Note also `.do/app.yaml:51` invokes this route with `-X POST` while the route exports only `GET` — so the job has been silently 405-ing, meaning the only party who has ever successfully called it is whoever sends a `GET`.

### Proof of concept

```bash
curl https://vsite.in/api/cron/cleanup
# → {"ok":true,"cleanedAt":"..."}   if CRON_SECRET is unset
# → {"error":"Cleanup failed","detail":"<postgres internals>"}  on RPC failure
```

`{"error":"Unauthorized"}` means the variable is set and this reduces to Low.

### Impact

Anonymous triggering of a destructive maintenance job: idempotency keys purged (re-enabling replays on `onboarding/complete`), rate-limit buckets wiped, acknowledged bill requests deleted. The `detail` field leaks Postgres schema and error internals.

### Fix

Mirror `process-emails` exactly — log and return `false` when the secret is missing, compare with `timingSafeEqual`, and drop `detail` from the response body (log it instead). Also add a `POST` export or fix the `app.yaml` verb.

---

# Finding 6 — `verify-payment` activates on `authorized`, not just `captured`

- **Location:** `apps/web/src/app/api/subscription/verify-payment/route.ts:151`
- **Category:** E (business logic)
- **Severity:** **MEDIUM**

### The vulnerability

```ts
if (payment.status !== 'captured' && payment.status !== 'authorized') {
```

The file's own security model, line 12, says: *"Razorpay's API confirms the payment is actually `captured`"*. The code accepts `authorized` as well.

`authorized` means the bank has reserved the funds and Razorpay has **not** taken them. An authorization that is never captured is voided automatically — Razorpay auto-refunds uncaptured authorizations after its configured window (typically 5 days). Between authorization and void, this route grants a full 30-day plan.

Whether this is exploitable end-to-end depends on your Razorpay account's auto-capture setting. If auto-capture is on (the default for Checkout), payments reach `captured` almost immediately and the `authorized` branch is mostly unreachable. **I could not verify your account configuration from the repo**, which is why this is Medium and not High. If auto-capture is off for any payment method, this is a free plan.

Compounding: `verify-payment` never compares `payment.amount` against the order amount, and never asserts `fetched.order_id === razorpay_order_id`. Neither is independently exploitable — Razorpay binds amount to the order, and forging an `(order_id, payment_id)` pair requires `RAZORPAY_KEY_SECRET` — but both are load-bearing assumptions left unstated.

### Fix

1. Require `payment.status === 'captured'`. Return a distinct `payment_pending` code for `authorized` so the client can poll rather than showing a hard failure.
2. Add the two cheap assertions while you are in the function: `fetched.order_id === razorpay_order_id`, and `payment.amount === PLAN_PRICES_INR[paidPlan] * 100`.
3. Subscribe to `payment.failed` / `refund.created` on the webhook and deactivate on either.

---

# Finding 7 — Unbounded request bodies buffered into memory on the AI upload routes

- **Location:** `apps/web/src/app/api/onboarding/extract/route.ts:54`, `:67`, `:76`; `apps/web/src/app/api/bulk-import/extract/route.ts:43`, `:46`, `:57`
- **Category:** A (availability)
- **Severity:** **MEDIUM**

### The vulnerability

`onboarding/extract` reads the whole multipart body into memory first:

```ts
formData = await request.formData();          // line 54 — buffers everything
const photoEntries = formData.getAll('photos').slice(0, MAX_PHOTOS);   // line 67
const result = await validateImageFile(entry);  // line 76 — size check, far too late
```

`MAX_IMAGE_BYTES` (10 MB) is enforced inside `validateImageFile`, which cannot run until `formData()` has already materialised every part. `MAX_PHOTOS = 15`. Nothing caps the body before that point — Next.js App Router route handlers have **no default body size limit** (the `api.bodyParser.sizeLimit` knob is Pages Router only), and I found no `sizeLimit` or equivalent anywhere in `next.config.mjs` or `src/`.

The route's own header comment names the mitigation it is relying on:

```
//   • Vercel platform caps request body at ~4.5MB — client MUST compress images
//     before upload. Server enforces a hard upper bound as defence-in-depth.
```

That cap was Vercel's. On DigitalOcean App Platform it does not exist, and the "defence-in-depth" server-side bound turns out to be the *only* bound — applied after the memory has already been allocated.

The target is `instance_size_slug: basic-xxs` — **512 MB RAM, `instance_count: 1`**.

### Proof of concept

```bash
# 15 parts × 20 MB of valid JPEG magic bytes = ~300 MB, buffered before any check
for i in $(seq 1 15); do
  printf '\xff\xd8\xff' > /tmp/p$i.jpg
  head -c 20971520 /dev/urandom >> /tmp/p$i.jpg
done

curl -X POST https://vsite.in/api/onboarding/extract \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -F 'shopName=x' $(for i in $(seq 1 15); do printf -- "-F photos=@/tmp/p$i.jpg "; done)
```

Two or three of these concurrently exceeds the instance's memory. `slice(0, MAX_PHOTOS)` does not help — the discarded parts were already buffered by `formData()`.

### Impact

A single authenticated trial user OOM-kills the only application instance, taking down every restaurant's QR menu at once. The rate limit does not help: 10 requests/hour is ten opportunities, and one suffices. Because `rateLimit` state lives in the process, the restart also clears every bucket in the app.

### Fix

1. Reject on `Content-Length` before touching the body, in both extract routes:
   ```ts
   const MAX_BODY_BYTES = MAX_PHOTOS * MAX_IMAGE_BYTES;   // ~150 MB — still too high
   const declared = Number(request.headers.get('content-length') ?? 0);
   if (declared > MAX_BODY_BYTES) {
     return NextResponse.json({ error: 'Upload too large' }, { status: 413 });
   }
   ```
2. Set a real ceiling at the edge. A DigitalOcean App Platform ingress limit (or Cloudflare, if it fronts the app) is the only thing that bounds a chunked request with no `Content-Length`. This is the load-bearing fix; the application check is defence-in-depth.
3. Drop `MAX_PHOTOS` and `MAX_IMAGE_BYTES` to what the client actually sends — `imageCompress.ts` compresses before upload, so 2 MB × 15 is likely generous.
4. Correct the stale Vercel comments in both files so the next reader does not re-inherit the assumption.

---

# Finding 8 — `track-menu-scan`: rate limit keyed on an attacker-controlled header

- **Location:** `apps/web/src/app/api/track-menu-scan/route.ts:17-30`, `:49-53`
- **Category:** A / B (unauthenticated writes, analytics corruption)
- **Severity:** **MEDIUM**

### The vulnerability

The route is unauthenticated by design and writes to `menu_scans` with the service-role client. Its only defence is an IP rate limit, built on a local helper that reads the client-supplied header **first**:

```ts
function ipFromRequest(req: NextRequest): string {
    return (
        req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||   // ← leftmost = attacker's value
        req.headers.get('x-real-ip') ||
        'unknown'
    );
}
```

The leftmost element of `X-Forwarded-For` is whatever the client put there; the proxy *appends* its observation. So `X-Forwarded-For: <random>` yields a fresh rate-limit bucket per request.

This is a local reimplementation that inverts the shared helper's precedence. `getClientIp` in `src/lib/platform/rateLimit.ts:93` reads `x-real-ip` first — the header a platform ingress sets and overwrites — and only falls back to `x-forwarded-for`. The shared helper is used by `/api/auth/session`; this route hand-rolls its own and gets the order backwards.

`site_id` is not a secret: the public menu page selects it (`shop/[slug]/page.tsx:59`) and ships it to the browser, which posts it back on every scan (`QRMenuTemplate.tsx:2140`). Any competitor can read it from the page source of any live menu.

### Proof of concept

```bash
SITE=$(curl -s https://vsite.in/shop/<any-live-store> | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
while :; do
  curl -s -X POST https://vsite.in/api/track-menu-scan \
    -H "X-Forwarded-For: $((RANDOM%255)).$((RANDOM%255)).$((RANDOM%255)).$((RANDOM%255))" \
    -H 'Content-Type: application/json' \
    -d "{\"site_id\":\"$SITE\",\"visitor_id\":\"$(uuidgen)\",\"table_number\":\"1\"}"
done
```

Every request is allowed — each forged IP gets its own bucket — and each `visitor_id` is a fresh UUID, so both the scan count and the distinct-visitor count inflate.

### Impact

Menu analytics is a headline feature of the ₹299 plan and the only measurement an owner has. An attacker can fabricate a competitor's scan numbers, or their own for a resale pitch, and there is no way to distinguish forged rows from real ones after the fact. Secondarily, this is an unauthenticated unbounded INSERT into a Supabase table — a sustained loop grows it without limit and there is no `menu_scans` purge in `cleanup_hardening_tables`.

### Fix

1. Use the shared `getClientIp` from `@/lib/platform/rateLimit` and delete the local `ipFromRequest`, so header precedence is decided in one place.
2. Do not trust either header unless the peer is the known ingress. On DigitalOcean, take the **rightmost** `X-Forwarded-For` element the platform appended rather than the leftmost.
3. Add a second bucket keyed on `site_id` — a single store cannot legitimately receive more than a few hundred scans an hour — so a distributed source still cannot inflate one target.
4. Insert with `ON CONFLICT DO NOTHING` on `(site_id, visitor_id, date_trunc('hour', ...))` to bound per-visitor row growth.

---

# Finding 9 — `X-User-Email` steers the invoice email recipient

- **Location:** `apps/web/src/app/api/subscription/verify-payment/route.ts:249`, `:258-278`
- **Category:** B / F
- **Severity:** **MEDIUM** (would be Low in isolation; Finding 1 makes it repeatable)

### The vulnerability

```ts
const headerEmail = (request.headers.get('X-User-Email') ?? '').trim();
...
const recipients = Array.from(new Set([
    ...((site.notification_emails as string[] | null) ?? []),
    headerEmail,          // ← client-controlled, unvalidated, becomes a recipient
    ownerEmail,
].map(s => s.trim()).filter(Boolean)));
```

The comment describes it as *"Firebase auth email (via X-User-Email header)"*, but nothing verifies that it matches the authenticated user — it is read straight off the request. Unlike `qr-card-request`, which takes the same header but only ever *displays* it (escaped) while sending to a hardcoded `official@vsite.in`, here the header **is the routing data**.

The message that goes out is a vsite-branded invoice, sent through ZeptoMail from vsite's authenticated sending domain, containing `site.name` — a string the attacker controls, since it is their own store's name.

On its own this costs ₹299 per send and is barely worth doing. Chained with Finding 1 — where the same request body can be replayed indefinitely — one ₹299 payment yields 10 arbitrary, attacker-addressed, vsite-branded emails per hour with attacker-chosen text in the shop name.

### Proof of concept

```bash
curl -X POST https://vsite.in/api/subscription/verify-payment \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H 'X-User-Email: victim@example.com' \
  -H 'Content-Type: application/json' \
  -d '{"razorpay_payment_id":"pay_...","razorpay_order_id":"order_...",
       "razorpay_signature":"...","siteId":"<own site>"}'
```

`victim@example.com` receives an invoice from vsite's domain with full SPF/DKIM alignment.

### Impact

Phishing amplification from a domain with legitimate sending reputation. Sustained abuse gets `vsite.in` listed as a spam source, which would break invoice and expiry-reminder delivery for every real customer.

### Fix

Drop `headerEmail` from the recipient set. The two trustworthy sources are already there: `site.notification_emails` (owner-managed, server-stored) and `profiles.contact_email` (server-stored). If the Firebase auth email is genuinely needed, read the `email` claim out of the verified token in `verifyFirebaseToken` rather than from a header — `jwtVerify` already returns the full payload and it is discarded today.

---

# Finding 10 — `orders/[id]/status`: unauthenticated, unmetered, deliberately slow

- **Location:** `apps/web/src/app/api/orders/[id]/status/route.ts:27`, `:37-43`
- **Category:** A (availability)
- **Severity:** **MEDIUM**

### The vulnerability

This route is intentionally public — `tests/acceptance/ordering-frozen.test.ts:61` asserts it must *not* be frozen, so customers can check order status. That design is sound, and the timing-padding mitigation against order-ID enumeration is genuinely well thought out.

But the mitigation is itself the problem. Every response is padded to a floor:

```ts
const MIN_RESPONSE_MS = 800;
async function respond(body, init) {
  const elapsed = Date.now() - start;
  if (elapsed < MIN_RESPONSE_MS) await new Promise(r => setTimeout(r, MIN_RESPONSE_MS - elapsed));
  return NextResponse.json(body, init);
}
```

So each request holds a live connection and a pending timer for at least 800 ms, plus a Supabase REST round trip — on a route with **no authentication and no rate limit**, against a **single `basic-xxs` instance**. The 400-response for a missing `id` is the one path that returns immediately.

### Proof of concept

```bash
# 500 concurrent holders, each pinned open for >=800ms, no credentials needed
seq 1 500 | xargs -P 500 -I{} curl -s -o /dev/null \
  "https://vsite.in/api/orders/$(uuidgen)/status"
```

Sustaining ~600 req/s keeps roughly 500 requests resident at all times. Each also issues an outbound Supabase fetch, so the Supabase connection pool saturates alongside the Node event loop.

### Impact

Cheap, unauthenticated exhaustion of the single web instance and the Supabase connection pool — taking down every restaurant's live QR menu. The attacker needs no account and no valid order ID; a random UUID reaches the same padded path.

### Fix

1. Rate-limit by IP (via the shared `getClientIp`, with Finding 8's precedence fix applied): `rateLimit(\`order-status:${ip}\`, { limit: 60, windowMs: 60_000 })` — comfortably above a polling customer's 1 req/2s.
2. Return `429` **before** entering `respond()`, so a throttled request is not also held for 800 ms.
3. Consider replacing the timing pad with a signed-token requirement once the printed-card migration allows it — a constant 800 ms floor is an expensive way to buy enumeration resistance that an HMAC gives for free. The `?t=` signed-link path already exists and is correctly implemented.

---

# Finding 11 — `sentry-example-api` debug route live in production

- **Location:** `apps/web/src/app/api/sentry-example-api/route.ts:6-9`
- **Category:** F (debug endpoint left enabled)
- **Severity:** **LOW**

```ts
export function GET() {
  throw new Error('Sentry server-side error test — safe to ignore');
  return NextResponse.json({ ok: true });
}
```

Unauthenticated, unmetered, and it exists solely to throw. Every hit is a captured Sentry event against a paid/quota'd plan, and a scripted loop burns the error quota so that real production errors are dropped by quota enforcement exactly when someone needs them. It also produces a reliable 500 for fingerprinting.

```bash
seq 1 100000 | xargs -P 50 -I{} curl -s -o /dev/null https://vsite.in/api/sentry-example-api
```

**Fix:** delete the route. If it must stay for smoke-testing, gate it on `process.env.NODE_ENV !== 'production'` and return 404 otherwise.

---

# Finding 12 — Rate limiting has no durable or shared backing

- **Location:** `apps/web/src/lib/platform/rateLimit.ts:19-20`
- **Category:** B (systemic)
- **Severity:** **LOW** today, structural

`const buckets = new Map<string, Bucket>()` in module scope. The file documents the limitations honestly and names Upstash Redis as the upgrade path at ~5 instances. Two things have changed since it was written:

- The comments reference Vercel and Firebase Functions. The app is on DigitalOcean App Platform at `instance_count: 1`, so the multi-instance multiplication is not live — but **any** horizontal scale, and every redeploy, resets every bucket in the app simultaneously.
- `deploy_on_push: true` is set in `.do/app.yaml`, so buckets clear on every push to `master`.

This is the single control that every AI cost path (Findings 3, 4) and the payment replay ceiling (Finding 1) rests on. It is worth knowing that it is a best-effort, restart-volatile counter, not an enforcement boundary — none of the cost findings above should be considered fixed by adding a `rateLimit()` call alone.

**Fix:** when you act on Findings 3 and 4, put the durable counter in Postgres (the atomic-increment RPC described in Finding 3) rather than relying on the in-memory limiter for anything that costs money. Keep `rateLimit` as the cheap first line it was designed to be.

---

# Finding 13 — CSP permits `unsafe-inline` and `unsafe-eval` on `script-src`

- **Location:** `apps/web/next.config.mjs:22`
- **Category:** F
- **Severity:** **LOW**

```
"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clarity.ms ... https://*.googleapis.com"
```

The header comment explains `'unsafe-inline'` (Next.js hydration data and JSON-LD blocks), which is a real constraint. `'unsafe-eval'` is not explained and is likely not needed. Together they mean the CSP provides no meaningful XSS mitigation — it is functioning as a resource allowlist only.

I found no XSS to pair this with (see Phase 1 notes), so this is defence-in-depth that is currently not depth. The rest of the header set is genuinely good: HSTS with preload, `frame-ancestors 'none'`, `nosniff`, a tight `Permissions-Policy`, `poweredByHeader: false`, and `form-action 'self'`.

**Fix:** drop `'unsafe-eval'` and verify nothing breaks (Razorpay Checkout and the reCAPTCHA bundle are the likely objectors). Replacing `'unsafe-inline'` requires Next.js nonce support via middleware — worth doing, but it is a project, not a one-liner. Note `https://*.googleapis.com` in `script-src` is broad; narrow it to the specific host if you can identify it.

---

# Finding 14 — Upstream error text returned to clients

- **Location:** `apps/web/src/app/api/cron/cleanup/route.ts:26`; `apps/web/src/app/api/manage/qr-card-request/route.ts:216`
- **Category:** F (debug information exposure)
- **Severity:** **LOW**

Two routes forward a third party's raw error text to the caller:

```ts
// cron/cleanup — reachable unauthenticated if CRON_SECRET is unset (Finding 5)
return NextResponse.json({ error: 'Cleanup failed', detail: error.message }, { status: 500 });

// qr-card-request — authenticated, but any trial user reaches it
const errText = await resp.text();
return NextResponse.json({ error: 'Failed to send email', detail: errText }, { status: 500 });
```

The first leaks Postgres internals (function names, column names, constraint names). The second leaks ZeptoMail API responses, which carry sub-account identifiers and quota state. Neither leaks a credential.

Every other route in the app gets this right — `billing-history:90` is the model: log `error.message`, return a generic string.

**Fix:** `console.error` the detail, return a generic message and a stable error `code`.

---

## Summary

| # | Finding | Cat. | Severity |
|---|---|---|---|
| 1 | Subscription replay → unlimited plan extensions for one ₹299 payment | E | **Critical** |
| 2 | Cron auth bypass via forged `x-vercel-cron` header | D/B | **High** |
| 3 | `bulk-import/insert` — no rate limit, quota races and meters the wrong unit | B/A | **High** |
| 4 | `gst/verify` — unmetered paid third-party lookups, cache bypassed by varying GSTIN | B | **High** |
| 5 | `cron/cleanup` fails open when `CRON_SECRET` is unset | D/F | **Medium** |
| 6 | `verify-payment` accepts uncaptured `authorized` payments | E | **Medium** |
| 7 | Unbounded request bodies buffered in memory on AI upload routes | A | **Medium** |
| 8 | `track-menu-scan` rate limit keyed on spoofable `X-Forwarded-For` | A/B | **Medium** |
| 9 | `X-User-Email` steers the invoice email recipient | B/F | **Medium** |
| 10 | `orders/[id]/status` — unauthenticated, unmetered, 800 ms per request | A | **Medium** |
| 11 | `sentry-example-api` debug route live in production | F | **Low** |
| 12 | Rate limiting has no durable or shared backing | B | **Low** |
| 13 | CSP permits `unsafe-inline` + `unsafe-eval` | F | **Low** |
| 14 | Upstream error text returned to clients | F | **Low** |

### What held up

Worth recording, because it narrowed the search considerably:

- **Multi-tenant isolation is clean.** Every `/api/manage/**` route pairs the resource id with `.eq('user_id', userId)` from a verified token. I found no IDOR, and no route that takes a user id from the request.
- **No injection of any kind.** No raw SQL, no shell, no `eval`, no path handling on user input. Supabase's builder is parameterised throughout.
- **No XSS.** All 40 `dangerouslySetInnerHTML` sites are static CSS or server-built JSON-LD from static content modules. The one owner-controlled value reaching a style block (`primary_color`) is validated in three places.
- **Crypto is correct throughout.** `jose` JWKS with issuer+audience pinning; `timingSafeEqual` on every HMAC comparison; AES-256-GCM for OAuth tokens at rest; `ORDER_EMAIL_SECRET` refuses to start in production if unset. No hardcoded secrets anywhere.
- **The ordering freeze holds.** Every order-taking route returns 403 via `frozenResponse()`. `orders/[id]/status` is open deliberately and the acceptance suite pins that decision.
- **`onboarding/complete` is the best-hardened route in the codebase** — shape validation before field access, per-item and per-variant bounds, idempotency keys scoped to the user, atomic slug allocation, and a store-limit check that fails closed on a DB error.
- **The Razorpay webhook is correct** — including the `.eq('razorpay_status', 'created')` guard that Finding 1 is entirely about `verify-payment` lacking.

---

## Phase 3 — remediation notes

### Behaviour changes a legitimate user may notice

- **Bulk import is metered by AI work, not by photo count.** A ~60-item import
  costs 3 of 15 units/day (about five imports); a maximal 300-item one costs 7.
  Items that arrive already carrying descriptions are nearly free. The previous
  counter charged 1–5 "photos" for work that ranged over two orders of magnitude.
- **Bulk import is capped at 10 requests/hour per user.** This is a placeholder —
  see the open question below.
- **A payment caught between authorization and capture returns `202`
  `PAYMENT_PENDING`** rather than activating. The client should poll; it is not
  an error state.
- **Menu scans: 120/minute per store.** **Order status: 60/minute per IP**
  (the waiting screen polls about twice that slowly).
- **Invoices go only to `sites.notification_emails` and `profiles.contact_email`.**
  If anything relied on the `X-User-Email` header reaching the invoice, it stops.
- **GST settings now return 403.** The tab was already unreachable in the UI, so
  this should be invisible; it is listed because the API contract changed.

### Still open — infrastructure, not code

1. **Set a request-body limit at the ingress.** The extract routes now reject on
   `Content-Length` and re-check what arrived, but a chunked request declares no
   length and `request.formData()` buffers before any handler code runs. Only the
   DigitalOcean ingress (or Cloudflare, if it fronts the app) can bound that.
2. **Give the crons a real schedule.** `kind: PRE_DEPLOY` in `.do/app.yaml` runs
   a job once per deploy. Expiry reminders will not fire on the day they are due.
3. **Smoke-test signup and checkout after the CSP change.** Firebase phone OTP
   (reCAPTCHA) and Razorpay Checkout are the two bundles that could plausibly
   have wanted `unsafe-eval`. A violation names the directive in the console;
   restoring the single token is a one-line revert.
4. **Confirm `CRON_SECRET` is set on the DO app.** Every cron route now fails
   closed, so an unset value stops the jobs visibly instead of opening them.

### Open question

**What is a realistic ceiling on bulk imports per owner per hour?** I used 10.
It is comfortably above any real onboarding I can infer from the code, but I have
no usage data, and this is the one number in the change set I guessed rather than
derived.

### Answered by the remediation

- *Is `CRON_SECRET` set?* No longer changes the severity — the route fails closed
  either way. Still worth confirming so the jobs actually run (item 4 above).
- *Is Razorpay auto-capture on?* No longer changes exploitability — `authorized`
  is refused regardless.
