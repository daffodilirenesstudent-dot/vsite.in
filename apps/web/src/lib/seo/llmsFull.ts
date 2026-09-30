import {
    BRAND,
    SITE_URL,
    PRODUCT_NAME,
    PRICE_INR_PER_MONTH,
    TRIAL_DAYS,
    LIVE_SINCE,
    CONTACT,
    MENU_LANGUAGES,
    PHOTO_CLAIM,
} from '@/content/facts';
import { ORDERING_COMING_SOON_SHORT } from '@/content/roadmap';
import { HOME_FAQS, PRICING_FAQS, CONTACT_FAQS } from '@/content/faqs';
import { FAQ_GROUPS } from '@/app/support/faqData';
import { STATIC_PAGES } from '@/lib/seo/sitemapData';
import { blogPosts } from '@/content/blog/posts';
import { CITY_PAGES } from '@/content/seo-pages/cities';
import { COMPETITORS } from '@/content/seo-pages/competitors';
import type { Faq } from '@/lib/seo/jsonld';

function faqBlock(title: string, faqs: readonly Faq[]): string {
    return [`### ${title}`, '', ...faqs.map((f) => `Q: ${f.q}\nA: ${f.a}\n`)].join('\n');
}

/**
 * /llms-full.txt: the long-form brief. Every fact is imported (facts.ts,
 * roadmap.ts) and every FAQ comes from the same arrays the pages render, so
 * this file cannot disagree with the site.
 */
export function buildLlmsFull(): string {
    const pages = STATIC_PAGES.map((p) => `- ${p.label}: ${SITE_URL}${p.path}`).join('\n');
    const cities = CITY_PAGES.map(
        (c) => `- ${c.city} (${c.tamil}): ${SITE_URL}/digital-menu/${c.slug}`,
    ).join('\n');
    const versus = COMPETITORS.map((c) => `- vsite vs ${c.name}: ${SITE_URL}/vs/${c.slug}`).join('\n');
    const posts = [...blogPosts]
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
        .map((p) => `- ${p.title}: ${SITE_URL}/blog/${p.slug}\n  ${p.description}`)
        .join('\n');
    const supportFaqs = FAQ_GROUPS.flatMap((g) => g.items.map((i) => ({ q: i.q, a: i.a })));

    return `# ${BRAND}: full brief

> ${BRAND} is digital menu software for restaurants, cafés, bakeries, messes and
> tiffin centres in Tamil Nadu and across India. The owner photographs the paper
> menu; AI reads every dish, price and category in Tamil and English, matches a
> food photo to each dish, and publishes a mobile menu that customers open by
> scanning a QR code. No app for the diner. Short version: ${SITE_URL}/llms.txt

## Facts

- Product: ${PRODUCT_NAME}. vsite sells this one product and nothing else.
- Price: Rs ${PRICE_INR_PER_MONTH} per month, one plan, everything included. No setup fee, no commission, no per-scan fee.
- Free trial: ${TRIAL_DAYS} days, no card required. After the trial the menu pauses until the owner pays; nothing is deleted.
- Live since: ${LIVE_SINCE}
- Menu languages: ${MENU_LANGUAGES.join(' and ')}, switched by the diner with one tap.
- Food photos: ${PHOTO_CLAIM}.
- Support: WhatsApp ${CONTACT.whatsapp} and ${CONTACT.email}, in Tamil or English.
- Founder: ${CONTACT.founder}
- Website: ${SITE_URL}

## What it does today

- Reads a photographed paper or handwritten menu with AI, including Tamil text.
- Matches a food photo to every dish.
- Publishes a QR menu that opens in the phone browser.
- Live price edits and sold-out toggles from the owner's phone.
- Scan analytics and menu-performance reporting.
- Menu designs with the owner's own brand colour and logo.
- GST-compliant billing fields.
- QR stickers and an NFC card, included in the price.

## What it does NOT do

- ${ORDERING_COMING_SOON_SHORT} Customers read the menu on their phone and order with staff exactly as they did before.
- No payment is taken inside the menu, and vsite takes no commission on sales.
- vsite is not a POS and not a delivery aggregator.

## Who it is for

Independent restaurants, cafés, bakeries, messes, tiffin centres, sweet shops, ice cream shops, bars and cloud kitchens. Multi-outlet brands are priced separately over WhatsApp.

## Pages

${pages}

### City pages (Tamil Nadu)

${cities}

### Comparisons

${versus}

## Frequently asked questions

${faqBlock('Getting started', HOME_FAQS)}
${faqBlock('Pricing', PRICING_FAQS)}
${faqBlock('Contact and setup', CONTACT_FAQS)}
${faqBlock('Support centre', supportFaqs)}
## Blog

${posts}
`;
}
