import type { SeoLandingData } from '@/components/home/SeoLanding';
import { STICKER_PRICE_INR } from '@/content/facts';

// All SEO landing pages share the same component but carry different copy
// and schema. Keeping data centralised lets us cross-link them trivially.

export const qrMenuPage: SeoLandingData = {
    slug: 'qr-menu',
    h1: 'QR Code Menu for Restaurants in India',
    subtitle:
        'Give every table a QR code that opens your menu in 2 seconds — no app download, no waiter needed, no printing cost. A live menu link in about 3 minutes with vsite.',
    features: [
        { icon: 'qr_code_2', title: 'Unique QR Per Table', description: 'Each table gets its own QR code, so you always know which table a scan came from. Orders still go through your staff — in-menu ordering is coming soon.' },
        { icon: 'bolt', title: 'Opens in 2 Seconds', description: 'Customers scan with the native camera app. Your menu loads instantly — no app download required.' },
        { icon: 'edit', title: 'Real-Time Menu Edits', description: 'Change prices, mark items out of stock, add daily specials from your phone. No reprinting ever.' },
        { icon: 'translate', title: 'Tamil + English', description: 'Dish names in Tamil, English or both on the same menu, in proper Tamil fonts. Built for South Indian restaurants.' },
        { icon: 'image', title: 'AI Food Photos', description: 'Every item gets an AI-matched food photo from a curated library — no photographer, no shoot. Swap in your own photo any time.' },
        { icon: 'payments', title: 'UPI Payment — Coming Soon', description: 'Paying inside the menu via PhonePe/GPay/Paytm is not live yet. Today, pair vsite with your own UPI QR — zero commission either way.' },
    ],
    content: [
        { type: 'p', text: 'A QR code menu lets your customers scan a printed code on the table and instantly view your restaurant\'s full menu on their own phone. With vsite, you get a unique QR code per table, AI-matched food photos for every item, and Tamil-language support — a live menu link in about 3 minutes for a typical menu.' },
        { type: 'h2', text: 'Why Every Indian Restaurant Needs a QR Menu in 2026' },
        { type: 'p', text: 'QR menus have become common in Indian restaurants since 2020. The reasons are practical: a price change no longer means a reprint, menus with photos are easier for customers to choose from, and for the customer it is faster, cleaner, and needs no app download. A paper menu set typically costs ₹500–₹2,000 to reprint, and many restaurants reprint a few times a year.' },
        { type: 'h2', text: 'How a QR Code Menu Works with vsite' },
        { type: 'ol', items: [
            'You photograph your paper menu and upload it to vsite',
            'Our AI reads every item, price, and category — including Tamil text',
            'AI matches a food photo from a curated library to each dish',
            `You get a QR code to print for each table, free. An optional NFC + QR sticker is ₹${STICKER_PRICE_INR} each`,
            'Customers scan → menu opens → they choose → your staff take the order (in-menu ordering coming soon)',
        ]},
        { type: 'h2', text: 'What Makes vsite\'s QR Menu Different' },
        { type: 'table', headers: ['Feature', 'vsite', 'Typical QR Menu Tool'], rows: [
            ['Time to a live menu link', 'About 3 minutes for a typical menu', '1–2 days'],
            ['AI-matched food photos', 'Included', 'Left to the restaurant'],
            ['Tamil language', 'Tamil and English on the same menu', 'Varies by tool'],
            ['NFC + QR sticker', `Optional, ₹${STICKER_PRICE_INR} each`, 'Varies'],
            ['Monthly cost', '₹299 flat', 'DineCard ₹99, Menulite from ₹799 (annual), MenuScan from ₹250'],
            ['Per-order commission', 'None', 'None on these three; some aggregators charge one'],
        ]},
        { type: 'callout', text: "vsite is built in Tamil Nadu for Tamil Nadu restaurants: Tamil and English on every menu, ₹299/mo, and an AI-matched food photo for every dish. DineCard is cheaper (₹99/month) if you only need a text menu online." },
    ],
    relatedLinks: [
        { label: 'Digital Menu for Indian Restaurants →', href: '/digital-menu-india' },
        { label: 'AI Menu Builder →', href: '/ai-menu-builder' },
        { label: 'Restaurant Menu Software →', href: '/restaurant-menu-software' },
        { label: 'Pricing →', href: '/pricing' },
        { label: 'Features →', href: '/features' },
        { label: 'How to Create a QR Code Menu →', href: '/blog/how-to-create-qr-code-menu-restaurant' },
        { label: 'NFC vs QR Code Menus →', href: '/blog/nfc-vs-qr-code-restaurant-menus' },
    ],
    faqs: [
        { q: 'How do I create a QR code menu for my restaurant?', a: `Sign up on vsite.in, upload a photo of your paper menu, and vsite's AI builds your digital menu with food photos automatically. You get a QR code to print and display on your tables, free. Getting to a live menu link takes about 3 minutes for a typical menu; a complete setup with the QR poster takes about 10 to 15 minutes. An optional NFC + QR sticker is ₹${STICKER_PRICE_INR} each.` },
        { q: 'Do customers need to download an app to scan a QR menu?', a: 'No. Customers use their phone\'s native camera app to scan the QR code. The menu opens in their browser within 2–3 seconds. No app download, no signup, no friction.' },
        { q: 'How much does a QR code menu cost in India?', a: 'vsite\'s QR Menu plan costs ₹299/month with no setup fee. This includes AI-matched food photos, unlimited menu updates, a free QR code to print, and WhatsApp support. The optional NFC + QR sticker is extra. DineCard is cheaper at ₹99/month, and MenuScan\'s published tiers run ₹250–₹750/month. Neither lists matched food photos or menu engineering in its own feature list. If you only need your text menu online, DineCard is worth a look.' },
        { q: 'Can I have a unique QR code for each table?', a: 'Yes. vsite generates a unique QR code per table, so a scan always tells you which table it came from. Your staff still take the order today — in-menu ordering with UPI payment is coming soon.' },
        { q: 'Does the QR menu work without internet on the customer\'s side?', a: 'Customers need mobile data or Wi-Fi to open the menu the first time. Once loaded, the menu runs entirely in their browser and works even on slow 4G connections.' },
    ],
};

