// What the owner is told when a menu scan does not go to plan — in English and
// Tamil, keyed by the `code` the extract route returns (plus the few situations
// only the browser can see: offline, timeout, unsupported photo formats, and
// PDFs that cannot be turned into pages).
//
// Every message says what happened AND what to do next. Owners here are often
// on a phone, on a slow network, and new to apps like this; a message that only
// names the problem is a dead end, and a dead end on this screen is a lost
// signup. `tests/acceptance/resilient-extraction.test.ts` fails if the route
// gains a code this file does not word in both languages.

import type { PdfProblem } from '@/lib/menu/pdfPages';

export interface ScanMessage {
  en: string;
  ta: string;
}

export const SCAN_MESSAGES = {
  UNAUTHORIZED: { en: 'Your login has expired. Please log in again.', ta: 'உங்கள் உள்நுழைவு காலாவதியாகிவிட்டது. மீண்டும் உள்நுழையவும்.' },
  INVALID_TOKEN: { en: 'Your login has expired. Please log in again.', ta: 'உங்கள் உள்நுழைவு காலாவதியாகிவிட்டது. மீண்டும் உள்நுழையவும்.' },
  SESSION_EXPIRED: { en: 'Your login has expired. Please log in again.', ta: 'உங்கள் உள்நுழைவு காலாவதியாகிவிட்டது. மீண்டும் உள்நுழையவும்.' },
  AI_PAUSED: { en: 'Menu scanning is paused for today. Skip this step and add your dishes by hand.', ta: 'இன்று மெனு ஸ்கேன் தற்காலிகமாக நிறுத்தப்பட்டுள்ளது. இந்தப் படியைத் தவிர்த்து, உணவுகளை நீங்களே சேர்க்கவும்.' },
  PAYLOAD_TOO_LARGE: { en: 'These photos are too big to send. Remove a few photos and try again.', ta: 'புகைப்படங்கள் மிகப் பெரியவை. சில புகைப்படங்களை நீக்கி மீண்டும் முயற்சிக்கவும்.' },
  SCAN_IN_PROGRESS: { en: 'Your menu is already being scanned. Please wait a moment.', ta: 'உங்கள் மெனு ஏற்கனவே ஸ்கேன் செய்யப்படுகிறது. சிறிது காத்திருக்கவும்.' },
  BUSY: { en: "Many restaurants are joining right now. You're in the queue — keep this page open, we'll start automatically.", ta: 'இப்போது பல உணவகங்கள் இணைகின்றன. நீங்கள் வரிசையில் உள்ளீர்கள் — இந்தப் பக்கத்தைத் திறந்தே வைத்திருங்கள், தானாகத் தொடங்கும்.' },
  DAILY_SCAN_LIMIT: { en: "You've reached today's scanning limit. Skip and add dishes by hand, or scan again tomorrow.", ta: 'இன்றைய ஸ்கேன் வரம்பை அடைந்துவிட்டீர்கள். தவிர்த்து உணவுகளை நீங்களே சேர்க்கவும், அல்லது நாளை மீண்டும் ஸ்கேன் செய்யவும்.' },
  RATE_LIMITED: { en: "You've scanned many times this hour. Try again later, or skip and add dishes by hand.", ta: 'இந்த மணிநேரத்தில் பலமுறை ஸ்கேன் செய்துவிட்டீர்கள். பிறகு முயற்சிக்கவும், அல்லது தவிர்த்து உணவுகளை நீங்களே சேர்க்கவும்.' },
  BAD_REQUEST: { en: "The upload didn't reach us properly. Please try again.", ta: 'பதிவேற்றம் சரியாக வந்து சேரவில்லை. மீண்டும் முயற்சிக்கவும்.' },
  NO_SHOP_NAME: { en: 'Please enter your store name.', ta: 'உங்கள் கடையின் பெயரை உள்ளிடவும்.' },
  SHOP_NAME_TOO_LONG: { en: 'Store name is too long — keep it under 100 letters.', ta: 'கடையின் பெயர் மிக நீளமாக உள்ளது — 100 எழுத்துகளுக்குள் வைக்கவும்.' },
  NO_PHOTOS: { en: 'Please add at least one photo of your menu.', ta: 'உங்கள் மெனுவின் குறைந்தது ஒரு புகைப்படத்தைச் சேர்க்கவும்.' },
  UNREADABLE_PHOTOS: { en: "We couldn't open these photos. Take new photos with your phone camera and try again.", ta: 'இந்தப் புகைப்படங்களைத் திறக்க முடியவில்லை. உங்கள் ஃபோன் கேமராவில் புதிய புகைப்படங்கள் எடுத்து மீண்டும் முயற்சிக்கவும்.' },
  NO_ITEMS_FOUND: { en: "We couldn't find any dishes in these photos. Try clearer, well-lit photos — or skip and add dishes by hand.", ta: 'இந்தப் புகைப்படங்களில் உணவுகளைக் கண்டறிய முடியவில்லை. தெளிவான, வெளிச்சமான புகைப்படங்களை முயற்சிக்கவும் — அல்லது தவிர்த்து உணவுகளை நீங்களே சேர்க்கவும்.' },
  INTERNAL: { en: 'Something went wrong on our side. Please try again.', ta: 'எங்கள் பக்கத்தில் ஏதோ தவறு நடந்துவிட்டது. மீண்டும் முயற்சிக்கவும்.' },
  PLAN_LIMIT: { en: 'Your account already has the maximum number of stores.', ta: 'உங்கள் கணக்கில் அதிகபட்ச கடைகள் ஏற்கனவே உள்ளன.' },
  TRIAL_LIMIT: { en: 'The free trial allows 2 stores. Activate a plan on a store to add more.', ta: 'இலவச சோதனையில் 2 கடைகள் மட்டுமே. மேலும் சேர்க்க ஒரு கடைக்குத் திட்டத்தைச் செயல்படுத்தவும்.' },
  ELIGIBILITY_UNAVAILABLE: { en: "We couldn't check your account just now. Please try again in a moment.", ta: 'உங்கள் கணக்கை இப்போது சரிபார்க்க முடியவில்லை. சிறிது நேரத்தில் மீண்டும் முயற்சிக்கவும்.' },
  NETWORK: { en: 'Your internet connection dropped. Check it and try again — your photos are still here.', ta: 'இணைய இணைப்பு துண்டிக்கப்பட்டது. இணைப்பைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும் — உங்கள் புகைப்படங்கள் இங்கேயே உள்ளன.' },
  TIMEOUT: { en: 'Scanning took too long. Try again with fewer photos (3–5 at a time).', ta: 'ஸ்கேன் செய்ய அதிக நேரம் ஆனது. குறைவான புகைப்படங்களுடன் (ஒரே நேரத்தில் 3–5) மீண்டும் முயற்சிக்கவும்.' },
  QUEUE_GAVE_UP: { en: "It's very busy right now. Try again in a few minutes, or skip and add dishes by hand.", ta: 'இப்போது மிகவும் கூட்டமாக உள்ளது. சில நிமிடங்களில் மீண்டும் முயற்சிக்கவும், அல்லது தவிர்த்து உணவுகளை நீங்களே சேர்க்கவும்.' },
  HEIC_UNSUPPORTED: { en: "Some photos are in HEIC format, which we can't read. Take a screenshot of each photo and upload that instead.", ta: 'சில புகைப்படங்கள் HEIC வடிவத்தில் உள்ளன, அவற்றைப் படிக்க முடியாது. ஒவ்வொரு புகைப்படத்தையும் ஸ்கிரீன்ஷாட் எடுத்து அதைப் பதிவேற்றவும்.' },
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
]);

