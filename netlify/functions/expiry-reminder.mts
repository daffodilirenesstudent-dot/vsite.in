// Netlify Scheduled Function — daily 03:30 UTC trigger that forwards to the
// Next.js cron route. Schedule is declared in netlify.toml under
// [functions."expiry-reminder"]. Keeping the actual sweep logic inside the
// Next.js API route lets the same endpoint be invoked by Vercel Cron, an
// external cron service, or this scheduled function — without code duplication.

import type { Config } from '@netlify/functions';

export default async (_req: Request) => {
  const base = process.env.URL ?? process.env.DEPLOY_URL ?? '';
  const secret = process.env.CRON_SECRET ?? '';
  if (!base) {
    return new Response(JSON.stringify({ error: 'URL env var missing' }), { status: 500 });
  }

  const target = `${base.replace(/\/$/, '')}/api/cron/expiry-reminder`;
  const resp = await fetch(target, {
    method: 'POST',
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
  const body = await resp.text();
  return new Response(body, { status: resp.status, headers: { 'content-type': 'application/json' } });
};

export const config: Config = {
  schedule: '30 3 * * *',
};
