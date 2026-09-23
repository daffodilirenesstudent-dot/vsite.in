import { describe, it, expect, afterEach } from 'vitest';

/**
 * GET /api/version
 *
 * The /add-feature live-verify phase polls this after a push to know the new
 * build is actually serving before it tests production. It must expose the
 * commit and nothing else: no env dump, no secrets, never cached.
 */

const ORIGINAL = process.env.COMMIT_SHA;

afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.COMMIT_SHA;
    else process.env.COMMIT_SHA = ORIGINAL;
});

describe('GET /api/version', () => {
    it('returns the deployed commit sha', async () => {
        process.env.COMMIT_SHA = 'abc123def4567890abc123def4567890abc123de';
        const { GET } = await import('@/app/api/version/route');
        const res = GET();
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ sha: 'abc123def4567890abc123def4567890abc123de' });
    });

    it('reports "unknown" when the env var is not bound', async () => {
        delete process.env.COMMIT_SHA;
        const { GET } = await import('@/app/api/version/route');
        expect(await GET().json()).toEqual({ sha: 'unknown' });
    });

    it('is never cached', async () => {
        process.env.COMMIT_SHA = 'abc';
        const { GET } = await import('@/app/api/version/route');
        expect(GET().headers.get('cache-control')).toMatch(/no-store/);
    });

    it('rejects a value that is not a hex sha so nothing else can leak through it', async () => {
        process.env.COMMIT_SHA = 'postgres://user:secret@host/db';
        const { GET } = await import('@/app/api/version/route');
        expect(await GET().json()).toEqual({ sha: 'unknown' });
    });

    it('opts out of static rendering', async () => {
        const mod = await import('@/app/api/version/route');
        expect(mod.dynamic).toBe('force-dynamic');
    });
});
