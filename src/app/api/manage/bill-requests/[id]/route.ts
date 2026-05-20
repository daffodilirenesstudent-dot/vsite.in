// PATCH /api/manage/bill-requests/[id]
// Firebase auth required. Acknowledges a bill request (sets status → 'acknowledged').
//
// Rate-limited per-user (30/min) to defeat the insider "mass-ack" attack — a
// cashier scripting 100 acks/sec to mask which tables actually paid. Normal
// admin UI use is 1-2 acks per few minutes; 30/min is generous for genuine bursts.
import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { rateLimit } from '@/lib/rateLimit';
import { audit } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await verifyFirebaseToken(authHeader.replace('Bearer ', ''));
  if (!userId) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const rl = rateLimit(`bill-ack:${userId}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many bill-request acknowledgements. Slow down.' },
      { status: 429, headers: { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } },
    );
  }

  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  // I8 hardening: require a reason for MANUAL acks so the owner can audit why
  // the cashier dismissed without checking out. checkout_table_atomic auto-acks
  // and never hits this endpoint, so the body requirement only affects manual
  // dismissal — the actual risk path. Free text 3-200 chars; reason captured in
  // audit log.
  let body: { reason?: string } = {};
  try { body = await request.json().catch(() => ({})); } catch { /* tolerate empty */ }
  const rawReason = typeof body.reason === 'string' ? body.reason : '';
  const reason = rawReason.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 200);
  if (!reason || reason.length < 3) {
    return NextResponse.json(
      { error: 'A short reason for dismissing this bill request is required (e.g., "customer changed mind", "false request")' },
      { status: 400 },
    );
  }

  // Verify bill request exists and belongs to a site the caller owns
  const { data: br } = await supabaseServer
    .from('bill_requests').select('id, site_id').eq('id', id).maybeSingle();
  if (!br) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: site } = await supabaseServer
    .from('sites').select('id').eq('id', br.site_id).eq('user_id', userId).maybeSingle();
  if (!site) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { error } = await supabaseServer
    .from('bill_requests')
    .update({ status: 'acknowledged', acknowledged_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('[PATCH /api/manage/bill-requests/[id]]', error);
    return NextResponse.json({ error: 'Failed to acknowledge' }, { status: 500 });
  }

  audit({
    userId, siteId: br.site_id, action: 'bill_request_ack',
    targetId: id,
    details: { manual_ack: true, reason },
    request,
  });

  return NextResponse.json({ success: true });
}