export const digitalMenuIndiaPage: SeoLandingData = {
    slug: 'digital-menu-india',
    h1: 'Digital Menu for Restaurants in India',
    subtitle:
        'A digital menu that understands Indian restaurants — Tamil language, ₹299/month pricing, and AI-matched food photos built in. Built in Tamil Nadu and live since March 2026.',
    features: [
        { icon: 'smartphone', title: 'Works on Every Phone', description: 'Opens in any smartphone browser — Android, iPhone, even basic 4G phones.' },
        { icon: 'autorenew', title: 'Update Anytime', description: 'Change prices, add specials, mark out-of-stock items in real time from your phone.' },
        { icon: 'language', title: 'Tamil + English', description: 'Serve Tamil-speaking and English-speaking customers from the same menu: dish names in Tamil, English or both.' },
        { icon: 'insights', title: 'Built-In Analytics', description: 'See which dishes get the most views, your busiest times, and top-selling categories.' },
        { icon: 'receipt_long', title: 'Zero Commission', description: 'Unlike Zomato or Swiggy, you keep 100% of every order. No middleman fees.' },
        { icon: 'support_agent', title: 'WhatsApp Support', description: 'Real humans on WhatsApp respond within 2 hours. No chatbots, no ticket queues.' },
    ],
    content: [
        { type: 'p', text: 'A digital menu is an online version of your restaurant\'s paper menu that customers view on their smartphone by scanning a QR code. For Indian restaurants in 2026, digital menus have become the default — eliminating printing costs, enabling real-time price changes, and improving the customer experience.' },
        { type: 'h2', text: 'Why Digital Menus Are Winning in India' },
        { type: 'ul', items: [
            'Nearly every customer already carries a smartphone with a camera, so a QR code needs no app or login',
            'UPI is the default way Indians pay — today you can take it with your own bank QR at the counter',
            'Menus with photos are easier to choose from than a list of names and prices',
            'Printing a paper menu set costs ₹500–₹2,000; most restaurants reprint 2–4 times a year',
        ]},
        { type: 'h2', text: 'What to Look for in a Digital Menu Tool for India' },
        { type: 'ol', items: [
            'Tamil language support — check it explicitly, coverage varies by tool',
            'Price point suited to Indian SMB restaurants — not enterprise POS prices',
            'Zero commission — vsite never sits between you and your customer payments',
            'Zero per-order commission — commission models compound fast at Indian ticket sizes',
            'Food photos without a photo shoot — most small restaurants cannot afford one',
            'Live in minutes — Indian restaurant owners don\'t have time for 2-day onboarding',
        ]},
        { type: 'h2', text: 'vsite vs Alternatives' },
        { type: 'table', headers: ['Tool', 'Price (published)', 'Tamil', 'Food photos', 'Ordering today'], rows: [
            ['vsite', '₹299/mo flat', 'Yes (Tamil + English)', 'AI-matched from a curated library', 'No — coming soon'],
            ['DineCard', '₹99/mo (₹999/yr), 14-day trial', 'Yes (15+ Indian languages)', 'Not listed', 'No'],
            ['Menulite', 'Starter ₹799/mo on annual (₹899 monthly); Pro ₹1,399–1,499', 'Yes', 'Not checked', 'On Pro'],
            ['MenuScan', 'From ₹250/mo (as published by MenuScan)', 'Not checked', 'Not listed', 'Yes'],
        ]},
        { type: 'p', text: 'Prices are each vendor\'s own published figures, checked on 30 September 2026. Plans change — confirm on their sites before you buy.' },
        { type: 'callout', text: "vsite is built in Tamil Nadu, for Tamil Nadu restaurants, with WhatsApp support from the people who made it. 7-day free trial. No credit card." },
    ],
    relatedLinks: [
        { label: 'QR Code Menu →', href: '/qr-menu' },
        { label: 'AI Menu Builder →', href: '/ai-menu-builder' },
        { label: 'Restaurant Menu Software →', href: '/restaurant-menu-software' },
        { label: 'Pricing →', href: '/pricing' },
        { label: 'Features →', href: '/features' },
        { label: 'Best Digital Menu Software in India 2026 →', href: '/best-digital-menu-software-india' },
        { label: 'Paper Menu vs Digital Menu Cost →', href: '/blog/paper-menu-vs-digital-menu-india' },
    ],
    faqs: [
        { q: 'What is a digital menu for restaurants?', a: 'A digital menu is an online version of your restaurant\'s menu that customers view on their smartphone — usually by scanning a QR code on the table. There is no app to download; the menu opens instantly in any browser and shows photos, prices and live availability. On vsite the customer then orders with your staff — a direct ordering button, with UPI payment, is coming soon.' },
        { q: 'Which is the best digital menu software for restaurants in India?', a: 'It depends on what you need. vsite suits restaurants that want a photo on every dish and Tamil + English menus: ₹299/month, AI-matched food photos, live in minutes. DineCard is cheaper (₹99/month) for a text-only menu, and MenuScan takes orders today. See our comparison page for the figures.' },
        { q: 'How much does a digital menu cost in India?', a: 'Published prices range from ₹99/month (DineCard) to about ₹1,400–1,500/month (Menulite Pro, which includes ordering). vsite\'s Smart QR Menu is ₹299/month flat with no setup fee and no commission.' },
        { q: 'Can I accept online orders through a digital menu?', a: 'Not today. vsite focuses on the menu itself — customers browse photos, prices and live availability on their phone, then order with your staff. There is no commission, because vsite never sits between you and the payment.' },
        { q: 'Does a digital menu work in Tamil?', a: 'vsite supports Tamil and English on the same menu. Type dish names in Tamil, English or both and they show in proper Tamil fonts; the AI reads Tamil and English text from your paper menu. There is no language switch and no automatic translation. Other tools, such as DineCard, also support Tamil.' },
    ],
};

export const aiMenuBuilderPage: SeoLandingData = {
    slug: 'ai-menu-builder',
    h1: 'AI Menu Builder for Restaurants',
    subtitle:
        'Upload a photo of your paper menu. Our AI reads every dish, every price, every Tamil word — and builds your digital menu with AI-matched food photos in minutes.',
    features: [
        { icon: 'auto_awesome', title: 'AI Menu Extraction', description: 'Photograph your paper menu. AI reads item names, prices, and categories — including Tamil text.' },
        { icon: 'photo_camera', title: 'AI-Matched Food Photos', description: 'Every item is matched to a professional food photo from a curated library. No shoot, no photographer.' },
        { icon: 'schedule', title: 'About 3 Minutes to a Live Menu', description: 'Sign up, add a photo of your paper menu, let the AI read it and launch: about 3 minutes to a live menu link for a typical menu.' },
        { icon: 'translate', title: 'Tamil OCR', description: 'The AI reads Tamil script and mixed Tamil-English menus.' },
        { icon: 'edit', title: 'Edit Anything After', description: 'AI gets you 90% of the way. Fine-tune prices, swap photos, re-categorise in the dashboard.' },
        { icon: 'shield', title: 'Your Data, Your Menu', description: 'We don\'t share menus with anyone. Your restaurant data belongs only to you.' },
    ],
    content: [
        { type: 'p', text: 'vsite\'s AI menu builder creates a digital menu from a photo of your paper menu in minutes. The AI reads your menu, matches professional food photos to every dish, and publishes a branded QR code menu — automatically.' },
        { type: 'h2', text: 'What the AI Does Step-by-Step' },
        { type: 'ol', items: [
            'Reads the uploaded image using OCR trained on Indian menu formats (English + Tamil)',
            'Extracts dish names, prices, categories, and descriptive text',
            'Matches each dish to a professional food photo from a vetted library',
            'Structures the menu into a branded, mobile-first digital layout',
            'Generates your unique vsite URL and QR code',
        ]},
        { type: 'h2', text: 'Why Use AI Instead of Manual Entry' },
        { type: 'ul', items: [
            'Speed — about 3 minutes to a live menu link vs 2+ hours typing item by item',
            'Accuracy — AI rarely mistypes prices; humans do frequently',
            'Tamil support — the AI reads Tamil script as well as English',
            'Food photos — matching is included in the plan; a photo shoot typically costs ₹5,000–₹15,000',
            'Consistency — every dish gets a polished photo; manual entry leaves gaps',
        ]},
        { type: 'callout', text: "vsite reads your paper menu with AI and matches a food photo for every dish. Other Indian tools, such as DineCard, also extract menu text; the matched photographs are what vsite adds on top." },
    ],
    relatedLinks: [
        { label: 'QR Code Menu →', href: '/qr-menu' },
        { label: 'Digital Menu for Restaurants in India →', href: '/digital-menu-india' },
        { label: 'Restaurant Menu Software →', href: '/restaurant-menu-software' },
        { label: 'Features →', href: '/features' },
        { label: 'Pricing →', href: '/pricing' },
        { label: 'How Tamil Nadu Restaurants Use AI Menus →', href: '/blog/tamil-nadu-restaurants-ai-menus' },
    ],
    faqs: [
        { q: 'How does an AI menu builder work?', a: 'You upload a photo of your paper menu. The AI uses OCR to read every item, price, and category — including Tamil text. It then matches each dish to a professional food photo and publishes your full digital menu automatically. The process takes under 3 minutes with vsite.' },
        { q: 'Can the AI read handwritten menus?', a: 'Printed menus give the best results. Handwritten pages are accepted, but check the result carefully and expect to correct names and prices by hand. Use a clear photo taken in good lighting.' },
        { q: 'Does it work for Tamil-language menus?', a: 'Yes. vsite\'s AI reads Tamil script. Mixed Tamil-English menus are also supported — common in Chennai, Coimbatore, and Madurai restaurants.' },
        { q: 'What if the AI gets something wrong?', a: 'You can edit anything in the dashboard after setup — prices, names, categories, photos. Most restaurants find the AI gets 90% right and they tweak the remaining 10% in a few minutes.' },
    ],
};

