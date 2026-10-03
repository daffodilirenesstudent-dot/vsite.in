# WhatsApp notification layer — design (v1)

Status: approved by owner 2026-09-22. Replaces the email layer removed in `34b0a10`.

## Goal

Owners hear about the lifecycle of their store on WhatsApp — the channel they
actually read — without vsite taking on a vendor, a queue service or a new
runtime. Today they get no warning before their plan or trial ends.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Provider | Meta WhatsApp Cloud API, direct (Graph v25.0) | No BSP markup, no lock-in, no dependency |
| Durability | `notification_outbox` table in Supabase | Transactional-outbox pattern (Knock/Novu/Slack); survives restarts |
| Scheduler | Supabase `pg_cron` + `pg_net` → `/api/cron/whatsapp` | App Platform `PRE_DEPLOY` is not a scheduler; no new vendor |
| QR image | `/api/qr/[slug]` renders PNG with the `qrcode` package | Meta needs a public image URL; the existing QR is browser-only |
| Template category | Utility only | ₹0.115–0.145/msg; marketing is ~6× and rate-limited |
| Language | English in v1 | No language column exists on sites/profiles; `language` is stored per row so Tamil is additive |
| Opt-in / opt-out | **Out of scope by owner decision** | Utility messages only, to the owner's own OTP-verified number about their own plan. If Meta flags quality, the cheapest fix is a one-line disclosure at signup |
| Trial length | `site_subscriptions.trial_ends_at` (amended 2026-10-02) | The column the shop page enforces since one-trial-per-account (058). NULL = no trial |

## v1 messages (Must)

| Event | Trigger | Idempotency key | Pre-send re-check |
|---|---|---|---|
| `welcome` — congrats + QR image + trial end date | `/api/onboarding/complete` | `welcome:<site>` | site exists |
| `trial_ending` — 2 days left | sweep: trial ends in next 48h, unpaid | `trial_ending:<site>` | still unpaid |
| `trial_ended` — menu offline | sweep: trial ended in last 30h, unpaid | `trial_ended:<site>` | still unpaid |
| `payment_receipt` | verify-payment / Razorpay webhook activation | `receipt:<razorpay_order_id>` | none |
| `plan_expiring` (T-3) | sweep: `store_expires_at` in (now+24h, now+78h] | `plan_expiring:<site>:<expires_at>` | expiry unchanged |
| `plan_expires_today` | sweep: `store_expires_at` in (now, now+24h] | `plan_expires_today:<site>:<expires_at>` | expiry unchanged |
| `plan_expired` | sweep: `store_expires_at` in (now-30h, now] | `plan_expired:<site>:<expires_at>` | expiry unchanged, in past |

"Paid" means `store_expires_at > now()`. `razorpay_status` is never consulted
(AGENTS.md: it is the replay guard, not a paid flag). Windows are bounded, so
enabling v1 does not backfill old stores. Overlapping windows are safe — the
key dedupes.

Sweep events also write the in-app bell (`notify()`), using the existing
`plan_expiring` / `plan_expired` / `trial_ending` / `trial_expired` types.

## Architecture

```
trigger ─► enqueue() ─► notification_outbox ─► dispatch() ─► Graph API /messages
pg_cron ─► /api/cron/whatsapp ─► sweep() + dispatchDue()          │
Meta ────► /api/webhooks/whatsapp (HMAC-verified) ─► status by wamid
```

`src/lib/notifications/whatsapp/`
- `templates.ts` — typed registry: event → Meta template name + components builder.
- `client.ts` — `sendTemplate()`: the Graph API call and error classification only.
- `signature.ts` — `verifyMetaSignature(rawBody, header, appSecret)`.
- `phone.ts` — `toWhatsAppNumber()`: E.164 digits, India default.
- `windows.ts` — pure time-window maths for the sweep.
- `outbox.ts` — `enqueue()`, `dispatchRow()`, `dispatchDue()`.
- `sweep.ts` — finds due trial/expiry rows and enqueues them.

Routes: `api/webhooks/whatsapp` (GET handshake, POST statuses),
`api/cron/whatsapp` (GET|POST, `authorizeCron`), `api/qr/[slug]` (PNG).

## Outbox state machine

`queued → sending → sent → delivered → read`; side exits `failed` (retryable,
`next_attempt_at` backoff 5m·4^n, max 5 attempts), `dead` (permanent Meta error
or attempts exhausted), `skipped` (no phone, pre-check false, older than 48h).

- Claim is a conditional UPDATE (`status in (queued, failed)`), so two workers
  cannot both send a row. A crash between send and record may double-send one
  message — accepted, as for every push provider without an idempotency key.
- Rows stuck in `sending` > 10 min are returned to `failed` by the cron.
- Webhook statuses only move forward (`sent < delivered < read`); a webhook
  `failed` marks the row `dead` with Meta's error code.
- Retryable Meta codes: 4, 130429, 131000, 131056, 80007, and HTTP 5xx/network.

## Security

- Webhook POST: HMAC-SHA256 of the **raw** body with `WHATSAPP_APP_SECRET`,
  constant-time compare, before JSON parse. Bad/missing → 401.
- Webhook GET: echo `hub.challenge` only when `hub.mode=subscribe` and the
  token matches `WHATSAPP_VERIFY_TOKEN` (constant time). Missing env → 403.
- A DB failure on POST returns 500 so Meta retries (it retries for 36h).
- Cron: shared `authorizeCron`. Table: RLS on, no policies, service-role only.
- Never log phone numbers or tokens — ids and counts only.

## Env

`WHATSAPP_ACCESS_TOKEN` (System User, permanent), `WHATSAPP_PHONE_NUMBER_ID`,
`WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, optional
`WHATSAPP_GRAPH_VERSION` (default `v25.0`). Unconfigured → rows stay `queued`
and are skipped as stale after 48h, so enabling later cannot blast old messages.

## Callback URL

`https://vsite.in/api/webhooks/whatsapp` — subscribe the `messages` field.

## Testing

- Unit: signature, phone, windows, template builders, error classification.
- API: webhook handshake + signature + status progression; cron auth; outbox
  claim/skip/retry/dead paths with a mocked Supabase and mocked `fetch`.
- Acceptance: `tests/acceptance/whatsapp-notifications.test.ts` — every v1 event
  is wired to its trigger, keys are cycle-scoped, and `razorpay_status` is never
  a sweep filter.

## Later tiers

Good: QR-card request to team WhatsApp, payment-failed, "Renew now" URL button,
failed-sends admin view, Tamil templates. Nice: weekly scans digest, inbound
reply routing, multi-staff recipients, per-owner preferences.

## Amendment 2026-10-02 — one free trial per account

Since migration 058 a store's trial is `site_subscriptions.trial_ends_at`, and an
account's second store opens with none (it goes live on payment).

- `welcome` is enqueued only when the store opened live, and `trialEndsOn` is that
  store's own trial end.
- The sweep windows trial events on `trial_ends_at` (`(now-30h, now+48h]`); NULL
  rows never match.
- Migrations are `062_notification_outbox.sql` and `063_whatsapp_cron.sql`.
