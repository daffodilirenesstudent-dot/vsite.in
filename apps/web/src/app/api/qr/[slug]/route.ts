// GET /api/qr/[slug]
//
// A plain PNG QR code of a shop's public menu URL. It exists so the WhatsApp
// welcome message can carry the QR as an image header: Meta downloads the image
// from a public link at send time, and the styled QR on /manage/qr is drawn in
// the browser, so there was nothing on the server to link to.
//
// Only real shops render (404 otherwise), so this is not a free QR service for
// arbitrary text. The image is deterministic per slug and cached for a day.

import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { rateLimit, getClientIp } from '@/lib/platform/rateLimit';
import { SITE_URL } from '@/lib/platform/brand';

export const runtime = 'nodejs';

/** Matches what onboarding's generateSlug produces: ASCII word chars and hyphens. */
const SLUG_RE = /^[a-z0-9_-]{1,80}$/;

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
    const slug = params.slug;
    if (!SLUG_RE.test(slug)) {
        return NextResponse.json({ error: 'Invalid shop' }, { status: 400 });
    }

    const rl = rateLimit(`qr-img:${getClientIp(req.headers)}`, { limit: 60, windowMs: 60_000 });
    if (!rl.allowed) {
        return NextResponse.json(
            { error: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } },
        );
    }

    const { data, error } = await supabaseServer.from('sites').select('id').eq('slug', slug).maybeSingle();
    if (error) {
        console.error('[qr] site lookup failed:', error.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
    if (!data) {
        return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    const png = await QRCode.toBuffer(`${SITE_URL}/shop/${slug}`, {
        type: 'png',
        width: 800,
        margin: 2,
        errorCorrectionLevel: 'M',
    });

    return new NextResponse(new Uint8Array(png), {
        status: 200,
        headers: {
            'Content-Type': 'image/png',
            'Content-Length': String(png.length),
            'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        },
    });
}
