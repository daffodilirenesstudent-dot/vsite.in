# WhatsApp notifications — go-live runbook

Code: `apps/web/src/lib/notifications/whatsapp/`. Design:
`docs/superpowers/specs/2026-09-22-whatsapp-notifications-design.md`.

Do the steps **in order** — Meta's "Verify and save" calls our server the moment
you press it, so the route must be deployed with the verify token first.
If you are already on Meta's "Configure Webhooks" screen: leave it, do steps 1–3 and deploy,
then come back. Pressing it before the deploy fails (404 from vsite.in).

---

## 1. Meta: permanent access token (the one in `whatsapp/.env` is expired)

The token from "API Setup → Try it out" lasts 24 hours (QA 2026-09-22 got
error **190 Authentication Error** with it). Production needs a System User token:

1. business.facebook.com → **Business settings → Users → System users → Add**
   (role: Admin).
2. **Add assets** → your app → *Manage app*; and your WhatsApp account → *Manage*.
3. **Generate new token** → app = yours, expiry = **Never**, permissions:
   `whatsapp_business_messaging`, `whatsapp_business_management`.
4. Copy it once → this is `WHATSAPP_ACCESS_TOKEN`.

Also collect:
- **Phone number ID** — WhatsApp → API Setup (a number, not the phone number) → `WHATSAPP_PHONE_NUMBER_ID`.
- **App Secret** — App settings → Basic → App secret → Show → `WHATSAPP_APP_SECRET`.
- **Verify token** — you invent it. Generate: `openssl rand -hex 32` → `WHATSAPP_VERIFY_TOKEN`.

Use a **real business number**, not the Meta test number: the test number can
only message 5 pre-registered recipients.

## 2. DigitalOcean: environment variables (encrypted, app-level)

| Key | Value |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | System User token (step 1) |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone number ID |
| `WHATSAPP_APP_SECRET` | App secret |
| `WHATSAPP_VERIFY_TOKEN` | the random string you generated |
| `CRON_SECRET` | already set — confirm it exists |

Until `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` are set, messages are
recorded as `queued` and nothing is sent. Rows older than 48h are skipped as
stale, so switching on late does not blast old messages.

## 3. Supabase: apply migrations and the Vault secret

1. Apply `apps/web/supabase/migrations/062_notification_outbox.sql`, then
   `064_notification_health.sql` (breaker/heartbeat table, service-role only).
2. Create the secret pg_cron uses (SQL editor, **never commit this**):
   ```sql
   select vault.create_secret('<same value as DO CRON_SECRET>', 'cron_secret');
   ```
3. Apply `063_whatsapp_cron.sql` (enables pg_cron + pg_net, schedules two jobs).
4. Check: `select jobname, schedule from cron.job;` → `whatsapp-daily 30 4 * * *`,
   `whatsapp-dispatch */10 * * * *`.

## 4. Deploy, then verify the webhook

After the deploy is live:

1. Meta App Dashboard → WhatsApp → Configuration (the screen in the screenshot):
   - **Callback URL:** `https://vsite.in/api/webhooks/whatsapp`
   - **Verify token:** the `WHATSAPP_VERIFY_TOKEN` value
   - **Verify and save** → must turn green.
2. **Webhook fields → Subscribe** to all four: `messages`,
   `message_template_status_update`, `phone_number_quality_update`, `account_update`.
3. The orange banner: production webhooks arrive only after **App → Publish**
   (needs a privacy policy URL — use `https://vsite.in/privacy`) and business
   verification (Step 3 in the left menu).

## 5. Create the 7 templates

WhatsApp Manager → Message templates → Create. **Category: Utility. Language:
English (`en` — not "English (US)").** `templates.ts` is the source of truth
(rewritten 2026-10-02); `tests/unit/whatsappPrimitives.test.ts` enforces Meta's
rejection rules on it. Names and the {{n}} variables must match exactly; headers,
footers and the static buttons are never sent by the code, so wording there can
change in WhatsApp Manager alone (keep `templates.ts` in step anyway).

House style: the header says what happened; the fact that matters is *bold*;
one emoji as a status icon; facts, never persuasion ("renew now", "!" get a
template re-filed as Marketing); the action is the button.

All seven: **Footer** `vsite · Smart QR Menu` · variable type **Number**.
Button = **Visit website**, URL type **Static**.

