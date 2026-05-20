// PATCH /api/manage/sites/[siteId]/printer-settings
// Body: { kot_printer_name?: string | null, bill_printer_name?: string | null }
// Saves which Windows printers are assigned as KOT and Bill printers for the site.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { audit } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { siteId: string } },
) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await verifyFirebaseToken(auth.replace('Bearer ', ''));
  if (!userId) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  let body: { kot_printer_name?: string | null; bill_printer_name?: string | null };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const update: Record<string, string | null> = {};
  if ('kot_printer_name' in body)  update.kot_printer_name  = body.kot_printer_name  ?? null;
  if ('bill_printer_name' in body) update.bill_printer_name = body.bill_printer_name ?? null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from('sites')
    .update(update)
    .eq('id', params.siteId)
    .eq('user_id', userId);

  if (error) {
    console.error('[PATCH printer-settings]', error);
    return NextResponse.json({ error: 'Failed to save printer settings' }, { status: 500 });
  }

  audit({
    userId, siteId: params.siteId, action: 'printer_settings_change',
    targetId: params.siteId,
    details: update,
    request,
  });

  return NextResponse.json({ success: true, ...update });
}
