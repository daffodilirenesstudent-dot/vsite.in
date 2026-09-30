import type { SeoLandingData } from '@/components/home/SeoLanding';
import type { CityPage } from './cities';
import { PLAN_PRICES_INR } from '@/lib/platform/productFlags';
import { ORDERING_COMING_SOON_SHORT } from '@/content/roadmap';
import { PHOTO_CLAIM, TRIAL_DAYS } from '@/content/facts';

/**
 * Turns a city record into a landing page, reusing `SeoLanding` so city pages
 * inherit FAQ and breadcrumb schema and the internal-link cluster.
 *
 * What makes these not doorway pages: the opening answer, the typical food
 * businesses, the local point, the setup scenario, the language note and three
 * of the six FAQs all come from fields written for that city alone. The shared
 * parts (price, trial, how setup works, what vsite does not do) are identical
 * everywhere because they are the same everywhere. The FAQ answers that share a
 * template still name the city, so no answer repeats across pages.
 */
export function buildCityPage(c: CityPage): SeoLandingData {
    const price = PLAN_PRICES_INR.qr_menu;
    const yearly = price * 12;
    const area = c.district && c.district !== c.city ? `${c.city} (${c.district})` : c.city;

    return {
        slug: `digital-menu/${c.slug}`,
        h1: `Digital Menu for Restaurants in ${c.city}`,
        subtitle:
            `QR code menus for ${c.city} (${c.tamil}) restaurants, cafés and messes, in Tamil and English, ` +
            `with ${PHOTO_CLAIM.toLowerCase()}. ₹${price}/month with a ${TRIAL_DAYS}-day free trial and no commission.`,

        features: [
            {
                icon: 'translate',
                title: `Tamil and English, for ${c.city}`,
                description: `Every dish holds a Tamil and an English name, switched with one tap, so ${c.tamil} diners and visitors read the same QR.`,
            },
            {
                icon: 'photo_camera',
                title: 'A photo beside each dish',
                description: `${PHOTO_CLAIM} are matched to your dish names. You can review and change any of them.`,
            },
            {
                icon: 'document_scanner',
                title: 'Read from your paper menu',
                description: 'Photograph your existing menu and the AI reads items, prices and categories, with printed menus read best (handwritten pages are accepted, so check them closely). You check the result before it goes live.',
            },
            {
                icon: 'edit',
                title: 'Change prices from your phone',
                description: 'Update a price or mark a dish sold out and every table sees it on the next scan. The printed QR never changes.',
            },
            {
                icon: 'currency_rupee',
                title: `₹${price} a month, no commission`,
                description: 'One price. No per-scan fee, no cut of your sales, no item cap and no charge for editing the menu as often as you like.',
            },
            {
                icon: 'support_agent',
                title: 'Support in Tamil, on WhatsApp',
                description: 'From a team based in Tamil Nadu, reachable on WhatsApp rather than through a ticket queue.',
            },
        ],

        content: [
            { type: 'p', text: c.intro },

            { type: 'h2', text: `What kinds of food businesses run a digital menu in ${c.city}?` },
            { type: 'p', text: `${area} is known for ${c.knownFor}. ${c.businesses}` },
            { type: 'p', text: c.localTruth },

            { type: 'h2', text: `How would a ${c.city} menu be set up?` },
            { type: 'p', text: c.scenario },
            {
                type: 'ol',
                items: [
                    'Photograph your paper menu or wall board. A phone picture is enough.',
                    'The AI reads the dishes, prices and categories in Tamil and English.',
                    'Check every price and name on the review screen, and fix what the AI read wrongly.',
                    'Photos are matched to each dish from a curated library; replace any that do not look right.',
                    'Print the QR code for the table or counter. Customers scan and read; your staff take the order as they do today.',
                ],
            },

            { type: 'h2', text: `Why a Tamil and English menu in ${c.city}?` },
            { type: 'p', text: c.languageNote },

            { type: 'h2', text: `What does a digital menu cost in ${c.city}?` },
            {
                type: 'p',
                text:
                    `vsite is ₹${price} a month (₹${yearly} a year) with a ${TRIAL_DAYS}-day free trial and no commission on your sales. ` +
                    `To compare it with paper, use your own numbers: yearly printing cost = cost of one print run × reprints per year. ` +
                    `If that comes to more than ₹${yearly}, the digital menu costs less; if your menu almost never changes, paper may cost less.`,
            },
            {
                type: 'table',
                headers: ['', 'Printed menu', 'vsite'],
                rows: [
                    ['Cost per year', 'Print cost per run × reprints per year', `₹${yearly} (₹${price} × 12)`],
                    ['Changing a price', 'Reprint the card', 'Edit on your phone'],
                    ['Marking an item finished', 'Tell each customer or cross it out', 'One sold-out toggle'],
                    ['Tamil and English', 'Two prints or crowded text', 'One menu, one tap'],
                    ['Commission on sales', 'None', 'None'],
                ],
            },

            { type: 'h2', text: 'What vsite does not do (yet)' },
            {
                type: 'p',
                text:
                    `${ORDERING_COMING_SOON_SHORT} Customers read the menu on their phone and order with your staff, exactly as they do now. ` +
                    'It will arrive at no extra cost inside the same plan. We would rather say that plainly than have you find out after paying.',
            },

            {
                type: 'callout',
                text: `Try it free for ${TRIAL_DAYS} days, no card needed. If it does not suit your ${c.city} business, walk away and nothing is charged.`,
            },
        ],

        relatedLinks: [
            { label: 'Digital menu setup guide →', href: '/guide/digital-menu-setup' },
            { label: 'Pricing →', href: '/pricing' },
            { label: 'See a live demo menu →', href: '/demo' },
            { label: 'QR Code Menus →', href: '/qr-menu' },
            { label: 'Digital Menus in India →', href: '/digital-menu-india' },
            { label: 'Café Menu Software →', href: '/cafe-menu-software' },
        ],

        faqs: [
            c.localFaq,
            ...c.extraFaqs,
            {
                q: `How much does a digital menu cost for a ${c.city} restaurant?`,
                a: `vsite costs ₹${price} a month, which is ₹${yearly} a year, with no setup fee, no commission and no per-scan charge. A ${c.city} restaurant gets unlimited menu changes, Tamil and English, ${PHOTO_CLAIM} and analytics, and can test it free for ${TRIAL_DAYS} days without a card.`,
            },
            {
                q: `How long does setup take for a ${c.city} menu?`,
                a: `For a menu of about 40 items, setup is typically minutes: photograph the menu, let the AI read it, then check names and prices. A larger ${c.city} menu takes longer because the review is the slow part. The setup guide at /guide/digital-menu-setup breaks down where the time goes.`,
            },
            {
                q: `Can customers in ${c.city} order and pay through the menu?`,
                a: `Not yet. ${ORDERING_COMING_SOON_SHORT} Today customers in ${c.city} scan, read the menu in Tamil or English, and order with your staff as usual.`,
            },
        ],
    };
}
