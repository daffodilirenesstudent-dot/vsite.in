import { PLAN_PRICES_INR, TRIAL_DURATION_MS } from '@/lib/platform/productFlags';
import { SMART_QR_MENU_LIVE_SINCE } from '@/content/roadmap';
import { ONBOARDING_PAGE_LIMIT } from '@/lib/menu/aiPageLimits';
import { MAX_PDF_BYTES } from '@/lib/menu/pdfPages';
import { QR_STICKER_PRICE_INR } from '@/lib/platform/hardware';
import { BILLING_CYCLE_DAYS } from '@/content/policy';
import { WHATSAPP_DISPLAY, SUPPORT_EMAIL, FOUNDER_NAME } from '@/lib/platform/brand';

/**
 * The facts every public surface states about vsite — one place.
 *
 * The llms.txt brief, the setup guide, FAQ answers, schema and blog copy import
 * from here so they cannot disagree. A model that catches two pages giving two
 * prices or two setup times learns the domain is unreliable, and that sticks.
 *
 * Ordering is NOT here on purpose: its status lives in `@/content/roadmap`.
 * Numbers that come from code (price, trial length) are imported, never typed.
 */

export const BRAND = 'vsite';
export const SITE_URL = 'https://vsite.in';
export const PRODUCT_NAME = 'Smart QR Menu';

export const PRICE_INR_PER_MONTH = PLAN_PRICES_INR.qr_menu;
export const TRIAL_DAYS = Math.round(TRIAL_DURATION_MS / (24 * 60 * 60 * 1000));
export const LIVE_SINCE = SMART_QR_MENU_LIVE_SINCE;

export const CONTACT = {
    whatsapp: WHATSAPP_DISPLAY,
    email: SUPPORT_EMAIL,
    founder: FOUNDER_NAME,
} as const;

/**
 * Scripts a menu can show today. There is NO diner-side language switch and no
 * automatic translation: a dish shows its name as the owner typed it (Tamil,
 * English or both together) and renders it with Tamil fonts. The AI reads
 * Tamil and English text from the paper menu.
 */
export const MENU_LANGUAGES = ['Tamil', 'English'] as const;

/** The one line for "what about Tamil?" on every public surface. */
export const LANGUAGE_CLAIM = 'Tamil and English on the same menu: dish names in Tamil, English or both';

/**
 * How food photos are made. They are MATCHED from a curated library by the dish
 * name (no image model is called), so public copy says "AI-matched", never
 * "AI-generated". See `src/lib/menu/photoSuggest.ts`.
 */
export const PHOTO_CLAIM = 'AI-matched food photos from a curated library';

/**
 * Setup time, two figures, both stated everywhere they are relevant.
 *
 * LIVE_MENU_MINUTES: about 3 minutes from sign-up to a live menu link for a
 * typical menu (owner-confirmed 2026-09-30). The fast path: sign up, add a menu
 * photo, the AI reads it, launch. The two dish-picking screens are skippable.
 *
 * COMPLETE_SETUP_MINUTES: about 10 to 15 minutes for a complete setup including
 * design, banners, correcting AI misreads and downloading and printing the QR
 * poster or sticker. Never say setup is "under 3 minutes" for everything.
 */
export const LIVE_MENU_MINUTES = 3;
export const COMPLETE_SETUP_MINUTES = { min: 10, max: 15 } as const;

/** The 3-minute definition, as one sentence fragment. */
export const LIVE_MENU_CLAIM = `about ${LIVE_MENU_MINUTES} minutes from sign-up to a live menu link for a typical menu`;
/** The complete-setup definition, as one sentence fragment. */
export const COMPLETE_SETUP_CLAIM = `about ${COMPLETE_SETUP_MINUTES.min} to ${COMPLETE_SETUP_MINUTES.max} minutes for a complete setup including the QR poster`;

/** Billing period in days: one payment buys one period, no auto-renewal (see `@/content/policy`). */
export const BILLING_DAYS = BILLING_CYCLE_DAYS;

/** Pages (photos, or pages of a PDF) the AI reads per store during setup. From `aiPageLimits`. */
export const MENU_SCAN_PAGE_LIMIT = ONBOARDING_PAGE_LIMIT;

/** Largest menu PDF, in MB. From `pdfPages`. */
export const MENU_PDF_MAX_MB = Math.round(MAX_PDF_BYTES / (1024 * 1024));

/** The optional NFC + QR sticker, per piece. Ordered by request from the QR page, paid separately. */
export const STICKER_PRICE_INR = QR_STICKER_PRICE_INR;

/** The one line for "what do I get for the QR?": the code is free, the sticker is optional and paid. */
export const STICKER_CLAIM = `The QR code is free to download and print. An optional NFC + QR sticker is ₹${STICKER_PRICE_INR} each`;

/**
 * Complete-setup time, step by step, in minutes. These per-step figures are
 * ESTIMATES from the number of screens and from timeouts in the code, not a
 * stopwatch measurement; the owner confirmed only the ~3 minute live-menu path
 * (LIVE_MENU_MINUTES). Basis for each:
 *   signUp   : 3 fields + 6-digit code that submits itself (signup/page.tsx)
 *   photo    : up to MENU_SCAN_PAGE_LIMIT pages; depends on menu length
 *   aiRead   : server gives up at 50 s (menuExtractor DEFAULT_DEADLINE_MS)
 *   picks    : two skippable screens, pick up to 3 dishes each (onboarding)
 *   launch   : design choice on the summary + launch screen that runs at least
 *              ~10 s (LaunchLoadingScreen: 4 message steps of 2.5 s)
 *   qr       : open the QR page and download the poster or QR
 */
export const CORE_STEP_MINUTES = [
    { id: 'signUp', min: 1, max: 2 },
    { id: 'photo', min: 2, max: 5 },
    { id: 'aiRead', min: 1, max: 1 },
    { id: 'picks', min: 1, max: 2 },
    { id: 'launch', min: 1, max: 2 },
    { id: 'qr', min: 2, max: 3 },
] as const;

/** The complete-setup range. Covers the sum of CORE_STEP_MINUTES (8 to 15), rounded to a plain range. */
export const TYPICAL_TOTAL_MINUTES = COMPLETE_SETUP_MINUTES;
