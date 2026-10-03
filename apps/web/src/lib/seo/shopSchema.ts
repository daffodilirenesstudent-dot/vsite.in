import { SITE_ORIGIN } from '@/lib/seo/entity';

/** Kept small: this is inlined in the HTML of the page a customer opens on a cheap phone. */
export const SHOP_SCHEMA_MAX_ITEMS = 120;

interface SchemaProduct {
    name: string;
    selling_price: number | null;
    description?: string | null;
    category?: string | null;
}

export interface ShopSchemaInput {
    slug: string;
    name: string;
    type: string | null | undefined;
    currency: 'INR' | 'AED';
    products: readonly SchemaProduct[];
}

type MenuItem = {
    '@type': 'MenuItem';
    name: string;
    description?: string;
    offers?: { '@type': 'Offer'; price: string; priceCurrency: string };
};
type MenuSection = { '@type': 'MenuSection'; name: string; hasMenuItem: MenuItem[] };

/** schema.org has specific subtypes; anything unknown stays a plain Restaurant. */
function establishmentType(type: string | null | undefined): string {
    const t = (type ?? '').toLowerCase();
    if (/\bbakery\b/.test(t)) return 'Bakery';
    if (/\b(caf[eé]|coffee|tea)\b/.test(t)) return 'CafeOrCoffeeShop';
    if (/\b(bar|pub)\b/.test(t)) return 'BarOrPub';
    if (/ice ?cream/.test(t)) return 'IceCreamShop';
    return 'Restaurant';
}

/**
 * Restaurant + Menu JSON-LD from data /shop/[slug] has already loaded.
 * Deliberately absent: rating, reviews, address and phone. None is in the
 * loaded data in a schema-ready form, and an invented one is worse than none.
 */
export function buildShopSchema(input: ShopSchemaInput) {
    const url = `${SITE_ORIGIN}/shop/${input.slug}`;
    const sections = new Map<string, MenuSection>();
    let count = 0;

    for (const p of input.products) {
        if (count >= SHOP_SCHEMA_MAX_ITEMS) break;
        if (!p.name) continue;
        const sectionName = p.category?.trim() || 'Menu';
        let section = sections.get(sectionName);
        if (!section) {
            section = { '@type': 'MenuSection', name: sectionName, hasMenuItem: [] };
            sections.set(sectionName, section);
        }
        const item: MenuItem = { '@type': 'MenuItem', name: p.name };
        if (p.description?.trim()) item.description = p.description.trim();
        if (typeof p.selling_price === 'number' && Number.isFinite(p.selling_price)) {
            item.offers = { '@type': 'Offer', price: String(p.selling_price), priceCurrency: input.currency };
        }
        section.hasMenuItem.push(item);
        count++;
    }

    return {
        '@context': 'https://schema.org',
        '@type': establishmentType(input.type),
        name: input.name,
        url,
        hasMenu: {
            '@type': 'Menu' as const,
            name: `${input.name} menu`,
            url,
            hasMenuSection: [...sections.values()],
        },
    };
}