// ─── Vertical pages ────────────────────────────────────────────────────────
// Each page targets a specific F&B sub-vertical so vsite ranks beyond the
// "restaurant" SERP. They share the same product story; copy is tuned to
// the vertical's specific pain points and search intent.

export const cafeMenuPage: SeoLandingData = {
    slug: 'cafe-menu-software',
    h1: 'Digital Menu Software for Cafés in India',
    subtitle:
        'Beautiful QR-code menus for cafés — coffee, pastries, all-day dining. AI food photos, real-time edits, Tamil + English. A live menu link in about 3 minutes.',
    features: [
        { icon: 'local_cafe', title: 'Café-Ready Categories', description: 'Coffee, tea, breakfast, brunch, all-day dining — vsite\'s menu structure fits café flow naturally.' },
        { icon: 'photo_camera', title: 'Aesthetic Food Photos', description: 'AI matches clean food and drink photos from a curated library to every item — no photographer needed.' },
        { icon: 'autorenew', title: 'Daily Specials in Real-Time', description: 'Add today\'s pour-over, weekend brunch, or seasonal lattes from your phone in seconds.' },
        { icon: 'qr_code_2', title: 'Per-Table QR Codes', description: 'A unique QR for every table — customers see the menu instantly, no app and no waiting for a printed card.' },
        { icon: 'translate', title: 'Tamil + English', description: 'Tamil and English on the same menu, for both your local regulars and tourist customers.' },
        { icon: 'payments', title: 'UPI Pay at Table — Coming Soon', description: 'Settling the bill inside the menu is not live yet. Until it is, display your own UPI QR — PhonePe, GPay and Paytm all work, with no commission.' },
    ],
    content: [
        { type: 'p', text: 'A digital menu for cafés lets your customers scan a QR code at the table and browse your full coffee, tea, and food menu on their phone. With vsite, you get aesthetic AI-matched photos for every item, real-time updates for daily specials, and Tamil + English language support — built for cafés across Chennai, Coimbatore, and beyond.' },
        { type: 'h2', text: 'Why Cafés in India Are Switching to Digital Menus' },
        { type: 'ul', items: [
            'Cafés rotate seasonal drinks and dishes constantly — paper menus can\'t keep up',
            'Most café customers prefer to read the menu at their own pace before they order',
            'Photos help customers choose, which matters when the average ticket is small',
            'Café customers expect tech — they\'ll judge your brand by your menu experience',
            'Hygiene matters in social settings — no more shared laminated menus',
        ]},
        { type: 'h2', text: 'Café Menu Setup: About 3 Minutes to a Live Menu' },
        { type: 'ol', items: [
            'Photograph your existing menu (or list items if you don\'t have one yet)',
            'AI extracts every coffee, tea, food item, and price',
            'AI matches a polished food photo to each item',
            'Place QR code stands on tables (an optional NFC + QR sticker works at the counter)',
            'You\'re live — your menu is on every table today',
        ]},
        { type: 'h2', text: 'vsite vs Generic Café Menu Tools' },
        { type: 'table', headers: ['', 'vsite', 'Generic QR Menu Tool'], rows: [
            ['AI-matched food photos', 'Yes', 'Varies'],
            ['Tamil support', 'Yes', 'Varies'],
            ['Per-table QR', 'Yes', 'Varies'],
            ['Setup', 'Minutes, from a photo of your menu', 'Varies'],
            ['Monthly cost', '₹299 flat', 'From ₹99 (DineCard) to ₹1,499 (Menulite Pro)'],
            ['NFC + QR sticker', `Optional, ₹${STICKER_PRICE_INR} each`, 'Varies'],
        ]},
        { type: 'callout', text: 'Whether you run a single boutique café in Coimbatore or a 10-outlet chain, vsite can put a photo-rich, bilingual café menu live from a photo of your paper menu.' },
    ],
    relatedLinks: [
        { label: 'QR Code Menu →', href: '/qr-menu' },
        { label: 'AI Menu Builder →', href: '/ai-menu-builder' },
        { label: 'Bakery Menu Software →', href: '/bakery-menu-software' },
        { label: 'Restaurant Menu Software →', href: '/restaurant-menu-software' },
        { label: 'Pricing →', href: '/pricing' },
        { label: 'Features →', href: '/features' },
    ],
    faqs: [
        { q: 'What is the best digital menu software for cafés in India?', a: 'vsite suits cafés that want a photo on every item and Tamil + English menus: ₹299/month flat, AI-matched food photos, live in minutes. If you only need a text menu online, DineCard is cheaper at ₹99/month.' },
        { q: 'How much does a café digital menu cost?', a: 'vsite costs ₹299/month with no setup fee. This includes AI-matched photos, QR codes to print for every table, unlimited menu updates, and WhatsApp support. The optional NFC + QR sticker is extra. There is no per-order commission.' },
        { q: 'Can I add daily specials to my café menu?', a: 'Yes. Add or remove daily specials from your phone in seconds. Customers see the update instantly on their next scan. No reprinting, no waiting.' },
        { q: 'Do customers need an app to see my café menu?', a: 'No. They scan the QR code with the phone camera and the menu opens in the browser within 2 seconds — no download, no signup. They order with your staff; in-menu ordering with UPI payment is coming soon.' },
    ],
};

