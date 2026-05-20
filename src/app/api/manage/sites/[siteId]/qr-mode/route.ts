// GET  /api/manage/sites/[siteId]/qr-mode  — current QR settings
// PATCH /api/manage/sites/[siteId]/qr-mode  — schedule or immediate mode switch

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

async function authenticate(request: NextRequest) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyFirebaseToken(auth.replace('Bearer ', ''));
}

async function verifySiteOwnership(siteId: string, userId: string) {
  const { data, error } = await supabaseServer
    .from('sites')
    .select('id, qr_mode, table_count, pending_qr_mode, qr_mode_switch_at')
    .eq('id', siteId)
    .eq('user_id', userId)
    .single();
  if (error || !data) return null;
  return data;
}

// GET — return current QR mode settings
export async function GET(
  request: NextRequest,
  { params }: { params: { siteId: string } }
) {
  const userId = await authenticate(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const site = await verifySiteOwnership(params.siteId, userId);
  if (!site) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Resolve if a pending switch has already elapsed
  let effectiveMode = site.qr_mode;
  let pendingMode = site.pending_qr_mode;
  let switchAt = site.qr_mode_switch_at;

  if (pendingMode && switchAt && new Date(switchAt) <= new Date()) {
    effectiveMode = pendingMode;
    pendingMode = null;
    switchAt = null;
    // Apply in background
    await supabaseServer.from('sites').update({
      qr_mode: effectiveMode,
      pending_qr_mode: null,
      qr_mode_switch_at: null,
    }).eq('id', params.siteId);
  }

  return NextResponse.json({
    qr_mode: effectiveMode,
    table_count: site.table_count,
    pending_qr_mode: pendingMode,
    qr_mode_switch_at: switchAt,
  });
}

// PATCH — switch QR mode
// Body: { mode: 'common'|'table', tableCount?: number, startNow?: boolean }
export async function PATCH(
  request: NextRequest,
  { params }: { params: { siteId: string } }
) {
  const userId = await authenticate(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const site = await verifySiteOwnership(params.siteId, userId);
  if (!site) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: { mode?: string; tableCount?: number; startNow?: boolean };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { mode, tableCount, startNow } = body;

  if (mode !== 'common' && mode !== 'table') {
    return NextResponse.json({ error: 'mode must be common or table' }, { status: 400 });
  }

  // Validate tableCount when switching to table mode
  if (mode === 'table') {
    if (!tableCount || !Number.isInteger(tableCount) || tableCount < 1 || tableCount > 50) {
      return NextResponse.json({ error: 'tableCount must be 1–50' }, { status: 400 });
    }
  }

  // If already on this mode and no table count change, no-op
  const currentMode = site.qr_mode;
  const noModeChange = mode === currentMode;
  const noCountChange = !tableCount || tableCount === site.table_count;
  if (noModeChange && noCountChange && !site.pending_qr_mode) {
    return NextResponse.json({
      qr_mode: site.qr_mode,
      table_count: site.table_count,
      pending_qr_mode: null,
      qr_mode_switch_at: null,
    });
  }

  const switchNow = startNow === true || noModeChange;

  if (switchNow) {
    // Apply immediately
    const { error } = await supabaseServer.from('sites').update({
      qr_mode: mode,
      table_count: tableCount ?? site.table_count,
      pending_qr_mode: null,
      qr_mode_switch_at: null,
    }).eq('id', params.siteId);

    if (error) {
      console.error('[PATCH qr-mode] update error:', error);
      return NextResponse.json({ error: 'Failed to update QR mode' }, { status: 500 });
    }

    return NextResponse.json({
      qr_mode: mode,
      table_count: tableCount ?? site.table_count,
      pending_qr_mode: null,
      qr_mode_switch_at: null,
    });
  } else {
    // Schedule 24 hours from now
    const switchAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabaseServer.from('sites').update({
      table_count: tableCount ?? site.table_count,
      pending_qr_mode: mode,
      qr_mode_switch_at: switchAt,
    }).eq('id', params.siteId);

    if (error) {
      console.error('[PATCH qr-mode] schedule error:', error);
      return NextResponse.json({ error: 'Failed to schedule QR mode switch' }, { status: 500 });
    }

    return NextResponse.json({
      qr_mode: site.qr_mode,
      table_count: tableCount ?? site.table_count,
      pending_qr_mode: mode,
      qr_mode_switch_at: switchAt,
    });
  }
}
