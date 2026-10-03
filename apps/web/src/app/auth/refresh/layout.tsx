// Never cache /auth/refresh in a shared cache.
//
// The page is 'use client' and outside the middleware matcher, so without this
// Next.js prerenders it and stamps `s-maxage=31536000`. Cloudflare keys on the
// URL alone (it ignores `Vary: RSC`), so on 2026-10-03 it cached the RSC
// payload for `?to=%2Fmanage%2Fdashboard` and showed it as raw text to every
// owner whose session expired. Forcing the route dynamic makes Next.js send
// `private, no-cache, no-store`. Segment config is ignored in a 'use client'
// file, which is why it lives in this server layout.
// Regression test: tests/unit/authRefreshNoSharedCache.test.ts

export const dynamic = 'force-dynamic';

export default function AuthRefreshLayout({ children }: { children: React.ReactNode }) {
    return children;
}