export const cloudKitchenPage: SeoLandingData = {
    slug: 'cloud-kitchen-software',
    h1: 'Cloud Kitchen Software with a Branded QR Menu',
    subtitle:
        'Run your cloud kitchen from a phone. A branded digital menu, a shareable QR and WhatsApp link, and zero commission to aggregators. In-menu ordering with UPI payment is coming soon.',
    features: [
        { icon: 'kitchen', title: 'Your Own Menu Link', description: 'Share one branded link via WhatsApp, Instagram or stickers, so customers reach you without an aggregator in between. They order over WhatsApp or a call today; ordering inside the menu is coming soon.' },
        { icon: 'restaurant_menu', title: 'AI Menu Generation', description: 'Upload your menu photo. AI builds your digital menu with matched photos: about 3 minutes to a live menu link for a typical menu.' },
        { icon: 'qr_code_2', title: 'QR Codes for Stickers', description: 'Print QR codes on delivery boxes, leaflets, and sticker drops. Repeat orders go to you, not aggregators.' },
        { icon: 'payments', title: 'UPI Straight to You', description: 'Customers pay your own UPI ID, so money lands in your account with no commission and no payout delay. UPI inside the menu is coming soon.' },
        { icon: 'speed', title: 'Live Kitchen Dashboard — Coming Soon', description: 'When ordering launches, orders will appear on any phone or tablet in your kitchen: Preparing → Ready → Out for delivery. Not live yet.' },
        { icon: 'storefront', title: 'Multiple Cloud Brands', description: 'Run multiple ghost-kitchen brands from one vsite account. Each gets its own URL and branding.' },
    ],
    content: [
        { type: 'p', text: 'A cloud kitchen lives or dies by direct customer orders. Aggregators take 18–30% commission and own your customer relationship. vsite gives you a branded digital menu and a direct QR link you can share anywhere — so customers reach you without an aggregator in between, and your margins stay yours.' },
        { type: 'h2', text: 'Why Cloud Kitchens Want a Direct Channel' },
        { type: 'ul', items: [
            'Aggregator commission of 18–30% destroys margins on small-ticket Indian orders',
            'Aggregators own the customer — you can\'t market to repeat orders',
            'Discount-driven aggregator orders attract one-time price-sensitive customers',
            'Direct orders avoid aggregator commission entirely',
            'WhatsApp plus your own UPI QR is a simple direct-order setup you can run today',
        ]},
        { type: 'h2', text: 'How vsite Works for Cloud Kitchens' },
        { type: 'ol', items: [
            'Sign up — your cloud kitchen brand gets a unique URL like vsite.in/shop/your-brand',
            'AI builds your digital menu from a photo: about 3 minutes to a live menu link',
            'Print QR codes on packaging, leaflets, sticker drops, and Instagram bios',
            'Customers scan → browse your menu → order by WhatsApp or phone (in-menu ordering and UPI payment coming soon)',
            'You fulfil and deliver. Zero commission. Customer is yours forever.',
        ]},
        { type: 'h2', text: 'Cloud Kitchen Cost Comparison' },
        { type: 'table', headers: ['Cost', 'Aggregator-Only Model', 'vsite Direct Model'], rows: [
            ['Average commission per order', '18% – 30%', '0%'],
            ['Monthly platform fee', '₹0 (taken from orders)', '₹299 / month flat'],
            ['Customer data ownership', 'Aggregator', 'You'],
            ['Repeat-order marketing', 'Not possible', 'WhatsApp / SMS direct'],
            ['Time to a live menu link', 'Weeks', 'About 3 minutes for a typical menu'],
        ]},
        { type: 'callout', text: 'For a cloud kitchen doing ₹1 lakh/month in orders, if 30% of those orders came direct instead of through an aggregator charging 18–30%, the commission avoided would be roughly ₹5,400–₹9,000/month (illustrative arithmetic, not a guarantee).' },
    ],
    relatedLinks: [
        { label: 'AI Menu Builder →', href: '/ai-menu-builder' },
        { label: 'QR Code Menu →', href: '/qr-menu' },
        { label: 'Restaurant Menu Software →', href: '/restaurant-menu-software' },
        { label: 'Bakery Menu Software →', href: '/bakery-menu-software' },
        { label: 'Pricing →', href: '/pricing' },
    ],
    faqs: [
        { q: 'What is the best software for a cloud kitchen in India?', a: 'For Indian cloud kitchens, vsite gives you a branded menu link plus QR codes you can print on packaging, for ₹299/month flat with zero commission. Customers order with you over WhatsApp or a call; ordering inside the menu is coming soon.' },
        { q: 'Can a cloud kitchen take orders without Zomato or Swiggy?', a: 'Yes. Your cloud kitchen gets a QR and a URL you can share via WhatsApp, Instagram, sticker drops or leaflets. Customers browse your menu there and order from you over WhatsApp or a call, paying your own UPI ID — you keep 100% of every order, with zero commission. Ordering and paying inside the menu is coming soon.' },
        { q: 'How do customers find a cloud kitchen using vsite?', a: 'You drive customers to your vsite URL via packaging stickers, social media, WhatsApp groups, and Google Business Profile. Each cloud kitchen brand on vsite gets a public URL that ranks on Google over time, giving you organic discovery.' },
    ],
};

export const bakeryMenuPage: SeoLandingData = {
    slug: 'bakery-menu-software',
    h1: 'Digital Menu Software for Bakeries & Patisseries',
    subtitle:
        'Show off your cakes, breads, pastries, and customised orders with a beautiful digital menu. AI-matched photos and live stock toggles — all on vsite. Ordering with UPI is coming soon.',
    features: [
        { icon: 'cake', title: 'Showcase Cakes & Pastries', description: 'AI-matched photos make every cupcake, croissant, and custom cake look magazine-ready.' },
        { icon: 'edit_note', title: 'Custom Cakes on the Menu', description: 'List your cake sizes, flavours and starting prices so customers know what to ask for. Custom orders are still confirmed with you by WhatsApp or phone.' },
        { icon: 'autorenew', title: 'Real-Time Stock Toggle', description: 'Sold out of brownies? Mark unavailable in one tap so customers don\'t waste an order.' },
        { icon: 'storefront', title: 'Counter or Dine-In', description: 'One menu for in-store browsing and for sharing on WhatsApp. Pickup ordering in the menu is coming soon.' },
        { icon: 'qr_code_2', title: 'Per-Table + Counter QR', description: 'QR codes on every counter and table. Print stickers for your packaging too.' },
        { icon: 'payments', title: 'UPI Payment — Coming Soon', description: 'Paying inside the menu is not live yet. Display your own UPI QR at the counter meanwhile — no card terminal needed either way.' },
    ],
    content: [
        { type: 'p', text: 'A digital menu for a bakery showcases your cakes, breads, and pastries with professional photos and lets customers browse them on their own phone before they buy. vsite works well for Indian bakeries — AI-matched product photos and real-time stock toggles, with zero commission. Pickup ordering and UPI payment inside the menu are coming soon.' },
        { type: 'h2', text: 'What Makes a Great Bakery Digital Menu' },
        { type: 'ul', items: [
            'Strong product photography — bakeries sell on visual appeal',
            'A clear list of custom-cake options and starting prices',
            'Stock toggle — bakery items sell out fast, customers hate disappointment',
            'Stock that is always current, so the kitchen plans around what is actually left',
            'Categorisation by product type (cakes, breads, pastries, beverages)',
        ]},
        { type: 'h2', text: 'How vsite Helps Bakeries Sell More' },
        { type: 'ol', items: [
            'AI matches polished food photos from a curated library to every product — no photographer fee',
            'Customers see the photo and price, browse, and tell you what they want',
            'You mark items unavailable in seconds when stock runs out',
            'Coming soon: customers pay by UPI before pickup and the kitchen prepares to schedule',
            'Photos make it easier for customers to pick, and to pick the premium item',
        ]},
        { type: 'callout', text: 'The right photo makes a ₹150 cupcake feel premium. vsite matches that kind of photo for you at no extra cost.' },
    ],
    relatedLinks: [
        { label: 'Café Menu Software →', href: '/cafe-menu-software' },
        { label: 'AI Food Photo Generator →', href: '/ai-food-photo-generator' },
        { label: 'AI Menu Builder →', href: '/ai-menu-builder' },
        { label: 'Sweet Shop Menu →', href: '/sweet-shop-menu' },
        { label: 'Pricing →', href: '/pricing' },
    ],
    faqs: [
        { q: 'What is the best digital menu software for a bakery in India?', a: 'vsite suits bakeries that want photos on every product: ₹299/month, AI-matched product photos, and real-time stock toggling. DineCard is cheaper (₹99/month) if you only need a text menu.' },
        { q: 'Can bakery customers place pickup orders on a digital menu?', a: 'Not yet on vsite. Today customers browse your bakery menu on their phone and order over WhatsApp, by phone or at the counter. Pickup ordering with UPI payment and a requested pickup time is coming soon.' },
        { q: 'How do I show photos of all my bakery items?', a: 'vsite\'s AI matches a food photo from a curated library to every item on your menu automatically — no photographer or photo shoot needed. You can swap any matched photo for your own at any time.' },
    ],
};

