import { ownerToken } from '@/lib/menu/ownerToken';

/**
 * Ask the server to delete photos an edit has just made unnecessary — the old
 * photo of a dish or banner that got a new one, or of one that was deleted.
 * See /api/manage/media/release for the rules that keep everything else.
 *
 * Call it only AFTER the database save succeeded. Fire-and-forget: a failure
 * leaves one unused file behind, never a broken menu. Never throws.
 */
export async function releaseMenuPhotos(
    siteId: string | null | undefined,
    urls: ReadonlyArray<string | null | undefined>,
    deps: { getToken: () => Promise<string | undefined>; fetchImpl?: typeof fetch } = { getToken: ownerToken },
): Promise<void> {
    const list = Array.from(new Set(urls.filter((u): u is string => typeof u === 'string' && u.length > 0)));
    if (!siteId || list.length === 0) return;
    try {
        const token = await deps.getToken();
        if (!token) return;
        await (deps.fetchImpl ?? fetch)('/api/manage/media/release', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ siteId, urls: list }),
            keepalive: true,
        });
    } catch { /* the file stays; nothing on the menu depends on it */ }
}
