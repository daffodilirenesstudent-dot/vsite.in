// POST /api/manage/media/release
//
// Deletes the stored photos an owner's edit no longer uses: the old photo of a
// dish or banner that was given a new one, or the photo of one that was
// deleted. Before this, every replaced or deleted photo stayed in storage
// forever (QA 2026-09-26: 226 files in product-images, 68 in use).
//
// Body: { siteId, urls: string[] } — at most 10. The dashboard calls this only
// AFTER its database save succeeded, so a failed save never loses the photo
// still on the menu.
//
// Deleting is permanent, so a URL is removed only when ALL hold:
//   1. the caller owns the store;
//   2. it is the store's own upload (lib/menu/photoCleanup — never the shared
//      default-images library, never another store's folder);
//   3. no dish or banner in ANY store still points at it.
// Anything else is kept and counted, never an error: keeping a file is always
// the safe answer. The thumbnail beside the photo goes with it.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/auth/verifyFirebaseToken';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { rateLimit } from '@/lib/platform/rateLimit';
import { thumbObjectName } from '@/lib/menu/menuImages';
import { parseOwnedUpload } from '@/lib/menu/photoCleanup';

export const dynamic = 'force-dynamic';

const BUCKET = 'product-images';
const MAX_URLS = 10;

/** Escape LIKE wildcards so a file name is matched literally. */
const likeLiteral = (s: string) => s.replace(/[\\%_]/g, c => `\\${c}`);

/** True when any dish or banner still points at this file (with or without a query string). */
async function stillInUse(urlPath: string): Promise<boolean> {
    const pattern = `%/product-images/${likeLiteral(urlPath)}%`;
    for (const table of ['products', 'banners'] as const) {
        const { data, error } = await supabaseServer.from(table).select('id').like('image_url', pattern).limit(1);
        // A failed check is not a "no": keep the file.
        if (error || !Array.isArray(data) || data.length > 0) return true;
    }
    return false;
}

export async function POST(request: NextRequest) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = await verifyFirebaseToken(authHeader.replace('Bearer ', ''));
    if (!userId) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const rl = rateLimit(`media-release:${userId}`, { limit: 60, windowMs: 60_000 });
    if (!rl.allowed) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    let body: { siteId?: unknown; urls?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { siteId, urls } = body ?? {};
    if (typeof siteId !== 'string' || !siteId) {
        return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }
    if (!Array.isArray(urls) || urls.length === 0 || urls.length > MAX_URLS
        || !urls.every(u => typeof u === 'string' && u.length > 0 && u.length <= 1000)) {
        return NextResponse.json({ error: `urls must be 1–${MAX_URLS} URLs` }, { status: 400 });
    }

    // Scoped by user_id: someone else's store reads as absent.
    const { data: site } = await supabaseServer
        .from('sites')
        .select('id, slug')
        .eq('id', siteId)
        .eq('user_id', userId)
        .maybeSingle();
    if (!site) {
        return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    let removed = 0;
    let kept = 0;
    for (const url of Array.from(new Set(urls as string[]))) {
        const upload = parseOwnedUpload(url, { siteId: site.id, slug: site.slug });
        if (!upload || await stillInUse(upload.urlPath)) { kept++; continue; }

        const thumb = thumbObjectName(upload.name);
        const { error } = await supabaseServer.storage.from(BUCKET).remove(thumb ? [upload.name, thumb] : [upload.name]);
        if (error) { kept++; continue; }
        removed++;
    }

    return NextResponse.json({ success: true, removed, kept });
}
