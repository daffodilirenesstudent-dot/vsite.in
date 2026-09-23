import { NextResponse } from 'next/server';

// Polled by the /add-feature live-verify phase to confirm which commit is
// serving. COMMIT_SHA is bound to ${_self.COMMIT_HASH} in DigitalOcean.
export const dynamic = 'force-dynamic';

export function GET() {
    const raw = process.env.COMMIT_SHA ?? '';
    const sha = /^[0-9a-f]{3,40}$/i.test(raw) ? raw : 'unknown';
    return NextResponse.json({ sha }, { headers: { 'Cache-Control': 'no-store' } });
}
