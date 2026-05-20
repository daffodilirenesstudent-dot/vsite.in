// PATCH /api/manage/sites/[siteId]/kot-device
// Assigns (or clears) the KOT station device for a site.
// Body: { device_id: string | null }

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';

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

  let body: { device_id?: string | null };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { device_id } = body;

  const { error } = await supabaseServer
    .from('sites')
    .update({ kot_station_device_id: device_id ?? null })
    .eq('id', params.siteId)
    .eq('user_id', userId);

  if (error) {
    console.error('[PATCH kot-device]', error);
    return NextResponse.json({ error: 'Failed to update KOT device' }, { status: 500 });
  }

  return NextResponse.json({ success: true, kot_station_device_id: device_id ?? null });
}
