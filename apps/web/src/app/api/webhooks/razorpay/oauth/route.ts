// POST /api/webhooks/razorpay/oauth
//
// Partner-level webhook receiver. Razorpay signs the body with the partner
// webhook secret (NOT the sub-merchant secret). We listen for:
//   • payment.captured                       → mark local order paid (fallback for verify-payment failures)
//   • payment.failed                         → mark local order payment_status='failed'
//   • account.app.authorization_revoked      → flip integration row to revoked
//   • account.suspended / account.under_review → flip integration to revoked (admin can reconnect)

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch { return false; }
}

interface WebhookPayload {
  event:   string;
  payload: {
    payment?: { entity?: { id: string; order_id: string; status: string; amount: number; notes?: Record<string, string> } };
    account?: { entity?: { id: string } };
  };
  account_id?: string;
}

export async function POST(request: NextRequest) {
  const secret = process.env.RAZORPAY_OAUTH_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[razorpay/oauth webhook] RAZORPAY_OAUTH_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const sig = request.headers.get('x-razorpay-signature') ?? '';
  const raw = await request.text();
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  if (!timingSafeEqualHex(expected, sig)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: WebhookPayload;
  try { event = JSON.parse(raw); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    switch (event.event) {
      case 'payment.captured':
      case 'payment.authorized': {
        const p = event.payload.payment?.entity;
        if (!p) break;
        // Match by order_id; idempotent thanks to the unique index on razorpay_payment_id.
        const { data: order } = await supabaseServer
          .from('orders')
          .select('id, payment_status')
          .eq('razorpay_order_id', p.order_id)
          .maybeSingle();
        if (order && order.payment_status !== 'paid') {
          const { error } = await supabaseServer
            .from('orders')
            .update({ razorpay_payment_id: p.id, payment_status: 'paid' })
            .eq('id', order.id);
          if (error && (error as { code?: string }).code !== '23505') {
            console.error('[webhook] order update failed:', error);
          }
        }
        break;
      }
      case 'payment.failed': {
        const p = event.payload.payment?.entity;
        if (!p) break;
        await supabaseServer
          .from('orders')
          .update({ payment_status: 'failed' })
          .eq('razorpay_order_id', p.order_id)
          .neq('payment_status', 'paid');
        break;
      }
      case 'account.app.authorization_revoked':
      case 'account.suspended':
      case 'account.under_review': {
        const acc = event.payload.account?.entity?.id ?? event.account_id;
        if (!acc) break;
        await supabaseServer
          .from('site_payment_integrations')
          .update({ status: 'revoked' })
          .eq('account_id', acc)
          .eq('provider', 'razorpay');
        break;
      }
      default:
        // Unknown event — acknowledge so Razorpay stops retrying.
        break;
    }
  } catch (err) {
    console.error('[razorpay/oauth webhook] handler error:', err);
    // Return 200 anyway — duplicate retries on a transient bug aren't worth
    // having Razorpay disable our webhook.
  }

  return NextResponse.json({ ok: true });
}