export const barMenuPage: SeoLandingData = {
    slug: 'bar-pub-menu',
    h1: 'Digital Bar & Pub Menu — QR Drinks Menu for India',
    subtitle:
        'Cocktails, craft beers, wine lists, bar bites — all in a beautiful QR menu. Real-time updates for nightly specials and happy-hour pricing.',
    features: [
        { icon: 'wine_bar', title: 'Cocktail-First Layout', description: 'Categories tuned for bars — cocktails, mocktails, beer, wine, spirits, bar bites.' },
        { icon: 'schedule', title: 'Edit Prices Live', description: 'Change a price from your phone when happy hour starts and change it back after — no reprinting.' },
        { icon: 'photo_camera', title: 'Cocktail Photos', description: 'AI-matched cocktail photos from a curated library help premium drinks look the part.' },
        { icon: 'translate', title: 'Bilingual', description: 'Tamil + English toggle for South Indian markets where both audiences sit at the same bar.' },
        { icon: 'qr_code_2', title: 'Per-Table QR', description: 'Customers read the drinks list on their own phone, so busy bartenders answer fewer menu questions. Ordering in the menu is coming soon.' },
        { icon: 'visibility', title: 'Real-Time Specials', description: 'Add tonight\'s special or mark a bottle finished in seconds, from your phone.' },
    ],
    content: [
        { type: 'p', text: 'A digital bar menu lets your guests browse cocktails, beer, wine, and bar bites on their phone via a QR code at the table. With vsite, you get AI-matched cocktail photos, live price edits for happy hour, and bilingual menus.' },
        { type: 'h2', text: 'Why Bars Should Drop the Paper Drinks Menu' },
        { type: 'ul', items: [
            'Bartenders are constantly busy — customers waiting to ask questions slows service',
            'Happy-hour price changes should be a quick edit, not a reprint',
            'Drinks photos help premium cocktails stand out next to cheaper beers',
            'New cocktails get added weekly at any decent bar — paper menus go stale',
            'Hygiene-conscious customers don\'t want to handle a shared sticky menu',
        ]},
        { type: 'h2', text: 'How vsite Works for Bars' },
        { type: 'ol', items: [
            'Add your full drinks menu — cocktails, beer, wine, spirits, bar bites',
            'AI matches cocktail and food photos automatically',
            'Edit prices from your phone when happy hour starts, and back again after',
            'Print QR stands on every table and the bar counter',
            'Customers scan and browse on their own phone — the bartender focuses on making drinks and takes the order as usual',
        ]},
        { type: 'callout', text: 'In a busy bar, every question the menu answers is a minute the bartender keeps. Ordering in the menu is coming soon; today staff still take the order.' },
    ],
    relatedLinks: [
        { label: 'Restaurant Menu Software →', href: '/restaurant-menu-software' },
        { label: 'Café Menu Software →', href: '/cafe-menu-software' },
        { label: 'QR Code Menu →', href: '/qr-menu' },
        { label: 'AI Food Photo Generator →', href: '/ai-food-photo-generator' },
        { label: 'Pricing →', href: '/pricing' },
    ],
    faqs: [
        { q: 'What is a digital menu for a bar?', a: 'A digital bar menu is an online drinks list customers scan with a QR code at the table. They browse cocktails, beer, wine and food, then order with your staff. With vsite, bars in India get AI-matched cocktail photos, live price edits, and Tamil + English support starting at ₹299/month. Ordering and UPI payment inside the menu are coming soon.' },
        { q: 'Can I update happy-hour pricing on a digital bar menu?', a: 'Yes. Yes. You edit the prices from your phone when happy hour starts and change them back afterwards — no reprints. vsite does not yet schedule price changes automatically.' },
        { q: 'Do bars need an age gate on a digital menu?', a: 'It is recommended for compliance. vsite does not currently show an age-gate screen, so any legal-age check stays with your staff.' },
    ],
};

export const sweetShopPage: SeoLandingData = {
    slug: 'sweet-shop-menu',
    h1: 'Digital Menu for Sweet Shops, Mithai Shops & Indian Sweets',
    subtitle:
        'Showcase every laddu, jalebi, barfi, and seasonal mithai with AI-matched photos. Festival menus, live prices and sold-out toggles. Ordering with UPI is coming soon.',
    features: [
        { icon: 'celebration', title: 'Festival-Ready Menus', description: 'Diwali, Eid, Pongal — flip your menu seasonally with festival items in real time.' },
        { icon: 'redeem', title: 'Gift Boxes on the Menu', description: 'List your gift-box options and prices so customers can decide before they reach the counter. Customising a box is still done with your staff.' },
        { icon: 'photo_camera', title: 'Mithai Photos', description: 'AI-matched photos for sweets from a curated library — kaju katli, gulab jamun, mysore pak, and more.' },
        { icon: 'scale', title: 'Per-Kg or Per-Piece Labels', description: 'Name and price each item your way — for example "Mysore Pak (per kg)" or "Laddu (per piece)".' },
        { icon: 'translate', title: 'Tamil + English', description: 'Display sweet names in Tamil for South Indian markets where most regulars prefer it.' },
        { icon: 'payments', title: 'UPI on Pickup — Coming Soon', description: 'Pre-ordering and paying by UPI before pickup is not live yet. It is coming soon; today customers browse the menu and order at the counter.' },
    ],
    content: [
        { type: 'p', text: 'A digital menu for a sweet shop showcases your mithai, festival sweets, and gift-box options online with photos and prices. vsite works for sweet shops — list items per kg, per piece, or as gift boxes — with AI-matched photos and Tamil-language names.' },
        { type: 'h2', text: 'Why Mithai Shops Are Going Digital in 2026' },
        { type: 'ul', items: [
            'Festival demand spikes — managing 30+ items in real time is impossible on paper',
            'Customers travel for festival sweets — browsing the menu on their phone in the queue cuts questions at the counter',
            'Gift-box options and prices are clearer written down than read out',
            'Younger customers prefer scrolling and scanning to asking',
            'Tamil mithai names are hard to spell — better seen than spoken across counters',
        ]},
        { type: 'h2', text: 'Sweet Shop Setup with vsite' },
        { type: 'ol', items: [
            'Photograph your menu board or list every sweet with prices',
            'AI extracts items including Tamil names',
            'AI matches a professional photo to each sweet',
            'Label each item per kg or per piece in its name, with the price',
            'Print QR stands on the counter — customers browse while in the queue',
        ]},
        { type: 'callout', text: 'vsite lists Tamil sweet names and matched photos on the same menu, which suits mithai shops in Tamil Nadu.' },
    ],
    relatedLinks: [
        { label: 'Bakery Menu Software →', href: '/bakery-menu-software' },
        { label: 'AI Food Photo Generator →', href: '/ai-food-photo-generator' },
        { label: 'Restaurant Menu Software →', href: '/restaurant-menu-software' },
        { label: 'QR Code Menu →', href: '/qr-menu' },
        { label: 'Pricing →', href: '/pricing' },
    ],
    faqs: [
        { q: 'Is there digital menu software for sweet shops in India?', a: 'Yes. vsite works for sweet shops and mithai shops: AI-matched photos for every sweet, Tamil-language naming, festival menus and live price edits, at ₹299/month. Ordering and UPI payment inside the menu are coming soon.' },
        { q: 'Can customers pre-order a gift box of mithai online?', a: 'Not yet. Customers can browse your full mithai range with photos and prices on their phone, then order by WhatsApp, phone or at the counter. Customising a gift box and paying by UPI in the menu is coming soon.' },
        { q: 'How does pricing work for items sold by weight?', a: 'Name the item with its unit, such as "Mysore Pak (per kg)", and set the price for that unit. You can mix per-kg and per-piece items in the same menu. Totals are worked out at the counter, since ordering in the menu is coming soon.' },
    ],
};

