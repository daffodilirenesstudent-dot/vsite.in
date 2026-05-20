// GET /api/orders/[id]/status
// Public (no auth) — returns only counter_number, token_number, payment_status.
// Used by:
//   1. Customer counter-waiting screen (no ?t param — same-session polling)
//   2. Email link order status page (?t=SIGNED_TOKEN — 24hr signed link)
// Must never be cached — the whole point is live status.

import { NextRequest, NextResponse } from 'next/server';
import { verifyOrderToken } from '@/lib/orderEmail';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// Minimum response time to prevent timing-oracle enumeration of valid order IDs.
//
// Set to cover the p95 of the downstream Supabase REST call. The previous
// floor (60ms) only padded responses that bypassed the DB entirely (e.g.,
// fast-rejected signed tokens), letting an attacker distinguish:
//   - no-token  (~150–1500ms, hits Supabase) vs
//   - bad-token (~90ms, fails fast at HMAC)
//
// 800ms covers Supabase's slowest observed responses on the free tier and
// makes 404s and 200s timing-indistinguishable from the attacker's view.
//
// UX impact: legitimate "customer waits 0.8s for status" instead of 0.1s.
// Acceptable — this endpoint is polled, not blocking initial page render.
const MIN_RESPONSE_MS = 800;

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const start = Date.now();

  // Pad every response to MIN_RESPONSE_MS so 404 and 200 are indistinguishable
  // by timing — prevents brute-force enumeration of the order ID space.
  async function respond(body: unknown, init: ResponseInit) {
    const elapsed = Date.now() - start;
    if (elapsed < MIN_RESPONSE_MS) {
      await new Promise(r => setTimeout(r, MIN_RESPONSE_MS - elapsed));
    }
    return NextResponse.json(body, init);
  }

  const { id } = params;
  if (!id) {
    return respond({ error: 'Order ID required' }, { status: 400 });
  }

  // If a signed token is present (email link), verify it. Expired = 410 Gone.
  const signedToken = _request.nextUrl.searchParams.get('t');
  if (signedToken) {
    const verified = verifyOrderToken(signedToken);
    if (!verified || verified !== id) {
      return respond({ error: 'Link expired or invalid' }, { status: 410 });
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return respond({ error: 'Server misconfiguration' }, { status: 500 });
  }

  // Unauthenticated: only fetch non-PII columns. Signed link: fetch full receipt.
  const selectCols = signedToken
    ? 'counter_number,token_number,table_number,payment_status,payment_method,status,order_number,items,subtotal,customer_name'
    : 'counter_number,token_number,table_number,payment_status,payment_method,status,order_number';
  const url = `${supabaseUrl}/rest/v1/orders?select=${selectCols}&id=eq.${encodeURIComponent(id)}&limit=1`;
  const res = await fetch(url, {
    cache: 'no-store',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    return respond({ error: 'Order not found' }, { status: 404 });
  }

  const rows: {
    counter_number: string | null;
    token_number: string | null;
    table_number: string | null;
    payment_status: string;
    payment_method: string;
    status: string;
    order_number: string;
    items: { name: string; qty: number; price: number; variantSize?: string }[] | null;
    subtotal: number | null;
    customer_name: string | null;
  }[] = await res.json();

  if (!rows.length) {
    return respond({ error: 'Order not found' }, { status: 404 });
  }

  const { counter_number, token_number, table_number, payment_status, payment_method, status, order_number, items, subtotal, customer_name } = rows[0];

  // Unauthenticated callers get minimal status only — never PII or item data.
  // Signed email links get the full receipt.
  const payload = signedToken
    ? { counter_number, token_number, table_number, payment_status, payment_method, status, order_number, items, subtotal, customer_name }
    : { counter_number, token_number, table_number, payment_status, payment_method, status, order_number };

  return respond(
    payload,
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } },
  );
}
