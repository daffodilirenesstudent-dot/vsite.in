// What the owner is told when a menu scan does not go to plan, keyed by the
// `code` the extract route returns (plus the few situations only the browser
// can see: offline, timeout, unsupported photo formats, and PDFs that cannot be
// turned into pages). English only: owner decision 2026-09-23, enforced by
// tests/acceptance/onboarding-english-only.test.ts.
//
// Every message says what happened AND what to do next. Owners here are often
// on a phone, on a slow network, and new to apps like this; a message that only
// names the problem is a dead end, and a dead end on this screen is a lost
// signup. `tests/acceptance/resilient-extraction.test.ts` fails if the route
// gains a code this file does not word.

import type { PdfProblem } from '@/lib/menu/pdfPages';

export interface ScanMessage {
  en: string;
}

export const SCAN_MESSAGES = {
  UNAUTHORIZED: { en: 'Your login has expired. Please log in again.' },
  INVALID_TOKEN: { en: 'Your login has expired. Please log in again.' },
  SESSION_EXPIRED: { en: 'Your login has expired. Please log in again.' },
  AI_PAUSED: { en: 'Menu scanning is paused for today. Skip this step and add your dishes by hand.' },
  PAYLOAD_TOO_LARGE: { en: 'These photos are too big to send. Remove a few photos and try again.' },
  SCAN_IN_PROGRESS: { en: 'Your menu is already being scanned. Please wait a moment.' },
  BUSY: { en: "Many restaurants are joining right now. You're in the queue — keep this page open, we'll start automatically." },
  DAILY_SCAN_LIMIT: { en: "You've reached today's scanning limit. Skip and add dishes by hand, or scan again tomorrow." },
  RATE_LIMITED: { en: "You've scanned many times this hour. Try again later, or skip and add dishes by hand." },
  BAD_REQUEST: { en: "The upload didn't reach us properly. Please try again." },
  NO_SHOP_NAME: { en: 'Please enter your store name.' },
  SHOP_NAME_TOO_LONG: { en: 'Store name is too long — keep it under 100 letters.' },
  NO_PHOTOS: { en: 'Please add at least one photo of your menu.' },
  UNREADABLE_PHOTOS: { en: "We couldn't open these photos. Take new photos with your phone camera and try again." },
  NO_ITEMS_FOUND: { en: "We couldn't find any dishes in these photos. Try clearer, well-lit photos — or skip and add dishes by hand." },
  INTERNAL: { en: 'Something went wrong on our side. Please try again.' },
  PLAN_LIMIT: { en: 'Your account already has 2 stores, the most for one account.' },
  CONSENT_REQUIRED: { en: 'The free trial for this phone number is already used. Agree to pay for this store to continue.' },
  ELIGIBILITY_UNAVAILABLE: { en: "We couldn't check your account just now. Please try again in a moment." },
  NETWORK: { en: 'Your internet connection dropped. Check it and try again — your photos are still here.' },
  TIMEOUT: { en: 'Scanning took too long. Try again with fewer photos (3–5 at a time).' },
  QUEUE_GAVE_UP: { en: "It's very busy right now. Try again in a few minutes, or skip and add dishes by hand." },
  HEIC_UNSUPPORTED: { en: "Some photos are in HEIC format, which we can't read. Take a screenshot of each photo and upload that instead." },
  // AI page limits: English only, by owner decision (docs/features/ai-page-limits/contract.md).
  PAGE_LIMIT: { en: "This store's 15 AI pages are used. Your items so far are saved. Continue, and add any missing dishes by hand." },
  PAGE_LIMIT_UNAVAILABLE: { en: "We couldn't check your pages. No pages were used. Check your internet and try again." },
} satisfies Record<string, ScanMessage>;

export type ScanCode = keyof typeof SCAN_MESSAGES;

/** The message for a route or client code; unknown codes read as a generic retry. */
export function scanMessage(code: string | undefined | null): ScanMessage {
  if (code && code in SCAN_MESSAGES) return SCAN_MESSAGES[code as ScanCode];
  return SCAN_MESSAGES.INTERNAL;
}

/** Codes after which the owner should be offered the way forward without a scan. */
export const SKIPPABLE_CODES: ReadonlySet<string> = new Set([
  'AI_PAUSED', 'DAILY_SCAN_LIMIT', 'RATE_LIMITED', 'NO_ITEMS_FOUND', 'UNREADABLE_PHOTOS', 'INTERNAL',
  'TIMEOUT', 'QUEUE_GAVE_UP', 'NETWORK', 'HEIC_UNSUPPORTED', 'PAYLOAD_TOO_LARGE',
  'PAGE_LIMIT', 'PAGE_LIMIT_UNAVAILABLE',
]);

/** PAGE_LIMIT with the pages this store still has: all used, or fewer than the owner picked. */
export function pageLimitMessage(pagesLeft: number): ScanMessage {
  if (pagesLeft <= 0) return SCAN_MESSAGES.PAGE_LIMIT;
  return {
    en: `This store has ${pagesLeft} AI page${pagesLeft === 1 ? '' : 's'} left. Remove some photos and try again, or continue and add dishes by hand.`,
  };
}

/** Told once the scan finishes but some photos could not be read. */
export function partialScanNotice(photoNumbers: number[]): ScanMessage {
  const list = photoNumbers.join(', ');
  const many = photoNumbers.length > 1;
  return {
    en: `We couldn't read photo${many ? 's' : ''} ${list}. Those dishes are not in your menu yet — retake ${many ? 'them' : 'it'} later, or add them from the dashboard after launch.`,
  };
}

/** Why a PDF could not be added, with its page numbers where they matter. */
export function pdfMessage(code: PdfProblem, n: { pages?: number; room?: number }): ScanMessage {
  const pages = n.pages ?? 0;
  const room = n.room ?? 0;
  switch (code) {
    case 'PDF_TOO_MANY_PAGES':
      return {
        en: `This PDF has ${pages} pages. A menu can have up to 15 pages — upload just the menu pages.`,
      };
    case 'PDF_NO_ROOM':
      return {
        en: `This PDF has ${pages} pages, but only ${room} more can be added (15 in total). Remove some photos first.`,
      };
    case 'PDF_PASSWORD':
      return {
        en: 'This PDF is password-protected. Upload a copy without a password, or photos of the menu.',
      };
    case 'PDF_TOO_LARGE':
      return {
        en: 'This PDF file is too big (over 25 MB). Upload a smaller copy, or photos of the menu.',
      };
    case 'PDF_UNREADABLE':
    default:
      return {
        en: "We couldn't open this PDF. Try saving it again, or upload photos of the menu instead.",
      };
  }
}
