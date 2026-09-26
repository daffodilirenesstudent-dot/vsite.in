import { MENU_THEMES, type MenuThemeId } from '@/lib/menu/menuThemes';

/**
 * Menu design on the phone screen. Saves go through the same endpoint the
 * settings Appearance tab uses (PATCH /api/manage/sites/[id]/menu-theme).
 */

/** Choosing a style also picks its lettering, as it does in settings. */
export function themePatch(id: MenuThemeId) {
    return { menu_theme: id, menu_font: MENU_THEMES[id].fontPair };
}

/** "Classic · Pink" for the You page row. */
export function designSummary(themeId: MenuThemeId, colour: string | null, colours: ReadonlyArray<{ hex: string; name: string }>): string {
    const theme = MENU_THEMES[themeId]?.label ?? 'Classic';
    if (!colour) return theme;
    const named = colours.find(c => c.hex.toUpperCase() === colour.toUpperCase());
    return `${theme} · ${named ? named.name : 'Your colour'}`;
}

export async function saveMenuDesign(siteId: string, patch: Record<string, string>): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
        const { firebaseAuth } = await import('@/lib/auth/firebase');
        const token = await firebaseAuth.currentUser?.getIdToken();
        if (!token) return { ok: false, error: 'Please sign in again' };
        const res = await fetch(`/api/manage/sites/${siteId}/menu-theme`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
        });
        if (res.ok) return { ok: true };
        const data = await res.json().catch(() => ({}));
        return { ok: false, error: typeof data.error === 'string' ? data.error : 'Could not save' };
    } catch {
        return { ok: false, error: 'Could not save. Check your connection.' };
    }
}