export const iceCreamShopPage: SeoLandingData = {
    slug: 'ice-cream-shop-menu',
    h1: 'Digital Menu for Ice Cream Shops & Parlours',
    subtitle:
        'Sundaes, scoops, shakes, falooda — show your full ice cream menu with photos, run flavour-of-the-day specials, and let customers read it all from the table. Ordering in the menu is coming soon.',
    features: [
        { icon: 'icecream', title: 'Flavour-First Layout', description: 'Categories built for ice cream parlours — scoops, sundaes, shakes, kulfi, falooda.' },
        { icon: 'photo_camera', title: 'Mouth-Watering Photos', description: 'AI-matched photos for scoops, sundaes and shakes from a curated library.' },
        { icon: 'autorenew', title: 'Sold-Out Toggle', description: 'Run out of mango kulfi? Mark unavailable in one tap. Customers don\'t waste an order.' },
        { icon: 'star', title: 'Flavour of the Day', description: 'Highlight today\'s special with a featured banner on every customer\'s screen.' },
        { icon: 'qr_code_2', title: 'Per-Table QR', description: 'Customers browse the full menu on their own phone, so busy weekends have fewer questions at the counter.' },
        { icon: 'payments', title: 'UPI Payment — Coming Soon', description: 'Paying inside the menu is not live yet. Today, show your own UPI QR at the counter.' },
    ],
    content: [
        { type: 'p', text: 'A digital menu for an ice cream shop lets customers see every scoop, sundae and shake with photos before they order. With vsite, ice cream parlours in India get AI-matched photos and sold-out toggles at ₹299/month. In-menu ordering with UPI checkout is coming soon.' },
        { type: 'h2', text: 'Why Ice Cream Shops Need Digital Menus' },
        { type: 'ul', items: [
            'Ice cream is photo-driven — paper menus that just list "vanilla, chocolate, butterscotch" don\'t sell',
            'Specials change daily based on what\'s freshly churned',
            'Weekend rushes are intense — a menu on the customer\'s phone cuts questions at the counter',
            'Kids decide based on visuals — photo menus drive faster decisions',
            'Customers love seasonal items (mango in summer, gulkand in winter) — digital is built for this',
        ]},
        { type: 'h2', text: 'How vsite Works for Ice Cream Shops' },
        { type: 'ol', items: [
            'List every flavour, sundae, shake, and dessert with prices',
            'AI matches a high-quality photo to every item',
            'Set today\'s special and toggle sold-out items in real time',
            'Print QR stands on tables and at the counter',
            'Customers scan and browse on their phone; you scoop, serve and take the order as usual (ordering in the menu is coming soon)',
        ]},
        { type: 'callout', text: 'The right photo turns "I\'ll have one scoop" into "I\'ll have a sundae." vsite matches that photo for every flavour at no extra cost.' },
    ],
    relatedLinks: [
        { label: 'Café Menu Software →', href: '/cafe-menu-software' },
        { label: 'Bakery Menu Software →', href: '/bakery-menu-software' },
        { label: 'AI Food Photo Generator →', href: '/ai-food-photo-generator' },
        { label: 'QR Code Menu →', href: '/qr-menu' },
        { label: 'Pricing →', href: '/pricing' },
    ],
    faqs: [
        { q: 'Is there digital menu software for ice cream parlours?', a: 'Yes. vsite is a digital menu platform purpose-built for SMB F&B businesses including ice cream parlours and shops. It matches a photo for every flavour, and lets you toggle sold-out items in real time — ₹299/month.' },
        { q: 'Can I run a "flavour of the day" promotion on a digital menu?', a: 'Yes. With vsite you can highlight a daily special with a featured banner that every customer sees when scanning the QR code. Update the special anytime in seconds.' },
        { q: 'How do I let customers order ice cream from their phone?', a: 'Ordering from the phone is coming soon — it is not live yet. What works today: sign up on vsite.in, add your menu, and place QR stands on every table. Customers scan and browse every flavour with photos, then order with your staff. No app download.' },
    ],
};

// ─── Keyword-gap pages ─────────────────────────────────────────────────────
// These cover commercial-intent keywords that didn't have a dedicated page.

