import {
    PRICE_INR_PER_MONTH,
    TRIAL_DAYS,
    BILLING_DAYS,
    MENU_SCAN_PAGE_LIMIT,
    MENU_PDF_MAX_MB,
    STICKER_PRICE_INR,
    LIVE_MENU_MINUTES,
    COMPLETE_SETUP_MINUTES,
    CORE_STEP_MINUTES,
    CONTACT,
} from '@/content/facts';
import { ORDERING_COMING_SOON_SHORT } from '@/content/roadmap';
import { HOW_TO_STOP, NO_REFUND_SHORT, TRIAL_RULE, BILLING_CYCLE_STEPS, REMINDER_DAYS_BEFORE } from '@/content/policy';
import {
    TRIAL_BULK_PAGE_LIMIT,
    PAID_BULK_PAGE_LIMIT,
} from '@/lib/menu/aiPageLimits';
import { STORE_LIMIT } from '@/lib/store/trialRules';
import type { GuideLink, GuidePage, GuideSlug } from './types';

/*
 * Ground truth for every statement below was traced in the code on 2026-09-30:
 *   sign-up      src/app/signup/page.tsx, src/app/login/page.tsx
 *   add menu     src/app/onboarding/*, src/app/api/onboarding/{extract,complete},
 *                src/lib/menu/{menuExtractor,pdfPages,aiPageLimits}.ts,
 *                src/app/manage/product-inventory/page.tsx
 *   design       src/lib/menu/menuThemes.ts, src/components/menu/MenuDesignPicker.tsx,
 *                src/app/manage/settings/_components/AppearancePanel.tsx
 *   banners      src/app/manage/banner-management/page.tsx,
 *                src/components/templates/QRMenuTemplate.tsx (BANNER block)
 *   config       src/app/manage/settings/page.tsx, src/app/manage/subscription/page.tsx,
 *                src/app/manage/dashboard/page.tsx, src/content/policy.ts
 *   QR           src/app/manage/qr/page.tsx, src/components/manage/MenuQrPanel.tsx,
 *                src/lib/qr/printKit.ts
 * Button and menu names are copied from those files. Prices, trial length, page
 * limits and times come from facts.ts, so they cannot drift between pages,
 * languages, schema and llms-full.
 */

const P = `₹${PRICE_INR_PER_MONTH}`;
const TRIAL = `${TRIAL_DAYS}-day free trial`;
/** Complete setup, including design, banners, fixes and the printed QR poster. */
const TOTAL = `about ${COMPLETE_SETUP_MINUTES.min} to ${COMPLETE_SETUP_MINUTES.max} minutes`;
const TOTAL_TA = `${COMPLETE_SETUP_MINUTES.min} முதல் ${COMPLETE_SETUP_MINUTES.max} நிமிடங்கள்`;
/** Fast path (owner-confirmed): sign-up to a live menu link for a typical menu. */
const LIVE = `about ${LIVE_MENU_MINUTES} minutes`;
const LIVE_TA = `சுமார் ${LIVE_MENU_MINUTES} நிமிடங்கள்`;
const LIVE_DEF =
    'sign up, add a menu photo, let the AI read it and launch; the two dish-picking screens can be skipped';
const LIVE_DEF_TA =
    'sign up, மெனு போட்டோ சேர்த்தல், AI படித்தல், launch; இரண்டு உணவு தேர்வு திரைகளையும் தவிர்க்கலாம்';

const L = {
    pricing: { label: 'Pricing', href: '/pricing' },
    features: { label: 'Features', href: '/features' },
    qrMenu: { label: 'QR menu for restaurants', href: '/qr-menu' },
    support: { label: 'Support', href: '/support' },
    india: { label: 'Digital menu in India', href: '/digital-menu-india' },
} as const;

const CORE_LINKS: GuideLink[] = [L.pricing, L.features, L.qrMenu, L.support, L.india];

const minutes = (id: (typeof CORE_STEP_MINUTES)[number]['id']): string => {
    const s = CORE_STEP_MINUTES.find((x) => x.id === id);
    if (!s) return '';
    return s.min === s.max ? `about ${s.min} minute` : `typically ${s.min} to ${s.max} minutes`;
};
const minutesTa = (id: (typeof CORE_STEP_MINUTES)[number]['id']): string => {
    const s = CORE_STEP_MINUTES.find((x) => x.id === id);
    if (!s) return '';
    return s.min === s.max ? `சுமார் ${s.min} நிமிடம்` : `பொதுவாக ${s.min} முதல் ${s.max} நிமிடங்கள்`;
};

