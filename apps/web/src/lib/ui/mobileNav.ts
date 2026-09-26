/**
 * The phone bottom bar, v2 (NEXT_PUBLIC_MOBILE_NAV_V2). Pure and client-safe.
 *
 * Four labelled destinations, the way WhatsApp's Material 3 bar has them, and a
 * "You" tab the way YouTube merged account and library: everything an owner
 * visits rarely — settings, banners, plan, help, extra stores, sign-out — lives
 * behind one tab instead of taking a slot each.
 */

/** Build-time flag. OFF unless exactly "true" — flag off is today's bar. */
export const MOBILE_NAV_V2: boolean = process.env.NEXT_PUBLIC_MOBILE_NAV_V2 === 'true';

export type TabId = 'home' | 'menu' | 'qr' | 'you';

export const NAV_V2: ReadonlyArray<{ id: TabId; label: string; icon: string; href: string }> = [
    { id: 'home', label: 'Home', icon: 'home', href: '/manage/dashboard' },
    { id: 'menu', label: 'Menu', icon: 'restaurant_menu', href: '/manage/product-inventory' },
    { id: 'qr', label: 'QR', icon: 'qr_code_2', href: '/manage/qr' },
    { id: 'you', label: 'You', icon: 'person', href: '/manage/you' },
];

/** The screens behind the You tab (phone-first; desktop keeps the old pages). */
export const YOU_ROUTES = {
    store: '/manage/you/store',
    design: '/manage/you/design',
    banners: '/manage/you/banners',
    plan: '/manage/you/plan',
    addStore: '/manage/you/add-store',
    help: '/manage/you/help',
} as const;

/** A screen opened from the You page: full-screen on phones, with its own back header. */
export function isYouSubPage(pathname: string): boolean {
    return pathname.startsWith('/manage/you/');
}

/** Pages reached from the You tab light the You tab. */
const YOU_PAGES = ['/manage/you', '/manage/settings', '/manage/banner-management', '/manage/subscription'];

export function activeTabFor(pathname: string): TabId | null {
    if (pathname === '/manage/dashboard') return 'home';
    if (pathname.startsWith('/manage/product-inventory')) return 'menu';
    if (pathname.startsWith('/manage/qr')) return 'qr';
    if (YOU_PAGES.some(p => pathname === p || pathname.startsWith(`${p}/`))) return 'you';
    return null;
}

/** A count badge says how much is waiting, not just that something is. */
export function badgeText(count: number): string | null {
    if (!count || count < 1) return null;
    return count > 9 ? '9+' : String(count);
}