export const onlineMenuMakerPage: SeoLandingData = {
    slug: 'online-menu-maker',
    h1: 'Online Menu Maker for Restaurants & Cafés',
    subtitle:
        'Build your digital menu online: about 3 minutes to a live menu link for a typical menu. Upload a paper menu photo and the AI builds your items, prices, photos and layout. Then publish a live QR-ready menu.',
    features: [
        { icon: 'auto_awesome', title: 'AI Menu Builder', description: 'Photograph your paper menu — AI extracts every item and price automatically.' },
        { icon: 'image', title: 'Photos for Every Item', description: 'AI matches a professional food photo to every dish on your menu.' },
        { icon: 'palette', title: 'Branded Design', description: 'Your menu uses your shop name, logo, and colours — fully branded.' },
        { icon: 'qr_code_2', title: 'Publish + QR Code', description: 'One click to publish. You get a unique URL and a QR code instantly.' },
        { icon: 'edit', title: 'Edit Anything Live', description: 'Update any item, price, or photo at any time. Changes go live in real time.' },
        { icon: 'language', title: 'Tamil and English', description: 'One menu that shows Tamil and English together, as you type the dish names. No automatic translation.' },
    ],
    content: [
        { type: 'p', text: 'An online menu maker is a tool that lets you build your restaurant or café menu on the web and publish it as a live, shareable, QR-scannable digital menu. vsite is an AI-powered online menu maker: upload a photo of your paper menu and the AI builds your full digital menu with matched food photos in minutes.' },
        { type: 'h2', text: 'How an Online Menu Maker Works' },
        { type: 'ol', items: [
            'You sign up on vsite.in (no credit card needed)',
            'Upload a photo of your existing menu OR enter items manually',
            'AI extracts every item, price, and category — including Tamil text',
            'AI matches a polished food photo to each dish',
            'You preview, edit if needed, and click Publish',
            'You get a live URL and a printable QR code for your tables',
        ]},
        { type: 'h2', text: 'Free vs Paid Online Menu Makers' },
        { type: 'p', text: 'Many "free" online menu makers exist but they can limit food photos, branding or ongoing menu updates. vsite includes everything in its 7-day free trial — AI photos, live menu updates, a QR code to print — and the full plan is ₹299/month after.' },
        { type: 'callout', text: 'Other tools, such as DineCard, also read a photographed menu; vsite adds matched food photos and Tamil + English menus on top.' },
    ],
    relatedLinks: [
        { label: 'AI Menu Builder →', href: '/ai-menu-builder' },
        { label: 'QR Code Menu →', href: '/qr-menu' },
        { label: 'Digital Menu India →', href: '/digital-menu-india' },
        { label: 'Restaurant Menu Software →', href: '/restaurant-menu-software' },
        { label: 'Pricing →', href: '/pricing' },
    ],
    faqs: [
        { q: 'What is the best online menu maker for restaurants in India?', a: 'vsite reads a photo of your paper menu with AI and builds the full digital menu with matched food photos. ₹299/month, 7-day free trial. DineCard (₹99/month) is a cheaper text-only alternative.' },
        { q: 'Is there a free online menu maker?', a: 'Several tools advertise free menu makers but many limit photos, branding or item counts behind upgrades. vsite offers a 7-day free trial with no credit card; the full feature set is ₹299/month.' },
        { q: 'Can I make a menu online and print a QR code?', a: 'Yes. vsite generates your QR code and unique URL automatically when you publish. You can print the QR code on table standees, stickers, or place cards. Updates to your menu reflect on the same QR code — no need to reprint.' },
    ],
};

export const contactlessMenuPage: SeoLandingData = {
    slug: 'contactless-menu',
    h1: 'Contactless Menu — No App Download Needed',
    subtitle:
        'Customers scan a QR code, the menu opens in their browser. No app download, no signup, no friction — works on every smartphone in India.',
    features: [
        { icon: 'phone_android', title: 'Works on Any Phone', description: 'Android, iPhone, basic 4G phones — anything with a camera and a browser.' },
        { icon: 'block', title: 'Zero App Downloads', description: 'Customers never download anything. The menu opens in their default browser.' },
        { icon: 'sanitizer', title: 'Hygienic by Design', description: 'No shared physical menu — customers use only their own phone.' },
        { icon: 'speed', title: '2-Second Load', description: 'The menu page loads in 2–3 seconds even on slow 4G connections.' },
        { icon: 'translate', title: 'Multi-Language', description: 'Tamil + English toggle for South Indian customers.' },
        { icon: 'qr_code_2', title: 'QR or NFC', description: `Customers scan the QR code, or tap an optional NFC + QR sticker (₹${STICKER_PRICE_INR} each). The QR code itself is free. Choose either or both.` },
    ],
    content: [
        { type: 'p', text: 'A contactless menu is a digital menu that customers view on their own smartphone — typically by scanning a QR code on the table — without needing to download an app or touch a shared physical menu. vsite\'s contactless menu loads in 2 seconds, works on every smartphone, and supports Tamil + English.' },
        { type: 'h2', text: 'Why Contactless Menus Matter in 2026' },
        { type: 'ul', items: [
            'Hygiene — post-COVID awareness keeps customers preferring no-touch experiences',
            'Speed — customers don\'t wait for a waiter to bring a menu',
            'Cost — no printing, laminating, or replacement of damaged menus',
            'Accuracy — out-of-stock items can be hidden in real time',
            'Mobile-first — diners already have the phone in hand',
        ]},
        { type: 'h2', text: 'How a No-App Contactless Menu Works' },
        { type: 'ol', items: [
            'You print the QR code on a table standee, or order an optional NFC + QR sticker',
            'Customer scans with their phone\'s native camera (no app needed)',
            'Phone shows a notification — customer taps to open',
            'Menu loads in their browser within 2 seconds',
            'Customer browses the menu in the browser; staff take the order and payment as usual (ordering and UPI in the menu are coming soon)',
        ]},
        { type: 'callout', text: 'No app means no friction. Every customer who scans actually sees your menu, because there is no download step to abandon.' },
    ],
    relatedLinks: [
        { label: 'QR Code Menu →', href: '/qr-menu' },
        { label: 'Digital Menu India →', href: '/digital-menu-india' },
        { label: 'Restaurant Menu Software →', href: '/restaurant-menu-software' },
        { label: 'Features →', href: '/features' },
        { label: 'Pricing →', href: '/pricing' },
    ],
    faqs: [
        { q: 'What is a contactless menu?', a: 'A contactless menu is a digital menu that customers view on their own smartphone by scanning a QR code or tapping an NFC sticker on the table. There is no shared physical menu and no app download required — it opens in any phone\'s default browser within 2 seconds.' },
        { q: 'Do customers need an app to use a contactless menu?', a: 'No. With vsite, the menu opens directly in the customer\'s phone browser. No app download, no signup, no login. This is the entire point of a contactless menu — frictionless access for every customer.' },
        { q: 'Does a contactless menu work on every smartphone?', a: 'Yes. The menu is a standard web page that loads on Android, iPhone, and even basic 4G feature phones with a camera. It works in any country, any browser, any phone manufactured in the last 5+ years.' },
    ],
};

