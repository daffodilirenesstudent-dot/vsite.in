// POST /api/bill-request
// Public endpoint — no auth (customer-facing).
// Rate limits:
//   • Per-IP:    3 requests per IP per 5 minutes (across all tables)
//   • Per-table: 1 pending request per table per 5 minutes
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { verifyTableSig } from '@/lib/qrSignature';
import crypto from 'crypto';

const STRICT_TABLE_SIG = process.env.STRICT_TABLE_SIG === '1';

export const dynamic    = 'force-dynamic';
export const fetchCache = 'force-no-store';

const IP_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const IP_LIMIT_MAX       = 3;

// In-memory IP rate limiter — lightweight, resets on cold start, good enough
// for this low-traffic public endpoint. No Redis dependency needed.
const ipHits = new Map<string, { count: number; resetAt: number }>();

function checkIpLimit(ip: string): boolean {
  const now  = Date.now();
  const hash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
  const rec  = ipHits.get(hash);
  if (!rec || now >= rec.resetAt) {
    ipHits.set(hash, { count: 1, resetAt: now + IP_LIMIT_WINDOW_MS });
    return true;
  }
  rec.count++;
  return rec.count <= IP_LIMIT_MAX;
}

export async function POST(request: NextRequest) {
  // IP rate limit — checked before any DB work
  const rawIp = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
  if (!checkIpLimit(rawIp)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429 },
    );
  }

  let body: { siteId?: string; tableNumber?: string | number; tableSig?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { siteId, tableNumber, tableSig } = body;
  if (!siteId || !/^[0-9a-f-]{36}$/i.test(siteId)) {
    return NextResponse.json({ error: 'Invalid siteId' }, { status: 400 });
  }
  if (!tableNumber) {
    return NextResponse.json({ error: 'tableNumber is required' }, { status: 400 });
  }
  const tableStr = String(tableNumber);
  const tableNum = Number(tableNumber);

  // Verify site exists and is live (pull qr_secret + slug for H3 sig check)
  const { data: site } = await supabaseServer
    .from('sites')
    .select('id, is_live, slug, qr_secret')
    .eq('id', siteId)
    .maybeSingle();
  if (!site?.is_live) {
    return NextResponse.json({ error: 'Store not found or offline' }, { status: 404 });
  }

  // ── Signed-QR check (H3) ──────────────────────────────────────────────────
  // Bill-request is the most attack-attractive endpoint — anyone who knows the
  // slug can ring the bell for any table without signing. With sig, only a
  // customer holding the genuine QR card can request the bill for that table.
  if (Number.isFinite(tableNum) && tableNum > 0) {
    const sigValid = verifyTableSig(site.slug ?? '', tableNum, site.qr_secret ?? '', tableSig);
    if (!sigValid) {
      if (STRICT_TABLE_SIG) {
        return NextResponse.json({ error: 'Invalid table QR — please re-scan from the table card' }, { status: 400 });
      }
      console.warn(`[POST /api/bill-request] unsigned tableNumber=${tableNum} for slug=${site.slug} — accepted under PHASE 1`);
    }
  }

  // Verify at least one active (non-completed) order exists for this table.
  // Use limit(1) not maybeSingle() — tables with multiple active orders (ordering
  // in rounds) would cause maybeSingle() to return an error, giving a false 400.
  const { data: activeOrders } = await supabaseServer
    .from('orders')
    .select('id')
    .eq('site_id', siteId)
    .eq('table_number', tableStr)
    .neq('status', 'completed')
    .limit(1);
  if (!activeOrders || activeOrders.length === 0) {
    return NextResponse.json({ error: 'No active orders found for this table' }, { status: 400 });
  }

  // Rate limit: 1 pending bill request per table per 5 minutes
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: recent } = await supabaseServer
    .from('bill_requests')
    .select('id')
    .eq('site_id', siteId)
    .eq('table_number', tableStr)
    .eq('status', 'pending')
    .gte('requested_at', fiveMinutesAgo)
    .maybeSingle();
  if (recent) {
    return NextResponse.json(
      { error: 'Bill already requested. Staff will be with you shortly.' },
      { status: 429 },
    );
  }

  const { data, error } = await supabaseServer
    .from('bill_requests')
    .insert({ site_id: siteId, table_number: tableStr })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[POST /api/bill-request]', error);
    return NextResponse.json({ error: 'Failed to send bill request' }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: data.id });
}
