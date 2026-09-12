import type { SeoLandingData } from '@/components/home/SeoLanding';
import type { CityPage } from './cities';
import { PLAN_PRICES_INR } from '@/lib/platform/productFlags';

/**
 * Turns a city record into a landing page.
 *
 * Reuses `SeoLanding` rather than inventing a second page component, so city
 * pages inherit the FAQ and breadcrumb schema, the internal-link cluster and
 * the styling that the keyword pages already have.
 *
 * ─── WHAT MAKES THESE NOT DOORWAY PAGES ──────────────────────────────────────
 * The template is shared; the SUBSTANCE is not. Every page's opening paragraph,
 * its main argument, one FAQ and the local-detail section come from fields that
 * are specific to that city — the food it is known for, where its restaurants
 * actually are, and the thing about its menus that is true there and nowhere
 * else. Google treats city pages with swapped names as spam, and rightly: they
 * are unreadable. More to the point for this project, an AI engine has nothing
 * to quote from a page that says nothing particular, and getting quoted is the
 * whole objective.
 *
 * The shared parts — pricing, how setup works, what the product does — SHOULD be
 * identical everywhere, because they are the same everywhere. Varying them for
 * the sake of looking different would be the actual spam signal.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function buildCityPage(c: CityPage): SeoLandingData {
    const price = PLAN_PRICES_INR.qr_menu;
    const where = c.district && c.district !== c.city ? `${c.city}, ${c.district}` : c.city;

    return {
        slug: `digital-menu/${c.slug}`,
        h1: `Digital Menu for Restaurants in ${c.city}`,
        subtitle:
            `QR code menus for ${c.city} restaurants, cafés and messes — in Tamil and English, ` +
            `with a photo for every dish. Photograph your paper menu and be live in 3 minutes. ₹${price}/month.`,

        features: [
            {
                icon: 'translate',
                title: `Tamil and English, for ${c.city}`,
                description: `Every dish appears in both languages, switched with one tap. Long Tamil dish names render properly — ${c.tamil} customers are not reading an English-only menu.`,
            },
            {
                icon: 'photo_camera',
                title: 'A photo for every dish',
                description: 'AI generates a food photo for each item on your menu. No photographer, no shoot, no empty grey boxes where a picture should be.',
            },
            {
                icon: 'bolt',
                title: 'Live in 3 minutes',
                description: 'Photograph your existing menu. The AI reads every item, price and category — including handwritten boards.',
            },
            {
                icon: 'edit',
                title: 'Change prices from your phone',
                description: 'Update a price or mark a dish sold out and every table sees it on the next scan. The printed QR sticker never changes.',
            },
            {
                icon: 'currency_rupee',
                title: `₹${price} a month, no commission`,
                description: 'One price. No per-scan fee, no cut of your sales, no charge for changing your menu as often as you like.',
            },
            {
                icon: 'support_agent',
                title: 'Support in Tamil, on WhatsApp',
                description: 'From the people who built it, based in Tamil Nadu — not a ticket queue in another timezone.',
            },
        ],

        content: [
            {
                type: 'p',
                text:
                    `${where} is known for ${c.knownFor}. If you run a restaurant, café, mess or bakery here — ` +
                    `around ${c.areas.slice(0, -1).join(', ')} or ${c.areas[c.areas.length - 1]}, or anywhere else in the city — ` +
                    `vsite turns your existing paper menu into a QR menu customers open on their own phone, in Tamil or English, with a photo beside every dish.`,
            },

            { type: 'h2', text: `Why ${c.city} restaurants are moving off paper` },
            { type: 'p', text: c.localTruth },
            {
                type: 'p',
                text:
                    `The cost argument is the same everywhere and it is simple: a printed menu costs ₹3,000–₹8,000 per batch and ` +
                    `is wrong the day a price changes. vsite is ₹${price} a month and is never out of date.`,
            },

            { type: 'h2', text: `How to get a digital menu in ${c.city}` },
            {
                type: 'ol',
                items: [
                    'Photograph your paper menu — a phone picture is enough, and a handwritten board works too.',
                    'The AI reads every dish, price and category, in Tamil and English.',
                    'It generates a food photo for each dish and you check the prices.',
                    'You get a QR code to print, plus weatherproof stickers and an NFC card posted to you.',
                    'Customers scan and read the menu. Your staff take the order exactly as they do today.',
                ],
            },

            { type: 'h2', text: `What it costs in ${c.city}` },
            {
                type: 'table',
                headers: ['', 'Printed menus', `vsite`],
                rows: [
                    ['Cost per year', '₹12,000 – ₹32,000 (3–4 reprints)', `₹${price * 12}`],
                    ['Changing a price', 'Reprint everything', 'From your phone, instantly'],
                    ['Photos of dishes', 'Extra photography cost', 'Included, AI-generated'],
                    ['Tamil and English', 'Two separate prints', 'One menu, one tap'],
                    ['Marking an item finished', 'Tell every customer', 'One toggle'],
                ],
            },

            { type: 'h2', text: 'What vsite does not do' },
            {
                type: 'p',
                text:
                    'Customers read the menu on their phone and order with your staff, exactly as they did before. ' +
                    'Ordering and payment inside the menu are not live yet — they are coming, at no extra cost, on the same ₹' +
                    `${price} plan. We would rather say that plainly than have you find out after paying.`,
            },

            {
                type: 'callout',
                text:
                    `Start free for 7 days — no card needed. If it does not suit your ${c.city} restaurant, walk away and nothing is charged.`,
            },
        ],

        relatedLinks: [
            { label: 'QR Code Menus →', href: '/qr-menu' },
            { label: 'Digital Menus in India →', href: '/digital-menu-india' },
            { label: 'AI Menu Builder →', href: '/ai-menu-builder' },
            { label: 'Café Menu Software →', href: '/cafe-menu-software' },
            { label: 'Pricing →', href: '/pricing' },
            { label: 'See a live demo menu →', href: '/demo' },
        ],

        faqs: [
            c.localFaq,
            {
                q: `How much does a digital menu cost in ${c.city}?`,
                a: `vsite costs ₹${price} per month — ₹${price * 12} a year — with no setup fee, no commission on your sales and no per-scan charge. That covers unlimited menu changes, AI food photos for every dish, Tamil and English, and the QR stickers and NFC card posted to your restaurant. A 7-day free trial needs no card.`,
            },
            {
                q: `How quickly can my ${c.city} restaurant be live?`,
                a: 'About three minutes. Photograph your paper menu, let the AI read it, check the prices, and your menu is live at its own web address with a QR code ready to print.',
            },
            {
                q: 'Do my customers need to download an app?',
                a: 'No. They scan the QR code with the normal camera on their phone and the menu opens in the browser in about two seconds. Nothing to install, nothing to sign up for.',
            },
            {
                q: 'Can I have the menu in Tamil?',
                a: `Yes — every dish carries a Tamil and an English name, and the customer switches with one tap. vsite is built in Tamil Nadu and Tamil is not an afterthought: long Tamil dish names are tested to render properly on the card.`,
            },
            {
                q: 'What happens to my printed QR codes if I change the menu?',
                a: 'Nothing — they keep working. The QR code points at your menu, not at a particular version of it. Change prices, add dishes or switch your menu design and every sticker already on your tables stays valid.',
            },
        ],
    };
}
