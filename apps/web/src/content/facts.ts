import { PLAN_PRICES_INR, TRIAL_DURATION_MS } from '@/lib/platform/productFlags';
import { SMART_QR_MENU_LIVE_SINCE } from '@/content/roadmap';
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

/** Languages a diner can read the menu in today. */
export const MENU_LANGUAGES = ['Tamil', 'English'] as const;

/**
 * How food photos are made. They are MATCHED from a curated library by the dish
 * name (no image model is called), so public copy says "AI-matched", never
 * "AI-generated". See `src/lib/menu/photoSuggest.ts`.
 */
export const PHOTO_CLAIM = 'AI-matched food photos from a curated library';

/**
 * Setup time. PENDING a timed real run on the test store (plan, Phase C): the
 * setup guide must replace this with the measured figure before it publishes.
 */
export const SETUP_TIME_CLAIM_UNVERIFIED = 'about 3 minutes';
