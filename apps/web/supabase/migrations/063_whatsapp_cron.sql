-- 063 — Schedule the WhatsApp notification job with pg_cron + pg_net (2026-09-22)
--
-- DigitalOcean App Platform has no scheduler: `.do/app.yaml` jobs are PRE_DEPLOY
-- and run once per deploy. Supabase already runs Postgres for us, so the clock
-- lives here and calls the app over HTTPS, authenticated exactly like any other
-- cron caller: `Authorization: Bearer <CRON_SECRET>` (src/lib/platform/cronAuth.ts).
--
-- PREREQUISITE — run ONCE by hand in the SQL editor, never committed:
--
--     select vault.create_secret('<the CRON_SECRET value from DigitalOcean>', 'cron_secret');
--
-- The secret is read from Vault at call time, so rotating it is
-- `select vault.update_secret(id, '<new>') from vault.secrets where name = 'cron_secret';`
-- with no change here. If the secret is missing the header is `Bearer ` and the
-- app rejects the call (authorizeCron fails closed) — a visible 401 in
-- net._http_response, not an open endpoint.
--
-- Jobs:
--   whatsapp-daily     04:30 UTC = 10:00 IST  sweep for due trial/plan messages, then send
--   whatsapp-dispatch  every 10 minutes        send queued rows and due retries
--
-- Inspect:   select * from cron.job_run_details order by start_time desc limit 20;
--            select id, status_code, left(content, 200) from net._http_response order by id desc limit 20;
-- Pause:     select cron.unschedule('whatsapp-dispatch');

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Re-runnable: drop our jobs if they exist, then (re)create them.
DO $$
BEGIN
    PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('whatsapp-daily', 'whatsapp-dispatch');
END $$;

SELECT cron.schedule(
    'whatsapp-daily',
    '30 4 * * *',
    $job$
    SELECT net.http_post(
        url := 'https://vsite.in/api/cron/whatsapp',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || coalesce((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'), '')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
    );
    $job$
);

SELECT cron.schedule(
    'whatsapp-dispatch',
    '*/10 * * * *',
    $job$
    SELECT net.http_post(
        url := 'https://vsite.in/api/cron/whatsapp?task=dispatch',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || coalesce((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'), '')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
    );
    $job$
);