| Name | Header | Button → URL |
|---|---|---|
| `vsite_welcome_qr` | Image (QR) | Manage menu → `https://vsite.in/manage/dashboard` |
| `vsite_trial_ending` | Free trial ending soon | View plan → `https://vsite.in/manage/subscription` |
| `vsite_trial_ended` | Free trial ended | View plan → same |
| `vsite_payment_receipt` | Payment received | View invoice → same |
| `vsite_plan_expiring` | Plan ending soon | View plan → same |
| `vsite_plan_expires_today` | Plan ends within 24 hours | View plan → same |
| `vsite_plan_expired` | Plan ended | View plan → same |

Bodies: copy the `copy` string of each entry in `templates.ts` (a `
` is a new
line). Samples: shop `Anna Cafe`, link `https://vsite.in/shop/anna-cafe`, dates
`29 Sept 2026`, amount/price `299`.

If Meta re-categorises one as Marketing, reword it to be more strictly
informational — do not accept Marketing (≈6× price, frequency-capped).

## 6. Smoke test after go-live

```bash
# handshake (expect the number back)
curl "https://vsite.in/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=$WHATSAPP_VERIFY_TOKEN&hub.challenge=42"
# QR image (expect 200 image/png)
curl -sI https://vsite.in/api/qr/<a-real-slug>
# cron (expect {"success":true,...,"configured":true})
curl -X POST -H "authorization: Bearer $CRON_SECRET" "https://vsite.in/api/cron/whatsapp?task=dispatch"
```
Then complete one onboarding with your own number → welcome with QR arrives.
Only a store that opens **on its trial** gets the welcome (one trial per account):
test with a phone number that has never had a store, or the first message you see
will be the payment receipt.

## Operating it

```sql
-- what went out today, by outcome
select event, status, count(*) from notification_outbox
where created_at > now() - interval '1 day' group by 1,2 order by 1,2;

-- failures and why (error_code = Meta code)
select event, status, error_code, last_error, attempts, created_at
from notification_outbox where status in ('failed','dead') order by created_at desc limit 50;

-- did the scheduler run, and what did the app answer?
select jobname, status, start_time from cron.job_run_details d join cron.job j using (jobid)
order by start_time desc limit 20;
select id, status_code, left(content::text, 200) from net._http_response order by id desc limit 20;
```

| Meta code | Meaning | Action |
|---|---|---|
| 190 | token expired | new System User token (step 1). Sending pauses and queued messages are kept; they resume by themselves within 15 minutes after the new token is set |
| breaker_open system 190 | token rejected, sending paused | new System User token; sending resumes by itself within 15 min |
| template_status PAUSED | Meta paused a template | fix wording in WhatsApp Manager; APPROVED reopens it |
| 133010 | OUR number is not registered | register the number in WhatsApp Manager (not a recipient problem) |
| 132000 / 132001 | template params / not approved | template in Meta ≠ `templates.ts` |
| 131026 | undeliverable (not on WhatsApp, old app) | nothing; owner still gets the bell |
| 131048 / 368 | quality / policy restriction | check WhatsApp Manager quality rating |
| 130429 (also 4, 80007, 131057) | throughput / rate limit | all sending pauses about 2 minutes, then resumes by itself |
| 131056 | pair rate limit | only that one message is retried later |

Alerts such as `breaker_open` and `template_status` arrive as Sentry email alerts
titled "WhatsApp: <kind>". Current pause state is in the database:

```sql
select key, open_until, reason, code from notification_health where open_until is not null;
```

Housekeeping runs once a day and deletes every outbox row older than 90 days
(sent, read, dead, skipped).

## Alerts (Sentry, free plan)

1. Sentry -> Alerts -> Create -> Issues -> "A new issue is created" OR "issue
   changes state from resolved to unresolved"; filter tag `area` equals
   `whatsapp`; action: email you.
2. Sentry -> Crons: the `whatsapp-dispatch` monitor appears after the first run.
   Set its alert to email you on missed/failed check-ins. It is the only monitor;
   the daily run is watched through `heartbeat:daily` by the watchdog.
3. Budget: the free plan is 5k events/month shared with the app. WhatsApp alerts
   are de-duplicated to a few per incident.