export const GUIDE: Record<GuideSlug, GuidePage> = {
    /* ───────────────────────────── HUB ───────────────────────────── */
    'digital-menu-setup': {
        slug: 'digital-menu-setup',
        title: 'How to set up a digital menu with vsite: steps, time and cost',
        description: `Set up a vsite QR digital menu yourself: ${LIVE} to a live menu link, ${TOTAL} for a complete setup with the QR poster. Steps, what you need, and the cost: ${P} a month after a ${TRIAL}.`,
        short: 'Setup overview',
        totalMinutes: LIVE_MENU_MINUTES,
        en: {
            h1: 'How do I set up a digital menu with vsite?',
            answer:
                `You can set up a vsite digital menu yourself: ${LIVE} from sign-up to a live menu link for a typical menu. A complete setup with design, banners and the printed QR poster takes ${TOTAL}. The Smart QR Menu costs ${P} a month after a ${TRIAL}, with no setup fee.`,
            needs: [
                'A mobile number that can receive a 6-digit code (OTP)',
                `Your current menu as photos or one PDF (up to ${MENU_SCAN_PAGE_LIMIT} pages) on your phone or computer`,
                'The name of your shop',
                'A printer, or a print shop, for the QR poster (optional until you want it on tables)',
            ],
            steps: [
                {
                    name: 'Sign up with your mobile number',
                    text: 'Open vsite.in and tap "Build my menu free". On "Create Account" enter your name and 10-digit mobile number, tick the Terms of Service and Privacy Policy box, tap "Create Account", then type the 6-digit code sent to your phone. No card is needed.',
                    time: minutes('signUp'),
                },
                {
                    name: 'Add your menu from photos or a PDF',
                    text: `On "Let's get your menu online" type your Store name, tap "Choose File" (or "Take Photo" on a phone) and add up to ${MENU_SCAN_PAGE_LIMIT} photos or one PDF, then tap "Continue". The AI reads every item, price and category.`,
                    time: `${minutes('photo')} to photograph or pick the files, then ${minutes('aiRead')} for the AI to read them`,
                },
                {
                    name: 'Pick your bestsellers and top earners',
                    text: 'Answer "Which items sell the most?" and "Which items earn the most?" by choosing up to 3 dishes each, or skip both. Bestsellers are featured at the top of your menu.',
                    time: minutes('picks'),
                },
                {
                    name: 'Choose a design and launch',
                    text: 'On "You\'re ready to launch" check the item count, pick a menu design (Classic, Cafe or Premium) and a brand colour under "Pick your menu design", then tap "Launch My Menu". Your menu gets its own link at vsite.in/shop/your-shop-name.',
                    time: minutes('launch'),
                },
                {
                    name: 'Add banners for offers (optional)',
                    text: 'Open Banner Management, tap "Add Banner", upload a wide image and save. Active banners slide across the top of your menu.',
                    time: 'typically 3 to 5 minutes, optional',
                },
                {
                    name: 'Check your store settings and fix any dish (optional)',
                    text: 'In Store Settings review Store details (name, location, business type, opening hours). In Product Inventory correct any name or price the AI misread and add photos to dishes without one.',
                    time: 'typically 3 to 5 minutes, optional',
                },
                {
                    name: 'Download and print your QR code',
                    text: 'Open QR Codes, choose where the poster goes (Table stand, Counter, or Wall or door), then tap "Download PDF". Print it and place it where customers sit.',
                    time: `${minutes('qr')}, plus your own printing time`,
                },
            ],
            sections: [
                {
                    heading: 'Time and cost at a glance',
                    intro: 'The fast path is for a typical menu. The per-step ranges are for a careful first-time setup. A longer menu takes longer to photograph.',
                    rows: [
                        ['Live menu link (fast path)', `${LIVE} for a typical menu: ${LIVE_DEF}`],
                        ['Complete setup with the QR poster', `${TOTAL}: design, banners, fixing any misread dish, downloading and printing the QR poster`],
                        ['Free trial', `${TRIAL}, no card needed`],
                        ['Price after the trial', `${P} a month (${BILLING_DAYS}-day periods, paid by hand, no auto-renewal)`],
                        ['Setup fee', 'None'],
                        ['Customer needs an app?', 'No. The QR code opens the menu in the phone browser.'],
                    ],
                },
                {
                    heading: 'Where each step is explained in full',
                    bullets: [
                        'Step 1: Sign up (/guide/sign-up)',
                        'Steps 2 and 3: Add your menu (/guide/add-menu)',
                        'Step 4: Menu design (/guide/menu-design)',
                        'Step 5: Banners (/guide/banners)',
                        'Step 6: Configuration (/guide/configuration)',
                        'Step 7: QR code (/guide/qr-code)',
                        'Cost and time in detail (/guide/cost-and-time)',
                    ],
                },
            ],
            faqs: [
                {
                    q: 'How long does it take to set up a digital menu?',
                    a: `${LIVE[0].toUpperCase()}${LIVE.slice(1)} from sign-up to a live menu link for a typical menu: ${LIVE_DEF}. A complete setup, with design, banners, fixing any misread dish and downloading and printing the QR poster, takes ${TOTAL}.`,
                },
                {
                    q: 'How much does a digital menu cost in India?',
                    a: `The vsite Smart QR Menu is ${P} a month after a ${TRIAL}. There is no setup fee and vsite takes no commission on your sales.`,
                },
                {
                    q: 'Do customers need to download an app?',
                    a: 'No. Customers scan the QR code with their phone camera and the menu opens in the browser.',
                },
                {
                    q: 'Can I show my menu in Tamil?',
                    a: 'Yes. The AI reads Tamil script from your menu photos, and the customer menu shows Tamil dish names in proper Tamil fonts. You can also type dish names in Tamil, English or both. There is no automatic translation.',
                },
                {
                    q: 'What happens after the free trial?',
                    a: `Your menu goes offline until you pay ${P} for the next ${BILLING_DAYS} days. Your menu, photos and account are kept, and paying again brings everything back.`,
                },
                {
                    q: 'Can customers order from the menu?',
                    a: `${ORDERING_COMING_SOON_SHORT} Today customers read the menu and order with your staff as usual.`,
                },
            ],
            links: CORE_LINKS,
        },
        ta: {
            h1: 'vsite-ல் டிஜிட்டல் மெனுவை எப்படி அமைப்பது?',
            answer:
                `vsite.in-ல் உங்கள் டிஜிட்டல் மெனுவை நீங்களே அமைக்கலாம். வழக்கமான மெனுவுக்கு sign up முதல் live மெனு link வரை ${LIVE_TA}. design, banner, QR போஸ்டர் print உட்பட முழு அமைப்புக்கு ${TOTAL_TA}. மொபைல் நம்பரில் sign up செய்யுங்கள், மெனுவை போட்டோ எடுத்து அல்லது PDF ஆக upload செய்யுங்கள், AI படிக்கும், பிறகு launch செய்யுங்கள். Smart QR Menu-க்கு ${TRIAL_DAYS} நாள் இலவச trial, அதன் பிறகு மாதம் ₹${PRICE_INR_PER_MONTH}.`,
            needs: [
                'OTP வரும் மொபைல் நம்பர்',
                `உங்கள் இப்போதைய மெனு போட்டோக்களாக அல்லது ஒரு PDF ஆக (அதிகபட்சம் ${MENU_SCAN_PAGE_LIMIT} பக்கங்கள்)`,
                'உங்கள் கடையின் பெயர்',
                'QR போஸ்டரை print செய்ய printer அல்லது print கடை (மேசையில் வைக்கும்போது மட்டும்)',
            ],
            steps: [
                {
                    name: 'மொபைல் நம்பரில் sign up செய்யுங்கள்',
                    text: 'vsite.in திறந்து "Build my menu free" தொடுங்கள். "Create Account" பக்கத்தில் உங்கள் பெயர், 10 இலக்க மொபைல் நம்பர் போட்டு, Terms of Service மற்றும் Privacy Policy பெட்டியை டிக் செய்து, "Create Account" தொடுங்கள். போனில் வரும் 6 இலக்க code-ஐ உள்ளிடுங்கள். கார்டு தேவையில்லை.',
                    time: minutesTa('signUp'),
                },
                {
                    name: 'போட்டோ அல்லது PDF மூலம் மெனுவை சேர்க்கவும்',
                    text: `"Let's get your menu online" பக்கத்தில் கடையின் பெயரை (Store name) உள்ளிடுங்கள். "Choose File" (போனில் "Take Photo") தொட்டு ${MENU_SCAN_PAGE_LIMIT} பக்கங்கள் வரை போட்டோ அல்லது ஒரு PDF சேர்த்து "Continue" தொடுங்கள். AI ஒவ்வொரு உணவு, விலை, வகையையும் படிக்கும்.`,
                    time: `${minutesTa('photo')} போட்டோ எடுக்க, பிறகு ${minutesTa('aiRead')} AI படிக்க`,
                },
                {
                    name: 'அதிகம் விற்பவை, அதிக லாபம் தருபவை தேர்வு',
                    text: '"Which items sell the most?" மற்றும் "Which items earn the most?" கேள்விகளுக்கு ஒவ்வொன்றிலும் 3 உணவுகள் வரை தேர்ந்தெடுக்கலாம், அல்லது இரண்டையும் தவிர்க்கலாம்.',
                    time: minutesTa('picks'),
                },
                {
                    name: 'Design தேர்ந்தெடுத்து launch செய்யுங்கள்',
                    text: '"You\'re ready to launch" பக்கத்தில் உணவுகளின் எண்ணிக்கையைப் பாருங்கள். "Pick your menu design" பகுதியில் Classic, Cafe அல்லது Premium design மற்றும் brand நிறத்தை தேர்ந்தெடுத்து "Launch My Menu" தொடுங்கள். உங்கள் மெனுவுக்கு vsite.in/shop/உங்கள்-கடை-பெயர் என்ற சொந்த link கிடைக்கும்.',
                    time: minutesTa('launch'),
                },
                {
                    name: 'Offer-க்கு banner சேர்க்கவும் (விருப்பம்)',
                    text: 'Banner Management திறந்து "Add Banner" தொட்டு, அகலமான படத்தை upload செய்து save செய்யுங்கள். Active banner-கள் மெனுவின் மேலே நகர்ந்து காட்டும்.',
                    time: 'பொதுவாக 3 முதல் 5 நிமிடங்கள், விருப்பம்',
                },
                {
                    name: 'Store settings பார்த்து, தவறான உணவுகளை சரிசெய்யுங்கள் (விருப்பம்)',
                    text: 'Store Settings-ல் Store details (பெயர், இடம், business type, திறக்கும் நேரம்) சரிபாருங்கள். Product Inventory-ல் AI தவறாகப் படித்த பெயர் அல்லது விலையை திருத்தி, படம் இல்லாத உணவுகளுக்கு போட்டோ சேருங்கள்.',
                    time: 'பொதுவாக 3 முதல் 5 நிமிடங்கள், விருப்பம்',
                },
                {
                    name: 'QR code download செய்து print எடுங்கள்',
                    text: 'QR Codes திறந்து, போஸ்டர் எங்கே வைக்கப்போகிறீர்கள் (Table stand, Counter, அல்லது Wall or door) என்பதைத் தேர்ந்தெடுத்து "Download PDF" தொடுங்கள். Print எடுத்து வாடிக்கையாளர்கள் அமரும் இடத்தில் வையுங்கள்.',
                    time: `${minutesTa('qr')}, print நேரம் தனி`,
                },
            ],
            sections: [
                {
                    heading: 'நேரமும் செலவும் ஒரே பார்வையில்',
                    intro: 'வேகமான வழி வழக்கமான மெனுவுக்கு. ஒவ்வொரு படிக்கான நேரம் முதல்முறை கவனமாக அமைப்பவருக்கானது. மெனு பெரிதாக இருந்தால் போட்டோ எடுக்க அதிக நேரம் ஆகும்.',
                    rows: [
                        ['Live மெனு link (வேகமான வழி)', `வழக்கமான மெனுவுக்கு ${LIVE_TA}: ${LIVE_DEF_TA}`],
                        ['QR போஸ்டர் உட்பட முழு அமைப்பு', TOTAL_TA],
                        ['இலவச trial', `${TRIAL_DAYS} நாள், கார்டு தேவையில்லை`],
                        ['Trial-க்கு பிறகு கட்டணம்', `மாதம் ₹${PRICE_INR_PER_MONTH} (${BILLING_DAYS} நாள் காலம், நீங்களே கட்டவேண்டும், தானாக பிடிக்காது)`],
                        ['Setup கட்டணம்', 'இல்லை'],
                        ['வாடிக்கையாளருக்கு app தேவையா?', 'இல்லை. QR code-ஐ ஸ்கேன் செய்தால் போன் browser-ல் மெனு திறக்கும்.'],
                    ],
                },
            ],
            faqs: [
                {
                    q: 'டிஜிட்டல் மெனு அமைக்க எவ்வளவு நேரம் ஆகும்?',
                    a: `வழக்கமான மெனுவுக்கு sign up முதல் live மெனு link வரை ${LIVE_TA} (${LIVE_DEF_TA}). Design, banner, தவறாகப் படித்த உணவுகளை சரிசெய்தல், QR போஸ்டர் download மற்றும் print உட்பட முழு அமைப்புக்கு ${TOTAL_TA}.`,
                },
                {
                    q: 'டிஜிட்டல் மெனுவுக்கு எவ்வளவு செலவாகும்?',
                    a: `vsite Smart QR Menu-க்கு ${TRIAL_DAYS} நாள் இலவச trial, அதன் பிறகு மாதம் ₹${PRICE_INR_PER_MONTH}. Setup கட்டணம் இல்லை. உங்கள் விற்பனையில் vsite கமிஷன் எடுக்காது.`,
                },
                {
                    q: 'வாடிக்கையாளர்கள் app download செய்ய வேண்டுமா?',
                    a: 'இல்லை. போன் கேமராவால் QR code-ஐ ஸ்கேன் செய்தால் மெனு browser-லேயே திறக்கும்.',
                },
                {
                    q: 'என் மெனுவை தமிழில் காட்ட முடியுமா?',
                    a: 'முடியும். உங்கள் மெனு போட்டோவில் உள்ள தமிழ் எழுத்தை AI படிக்கும், வாடிக்கையாளர் மெனுவில் தமிழ் பெயர்கள் சரியான தமிழ் எழுத்துருவில் தெரியும். உணவு பெயர்களை தமிழ், ஆங்கிலம் அல்லது இரண்டிலும் எழுதலாம். தானியங்கி மொழிபெயர்ப்பு இல்லை.',
                },
                {
                    q: 'இலவச trial முடிந்த பிறகு என்ன நடக்கும்?',
                    a: `நீங்கள் ₹${PRICE_INR_PER_MONTH} கட்டும் வரை உங்கள் மெனு offline ஆகிவிடும். உங்கள் மெனு, போட்டோக்கள், கணக்கு அனைத்தும் அப்படியே இருக்கும். மீண்டும் கட்டினால் உடனே திரும்ப வரும்.`,
                },
            ],
            links: CORE_LINKS,
        },
    },

    /* ─────────────────────────── SIGN UP ─────────────────────────── */
    'sign-up': {
        slug: 'sign-up',
        title: 'How to sign up for vsite: mobile number, OTP and free trial',
        description: `Sign up for vsite with just your mobile number and a 6-digit code. ${TRIAL}, no card needed, then ${P} a month.`,
        short: 'Sign up',
        totalMinutes: 2,
        en: {
            h1: 'How do I sign up for vsite?',
            answer:
                `Open vsite.in, tap "Build my menu free", enter your name and 10-digit mobile number, agree to the Terms and Privacy Policy, and type the 6-digit code sent to your phone. There is no password and no card needed. Signing up starts your ${TRIAL}; the plan is ${P} a month afterwards.`,
            needs: [
                'A mobile number that can receive an SMS code',
                'Your name',
                'One minute or two',
            ],
            steps: [
                {
                    name: 'Open vsite.in and tap "Build my menu free"',
                    text: 'The button is on the home page. It opens the "Create Account" screen. If you already have an account, use "Log in" instead.',
                    time: 'about 10 seconds',
                },
                {
                    name: 'Enter your name and mobile number',
                    text: 'Type your name, then your 10-digit mobile number (the +91 code is already set). The screen says "Your menu, one scan away. No app to install."',
                    time: 'about 20 seconds',
                },
                {
                    name: 'Tick the agreement box and tap "Create Account"',
                    text: 'You must accept the Terms of Service and Privacy Policy first. Under the button the screen states the billing model: free trial, no card today, then the monthly price, paid one period at a time with no auto-renewal.',
                    time: 'about 10 seconds',
                },
                {
                    name: 'Type the 6-digit code (OTP)',
                    text: 'On "Verify your number" type the 6 digits from your SMS. The code submits itself when the sixth digit is typed. Use "Resend" if it does not arrive, or edit the number if you mistyped it.',
                    time: 'about 30 seconds',
                },
                {
                    name: 'Continue to your menu setup',
                    text: 'After the code is accepted a new account goes straight to the menu setup screen, where you add your shop name and menu photos. Your trial has started.',
                    time: 'immediate',
                },
            ],
            sections: [
                {
                    heading: 'The free trial rules',
                    bullets: [
                        TRIAL_RULE,
                        `${TRIAL}, no card needed. Payment is only asked when you choose to keep the menu live.`,
                        'Logging in later uses the same mobile number and a new 6-digit code. There is no password to remember.',
                    ],
                },
            ],
            faqs: [
                {
                    q: 'Do I need a credit card to start the vsite free trial?',
                    a: `No. The ${TRIAL} needs no card. You pay only if you decide to keep your menu live after the trial.`,
                },
                {
                    q: 'Is there a password?',
                    a: 'No. You sign in with your mobile number and a 6-digit code sent by SMS each time.',
                },
                {
                    q: 'Can I sign up more than once for a free trial?',
                    a: TRIAL_RULE,
                },
                {
                    q: 'The code did not arrive. What should I do?',
                    a: `Wait for the countdown, then tap "Resend". Check the number is correct, or ask for help on WhatsApp at ${CONTACT.whatsapp}.`,
                },
            ],
            links: [L.pricing, L.features, L.qrMenu, L.support, L.india],
        },
    },

    /* ─────────────────────────── ADD MENU ─────────────────────────── */
    'add-menu': {
        slug: 'add-menu',
        title: 'How to add your menu to vsite: photo or PDF to live menu',
        description: `Add your menu to vsite by photo or PDF. The AI reads the items, you pick bestsellers and launch. Up to ${MENU_SCAN_PAGE_LIMIT} pages; edit any dish afterwards.`,
        short: 'Add your menu',
        totalMinutes: 8,
        en: {
            h1: 'How do I add my menu to vsite?',
            answer:
                `Photograph your printed menu or upload a PDF, up to ${MENU_SCAN_PAGE_LIMIT} pages, and tap "Continue". The AI reads every item, price and category, and matches food photos from a curated library. You pick bestsellers, then tap "Launch My Menu". Afterwards you can edit, add or hide any dish in Product Inventory.`,
            needs: [
                `Photos of your menu or one PDF (up to ${MENU_SCAN_PAGE_LIMIT} pages, PDF up to ${MENU_PDF_MAX_MB} MB)`,
                'Clear, well-lit photos, one menu page per photo',
                'Your shop name as you want customers to see it',
            ],
            steps: [
                {
                    name: 'Type your Store name',
                    text: 'On "Let\'s get your menu online" enter the name of your shop in the Store name box (for example Cream Story). This becomes the heading of your menu and the last part of its link.',
                    time: 'about 10 seconds',
                },
                {
                    name: 'Add menu photos or a PDF',
                    text: `Under "Menu photos" tap "Choose File" (or "Take Photo" on a phone camera, or drag files in on a computer). Add up to ${MENU_SCAN_PAGE_LIMIT} pages in total. A PDF is split into pages on your device. Remove a photo with the small close button on it.`,
                    time: minutes('photo'),
                },
                {
                    name: 'Tap "Continue" and wait for the AI to read the menu',
                    text: 'The button shows "Scanning your menu…" and then the number of items found. Keep the page open. If the service is busy you are queued and it starts by itself.',
                    time: minutes('aiRead'),
                },
                {
                    name: 'Choose your bestsellers',
                    text: 'On "Which items sell the most?" pick up to 3 dishes. They are featured at the top of your menu. Use "Clear" to start over, "Back" to return, or "Continue" to go on without picking.',
                    time: 'about 30 seconds',
                },
                {
                    name: 'Choose your top earners',
                    text: 'On "Which items earn the most?" pick up to 3 dishes with the best profit margin. They are prioritised in your layout.',
                    time: 'about 30 seconds',
                },
                {
                    name: 'Review the summary and tap "Launch My Menu"',
                    text: 'The summary "You\'re ready to launch" shows your store name and counts of Items, Bestsellers and Top earners, and the list of dishes found. Choose a design (see the menu design page), then tap "Launch My Menu". A launch screen runs while food photos are matched, then shows "View live menu", "Share your menu" and "Go to dashboard".',
                    time: minutes('launch'),
                },
                {
                    name: 'Fix and complete your dishes in Product Inventory',
                    text: 'Open Product Inventory (Products on a phone). Correct any name or price the AI misread, add a photo to dishes marked "No photo yet", and add anything it missed with "Add Product".',
                    time: 'depends on menu size',
                },
            ],
            sections: [
                {
                    heading: 'What the AI reads from your photos',
                    bullets: [
                        'Item names (Tamil script is kept as written), prices, and the category or section each item sits under.',
                        'Size prices such as small and large, where your menu shows several prices for one dish.',
                        'A short description for each dish. Food photos are matched from a curated library by the dish name; they are not new pictures of your own food.',
                        'Printed menus read best. A clear, straight photo with no shadow or glare helps most. Handwritten pages are accepted, but check the result more carefully.',
                    ],
                },
                {
                    heading: 'File limits and what is not accepted',
                    bullets: [
                        `Up to ${MENU_SCAN_PAGE_LIMIT} pages (photos plus PDF pages) per store in setup. A PDF can be up to ${MENU_PDF_MAX_MB} MB.`,
                        'Password-protected PDFs cannot be opened. Upload an unlocked copy or photos.',
                        'HEIC photos cannot be read. Take a screenshot of the photo and upload that.',
                        'If a scan times out, try again with 3 to 5 photos at a time. A photo that cannot be read is named in a notice, and you can add those dishes later.',
                        'If scanning is not available, tap "Skip — add dishes by hand" and add dishes yourself.',
                    ],
                },
                {
                    heading: 'Adding and editing a dish yourself',
                    intro: 'In Product Inventory, tap "Add Product" to open the form. Each dish has:',
                    bullets: [
                        'Product Name (required) and Description.',
                        'Photo: upload your own, or tap "Use Professional Image" to search the curated food image library by the dish name.',
                        'Veg or non-veg (required), shown as a coloured mark on the menu.',
                        'Pricing: one price, several sizes (Size Variants, for example Small and Large), or a combo of several items. Add on or Toppings can be added with their own prices.',
                        'Category, chosen from your list or created with "+ Add New".',
                        'Offer / Discount: add an Original Price (MRP) to show a struck-through price and a discount badge.',
                        'Show on menu switch to hide a dish without deleting it.',
                    ],
                },
                {
                    heading: 'Sold out, hide, delete, bulk add',
                    bullets: [
                        'Mark sold out: use the availability switch on the dish row. Sold-out dishes stay visible but greyed out and move below available items.',
                        'Changes reach customers on the live menu within moments; no reprint and no new QR code.',
                        `"Add Bulk Products" reads more menu pages later: ${TRIAL_BULK_PAGE_LIMIT} pages during the free trial, then ${PAID_BULK_PAGE_LIMIT} pages each month once you pay.`,
                        'Deleting a dish asks you to confirm first.',
                    ],
                },
            ],
            faqs: [
                {
                    q: 'Can vsite read a photo of my paper menu?',
                    a: `Yes. Photograph each page, or upload a PDF, up to ${MENU_SCAN_PAGE_LIMIT} pages. The AI reads item names, prices and categories, including Tamil script. Check the result after launch and correct anything it misread.`,
                },
                {
                    q: 'How long does the AI take to read my menu?',
                    a: 'About a minute for a typical menu. The app stops waiting at about 50 seconds per scan and tells you what to do if a photo could not be read.',
                },
                {
                    q: 'Are the food photos pictures of my own dishes?',
                    a: 'No. Photos are AI-matched from a curated library of food images using the dish name. You can replace any of them with your own photo in Product Inventory.',
                },
                {
                    q: 'What if the AI gets a price or name wrong?',
                    a: 'Edit it in Product Inventory at any time. Changes show on your live menu within moments.',
                },
                {
                    q: 'Can I add dishes without a photo of my menu?',
                    a: 'Yes. Choose "Skip — add dishes by hand" during setup, or tap "Add Product" in Product Inventory.',
                },
            ],
            links: [L.pricing, L.features, L.qrMenu, L.support, L.india],
        },
    },

    /* ────────────────────────── MENU DESIGN ────────────────────────── */
    'menu-design': {
        slug: 'menu-design',
        title: 'Menu design on vsite: three designs, brand colour and lettering',
        description: 'Choose how your vsite menu looks: Classic, Cafe or Premium, six brand colours and three lettering styles. Changes are instant and your QR codes keep working.',
        short: 'Menu design',
        totalMinutes: 2,
        en: {
            h1: 'How do I change the design of my vsite menu?',
            answer:
                'Choose one of three designs, Classic, Cafe or Premium, plus a brand colour and a lettering style. You pick a design when you launch, and you can change it any time in Store Settings under Menu design. Your dishes, prices and photos stay the same, and printed QR codes keep working.',
            needs: [
                'A launched menu (or pick a design during setup)',
                'About a minute',
            ],
            steps: [
                {
                    name: 'Open Store Settings and then Menu design',
                    text: 'In the dashboard open Store Settings (Settings on a phone, or You then Store settings) and tap the "Menu design" tab.',
                    time: 'about 10 seconds',
                },
                {
                    name: 'Choose a design',
                    text: 'Tap Classic ("Clean and familiar. The safe choice."), Cafe ("Warm and hand-made. Suits tiffin rooms and coffee shops.") or Premium ("Spare and expensive. Suits hotels and dine-in restaurants."). A preview uses your own dish names and prices.',
                    time: 'about 20 seconds',
                },
                {
                    name: 'Choose a brand colour',
                    text: 'Tap one of the colours under "Brand colour": Pink, Terracotta, Green, Navy, Mustard or Black. The menu uses it for accents such as prices.',
                    time: 'about 10 seconds',
                },
                {
                    name: 'Choose a lettering style (optional)',
                    text: 'Under "Lettering" pick Classic, Warm or Sharp. Each design has a matching default, and Tamil text has a matching Tamil typeface in every style.',
                    time: 'about 10 seconds',
                },
                {
                    name: 'Open "See my live menu" to check it',
                    text: 'Every choice saves as you tap it, so there is no Save button. Tap "See my live menu" to see exactly what customers see.',
                    time: 'about 20 seconds',
                },
            ],
            sections: [
                {
                    heading: 'The three designs',
                    rows: [
                        ['Classic', 'Clean and familiar. The safe choice. Default lettering: Classic. The design every new menu starts with.'],
                        ['Cafe', 'Warm and hand-made, with rounder cards. Suits tiffin rooms and coffee shops. Default lettering: Warm.'],
                        ['Premium', 'Spare and expensive, with sharp corners and small capital section titles. Suits hotels and dine-in restaurants. Default lettering: Sharp.'],
                    ],
                },
                {
                    heading: 'What you can and cannot change',
                    bullets: [
                        'You can change: design, brand colour and lettering style.',
                        'If a colour is too light to read as a price, the menu darkens it a little and tells you so.',
                        'The menu heading shows your shop name. There is no logo or cover photo upload; your banners are the picture space (see the banners page).',
                        'Dishes, prices, categories and photos are not touched by a design change.',
                    ],
                },
            ],
            faqs: [
                {
                    q: 'Can I change my menu design after launching?',
                    a: 'Yes, any time, from Store Settings then Menu design. The change is instant and printed QR codes keep working.',
                },
                {
                    q: 'Can I use my own logo on the menu?',
                    a: 'Not today. The menu heading shows your shop name, and you can add banner images for offers and visuals.',
                },
                {
                    q: 'Can I pick any colour I like?',
                    a: 'You choose from six brand colours: Pink, Terracotta, Green, Navy, Mustard and Black.',
                },
                {
                    q: 'Does the menu design work for Tamil dish names?',
                    a: 'Yes. Every lettering style is paired with a Tamil typeface, so Tamil and English names both look right.',
                },
            ],
            links: [L.pricing, L.features, L.qrMenu, L.support, L.india],
        },
    },

    /* ───────────────────────────── BANNERS ───────────────────────────── */
    banners: {
        slug: 'banners',
        title: 'How to add banners to your vsite menu: offers and promotions',
        description: 'Add promotional banners to your vsite QR menu: upload a wide image, name it, switch it on. Banners slide across the top of the menu.',
        short: 'Banners',
        totalMinutes: 5,
        en: {
            h1: 'How do I add banners to my vsite menu?',
            answer:
                'Open Banner Management, tap "Add Banner", upload a wide image, give it a name and tap "Add Banner" again. Active banners appear at the top of your customer menu and slide automatically every 3 seconds when you have more than one. You can switch each banner on or off, edit, reorder or delete it.',
            needs: [
                'A banner image: JPG, PNG or WebP, ideally 1050 by 405 pixels (wide)',
                'A short name for the banner (for your own reference)',
                'A launched menu',
            ],
            steps: [
                {
                    name: 'Open Banner Management',
                    text: 'On a computer choose "Banner Management" in the left menu. On a phone tap "Banners" in the bottom bar, or open You and then Banners.',
                    time: 'about 10 seconds',
                },
                {
                    name: 'Tap "Add Banner"',
                    text: 'A panel slides in with the heading for a new banner. The empty page says "Promote your offers with banners".',
                    time: 'about 5 seconds',
                },
                {
                    name: 'Upload your banner image',
                    text: 'Under "Banner Image" choose "Upload Banner Image" then "Choose File". Use JPG, PNG or WebP. The recommended size shown is 1050 × 405 px. Big phone photos are shrunk for you when you save.',
                    time: 'about 30 seconds',
                },
                {
                    name: 'Name it and save',
                    text: 'Enter a "Banner Name" (required, for example Summer Offer). "Description" is optional. Tap "Add Banner" to save. To change one later use the edit button and "Save Changes".',
                    time: 'about 30 seconds',
                },
                {
                    name: 'Switch it on, reorder or remove banners',
                    text: 'Each row has a show-on-the-menu switch, an edit button and a delete button. Delete asks "Delete Banner?" before it removes anything. Drag rows, or use the move up and down buttons, to set the order. Turn a banner off when the offer ends.',
                    time: 'about 1 minute',
                },
            ],
            sections: [
                {
                    heading: 'How banners look to customers',
                    bullets: [
                        'Banners sit in a strip at the top of the menu, above the dishes, in the order you set.',
                        'One banner stays still. Two or more slide automatically every 3 seconds, with small dots underneath; tapping a dot pauses the slide for a few seconds.',
                        'The image fills a wide strip (about 351 by 134 in proportion), so keep important text away from the edges.',
                        'Only the image is shown. The name and description are for you, so put any words (for example a price or a date) inside the image.',
                        'A banner has no link and no schedule. Switch it off, or delete it, when the offer ends.',
                        'A banner that is switched off, or has no image, is not shown. Changes appear on the live menu within moments.',
                    ],
                },
            ],
            faqs: [
                {
                    q: 'What size should a vsite banner image be?',
                    a: 'The uploader recommends 1050 by 405 pixels in JPG, PNG or WebP. Any wide image works, and it is cropped to fit the strip.',
                },
                {
                    q: 'How many banners can I add?',
                    a: 'The dashboard does not set a fixed number. Several banners take turns, each showing for about 3 seconds.',
                },
                {
                    q: 'Can a banner link to a page or WhatsApp?',
                    a: 'No. A banner is an image only. Put your offer wording inside the image.',
                },
                {
                    q: 'How do I remove a banner when an offer ends?',
                    a: 'Switch it off to keep it for later, or use the delete button and confirm "Delete Banner?" to remove it.',
                },
            ],
            links: [L.pricing, L.features, L.qrMenu, L.support, L.india],
        },
    },

    /* ────────────────────────── CONFIGURATION ────────────────────────── */
    configuration: {
        slug: 'configuration',
        title: 'vsite configuration: store settings, plan, stores and analytics',
        description: `Everything you can configure in vsite: store details, menu design, plan and payment (${P} a month), extra stores, and the scan analytics dashboard.`,
        short: 'Configuration',
        totalMinutes: 5,
        en: {
            h1: 'What can I configure in my vsite dashboard?',
            answer:
                `In the vsite dashboard you can edit your store details, change your menu design, manage products, banners and QR codes, see scan analytics, and activate or renew your plan at ${P} a month. Store details cover name, location, business type and opening hours. You can run up to ${STORE_LIMIT} stores on one account.`,
            needs: [
                'A launched store',
                'About 5 minutes to review each area once',
            ],
            steps: [
                {
                    name: 'Review Store details',
                    text: 'Open Store Settings and the "Store details" tab. Fill Business Name (required), Mobile Number, Location (for example Anna Nagar, Madurai) and PIN Code. Tap "Save Changes".',
                    time: 'about 1 minute',
                },
                {
                    name: 'Pick your Business Type and Opening Hours',
                    text: 'Choose one chip: Restaurant, Café, Takeaway, Mess / Tiffin or Tea / Juice. Set Opening Hours from the time lists, or choose Open 24 hours. Type and location help build the description search engines show for your menu page.',
                    time: 'about 1 minute',
                },
                {
                    name: 'Set the look in Menu design',
                    text: 'The "Menu design" tab sets design, brand colour and lettering. See the menu design page.',
                    time: 'about 1 minute',
                },
                {
                    name: 'Check your dashboard numbers',
                    text: 'The Dashboard ("Home" on a phone) shows Scans Today, Total Visitors, Total Products, Total Categories and Items per Category. "Preview Store" (or "View menu") opens your live menu.',
                    time: 'about 1 minute',
                },
                {
                    name: 'Check or pay for your plan',
                    text: `Open Subscription (Plan & bills on a phone). The Smart QR Menu shows "Activate" or "Renew" at ${P} a month, paid through Razorpay by UPI, card or netbanking. The page also shows when your trial or paid period ends and your invoice history.`,
                    time: 'about 1 minute',
                },
            ],
            sections: [
                {
                    heading: 'Every area of the dashboard',
                    rows: [
                        ['Dashboard / Home', 'Scans Today, Total Visitors (unique, all-time), Total Products, Total Categories, Items per Category. Open the live menu with Preview Store.'],
                        ['Product Inventory / Products', 'The menu itself: add, edit, hide, mark sold out, delete, set offers, add photos, bulk add from photos or PDF.'],
                        ['QR Codes / QR', 'Download the QR poster and QR code, copy and share the menu link.'],
                        ['Banner Management / Banners', 'Promotional image banners at the top of the menu.'],
                        ['Store Settings / Settings', 'Store details, Menu design, and a Danger zone to delete a store.'],
                        ['Subscription / Plan & bills', 'Activate or renew, payment, invoice history.'],
                    ],
                },
                {
                    heading: 'Menu language',
                    bullets: [
                        'The customer menu shows dish names exactly as you entered them, in Tamil, English or both.',
                        'Tamil text is shown in proper Tamil typefaces. The AI keeps Tamil script it reads from your photos.',
                        'There is no automatic translation and no language switch button on the customer menu today.',
                    ],
                },
                {
                    heading: 'Your menu link, stores and analytics',
                    bullets: [
                        'Menu link: vsite.in/shop/ followed by a name made from your shop name when you launch. If the name is taken a number is added.',
                        TRIAL_RULE,
                        'Analytics count menu scans and the distinct visitors behind them.',
                        'Delete this store (Danger zone) asks you to type a confirmation first.',
                    ],
                },
                {
                    heading: 'Not available today',
                    bullets: [
                        ORDERING_COMING_SOON_SHORT,
                    ],
                },
            ],
            faqs: [
                {
                    q: 'Can I change my shop name after launching?',
                    a: 'Yes. Edit Business Name in Store Settings under Store details and tap "Save Changes". Your menu link does not change when you rename the shop.',
                },
                {
                    q: 'Can I run more than one outlet on vsite?',
                    a: `Yes, up to ${STORE_LIMIT} stores on one account. The free trial applies to your first store only; a second store has no free trial and goes live after you pay for it.`,
                },
                {
                    q: 'What analytics does vsite show?',
                    a: 'Scans Today, Total Visitors (unique, all-time), Total Products, Total Categories and Items per Category on the Dashboard.',
                },
                {
                    q: 'How do I cancel vsite?',
                    a: HOW_TO_STOP,
                },
            ],
            links: [L.pricing, L.features, L.qrMenu, L.support, L.india],
        },
    },

    /* ──────────────────────────── QR CODE ──────────────────────────── */
    'qr-code': {
        slug: 'qr-code',
        title: 'How to get and print your vsite QR code: poster, PDF and sticker',
        description: 'Download your vsite menu QR code as a print-ready poster PDF, PNG or SVG, choose table, counter or wall size, and share the link on WhatsApp.',
        short: 'QR code',
        totalMinutes: 3,
        en: {
            h1: 'How do I get and print my vsite QR code?',
            answer:
                'Open QR Codes in your dashboard, choose where the poster will go (Table stand, Counter, or Wall or door), then tap "Download PDF" and print it at home or at a print shop. You can also download the QR code alone as PNG or SVG, copy your menu link, or share it on WhatsApp.',
            needs: [
                'A launched store',
                'A printer, or a print shop, to print the poster',
                'A phone to test-scan the printed poster',
            ],
            steps: [
                {
                    name: 'Open QR Codes',
                    text: 'Choose "QR Codes" in the left menu on a computer, or the "QR" tab on a phone. You see your poster preview ("Your QR poster").',
                    time: 'about 10 seconds',
                },
                {
                    name: 'Choose the poster design',
                    text: 'Under "Poster design" pick Restaurant or Café, then a design and a colour, or keep "Current poster". The headline on the poster reads "Scan and see menu".',
                    time: 'about 30 seconds',
                },
                {
                    name: 'Say where it will go',
                    text: 'Under "Where will it go?" choose Table stand (A6, one on each table), Counter (A5) or Wall or door (A4). The page sizes the QR so a phone can scan it from there.',
                    time: 'about 10 seconds',
                },
                {
                    name: 'Choose how you will print, then tap "Download PDF"',
                    text: 'Pick Home printer (several posters are laid out on one A4 sheet with cutting lines) or Print shop (the artwork runs slightly past the trim so edges print cleanly). Tap "Download PDF".',
                    time: 'about 30 seconds',
                },
                {
                    name: 'Print, then test-scan',
                    text: 'Print the PDF, cut along the dashed lines and place it on the table, counter or wall. Scan it with a phone camera to check your menu opens.',
                    time: 'your own printing time',
                },
                {
                    name: 'Share the link (optional)',
                    text: 'Under "Share your menu link" tap "Copy", "WhatsApp", "Open menu" or "Status image". The same link works for Instagram and as the menu link on Google Maps. For the QR code alone use the PNG or SVG buttons after "QR code only:".',
                    time: 'about 1 minute',
                },
            ],
            sections: [
                {
                    heading: 'Formats and sizes',
                    rows: [
                        ['Poster PDF', 'Print-ready, for home printer or print shop.'],
                        ['QR code only', 'PNG or SVG, for your own design or packaging.'],
                        ['Status image', 'A picture for WhatsApp Status.'],
                        ['Menu link', 'vsite.in/shop/your-shop-name, to paste in WhatsApp, Instagram or Google Maps.'],
                    ],
                },
                {
                    heading: 'NFC + QR stickers (optional, paid separately)',
                    bullets: [
                        `A peel-and-stick label with a printed QR and an NFC tag inside, so customers can tap or scan. It costs ₹${STICKER_PRICE_INR} per sticker and is not part of the monthly price.`,
                        'Tap "Get NFC + QR stickers" on the QR Codes page to request them. Support contacts you to confirm and arrange payment.',
                    ],
                },
                {
                    heading: 'Good to know',
                    bullets: [
                        'One QR code serves your whole menu. You never reprint it when prices or dishes change.',
                        'If your plan ends, scans show an unavailable page until you pay again; the same QR code works again after renewal.',
                    ],
                },
            ],
            faqs: [
                {
                    q: 'Do I need to reprint the QR code when I change my menu?',
                    a: 'No. The QR code always opens your latest menu. Price changes, new dishes and sold-out marks reach customers within moments.',
                },
                {
                    q: 'Do customers need an app to scan the QR code?',
                    a: 'No. A phone camera is enough, and the menu opens in the browser.',
                },
                {
                    q: 'What size should I print the vsite QR code?',
                    a: 'Table stand is A6, Counter is A5 and Wall or door is A4. The page sizes the code so a phone can scan it from where it will sit.',
                },
                {
                    q: 'Is the NFC + QR sticker part of the monthly price?',
                    a: `No. They are optional and cost ₹${STICKER_PRICE_INR} each. The ${P} plan includes your QR code and poster downloads.`,
                },
            ],
            links: [L.pricing, L.features, L.qrMenu, L.support, L.india],
        },
    },

    /* ────────────────────────── COST AND TIME ────────────────────────── */
    'cost-and-time': {
        slug: 'cost-and-time',
        title: 'vsite cost and setup time: price, free trial and minutes to go live',
        description: `vsite costs ${P} a month after a ${TRIAL}, no setup fee. Setup takes ${LIVE} to a live menu link and ${TOTAL} for a complete setup with the QR poster. Full cost and time breakdown.`,
        short: 'Cost and time',
        totalMinutes: COMPLETE_SETUP_MINUTES.max,
        en: {
            h1: 'How much does a vsite digital menu cost and how long does setup take?',
            answer:
                `The vsite Smart QR Menu costs ${P} a month after a ${TRIAL}, with no setup fee or commission. Setup takes ${LIVE} to a live menu link for a typical menu, and ${TOTAL} for a complete setup with the QR poster. You pay through Razorpay, one ${BILLING_DAYS}-day period at a time, no auto-renewal.`,
            needs: [
                'A mobile number for sign-up',
                'Your menu as photos or a PDF',
                `${P} when you decide to keep the menu live after the trial`,
            ],
            steps: [
                {
                    name: 'Start the free trial',
                    text: `Sign up with your mobile number. The ${TRIAL} starts with your first store and needs no card.`,
                    time: minutes('signUp'),
                },
                {
                    name: 'Build and launch your menu during the trial',
                    text: 'Add your menu, choose a design, launch and download your QR code. The full Smart QR Menu is live during the trial.',
                    time: `${LIVE} to go live, ${TOTAL} with the QR poster`,
                },
                {
                    name: `Pay ${P} to keep the menu live`,
                    text: `Before the ${TRIAL_DAYS} days end, open Subscription and tap "Activate". Pay by UPI, card or netbanking through Razorpay. Your menu then stays live for ${BILLING_DAYS} days.`,
                    time: 'about 1 minute',
                },
                {
                    name: 'Renew every 30 days, or stop by not renewing',
                    text: `A reminder email comes ${REMINDER_DAYS_BEFORE} days before the period ends. To continue, tap "Renew". To stop, do nothing: nothing is charged automatically.`,
                    time: 'about 1 minute per renewal',
                },
            ],
            sections: [
                {
                    heading: 'What it costs',
                    rows: [
                        ['Setup fee', 'None'],
                        ['Free trial', `${TRIAL}, no card needed. One free trial per phone number, for the first store.`],
                        ['Smart QR Menu', `${P} a month, for ${BILLING_DAYS} days at a time`],
                        ['Payment', 'Razorpay: UPI, cards, netbanking. No card is stored.'],
                        ['Auto-renewal', 'None. You renew by hand each period.'],
                        ['Commission on sales', 'None. vsite does not take orders or a cut of your sales.'],
                        ['Refunds', NO_REFUND_SHORT],
                        ['Second store', `Up to ${STORE_LIMIT} stores per account; a second store has no free trial.`],
                        ['NFC + QR sticker (optional)', `₹${STICKER_PRICE_INR} each, ordered separately`],
                        ['Printing the QR poster', 'Your own cost at home or at a print shop'],
                    ],
                },
                {
                    heading: 'How long each step typically takes',
                    intro: `The fast path (${LIVE_DEF}) takes ${LIVE}. The ranges below are for a careful first-time setup with a QR poster. A longer menu takes longer to photograph.`,
                    rows: [
                        ['1. Sign up (mobile number and code)', minutes('signUp')],
                        ['2. Photograph or upload your menu', minutes('photo')],
                        ['3. The AI reads the menu', minutes('aiRead')],
                        ['4. Pick bestsellers and top earners', minutes('picks')],
                        ['5. Choose a design and launch', minutes('launch')],
                        ['6. Download the QR code', minutes('qr')],
                        ['Live menu link (fast path, for a typical menu)', LIVE],
                        ['Complete setup with the QR poster', TOTAL],
                        ['Optional: banners and settings', 'typically 3 to 5 minutes each'],
                    ],
                },
                {
                    heading: 'What happens when the trial or period ends',
                    bullets: BILLING_CYCLE_STEPS.map((s) => `${s.day}: ${s.title}. ${s.body}`),
                },
            ],
            faqs: [
                {
                    q: 'How much does a digital menu cost in India?',
                    a: `vsite Smart QR Menu: ${P} a month after a ${TRIAL}. No setup fee, no commission.`,
                },
                {
                    q: 'How long does it take to set up a digital menu?',
                    a: `${LIVE[0].toUpperCase()}${LIVE.slice(1)} from sign-up to a live menu link for a typical menu. A complete setup including the QR poster takes ${TOTAL}.`,
                },
                {
                    q: 'What happens after the free trial?',
                    a: `Your menu goes offline until you pay ${P}. Your menu and photos are kept and come straight back when you pay.`,
                },
                {
                    q: 'Is there auto-renewal or a cancellation fee?',
                    a: HOW_TO_STOP,
                },
                {
                    q: 'Can customers order and pay from the menu?',
                    a: ORDERING_COMING_SOON_SHORT,
                },
            ],
            links: [L.pricing, L.features, L.qrMenu, L.support, L.india],
        },
        ta: {
            h1: 'vsite டிஜிட்டல் மெனுவுக்கு எவ்வளவு செலவு, அமைக்க எவ்வளவு நேரம்?',
            answer:
                `vsite Smart QR Menu-க்கு ${TRIAL_DAYS} நாள் இலவச trial, அதன் பிறகு மாதம் ₹${PRICE_INR_PER_MONTH}. Setup கட்டணம் இல்லை, கமிஷனும் இல்லை. வழக்கமான மெனுவுக்கு live link வரை ${LIVE_TA}, QR போஸ்டர் உட்பட முழு அமைப்புக்கு ${TOTAL_TA} ஆகும். Razorpay மூலம் UPI, card அல்லது netbanking-ல் ${BILLING_DAYS} நாளுக்கு ஒருமுறை நீங்களே கட்டலாம், தானாக பணம் பிடிக்காது. QR போஸ்டர் print செலவு உங்களுடையது.`,
            needs: [
                'Sign up-க்கு மொபைல் நம்பர்',
                'உங்கள் மெனு போட்டோ அல்லது PDF',
                `Trial முடிந்த பிறகு மெனுவை தொடர விரும்பினால் ₹${PRICE_INR_PER_MONTH}`,
            ],
            steps: [
                {
                    name: 'இலவச trial-ஐ தொடங்குங்கள்',
                    text: `மொபைல் நம்பரில் sign up செய்யுங்கள். உங்கள் முதல் கடைக்கு ${TRIAL_DAYS} நாள் இலவச trial தொடங்கும், கார்டு தேவையில்லை.`,
                    time: minutesTa('signUp'),
                },
                {
                    name: 'Trial காலத்தில் மெனுவை உருவாக்கி launch செய்யுங்கள்',
                    text: 'மெனுவை சேர்த்து, design தேர்ந்தெடுத்து, launch செய்து, QR code download செய்யுங்கள். Trial-லிலேயே எல்லா வசதிகளையும் பயன்படுத்தலாம்.',
                    time: `${LIVE_TA} (live link), ${TOTAL_TA} (QR போஸ்டர் உட்பட)`,
                },
                {
                    name: `மெனுவை தொடர ₹${PRICE_INR_PER_MONTH} கட்டுங்கள்`,
                    text: `${TRIAL_DAYS} நாள் முடிவதற்குள் Subscription திறந்து "Activate" தொடுங்கள். Razorpay மூலம் UPI, card அல்லது netbanking-ல் கட்டுங்கள். பிறகு ${BILLING_DAYS} நாள் உங்கள் மெனு live-ஆக இருக்கும்.`,
                    time: 'சுமார் 1 நிமிடம்',
                },
                {
                    name: `ஒவ்வொரு ${BILLING_DAYS} நாளுக்கும் renew செய்யுங்கள், வேண்டாம் என்றால் விடுங்கள்`,
                    text: `காலம் முடிவதற்கு ${REMINDER_DAYS_BEFORE} நாள் முன் reminder email வரும். தொடர "Renew" தொடுங்கள். நிறுத்த எதுவும் செய்ய வேண்டாம், தானாக பணம் பிடிக்காது.`,
                    time: 'ஒவ்வொரு renewal-க்கும் சுமார் 1 நிமிடம்',
                },
            ],
            sections: [
                {
                    heading: 'செலவு விவரம்',
                    rows: [
                        ['Setup கட்டணம்', 'இல்லை'],
                        ['இலவச trial', `${TRIAL_DAYS} நாள், கார்டு தேவையில்லை. ஒரு மொபைல் நம்பருக்கு முதல் கடைக்கு மட்டும் ஒருமுறை.`],
                        ['Smart QR Menu', `மாதம் ₹${PRICE_INR_PER_MONTH}, ${BILLING_DAYS} நாள் காலத்துக்கு`],
                        ['கட்டணம் செலுத்தும் முறை', 'Razorpay: UPI, card, netbanking. கார்டு விவரம் சேமிக்கப்படாது.'],
                        ['தானாக renew', 'இல்லை. ஒவ்வொரு காலமும் நீங்களே கட்டவேண்டும்.'],
                        ['விற்பனையில் கமிஷன்', 'இல்லை. vsite ஆர்டர் எடுக்காது, உங்கள் விற்பனையில் பங்கும் எடுக்காது.'],
                        ['NFC + QR sticker (விருப்பம்)', `ஒன்றுக்கு ₹${STICKER_PRICE_INR}, தனியாக ஆர்டர் செய்யவேண்டும்`],
                        ['QR போஸ்டர் print', 'வீட்டிலோ print கடையிலோ, செலவு உங்களுடையது'],
                    ],
                },
                {
                    heading: 'ஒவ்வொரு படிக்கும் ஆகும் நேரம்',
                    intro: 'திரையில் உள்ள படிகளை வைத்து போடப்பட்ட மதிப்பீடு, உத்தரவாதம் அல்ல.',
                    rows: [
                        ['1. Sign up', minutesTa('signUp')],
                        ['2. மெனு போட்டோ அல்லது PDF சேர்த்தல்', minutesTa('photo')],
                        ['3. AI மெனுவை படிக்கும்', minutesTa('aiRead')],
                        ['4. அதிகம் விற்பவை தேர்வு', minutesTa('picks')],
                        ['5. Design தேர்வு, launch', minutesTa('launch')],
                        ['6. QR code download', minutesTa('qr')],
                        ['Live மெனு link (வேகமான வழி)', LIVE_TA],
                        ['QR போஸ்டர் உட்பட முழு அமைப்பு', TOTAL_TA],
                    ],
                },
            ],
            faqs: [
                {
                    q: 'டிஜிட்டல் மெனுவுக்கு இந்தியாவில் எவ்வளவு செலவாகும்?',
                    a: `vsite Smart QR Menu: ${TRIAL_DAYS} நாள் இலவச trial-க்கு பிறகு மாதம் ₹${PRICE_INR_PER_MONTH}. Setup கட்டணம், கமிஷன் இல்லை.`,
                },
                {
                    q: 'டிஜிட்டல் மெனு அமைக்க எவ்வளவு நேரம் ஆகும்?',
                    a: `வழக்கமான மெனுவுக்கு sign up முதல் live link வரை ${LIVE_TA}. QR போஸ்டர் உட்பட முழு அமைப்புக்கு ${TOTAL_TA}.`,
                },
                {
                    q: 'இலவச trial முடிந்த பிறகு என்ன ஆகும்?',
                    a: `நீங்கள் ₹${PRICE_INR_PER_MONTH} கட்டும் வரை மெனு offline ஆகும். உங்கள் மெனுவும் போட்டோக்களும் அப்படியே இருக்கும், கட்டியதும் உடனே திரும்ப வரும்.`,
                },
                {
                    q: 'தானாக renew ஆகுமா? ரத்து செய்ய கட்டணம் உண்டா?',
                    a: 'இல்லை. கார்டு சேமிக்கப்படாது, தானாக பணம் பிடிக்காது. நிறுத்த வேண்டுமானால் renew செய்யாமல் விட்டுவிடுங்கள்.',
                },
            ],
            links: CORE_LINKS,
        },
    },
};
