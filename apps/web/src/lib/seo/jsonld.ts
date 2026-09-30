/** Small, pure JSON-LD builders shared by pages. Client-safe. */

export interface Faq {
    q: string;
    a: string;
}

/**
 * JSON.stringify is not enough inside a <script>: a `</script>` in any string
 * would end the block. Escaping `<` keeps the JSON identical once parsed.
 */
export function serializeJsonLd(data: unknown): string {
    return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function faqPageSchema(faqs: readonly Faq[]) {
    return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map(({ q, a }) => ({
            '@type': 'Question' as const,
            name: q,
            acceptedAnswer: { '@type': 'Answer' as const, text: a },
        })),
    };
}

export function breadcrumbSchema(items: readonly { name: string; url: string }[]) {
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map((it, i) => ({
            '@type': 'ListItem' as const,
            position: i + 1,
            name: it.name,
            item: it.url,
        })),
    };
}

export function itemListSchema(name: string, items: readonly { name: string; url: string }[]) {
    return {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name,
        numberOfItems: items.length,
        itemListElement: items.map((it, i) => ({
            '@type': 'ListItem' as const,
            position: i + 1,
            name: it.name,
            url: it.url,
        })),
    };
}
