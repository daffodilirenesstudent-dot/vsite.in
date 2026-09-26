import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/auth/verifyFirebaseToken';
import { readStoreEligibility } from '@/lib/platform/storeEligibility';

/**
 * GET /api/onboarding/eligibility — where the signed-in account stands before
 * it builds a store: how many it has, the limit, and whether the next one gets
 * the free trial (and which store used it). The app shows the owner the
 * paid-store agreement from this answer, before any photo is scanned.
 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = await verifyFirebaseToken(authHeader.replace('Bearer ', ''));
    if (!userId) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const standing = await readStoreEligibility(userId);
    if (!standing.ok) {
        return NextResponse.json({ error: standing.error, code: standing.code }, { status: standing.status });
    }
    return NextResponse.json({
        success: true,
        storeCount: standing.storeCount,
        storeLimit: standing.storeLimit,
        canCreate: standing.canCreate,
        trialAvailable: standing.trialAvailable,
        trialStoreName: standing.trialStoreName,
    }, { headers: { 'Cache-Control': 'no-store' } });
}
