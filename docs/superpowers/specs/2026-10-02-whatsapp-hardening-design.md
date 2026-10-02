# WhatsApp notification layer — production hardening + alerts (design)

Status: design approved in chat 2026-10-02 (sections 1–2); spec awaiting owner review.
Builds on `2026-09-22-whatsapp-notifications-design.md`. Branch `feat/whatsapp-live`.

## Goal

The layer must survive account-wide failures without losing messages, and the
owner must hear about any failure from Sentry email within minutes — not from a
restaurant owner who never got their receipt.

## Non-goals

WhatsApp OTP (its own spec, next). Admin UI for the outbox. Opt-out and Tamil
templates. Any change to which events are sent or when.

## The defects this fixes

| # | Today | Consequence |
|---|---|---|
| D1 | Error 190 (token expired), 131031 (account locked), 132001 (template missing / not approved), 368 (policy block) are "non-retryable" per row | Every message goes `dead` one by one and is lost for good; the outage is invisible |
| D2 | No alerting — `logger.warn` only | Nobody knows anything is wrong |
| D3 | pg_cron/pg_net failures are fire-and-forget | If the scheduler stops, nothing sends and nothing says so |
| D4 | Template paused/disabled by Meta is discovered only by failed sends | Late, and after messages are lost |
| D5 | Dispatch is sequential, 50 rows per run; the sweep stops at 1,000 rows with no paging | Backlog under load; rows pass the 48 h stale cut-off and are skipped |
| D6 | Rows (with phone numbers) are kept forever | Needless personal data (DPDP Act) |

## Design

### 1. Error classes — `whatsapp/health.ts` (pure)

`classifyMetaError(code, httpStatus) → 'message' | 'retry' | 'template' | 'system' | 'throttle'`

| Class | Codes | Effect |
|---|---|---|
| `message` | 100, 130472, 131008, 131009, 131021, 131026 undeliverable, 131047, 131051, 131052, 131053 | This row only → `dead` (unchanged) |
| `retry` | 1, 2, 131000, 131016, 131049, 131056 pair rate (per recipient), 133004, 135000, network / 5xx / missing wamid | This row → `failed` with backoff (unchanged) |
| `throttle` | 4, 80007, 130429, 131057 maintenance, HTTP 429 | Row → `failed`, attempt **not** counted; system breaker opens 2 min; no alert |
| `template` | 132000, 132001, 132005, 132007, 132012, 132015 paused, 132016 disabled | Row → `failed`, attempt not counted; **template breaker** opens 60 min; alert |
| `system` | 0, 3, 10, 190, 200, 368, 131005, 131031, 131042, 131045, 131048, 133010 (our number not registered), HTTP 401/403 | Row → `failed`, attempt not counted; **system breaker** opens 15 min; alert |

Codes verified against Meta's Cloud API error-code reference on 2026-10-02.
Correction to v1: 133010 is *our* business number not registered (system), not
"recipient not on WhatsApp"; 131056 is a per-recipient pair limit (row retry),
not an account throttle.

Unknown codes default to `retry` (bounded by MAX_ATTEMPTS) — never silently `dead`.

### 2. Circuit breaker — table `notification_health` (migration 064, expand-only)

```
key         text primary key   -- 'system' | 'template:<name>'
open_until  timestamptz        -- null = closed
reason      text, code integer, opened_at timestamptz,
updated_at  timestamptz
```
RLS on, no policies, service role only (same as the outbox).

- `dispatchRow` reads the breakers once per run (cached for the run). If
  `system` or the row's `template:<name>` is open, it returns `'paused'` and
  does not touch the row.
