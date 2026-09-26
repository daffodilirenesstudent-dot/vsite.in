/**
 * Help & support, placeholder edition: the contacts the public /support page
 * already publishes, and the owner-relevant part of its FAQ. A real request
 * system replaces this later.
 */

export const SUPPORT_WHATSAPP = '919360706659';
export const SUPPORT_EMAIL = 'official@vsite.in';

/**
 * WhatsApp with the store already named, so the team knows which menu the
 * owner means without a round of "which shop is this?".
 */
export function supportWhatsAppUrl(store: { name: string; slug: string } | null): string {
    const text = store
        ? `Hi vsite, I need help with my store ${store.name} (menu: /shop/${store.slug}).`
        : 'Hi vsite, I need help with my store.';
    return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(text)}`;
}


interface FaqGroup {
    id: string;
    items: ReadonlyArray<{ id: string; q: string; a: string }>;
}

/**
 * The FAQ an owner inside the app needs: managing the menu, billing, setup.
 * The "orders" group is for prospects asking about ordering, which is not live.
 */
const OWNER_GROUPS = ['menu', 'account', 'setup'];

export function ownerFaqs(groups: ReadonlyArray<FaqGroup>): Array<{ id: string; q: string; a: string }> {
    return OWNER_GROUPS.flatMap(id => groups.find(g => g.id === id)?.items ?? []);
}