export const aiFoodPhotoPage: SeoLandingData = {
    slug: 'ai-food-photo-generator',
    h1: 'AI Food Photos for Restaurant Menus',
    subtitle:
        'Get a professional food photo on every dish on your menu — automatically matched from a curated library, with no photographer, no shoot and no editing. Swap in your own photo any time. Built into every vsite account.',
    features: [
        { icon: 'auto_awesome', title: 'Auto-Match Per Item', description: 'AI reads each dish name and matches it to a professional food photo from a curated library.' },
        { icon: 'tune', title: 'Swap Anytime', description: 'Don\'t love a matched photo? Pick a different one or upload your own.' },
        { icon: 'photo_library', title: 'Indian Dishes in the Library', description: 'The curated library covers Indian dishes — biryani, dosa, paneer, mithai and more — so matches look right.' },
        { icon: 'free_breakfast', title: 'Coffee, Cocktails, Sweets', description: 'Beyond restaurant food — café drinks, mocktails, mithai, ice cream, bakery items.' },
        { icon: 'translate', title: 'Tamil-Aware', description: 'Tamil dish names work too — the matcher understands Tamil names.' },
        { icon: 'savings', title: 'Free with vsite', description: 'Included in every plan — no per-photo charges, no upsells.' },
    ],
    content: [
        { type: 'p', text: 'vsite does not generate pictures with an image model. It matches each dish on your menu, by name, to a photo in a curated food photography library — so there is no photographer, no shoot and no editing, and every dish, drink and dessert gets a polished photo in seconds. The matching is built into every plan.' },
        { type: 'h2', text: 'Why AI-Matched Food Photos Matter' },
        { type: 'ul', items: [
            'Customers find it easier to choose from a menu with photos than from a list of names',
            'A real food photo shoot in India costs ₹5,000 – ₹15,000 per session',
            'Most SMB restaurants and cafés cannot afford ongoing photography',
            'Photos need to refresh as menus change — not feasible with one-off shoots',
            'A matched library photo shows what the dish is; for a signature dish, upload your own photo',
        ]},
        { type: 'h2', text: 'How vsite\'s AI Food Photo Matching Works' },
        { type: 'ol', items: [
            'You add a dish to your vsite menu (or AI extracts it from your paper menu)',
            'AI matches the dish name to the closest photo in a curated library',
            'The matched photo is attached to the dish',
            'You preview the photo and accept it, pick another, or upload your own',
            'Done — every item on your menu now has a polished photo',
        ]},
        { type: 'callout', text: 'Matched photos are included in the ₹299/month plan — no per-photo charge.' },
    ],
    relatedLinks: [
        { label: 'AI Menu Builder →', href: '/ai-menu-builder' },
        { label: 'Digital Menu India →', href: '/digital-menu-india' },
        { label: 'Bakery Menu Software →', href: '/bakery-menu-software' },
        { label: 'Sweet Shop Menu →', href: '/sweet-shop-menu' },
        { label: 'Features →', href: '/features' },
    ],
    faqs: [
        { q: 'Are vsite\'s food photos AI-generated?', a: 'No. Nothing is created by an image model. the AI matches each dish name to a photo in a curated food photography library, so every menu item gets a matching photo in seconds — no photographer, no shoot, no editing. The library covers South Indian, North Indian, sweets and beverages, and you can replace any photo with your own.' },
        { q: 'Can AI match photos for Indian dishes like biryani or dosa?', a: 'Yes. The library includes Indian dishes such as biryani, dosa, idli, paneer dishes, mithai, ice creams, cocktails and coffee, and the matcher understands Tamil dish names. If no photo fits a dish well, upload your own.' },
        { q: 'How much do AI-matched food photos cost on vsite?', a: 'Photo matching is included in the ₹299/month plan. There are no per-photo charges and no premium upgrades for photos.' },
    ],
};

export const restaurantMenuSoftwarePage: SeoLandingData = {
    slug: 'restaurant-menu-software',
    h1: 'Restaurant Menu Software in India 2026',
    subtitle:
        'Modern restaurant menu software designed for India — QR code menus, AI food photos, Tamil support, and zero commission. ₹299/month with a 7-day free trial.',
    features: [
        { icon: 'qr_code_2', title: 'QR Code Menu', description: 'A unique QR code for every table. Customers scan and read the menu on their phone; staff take the order as usual.' },
        { icon: 'auto_awesome', title: 'AI Food Photos', description: 'Every menu item gets an AI-matched food photo automatically.' },
        { icon: 'storefront', title: 'Multi-Store Support', description: 'Run multiple outlets from one vsite account. Switch between stores in the dashboard.' },
        { icon: 'receipt', title: 'Order Management — Coming Soon', description: 'A live kitchen dashboard for marking orders ready or completed is not live yet. Sold-out toggles on your menu work today.' },
        { icon: 'inventory_2', title: 'Menu Management', description: 'Add dishes, change prices, and organise categories — all changes are real-time.' },
        { icon: 'analytics', title: 'Reports & Insights', description: 'See which dishes get the most views and when your menu is scanned most.' },
    ],
    content: [
        { type: 'p', text: 'vsite is restaurant menu software purpose-built for Indian restaurants — especially in Tamil Nadu. It combines QR code menus, AI-matched food photos, and real-time menu management into a single ₹299/month subscription. No commission, no POS hardware, no 2-day onboarding.' },
        { type: 'h2', text: 'What Restaurant Menu Software Should Do' },
        { type: 'ul', items: [
            'Let customers see your menu instantly via QR code',
            'Show professional food photos that drive higher order values',
            'Support price/item updates in real time (no reprinting)',
            'Keep 100% of every bill — vsite takes no commission',
            'See which dishes customers look at most, and when',
            'Work in your customers\' preferred language (Tamil for South Indian markets)',
        ]},
        { type: 'h2', text: 'How vsite Compares on Published Facts' },
        { type: 'table', headers: ['Capability', 'vsite', 'DineCard', 'Menulite', 'MenuScan'], rows: [
            ['QR code menu', 'Yes', 'Yes', 'Yes', 'Yes'],
            ['Food photos', 'AI-matched, from a curated library', 'Not listed', 'Not checked', 'Not listed'],
            ['Tamil support', 'Yes', 'Yes', 'Yes', 'Not checked'],
            ['Ordering today', 'No — coming soon', 'No', 'On Pro', 'Yes'],
            ['Full POS / billing', 'No', 'No', 'Not checked', 'Premium + POS tier'],
            ['Price (published)', '₹299/mo flat', '₹99/mo', 'From ₹799/mo (annual)', 'From ₹250/mo'],
        ]},
        { type: 'callout', text: 'If you run a tiffin centre, hotel, cafe, or cloud kitchen in Tamil Nadu, vsite is a Tamil + English Smart QR Menu that goes live from a photo of your paper menu, for ₹299/month flat.' },
    ],
    relatedLinks: [
        { label: 'QR Code Menu →', href: '/qr-menu' },
        { label: 'Digital Menu for Restaurants in India →', href: '/digital-menu-india' },
        { label: 'AI Menu Builder →', href: '/ai-menu-builder' },
        { label: 'Pricing →', href: '/pricing' },
        { label: 'Features →', href: '/features' },
        { label: 'vsite vs Petpooja →', href: '/blog/vsite-vs-petpooja' },
        { label: 'Best Digital Menu Software in India 2026 →', href: '/best-digital-menu-software-india' },
    ],
    faqs: [
        { q: 'What is restaurant menu software?', a: 'Restaurant menu software lets you create, publish, and manage your restaurant\'s menu digitally. Modern options like vsite generate a QR code that customers scan to view the menu on their phone, with features like food photos and real-time price updates. Ordering inside the menu is not live on vsite yet — it is coming soon.' },
        { q: 'How much does restaurant menu software cost in India?', a: 'Published prices for menu tools run from ₹99/month (DineCard) to ₹1,499/month (Menulite Pro), and full POS systems cost more. vsite costs ₹299/month with no setup fee, including AI-matched food photos, QR codes to print, and Tamil and English menus. NFC + QR stickers are optional extras.' },
        { q: 'Do I need a POS machine to use vsite?', a: 'No, and you never will. vsite runs entirely from your phone or browser: customers read the menu on their own phone and order with your staff. No POS terminal, no card reader, no extra hardware. When in-menu ordering with UPI payment launches — coming soon — it will run in the browser too.' },
        { q: 'Can I run multiple restaurants from one account?', a: 'Yes. vsite supports multiple stores under one login. Each store gets its own URL, QR code, and menu. You switch between stores in the dashboard.' },
        { q: 'Is there a free trial?', a: 'Yes. vsite offers a 7-day free trial with no credit card required. You can set up your full digital menu and test it with customers before paying anything.' },
    ],
};