- On a `system`/`template`/`throttle` error: the row goes back to `failed`
  with `next_attempt_at = open_until` and `attempts` unchanged (it was not the
  row's fault), and the breaker is opened (upsert, extends `open_until`).
- Half-open: after `open_until`, the next dispatch tries normally. A success
  clears the breaker (`open_until = null`) and logs "recovered".
- Stale rule (48 h) is unchanged: a breaker held open for two days means
  the owner ignored two days of alerts; old reminders are wrong by then.

### 3. Alerts — `whatsapp/alerts.ts` → Sentry (already installed, v10.53)

`alert(kind, detail)` = `Sentry.captureMessage` with a fixed `fingerprint`
per kind (Sentry groups repeats into one issue → one email) plus
`logger.error`. Never includes a phone number, token or message content.

| Kind | Fires when | Level |
|---|---|---|
| `breaker_open` | a system or template breaker opens (once per opening: `newlyOpened`) | error |
| `template_status` | webhook says a template is PAUSED, DISABLED, REJECTED, FLAGGED | error |
| `quality_drop` | webhook `phone_number_quality_update` to YELLOW/RED or a lower tier | warning |
| `account_update` | webhook `account_update` with a ban/restriction event | error |
| `backlog` | dispatch run: oldest due row older than 30 min while configured | error |
| `dead_spike` | ≥ 5 rows went `dead` in the last hour | error |
| `not_configured` | production and WhatsApp env missing (checked by the daily run) | warning |
| `daily_missed` | the daily heartbeat is older than 26 h (checked by each dispatch run) | error |

Owner action: Sentry → Alerts → "issue is first seen / regresses" email rule
(once). Runbook updated.

### 4. Missed-run detection — one Sentry Cron Monitor (free plan)

Sentry is on the free Developer plan once the trial ends: email alerts, **one**
cron monitor, 5,000 events/month shared with the whole app.

- The single monitor is `whatsapp-dispatch` (`*/10 * * * *`, margin 5 min):
  the cron route sends `Sentry.captureCheckIn` `in_progress` → `ok`/`error`,
  `monitorConfig` upserted from code. pg_cron stopping, pg_net failing or every
  call returning 401 all show up as "missed check-in" email. Fixes D3.
- The daily run writes a heartbeat row (`notification_health` key
  `heartbeat:daily`, `updated_at`). Each dispatch run alerts `daily_missed`
  if it is older than 26 h — no second monitor needed.

**Event budget.** Alerts are deduplicated before Sentry: a breaker alerts once
per opening (`newlyOpened`), watchdog kinds at most once per hour per kind
(`notification_health` key `alert:<kind>`). A day-long outage costs ~30 events,
not thousands.

### 5. Template + account webhooks

`/api/webhooks/whatsapp` additionally handles (same HMAC check):
`message_template_status_update` → alert on bad states, open the template
breaker; APPROVED closes it. `phone_number_quality_update`,
`account_update` → alert. Owner subscribes these three fields in Meta
(runbook). Fixes D4.

### 6. Throughput — fixes D5

- `dispatchDue`: limit 200 per run, concurrency 5 (a small pool, no new
  dependency), deadline 45 s unchanged. ≈ 1,200/hour headroom vs ≈ 300 today;
  Meta's floor is 80 msg/s, so we stay far below it.
- `runSweep`: keyset pagination (500 per page) on both queries until a short
  page or the deadline; the cap warning stays as a last resort.

### 7. Retention — fixes D6

The daily run deletes outbox rows older than 90 days in batches of 1,000
(at most 10 batches per run). `notification_health` holds no personal data.

## Data flow (after)

```
dispatchRow ─► breakers open? ─yes─► 'paused' (row untouched)
     │ no
     ▼
sendTemplate ─► ok ─► sent; clear breaker
     │ error
     ▼
classifyMetaError ─► message: dead │ retry: failed+backoff
                     template/system/throttle: failed (no attempt) + open breaker + alert
```

## Error handling

- Breaker reads/writes failing (DB down) → dispatch proceeds as today
  (fail-open on the breaker, never fail-closed on sending), error logged.
- Sentry unavailable → `captureMessage` is fire-and-forget; logging still happens.
- Alerts never throw into the send path.

## Testing (TDD, existing harness `tests/fixtures/fakeSupabase.ts`)

- Unit: `classifyMetaError` table; breaker open/extend/half-open/close maths;
  alert payload has no phone/token.
- API: 190 on the first row → that row `failed`, attempts unchanged, breaker
  open, alert called once, remaining rows `paused`; after `open_until` a
  success closes it. 132015 pauses only that template. Webhook template
  PAUSED → breaker + alert; APPROVED → closed. Backlog and dead-spike
  watchdog. Cron check-ins `in_progress` → `ok` / `error`. Concurrency: 200
  rows, pool of 5, each row claimed once. Sweep pagination over 1,200 stores.
  Retention deletes only rows > 90 days.
- Acceptance additions in `tests/acceptance/whatsapp-notifications.test.ts`.

## Rollout

Migration 064 (expand-only) is applied with 062/063, before the deploy. No
flag: the layer is not live yet, so this ships as part of its first release.
Owner one-time setup: Sentry email alert rule; subscribe three more webhook
fields.
