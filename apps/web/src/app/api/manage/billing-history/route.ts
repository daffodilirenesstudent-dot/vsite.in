import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/auth/verifyFirebaseToken';
import { supabaseServer } from '@/lib/platform/db/supabase-server';

/**
 * The owner's payment history for their own ₹299 plan.
 *
 * `billing_history` has been filling up since the first subscription — written
 * by verify-payment, and by the Razorpay webhook — but nothing ever read it
 * back. The subscription page asked owners to "Renew manually" while showing
 * no evidence that any previous payment existed.
 *
 * This lists payments. It is **not** a GST invoice: vsite has no GSTIN yet, so
 * nothing here is presented as a tax document, and no tax is broken out. When
 * a GSTIN exists, this is where the extra fields go.
 *
 * Scoped to one store. An owner can have several, and the table used to record
 * only who paid, never which store the payment was for — so every store showed
 * every other store's invoices. `site_id` (migration 053) is what makes the
 * list isolable, and the query pairs it with the uid so naming someone else's
 * store returns nothing rather than their payments.
 *
 * Security: `billing_history.user_id` is the Firebase uid, and this reads with
 * the service-role client, which bypasses RLS. The uid must therefore come
 * from the verified token — never from a query parameter — or any owner could
 * read another's payments. `site_id` is narrowing only; it never widens.
 */

/** Rows to return. A monthly plan means ~12 a year; two years is plenty. */
const MAX_INVOICES = 24;

interface BillingRow {
    id: string;
    plan_name: string | null;
    amount: number | string | null;
    currency: string | null;
    status: string | null;
    created_at: string | null;
    razorpay_payment_id: string | null;
}

/**
 * A short, human-quotable reference.
 *
 * Owners ring up saying "I paid in September" — a reference they can read off
 * the screen makes that call shorter. Derived from the row id so it is stable
 * across reloads without needing a new column or a sequence.
 */
/**
 * Turn the stored plan_name into something an owner should read.
 *
 * Rows written by the Razorpay webhook are named "Smart QR Menu — Payment
 * (webhook)" and rows written by verify-payment "Smart QR Menu — Monthly".
 * Which of the two code paths recorded a payment is our plumbing, not the
 * customer's business, and showing it in an invoice list invites the question
 * "what is a webhook?". Strip the suffix and keep the plan.
 */
function displayPlanName(raw: string | null): string {
    const name = (raw ?? '').trim();
    if (!name) return 'Smart QR Menu';
    // Everything from the em dash onwards is the internal qualifier.
    return name.split('—')[0].trim() || name;
}

function invoiceNumber(rowId: string): string {
    return `VS-${rowId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export async function GET(req: NextRequest) {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
    const userId = await verifyFirebaseToken(token);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // No store, no list. Defaulting to "every store this user owns" is the
    // behaviour this endpoint exists to stop.
    const siteId = new URL(req.url).searchParams.get('site_id')?.trim();
    if (!siteId) return NextResponse.json({ error: 'site_id is required' }, { status: 400 });

    const { data, error } = await supabaseServer
        .from('billing_history')
        .select('id, plan_name, amount, currency, status, created_at, razorpay_payment_id')
        .eq('user_id', userId)
        .eq('site_id', siteId)
        .order('created_at', { ascending: false })
        .limit(MAX_INVOICES);

    if (error) {
        // Surfacing this as an empty list would tell an owner their payments
        // had vanished, which is a far worse lie than "couldn't load".
        console.error('[billing-history] query failed:', error.message);
        return NextResponse.json({ error: 'Could not load your invoices' }, { status: 500 });
    }

    const invoices = ((data ?? []) as BillingRow[]).map(row => ({
        id: row.id,
        invoiceNo: invoiceNumber(row.id),
        planName: displayPlanName(row.plan_name),
        amount: Number(row.amount ?? 0),
        currency: row.currency ?? 'INR',
        status: row.status ?? 'Success',
        paidAt: row.created_at,
        paymentId: row.razorpay_payment_id,
    }));

    return NextResponse.json({ success: true, invoices });
}
