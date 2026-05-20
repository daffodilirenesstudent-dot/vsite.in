// GET /api/manage/sites/[siteId]/table-qr-sigs
//
// Returns HMAC signatures for every table at this site so the client-rendered
// QR page can build /shop/<slug>?table=N&sig=<sig> URLs without ever holding
// the per-site secret in the browser.
//
// Auth: Firebase Bearer; site_id must belong to caller.
// Response: { slug, table_count, sigs: { "1": "abcdef1234567890", ... } }
//
// Why a server endpoint: HMAC requires the secret. The secret stays server-only.
// The client just fetches the precomputed signatures and concatenates them
// into the QR data string. Stealing the response gives an attacker the sigs
// for ONE site only — not the secret, and not other sites' sigs.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { signTable } from '@/lib/qrSignature';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const HARD_MAX_TABLES = 200; // matches qr-mode/route.ts upper bound

export async function GET(
  req: NextRequest,
  { params }: { params: { siteId: string } },
) {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await verifyFirebaseToken(auth.replace('Bearer ', ''));
  if (!userId) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const { siteId } = params;
  if (!siteId || !/^[0-9a-f-]{36}$/i.test(siteId)) {
    return NextResponse.json({ error: 'Invalid siteId' }, { status: 400 });
  }

  // Single query: validates ownership AND fetches slug + secret + table_count.
  const { data: site, error } = await supabaseServer
    .from('sites')
    .select('slug, qr_secret, table_count')
    .eq('id', siteId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !site) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tableCount = Math.min(Math.max(0, site.table_count ?? 0), HARD_MAX_TABLES);

  const sigs: Record<string, string> = {};
  // Always include 1 even when table_count is 0 — covers single-QR layouts.
  const upper = Math.max(tableCount, 1);
  for (let n = 1; n <= upper; n++) {
    sigs[String(n)] = signTable(site.slug ?? '', n, site.qr_secret ?? '');
  }

  return NextResponse.json(
    { slug: site.slug, tableCount, sigs },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