/** Told once the scan finishes but some photos could not be read. */
export function partialScanNotice(photoNumbers: number[]): ScanMessage {
  const list = photoNumbers.join(', ');
  const many = photoNumbers.length > 1;
  return {
    en: `We couldn't read photo${many ? 's' : ''} ${list}. Those dishes are not in your menu yet — retake ${many ? 'them' : 'it'} later, or add them from the dashboard after launch.`,
    ta: `புகைப்படம் ${list}-ஐப் படிக்க முடியவில்லை. அந்த உணவுகள் இன்னும் மெனுவில் இல்லை — பின்னர் மீண்டும் எடுக்கவும், அல்லது தொடங்கிய பிறகு டாஷ்போர்டில் சேர்க்கவும்.`,
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
        ta: `இந்த PDF-இல் ${pages} பக்கங்கள் உள்ளன. மெனுவில் அதிகபட்சம் 15 பக்கங்கள் மட்டுமே — மெனு பக்கங்களை மட்டும் பதிவேற்றவும்.`,
      };
    case 'PDF_NO_ROOM':
      return {
        en: `This PDF has ${pages} pages, but only ${room} more can be added (15 in total). Remove some photos first.`,
        ta: `இந்த PDF-இல் ${pages} பக்கங்கள் உள்ளன, ஆனால் இன்னும் ${room} பக்கங்களுக்கு மட்டுமே இடம் உள்ளது (மொத்தம் 15). முதலில் சில புகைப்படங்களை நீக்கவும்.`,
      };
    case 'PDF_PASSWORD':
      return {
        en: 'This PDF is password-protected. Upload a copy without a password, or photos of the menu.',
        ta: 'இந்த PDF கடவுச்சொல்லால் பூட்டப்பட்டுள்ளது. கடவுச்சொல் இல்லாத நகலை அல்லது மெனுவின் புகைப்படங்களைப் பதிவேற்றவும்.',
      };
    case 'PDF_TOO_LARGE':
      return {
        en: 'This PDF file is too big (over 25 MB). Upload a smaller copy, or photos of the menu.',
        ta: 'இந்த PDF கோப்பு மிகப் பெரியது (25 MB-க்கு மேல்). சிறிய நகலை அல்லது மெனுவின் புகைப்படங்களைப் பதிவேற்றவும்.',
      };
    case 'PDF_UNREADABLE':
    default:
      return {
        en: "We couldn't open this PDF. Try saving it again, or upload photos of the menu instead.",
        ta: 'இந்த PDF-ஐத் திறக்க முடியவில்லை. மீண்டும் சேமித்து முயற்சிக்கவும், அல்லது மெனுவின் புகைப்படங்களைப் பதிவேற்றவும்.',
      };
  }
}
