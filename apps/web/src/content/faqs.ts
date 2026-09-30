import type { Faq } from '@/lib/seo/jsonld';
import { QR_STICKER_PRICE_INR as STICKER_PRICE_INR } from '@/lib/platform/hardware';

/**
 * FAQ copy rendered on the homepage, pricing page and contact page.
 *
 * Lives in a plain module (not inside the components) so the same array feeds
 * the visible accordion, the FAQPage JSON-LD and /llms-full.txt. A 'use client'
 * component cannot export data to a server route, and a second copy of an
 * answer is how the schema ends up disagreeing with the page.
 */

/**
 * Homepage objection handling, ordered by how much each objection costs.
 *
 * "Can customers order from the menu?" is first because it is the question
 * that decides whether the sale survives week one. Answering it honestly at
 * the top of the FAQ costs a few signups and saves the refunds and the
 * one-star reviews that follow the alternative.
 */
export const HOME_FAQS: Faq[] = [
    {
        q: 'Can customers order from the menu?',
        a: 'Not today. vsite shows your menu; your server takes the order as usual. In-menu ordering and payment are being built, and existing customers get them first — but we are not going to sell you something that does not exist yet.',
    },
    {
        q: 'My menu is handwritten in a notebook. Will it work?',
        a: 'Handwritten pages are accepted, but the AI is not tuned for handwriting, so check the result carefully. Photograph each page in good light, then read every dish name and price in the review step and fix what it misread.',
    },
    {
        q: 'What happens after the 7 free days?',
        a: 'We ask you to pay ₹299. If you do not, the menu pauses — nothing is deleted, and it comes straight back whenever you return. We never take a card before day 8.',
    },
    {
        q: 'Do you take a cut of my sales?',
        a: `No. ₹299 a month is the entire relationship. No commission and no per-scan fee. The QR code is free to print; an optional NFC + QR sticker is ₹${STICKER_PRICE_INR} each.`,
    },
    {
        q: 'Do my customers need to install anything?',
        a: 'No. It opens in the phone’s own browser. Older Android, iPhone, a borrowed phone — all the same.',
    },
    {
        q: 'Is support in Tamil?',
        a: 'Yes — on WhatsApp, from a person, in Tamil or English.',
    },
];

/** Pricing objections, ordered by how much each one costs to leave unanswered. */
export const PRICING_FAQS: Faq[] = [
    {
        q: 'Is there a setup fee?',
        a: `₹299 a month is the whole bill. Store creation, AI menu scanning, food photo matching, the QR code to print and onboarding are all inside it. The optional NFC + QR sticker is ₹${STICKER_PRICE_INR} each, separately.`,
    },
    {
        q: 'Do you take a cut of my sales?',
        a: 'No. Your customers pay you exactly as they do today — cash, card, or your own UPI QR. Nothing is routed through vsite, so there is no commission and no settlement delay.',
    },
    {
        q: 'What happens after the 7 free days?',
        a: 'We ask you to pay ₹299. If you do not, the menu pauses — nothing is deleted, and it comes straight back whenever you return. We never take a card before day 8.',
    },
    {
        q: 'Is there more than one plan?',
        a: 'No. One product, one price: the Smart QR Menu at ₹299 a month, everything included. Nothing to compare, no upgrade waiting for you.',
    },
    {
        q: 'I have several branches. Is there a better rate?',
        a: 'Yes — three branches or more gets a discount. Message us on WhatsApp and we will price it for your outlets.',
    },
];

export const CONTACT_FAQS: Faq[] = [
    {
        q: 'How long does setup take?',
        a: 'About 3 minutes from sign-up to a live menu link for a typical menu. A complete setup with the QR poster takes about 10 to 15 minutes.',
    },
    {
        q: 'Do my customers need an app?',
        a: 'No. Your digital menu opens in any phone browser — no download needed.',
    },
    {
        q: 'What does the 7-day trial include?',
        a: 'Full access to every feature. No credit card required. No automatic charge.',
    },
    {
        q: 'Can I get help with setup?',
        a: 'Yes — message us on WhatsApp and we will walk you through setup live.',
    },
];
