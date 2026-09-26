// PATCH /api/manage/sites/[siteId]/menu-theme
//
// Changes the menu's design, font pairing and brand colour.
//
// ─── THIS ROUTE MUST NEVER TOUCH MENU DATA ───────────────────────────────────
// A design is config on the site row. It writes four columns and nothing else:
// no product row, no slug, no qr_secret. Switching a design must leave the menu,
// the URL and the printed QR code exactly as they were — otherwise the standees
// already on twenty tables stop resolving, and every future design becomes a
// migration instead of a row update.
// ─────────────────────────────────────────────────────────────────────────────
//
// Every successful change is written to admin_audit_log as `menu_theme_change`
// with { before, after, source }. That trail is not bookkeeping: the decision in
// October on whether to build more designs rests on the share of stores that
// change theirs within 30 days, and this is the only place that is recorded.

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { verifyFirebaseToken } from '@/lib/auth/verifyFirebaseToken';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { audit } from '@/lib/platform/auditLog';
import { isMenuThemeId, isFontPairId, isHexColor } from '@/lib/menu/menuThemes';

export const dynamic = 'force-dynamic';

async function authenticate(request: NextRequest) {
    const auth = request.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return null;
    return verifyFirebaseToken(auth.replace('Bearer ', ''));
}

interface Body {
    menu_theme?: unknown;
    menu_font?: unknown;
    primary_color?: unknown;
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: { siteId: string } },
) {
    const userId = await authenticate(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: Body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // `await request.json()` returns null, a number, a string or an array for
    // plenty of syntactically valid bodies, and reading a field off any of them
    // throws — which surfaces as a 500 on an authenticated route anyone can
    // reach. Reject the shape before touching a single field. Same defect, and
    // the same fix, as validatePayload() in api/onboarding/complete.
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 });
    }

    // Build the patch from whatever was actually sent, rejecting anything that
    // is present but invalid. A partial update is legitimate — the Appearance
    // panel saves one control at a time.
    const patch: Record<string, unknown> = {};

    if (body.menu_theme !== undefined) {
        if (!isMenuThemeId(body.menu_theme)) {
            return NextResponse.json(
                { error: 'menu_theme must be classic, cafe or premium' },
                { status: 400 },
            );
        }
        patch.menu_theme = body.menu_theme;
    }

    if (body.menu_font !== undefined) {
        if (!isFontPairId(body.menu_font)) {
            return NextResponse.json(
                { error: 'menu_font must be classic, warm or sharp' },
                { status: 400 },
            );
        }
        patch.menu_font = body.menu_font;
    }

    if (body.primary_color !== undefined) {
        // Owner-supplied and rendered into a style block. Anything but a plain
        // six-digit hex is a CSS injection, not a colour.
        if (!isHexColor(body.primary_color)) {
            return NextResponse.json(
                { error: 'primary_color must be a six-digit hex colour' },
                { status: 400 },
            );
        }
        patch.primary_color = body.primary_color;
    }

    if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    // Read-before-write, scoped to the caller. A site that is not theirs reads
    // as absent, so an attacker learns nothing from the difference.
    const { data: row } = await supabaseServer
        .from('sites')
        .select('menu_theme, menu_font, primary_color, slug')
        .eq('id', params.siteId)
        .eq('user_id', userId)
        .maybeSingle();

    if (!row) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    // The slug only locates the public page to refresh; it is not part of the design.
    const { slug, ...prev } = row as typeof row & { slug?: string | null };

    const { error } = await supabaseServer
        .from('sites')
        .update(patch)
        .eq('id', params.siteId)
        .eq('user_id', userId);

    if (error) {
        console.error('[PATCH menu-theme]', error);
        return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }

    // The next diner gets the new design, not the cached page from before it.
    if (slug) revalidatePath(`/shop/${slug}`);

    audit({
        userId,
        siteId: params.siteId,
        action: 'menu_theme_change',
        targetId: params.siteId,
        details: { before: prev, after: patch, source: 'settings' },
        request,
    });

    return NextResponse.json({ success: true, ...prev, ...patch });
}
