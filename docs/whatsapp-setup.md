# WhatsApp notifications — go-live runbook

Code: `apps/web/src/lib/notifications/whatsapp/`. Design:
`docs/superpowers/specs/2026-09-22-whatsapp-notifications-design.md`.

Do the steps **in order** — Meta's "Verify and save" calls our server the moment
you press it, so the route must be deployed with the verify token first.

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

1. Apply `apps/web/supabase/migrations/057_notification_outbox.sql`.
2. Create the secret pg_cron uses (SQL editor, **never commit this**):
   ```sql
   select vault.create_secret('<same value as DO CRON_SECRET>', 'cron_secret');
   ```
3. Apply `058_whatsapp_cron.sql` (enables pg_cron + pg_net, schedules two jobs).
4. Check: `select jobname, schedule from cron.job;` → `whatsapp-daily 30 4 * * *`,
   `whatsapp-dispatch */10 * * * *`.

## 4. Deploy, then verify the webhook

After the deploy is live:

1. Meta App Dashboard → WhatsApp → Configuration (the screen in the screenshot):
   - **Callback URL:** `https://vsite.in/api/webhooks/whatsapp`
   - **Verify token:** the `WHATSAPP_VERIFY_TOKEN` value
   - **Verify and save** → must turn green.
2. **Webhook fields → `messages` → Subscribe.**
3. The orange banner: production webhooks arrive only after **App → Publish**
   (needs a privacy policy URL — use `https://vsite.in/privacy`) and business
   verification (Step 3 in the left menu).

## 5. Create the 7 templates

WhatsApp Manager → Message templates → Create. **Category: Utility.
Language: English (`en`).** Name, header, body and footer must match exactly —
the code sends these names with these parameter counts
(`templates.ts` is the source of truth). Add the sample values Meta asks for.

### `vsite_welcome_qr`
- Header: **Image** (sample: any QR PNG)
- Body:
  ```
  Congratulations! {{1}} is now live on vsite.

  Your QR code is attached. Print it and place it on your tables or counter — customers scan it to see your menu.

  Menu link: {{2}}

  Your free trial is active until {{3}}. You can edit your menu anytime from your dashboard.
  ```
  Samples: `Anna Cafe`, `https://vsite.in/shop/anna-cafe`, `29 Sept 2026`

### `vsite_trial_ending`
```
Your free trial for {{1}} ends on {{2}}.

After that, customers who scan your QR code will not see your menu. To keep it live, activate your plan (₹{{3}}/month) at vsite.in/manage/subscription.
```
Samples: `Anna Cafe`, `29 Sept 2026`, `299`

### `vsite_trial_ended`
```
The free trial for {{1}} has ended, so your QR menu is now offline.

Your menu and photos are saved. Activate your plan (₹{{2}}/month) at vsite.in/manage/subscription to bring it back instantly.
```
Samples: `Anna Cafe`, `299`

### `vsite_payment_receipt`
```
Payment received: ₹{{1}} for your vsite Smart QR Menu plan.

Your menu is live until {{2}}. Your invoice is available at vsite.in/manage/subscription.
```
Samples: `299`, `22 Oct 2026`

### `vsite_plan_expiring`
```
Your vsite plan for {{1}} expires on {{2}}.

Renew at vsite.in/manage/subscription to keep your QR menu live without interruption.
```
Samples: `Anna Cafe`, `25 Sept 2026`

### `vsite_plan_expires_today`
```
Your vsite plan for {{1}} expires today.

Renew at vsite.in/manage/subscription so customers can keep scanning your QR menu.
```
Sample: `Anna Cafe`

### `vsite_plan_expired`
```
Your vsite plan for {{1}} has expired, so your QR menu is now offline.

Your menu is saved. Renew at vsite.in/manage/subscription to bring it back instantly.
```
Sample: `Anna Cafe`

**Footer for all seven:** `vsite.in · Smart QR Menu`

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
| 190 | token expired | new System User token (step 1) |
| 132000 / 132001 | template params / not approved | template in Meta ≠ `templates.ts` |
| 131026 | undeliverable (not on WhatsApp, old app) | nothing; owner still gets the bell |
| 131048 / 368 | quality / policy restriction | check WhatsApp Manager quality rating |
| 130429 / 131056 | throughput / pair rate | retried automatically |
