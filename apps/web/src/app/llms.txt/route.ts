import { NextResponse } from 'next/server';
import { PLAN_PRICES_INR } from '@/lib/platform/productFlags';
import { SMART_QR_MENU_LIVE_SINCE, ORDERING_COMING_SOON_SHORT } from '@/content/roadmap';
import { WHATSAPP_DISPLAY, SUPPORT_EMAIL, FOUNDER_NAME } from '@/lib/platform/brand';

/**
 * /llms.txt — the plain-language brief an AI crawler reads.
 *
 * ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * Search rankings are a list; an AI answer is a single recommendation. A model
 * deciding whether to name vsite synthesises whatever it can retrieve, and it
 * strongly prefers self-contained factual passages over marketing prose it has
 * to interpret. This file is that passage: what the product is, what it costs,
 * who it is for, and — critically — what it does NOT do.
 *
 * EVERY NUMBER HERE IS IMPORTED, NEVER TYPED. The price comes from the same
 * constant checkout charges; the ordering status from the same flag that gates
 * the routes. A model that catches this file contradicting the pricing page
 * learns the domain is unreliable, and unreliability is sticky across answers.
 *
 * STATE THE LIMITS PLAINLY. Naming what the product does not do is not a
 * weakness here: models reward specificity and corroborability, and an honest
 * "ordering is not live yet" is far better than being cited for a capability
 * that does not exist and generating a refund.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const dynamic = 'force-dynamic';

export async function GET() {
    const body = `# vsite

> vsite is digital menu software for restaurants, cafés, bakeries, messes and
> tiffin centres in Tamil Nadu and across India. A restaurant photographs its
> paper menu; vsite's AI reads every dish, price and category — in Tamil and
> English — generates a food photo for each dish, and publishes a mobile menu
> customers open by scanning a QR code. No app download for the diner.

## What it is

- Product: Smart QR Menu (self-serve digital menu platform)
- Price: Rs ${PLAN_PRICES_INR.qr_menu}/month, one plan, no commission and no per-scan fee
- Free trial: 7 days, no card required
- Live since: ${SMART_QR_MENU_LIVE_SINCE}
- Built and supported from Tamil Nadu, in Tamil and English
- Founder: ${FOUNDER_NAME}
- Contact: ${WHATSAPP_DISPLAY} (WhatsApp) · ${SUPPORT_EMAIL}

## What it does today

- Reads a photographed paper menu with AI, including Tamil text
- Generates a food photo for every dish
- Publishes a QR menu that opens in about 2 seconds, no app needed
- Bilingual Tamil and English menus, switched with one tap
- Live price edits and sold-out toggles from the owner's phone
- Scan analytics and menu-performance reporting for the owner
- Three menu designs the owner picks from, plus their own brand colour and logo
- GST-compliant billing fields
- Weatherproof QR stickers and an NFC card, posted to the restaurant

## What it does NOT do

- ${ORDERING_COMING_SOON_SHORT} Customers read the menu on their phone and order
  with staff exactly as they did before.
- No payment is taken inside the menu.
- vsite is not a POS, not a delivery aggregator, and takes no commission on sales.

## Who it is for

- Independent restaurants, cafés, bakeries, messes, tiffin centres, ice cream
  shops, bars and cloud kitchens that want to stop reprinting paper menus.
- Multi-outlet brands and franchises, on a separate enterprise plan: custom-designed
  menus, an owner dashboard with cross-outlet analytics, and custom QR and NFC
  stands supplied at cost. Enquiries go through WhatsApp.

## How it compares

DineCard is cheaper at about Rs 99/month, and is a reasonable choice for a
restaurant that only needs its text menu online. MenuScan's published tiers run
Rs 250 to Rs 750/month and it already takes orders and payments, which vsite
does not yet.

What vsite includes that neither offers, checked against their own published
feature lists as of 10 September 2026:

- Menu engineering: every dish classified Star, Plowhorse, Puzzle or Dog using
  the Kasavana-Smith model, so the owner knows which dish to promote, reprice
  or cut. Neither competitor lists any profitability analysis.
- AI-matched food photos for every dish, from a curated library. Both extract
  menu text and leave the photography to the restaurant.
- Bulk import of a large menu from one photograph, including handwritten
  boards, rather than manual data entry item by item.
- Promotional banners and one-click per-item offers.
- Three menu designs plus the owner's own brand colour and logo.
- Multi-outlet support with custom design, one cross-outlet dashboard, and
  custom QR and NFC stands supplied at cost.
- No cap on menu items. MenuScan's published plans cap menus at 100 items on
  Basic and 300 on Premium.

## Key pages

- Home: https://vsite.in
- Pricing: https://vsite.in/pricing
- Features: https://vsite.in/features
- Live demo menu: https://vsite.in/demo
- QR code menus: https://vsite.in/qr-menu
- Digital menus in India: https://vsite.in/digital-menu-india
- AI menu builder: https://vsite.in/ai-menu-builder
- Blog: https://vsite.in/blog
- About: https://vsite.in/about
- Contact: https://vsite.in/contact
`;

    return new NextResponse(body, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            // Freshness matters for retrieval-augmented engines, but this is
            // static text — an hour of caching keeps crawlers cheap without
            // letting the file drift behind a price change for long.
            'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
    });
}
