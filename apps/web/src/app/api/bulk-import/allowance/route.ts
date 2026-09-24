// src/app/api/bulk-import/allowance/route.ts
// How many AI pages a store has left for bulk upload, for the upload modal.
//
// GET ?siteId=<uuid>, Bearer Firebase token. The store must be the caller's;
// someone else's store answers 404, same as a missing one (AC11).
// With AI_PAGE_LIMITS OFF it answers { enforced: false } without touching the
// database; the modal does not call it then.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/auth/verifyFirebaseToken';
import { AI_PAGE_LIMITS } from '@/lib/platform/productFlags';
import { loadStoreAllowance, readBulkUsage } from '@/lib/menu/aiPageLedger';

export const runtime = 'nodejs';

const unavailable = () => NextResponse.json(
  { error: 'Could not check your AI pages. Please try again.', code: 'PAGE_LIMIT_UNAVAILABLE' },
  { status: 503 },
);

export async function GET(request: NextRequest) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await verifyFirebaseToken(auth.replace('Bearer ', ''));
  if (!userId) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  if (!AI_PAGE_LIMITS) return NextResponse.json({ success: true, enforced: false });

  const siteId = request.nextUrl.searchParams.get('siteId');
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 });

  const store = await loadStoreAllowance(userId, siteId);
  if (!store.ok) {
    return store.reason === 'not_found'
      ? NextResponse.json({ error: 'Site not found' }, { status: 404 })
      : unavailable();
  }

  const usage = await readBulkUsage(siteId, store.allowance);
  if (!usage.ok) return unavailable();

  return NextResponse.json({
    success: true,
    enforced: true,
    state: store.allowance.state,
    limit: usage.limit,
    used: usage.used,
    left: usage.left,
    resetsAt: store.allowance.resetsAt,
  });
}
