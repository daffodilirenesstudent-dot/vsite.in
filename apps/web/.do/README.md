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
