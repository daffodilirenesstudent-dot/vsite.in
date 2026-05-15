// PATCH /api/manage/sites/[siteId]/kot-mode
// Toggles the KOT printing mode for a site: 'manual' | 'automatic'

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

async function authenticate(request: NextRequest) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyFirebaseToken(auth.replace('Bearer ', ''));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { siteId: string } }
) {
  const userId = await authenticate(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { kot_mode?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { kot_mode } = body;
  if (kot_mode !== 'manual' && kot_mode !== 'automatic') {
    return NextResponse.json({ error: 'kot_mode must be manual or automatic' }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from('sites')
    .update({ kot_mode })
    .eq('id', params.siteId)
    .eq('user_id', userId);

  if (error) {
    console.error('[PATCH kot-mode] update error:', error);
    return NextResponse.json({ error: 'Failed to update KOT mode' }, { status: 500 });
  }

  return NextResponse.json({ success: true, kot_mode });
}
