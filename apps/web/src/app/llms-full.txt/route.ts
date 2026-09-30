import { NextResponse } from 'next/server';
import { buildLlmsFull } from '@/lib/seo/llmsFull';

/**
 * /llms-full.txt: the long-form companion to /llms.txt.
 *
 * All content is assembled from the same modules the pages render (facts,
 * roadmap, FAQ arrays, blog and city data) in `buildLlmsFull`, so it cannot
 * drift from the site. Same caching as llms.txt.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
    return new NextResponse(buildLlmsFull(), {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
    });
}
