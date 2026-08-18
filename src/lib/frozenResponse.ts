import { NextResponse } from 'next/server';

/**
 * Standard 403 for a route belonging to a frozen product.
 *
 * Lives in its own module rather than in `@/lib/productFlags` because it
 * imports `next/server`: productFlags is imported by PlanContext (a client
 * component), and pulling server runtime in there would break the client
 * bundle. Only route handlers should import this file.
 *
 * See `@/lib/productFlags` for the ORDERING_FROZEN flag and unfreeze notes.
 */
export function frozenResponse() {
    return NextResponse.json(
        { error: 'This feature is temporarily unavailable.', code: 'FEATURE_FROZEN' },
        { status: 403 }
    );
}
