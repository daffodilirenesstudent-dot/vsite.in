import { ownerToken } from '@/lib/menu/ownerToken';

/**
 * Ask the server to drop the cached copy of a store's public menu, so the next
 * diner sees the edit the owner just made. See /api/manage/menu-refresh.
 *
 * Fire-and-forget: the edit is already saved, and a failed refresh only means
 * the menu catches up at the end of its 10-second cache window. Never throws.
 */
export async function refreshPublicMenu(
    siteId: string | null | undefined,
    deps: { getToken: () => Promise<string | undefined>; fetchImpl?: typeof fetch } = { getToken: ownerToken },
): Promise<void> {
    if (!siteId) return;
    try {
        const token = await deps.getToken();
        if (!token) return;
        await (deps.fetchImpl ?? fetch)('/api/manage/menu-refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ siteId }),
            keepalive: true,
        });
    } catch { /* the menu refreshes itself within 10 s anyway */ }
}
