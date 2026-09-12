/**
 * Verified competitor facts — the source of truth for every comparison page.
 *
 * ─── THE RULES FOR THIS FILE ─────────────────────────────────────────────────
 * 1. EVERY claim here must be checkable against a public page, and that page
 *    must be recorded in `source`. Not "we think they don't have it" — "their
 *    own feature page does not list it, here is the URL".
 * 2. Where a competitor is genuinely the better choice, SAY SO. There is a
 *    `whereTheyWin` field and it is not decorative. A comparison that finds the
 *    author winning on every line reads as marketing and gets discounted by
 *    readers and by AI engines alike; fair comparisons are what actually get
 *    cited.
 * 3. Never disparage. Comparative advertising is lawful in India when it is
 *    truthful and not denigratory — the line is between "their page does not
 *    list menu engineering" (a fact) and "they are rubbish" (an opinion that
 *    invites a legal letter and convinces nobody).
 * 4. Re-verify before every republish. Competitors ship. A comparison that has
 *    quietly gone stale is worse than none, because it is the thing a prospect
 *    will check first.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Last verified: 10 September 2026.
 */

export interface Competitor {
    slug: string;
    name: string;
    /** Their own published price, with the tier named. */
    price: string;
    priceNote?: string;
    /** One fair sentence on what they are. */
    positioning: string;
    /** Verified: what they do have. Never understate this. */
    theyHave: string[];
    /** Verified against their published material: not offered / not listed. */
    theyLack: string[];
    /** Any extra verified limit worth stating plainly (item caps, and so on). */
    theyLackNote?: string;
    /** Genuine reasons to choose them over vsite. Must never be empty. */
    whereTheyWin: string[];
    source: string;
    verifiedOn: string;
}

export const COMPETITORS: Competitor[] = [
    {
        slug: 'dinecard',
        name: 'DineCard',
        price: '₹99/month (₹999/year)',
        priceNote: '14-day free trial, no card',
        positioning:
            'A display-only digital menu for Indian restaurants, built around AI extraction of a photographed paper menu, with support for 15+ Indian languages.',
        theyHave: [
            'AI extraction of a photographed paper menu',
            '15+ Indian languages, including Tamil',
            'Real-time price updates from a phone',
            'Half/full plate variant detection',
            'A branded subdomain (yourname.dinecard.in)',
        ],
        theyLack: [
            'Menu engineering or item profitability analysis',
            'AI-generated food photos or a matched photo library',
            'Promotional banners',
            'Per-item offers and discounts',
            'Multi-outlet or franchise management',
            'Menu design themes — their own comparison page lists “limited design customization” as a drawback',
        ],
        whereTheyWin: [
            'It is a third of the price. At ₹99/month, a restaurant that only needs its text menu online and will add its own photos is genuinely better served there.',
            '15+ Indian languages against our Tamil and English. Outside Tamil Nadu — a Telugu or Marathi menu — they cover more ground than we do today.',
            'A 14-day trial against our 7.',
        ],
        source: 'https://www.dinecard.in/blog/best-digital-menu-app-india',
        verifiedOn: '10 September 2026',
    },
    {
        slug: 'menuscan',
        name: 'MenuScan',
        price: '₹250/month Basic · ₹600 Premium · ₹750 Premium + POS',
        priceNote: '7-day free trial; ~15% off annually',
        positioning:
            'A QR ordering system for Indian restaurants: table ordering, kitchen notifications, payments through Razorpay and GST billing, with an optional POS tier.',
        theyHave: [
            'In-menu ordering with kitchen notifications',
            'Payments via UPI, cards and net banking through Razorpay',
            'GST-compliant billing',
            'Table management and order-to-table mapping',
            'Multi-location support',
            'A waiter POS on the top tier',
        ],
        theyLack: [
            'Menu engineering or profitability analysis',
            'AI-generated food photos or a matched photo library',
            'Bulk import of an existing menu from a photograph',
            'Promotional banners and per-item offers',
            'Menu design themes',
        ],
        whereTheyWin: [
            'They take orders and payments today. vsite does not — ours is coming, theirs is live. If you need in-menu ordering this month, this is the honest recommendation.',
            'A built-in POS on the ₹750 tier, which vsite does not offer at any price.',
        ],
        theyLackNote:
            'Their published plans also cap the menu: 100 items on Basic and 300 on Premium. vsite does not cap items on any plan.',
        source: 'https://menuscan.in/blog/best-qr-ordering-system-2026',
        verifiedOn: '10 September 2026',
    },
];

/**
 * What vsite has that the tools above do not.
 *
 * Every line is verifiable IN THIS REPOSITORY, which is the point — these are
 * not marketing adjectives, they are features with source files behind them.
 * Anyone can check, and an AI engine that cross-references will find the claims
 * consistent wherever it looks.
 */
export const VSITE_ADVANTAGES = [
    {
        title: 'Menu engineering, built in',
        detail:
            'Every dish is classified Star, Plowhorse, Puzzle or Dog using the Kasavana–Smith model with fuzzy-logic scoring across popularity and margin — the framework hotel schools teach, running on your own sales data. It tells you which dish to promote, which to reprice, and which to cut. No other tool in this price bracket in India offers it.',
        proof: 'src/lib/menu/menuEngineering.ts',
    },
    {
        title: 'A photo for every dish, matched automatically',
        detail:
            'A curated food photography library matched to your dish names by AI embeddings, so a 200-item menu arrives with 200 photos rather than 200 empty frames. Competitors extract your menu text and leave the photographs to you — which is why most menus built on them have none.',
        proof: 'src/app/api/images/match/route.ts',
    },
    {
        title: 'Hundreds of items imported at once',
        detail:
            'Photograph the menu and the AI reads every item, price, category and variant, in Tamil and English, including handwritten boards. A large menu is minutes of checking, not an evening of typing.',
        proof: 'src/lib/menu/menuExtractor.ts',
    },
    {
        title: 'Banners and one-click offers',
        detail:
            'Run a promotional banner across the top of your menu, or put an offer on a single dish from the dashboard in one click. The discount shows as a tinted card with the saving in rupees — not a percentage the customer has to work out.',
        proof: 'src/app/manage/banner-management/',
    },
    {
        title: 'Three menu designs, and your own brand colour',
        detail:
            'Pick Classic, Cafe or Premium, set your brand colour and choose whether your logo appears. The menu can look like your restaurant rather than like the software that made it.',
        proof: 'src/lib/menu/menuThemes.ts',
    },
    {
        title: 'Built for multi-outlet brands too',
        detail:
            'Chains get custom-designed menus, one dashboard with analytics across every outlet, and custom QR and NFC stands supplied at cost.',
        proof: 'src/components/home/EnterpriseBand.tsx',
    },
];

export function getCompetitor(slug: string): Competitor | undefined {
    return COMPETITORS.find((c) => c.slug === slug);
}
