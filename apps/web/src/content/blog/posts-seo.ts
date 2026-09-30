import type { BlogPost, ContentBlock } from './types';
import { CONTACT, LIVE_SINCE, PHOTO_CLAIM, PRICE_INR_PER_MONTH, TRIAL_DAYS } from '@/content/facts';
import { ORDERING_COMING_SOON_SHORT } from '@/content/roadmap';

/**
 * Six flagship posts aimed at the questions people (and AI assistants) ask
 * about digital menus in Tamil Nadu. Merged into the blog list by posts.ts.
 *
 * Rules: answer first, dated comparison claims, who-publishes disclosure,
 * ordering only ever "coming soon", no measured claim we cannot prove. Setup
 * time is stated only as "typically minutes for a menu of about 40 items".
 * Competitor figures were read from each vendor's published pages on
 * 2026-09-30.
 */

const PUBLISHED = '2026-09-30';
const AUTHOR = 'vsite Team';
const AUTHOR_TITLE = 'Digital menu software, Tamil Nadu';
const YEARLY = PRICE_INR_PER_MONTH * 12;

const DISCLOSURE =
    'Who publishes this: vsite, which makes one of the tools compared here. Figures for other vendors are taken from their own published pages; check them before you decide.';

function faqBlocks(faqs: { q: string; a: string }[]): ContentBlock[] {
    return faqs.map((f) => ({ type: 'faq', q: f.q, a: f.a }));
}

const priceFaqs = [
    {
        q: 'How much does a digital menu cost in India in 2026?',
        a: `From the vendors compared here, as of September 2026, published prices run from a free tier to about ₹1,500 a month. DineCard lists ₹99 a month, vsite is ₹${PRICE_INR_PER_MONTH} a month, and Menulite lists ₹799 a month billed annually. Check each vendor's page before you pay.`,
    },
    {
        q: 'Is there a free digital menu for a restaurant in India?',
        a: 'Yes, some vendors offer a free tier. QRSeva lists one, with a paid plan at ₹199, as of September 2026. Free tiers usually limit items, languages or features, so read the limits before you rebuild your menu on one.',
    },
    {
        q: 'Why do some digital menus cost ₹1,400 or more a month?',
        a: 'Usually because the plan includes ordering. Menulite lists its Pro plan at ₹1,399 to ₹1,499 with ordering. A menu you only read costs less than a system that also handles orders and payments.',
    },
    {
        q: `Does vsite charge commission or extra for changes?`,
        a: `No. vsite is ₹${PRICE_INR_PER_MONTH} a month with a ${TRIAL_DAYS}-day free trial, no commission on your sales, no item cap and no charge for editing the menu. ${ORDERING_COMING_SOON_SHORT}`,
    },
];

const pricePost: BlogPost = {
    slug: 'digital-menu-price-india-2026',
    title: 'How much does a digital menu cost in India in 2026?',
    description:
        'Published prices for digital and QR menu software in India as of September 2026, what drives the price, and how to compare a yearly subscription with reprinting your paper menu.',
    category: 'Pricing',
    categoryClass: 'bg-[#FBEFE0] text-[#8A5A1B]',
    tags: ['digital menu price', 'QR menu cost India', 'restaurant software pricing', 'Tamil Nadu'],
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    author: AUTHOR,
    authorTitle: AUTHOR_TITLE,
    readTime: 7,
    faqSchema: priceFaqs,
    content: [
        {
            type: 'p',
            text: `In India in 2026, a digital menu costs anywhere from nothing to about ₹1,500 a month. As of September 2026, DineCard lists ₹99 a month, vsite is ₹${PRICE_INR_PER_MONTH}, and Menulite lists ₹799 a month billed annually. The price mostly depends on whether ordering is included.`,
        },
        { type: 'p', text: DISCLOSURE },

        { type: 'h2', text: 'What do digital menu tools cost, vendor by vendor?' },
        {
            type: 'table',
            headers: ['Vendor', 'Published price (as of September 2026)', 'Trial', 'Notes'],
            rows: [
                ['QRSeva', 'Free tier; paid plan ₹199', 'Free tier', 'Free tier has limits; read them first'],
                ['DineCard', '₹99 a month or ₹999 a year', '14 days', '15+ Indian languages including Tamil; AI reads a photo of your menu'],
                ['vsite', `₹${PRICE_INR_PER_MONTH} a month (₹${YEARLY} a year)`, `${TRIAL_DAYS} days`, 'Tamil and English; no item cap; menu engineering, banners and multi-outlet included'],
                ['Menulite', 'Starter ₹799 a month billed annually (₹899 if paid monthly)', '14 days', 'Tamil supported; Pro plan ₹1,399 to ₹1,499 a month includes ordering'],
            ],
        },
        {
            type: 'p',
            text: 'Last verified: 30 September 2026, from each vendor\'s published pricing. Vendors change prices; treat this table as a starting point and confirm on their sites. MenuKard, AviQR and eMenuQR also support Tamil but are not priced here.',
        },
        {
            type: 'p',
            text: 'Read the table as a range, not a ranking. DineCard is cheaper than vsite on price, and the two differ in what is included. The rest of this post explains what moves a price, so you can decide which gaps matter for your restaurant.',
        },

        { type: 'h2', text: 'What makes one digital menu cost more than another?' },
        {
            type: 'ul',
            items: [
                'Ordering. A tool that also takes orders and payments costs more than one that shows a menu. This is the biggest single driver in the table above.',
                'Languages. Some tools offer many Indian languages; others offer English only. Tamil support is worth checking by looking at a live menu, not a feature list.',
                'Item caps. Cheaper plans sometimes limit how many dishes you can list. A large menu with variations can hit the cap quickly.',
                'Photos. Some tools leave photography to you. vsite matches photos from a curated library to your dish names, so the price includes them.',
                'Extra features. Analytics, menu engineering, banners, several outlets and several design choices are included in some plans and sold separately in others.',
                'Trial and billing period. A plan billed annually lowers the monthly figure but asks for the year up front. A short trial gives you less time to test in a real lunch rush.',
            ],
        },

        { type: 'h2', text: 'How do I compare a digital menu with reprinting a paper menu?' },
        {
            type: 'p',
            text: `Use your own numbers, not anyone else's. The formula is: yearly printing cost = cost of one print run × number of reprints per year. Add any design fee you pay each time. Then compare it with the digital plan's yearly price: ₹${PRICE_INR_PER_MONTH} × 12 = ₹${YEARLY} for vsite.`,
        },
        {
            type: 'p',
            text: `A worked example with invented figures, to show the method only: if one print run cost you ₹1,500 and you reprinted three times in a year, that is ₹4,500, compared with ₹${YEARLY}. If you reprint once a year for ₹800, paper is cheaper. Put in your own print quote and your own reprint count.`,
        },
        {
            type: 'p',
            text: 'Do not stop at the printing bill. A wrong printed price has a cost too: either you honour it and lose margin, or you explain it to a customer at the table. A price edit on a digital menu is live on the next scan.',
        },

        { type: 'h2', text: 'Which price band suits which kind of restaurant?' },
        {
            type: 'ul',
            items: [
                'Very small stall or shop with a short, rarely changing menu: a free tier or the lowest-priced plan may be enough. Test whether Tamil displays properly.',
                `A restaurant that changes prices, runs specials or has a large menu: look at tools with no item cap and quick editing, such as a ₹${PRICE_INR_PER_MONTH} plan, and check the trial lets you test a full service.`,
                'A restaurant that wants customers to order and pay from the phone: the plans that include ordering cost more, and you should confirm what they charge on payments.',
            ],
        },
        {
            type: 'p',
            text: `What vsite does not do (yet): ${ORDERING_COMING_SOON_SHORT} It is planned at no extra cost inside the same ₹${PRICE_INR_PER_MONTH} plan. Today customers read the menu on their phone and order with your staff, as they do now. The Smart QR Menu has been live since ${LIVE_SINCE}.`,
        },

        { type: 'h2', text: 'How should I test a vendor before paying?' },
        {
            type: 'ol',
            items: [
                'Start the free trial and build your real menu, not a sample.',
                'Open the menu on a mid-range phone and check that Tamil names display correctly.',
                'Change a price and mark an item sold out, then scan again to see how quickly it updates.',
                'Ask support a question in Tamil on WhatsApp and see how fast it is answered.',
                'Write down the price after the trial ends, including any annual billing.',
            ],
        },
        {
            type: 'p',
            text: 'More detail: see [our pricing page](/pricing), the [comparison with DineCard](/vs/dinecard), the [comparison with MenuScan](/vs/menuscan) and the [setup and cost guide](/guide/cost-and-time). You can also try the [live demo menu](/demo).',
        },
        ...faqBlocks(priceFaqs),
    ],
};

const glossaryFaqs = [
    {
        q: 'Is a QR menu the same as a digital menu?',
        a: 'Not exactly. A digital menu is the menu shown on a phone or screen; a QR menu is one way to open it, by scanning a code. A QR code can also point to a PDF, which is not a full digital menu.',
    },
    {
        q: 'Do I need an NFC menu in my restaurant?',
        a: 'Probably not. An NFC tag opens the same menu link when a phone is tapped. It saves a scan step but needs a compatible phone, so a printed QR is still needed as the main route.',
    },
    {
        q: 'What is the difference between a digital menu and an online ordering system?',
        a: `A digital menu shows dishes and prices. An online ordering system also takes orders and payments and usually connects to your kitchen. vsite is a digital menu today; ${ORDERING_COMING_SOON_SHORT}`,
    },
    {
        q: 'Is a PDF menu enough for a Tamil Nadu restaurant?',
        a: 'It works as a stopgap, but it is slow to edit, hard to read on a small phone screen and does not update by itself. A menu built for phones lets you change a price in seconds and lets diners switch between Tamil and English.',
    },
];

const glossaryPost: BlogPost = {
    slug: 'digital-menu-vs-qr-menu-vs-pdf-menu',
    title: 'Digital menu vs QR menu vs PDF menu: what is the difference?',
    description:
        'Plain definitions of a digital menu, a QR menu, a PDF menu, an NFC menu and an online ordering system, and which one a Tamil Nadu restaurant actually needs.',
    category: 'Guide',
    categoryClass: 'bg-[#EEEDFF] text-[#4340D4]',
    tags: ['digital menu', 'QR menu', 'PDF menu', 'NFC menu', 'Tamil Nadu'],
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    author: AUTHOR,
    authorTitle: AUTHOR_TITLE,
    readTime: 6,
    faqSchema: glossaryFaqs,
    content: [
        {
            type: 'p',
            text: 'These terms are used as if they mean the same thing, and they do not. A digital menu is the menu on a screen. A QR menu is a digital menu opened by scanning a code. A PDF menu is a file. NFC is a tap instead of a scan. An ordering system also takes orders and payments.',
        },
        { type: 'p', text: DISCLOSURE },

        { type: 'h2', text: 'What is a digital menu?' },
        {
            type: 'p',
            text: 'A digital menu is your menu shown on a phone, tablet or screen instead of paper. It can hold photos, Tamil and English names, prices and sold-out marks, and you change it from your own phone. It is the content. The QR code or NFC tag is just the doorway to it.',
        },

        { type: 'h2', text: 'What is a QR menu?' },
        {
            type: 'p',
            text: 'A QR menu is a digital menu that customers open by scanning a QR code with the phone camera. No app is needed. One detail matters: a good QR code points to your menu\'s web address, not to a particular version, so the printed code keeps working when you change the menu.',
        },

        { type: 'h2', text: 'What is a PDF menu, and why is it not the same thing?' },
        {
            type: 'p',
            text: 'A PDF menu is your printed menu saved as a file, often behind a QR code. It is quick to make and it is a real improvement over nothing. But it is a picture of a page: the text is small on a phone, it does not switch languages, it cannot show a sold-out mark, and a price change means editing the file and uploading it again.',
        },

        { type: 'h2', text: 'What is an NFC menu?' },
        {
            type: 'p',
            text: 'NFC is the same idea as a QR code, read by tapping a phone on a tag rather than scanning. The tag opens the same menu link. It needs a phone with NFC switched on, so most restaurants that use it keep a QR code beside it.',
        },

        { type: 'h2', text: 'What is an online ordering system?' },
        {
            type: 'p',
            text: 'An ordering system lets customers choose dishes and send the order, often with payment, straight to the kitchen or billing screen. It is a bigger product than a menu, with more setup and usually a higher price or a commission. It is a different decision from putting your menu on a phone.',
        },
        {
            type: 'p',
            text: `What vsite does not do (yet): vsite is a digital menu, read through a QR code, and it does not take orders. ${ORDERING_COMING_SOON_SHORT} Staff take orders exactly as they do now.`,
        },

        { type: 'h2', text: 'How do the five compare?' },
        {
            type: 'table',
            headers: ['Type', 'What it is', 'Updates easily?', 'Tamil and English toggle?', 'Takes orders?'],
            rows: [
                ['Digital menu', 'Menu on a screen', 'Yes', 'Depends on the tool', 'No'],
                ['QR menu', 'Digital menu opened by scanning', 'Yes', 'Depends on the tool', 'No'],
                ['PDF menu', 'Your paper menu as a file', 'No, re-upload', 'No', 'No'],
                ['NFC menu', 'Digital menu opened by tapping', 'Yes', 'Depends on the tool', 'No'],
                ['Online ordering system', 'Menu plus orders and payments', 'Yes', 'Depends on the tool', 'Yes'],
            ],
        },
        { type: 'p', text: 'Last verified: 30 September 2026.' },

        { type: 'h2', text: 'Which one does a Tamil Nadu restaurant need?' },
        {
            type: 'p',
            text: 'For most meals hotels, tiffin centres, cafés and messes, the useful answer is a QR menu built as a proper digital menu: photos, Tamil and English, live prices and sold-out marks. A PDF is a stopgap. NFC is an optional extra. An ordering system is worth considering once the menu itself is working.',
        },
        {
            type: 'ul',
            items: [
                'Your prices change or items finish during the day: you need a menu you can edit from your phone, not a PDF.',
                'Your diners read Tamil, English or both: check that the tool shows both, with real Tamil text and not a picture.',
                'You want a menu first and ordering later: start with the menu, and ask every vendor where ordering sits on their roadmap.',
            ],
        },
        {
            type: 'p',
            text: `If this matches your situation, read the [guide to setting up a digital menu](/guide/digital-menu-setup), look at [QR code menus](/qr-menu) or see the [demo menu](/demo). Pricing is on the [pricing page](/pricing): ₹${PRICE_INR_PER_MONTH} a month with a ${TRIAL_DAYS}-day free trial.`,
        },
        ...faqBlocks(glossaryFaqs),
    ],
};

const mealsFaqs = [
    {
        q: 'How do I show a different lunch menu every day on a QR menu?',
        a: 'Keep your fixed items in categories, and add a "today" category for the daily meals and specials. Edit it each morning from your phone. When something finishes, mark it sold out instead of deleting it.',
    },
    {
        q: 'Can a hostel mess or tiffin centre use a digital menu?',
        a: 'Yes. A mess can list each meal slot as a category with veg and non-veg marks, and update what is being served from a phone. Students or residents scan once to see the day\'s food.',
    },
    {
        q: 'How do I list combo items such as tiffin sets or meals with extras?',
        a: 'Add each combo as its own item with its own price and a short description of what is inside, then put the combos in a category near the top. Customers then see the set before the single items.',
    },
    {
        q: 'Will my regular customers who read only Tamil manage the menu?',
        a: 'Yes, if you check the Tamil names in review. Each dish holds a Tamil and an English name and the diner switches with one tap. Keep Tamil as the first view if most of your customers read Tamil.',
    },
    {
        q: 'Can vsite take orders for my tiffin centre?',
        a: `Not today. ${ORDERING_COMING_SOON_SHORT} Customers read the menu on their phone and order with your staff or at your counter as they do now.`,
    },
];

const mealsPost: BlogPost = {
    slug: 'digital-menu-for-meals-hotels-tiffin-centres-tamil-nadu',
    title: 'Digital menu for meals hotels, tiffin centres and messes in Tamil Nadu',
    description:
        'How a meals hotel, tiffin centre or hostel mess can set up a bilingual Tamil and English digital menu: daily specials, sold-out items, combos and veg and non-veg marks.',
    category: 'Guide',
    categoryClass: 'bg-[#E9F3EC] text-[#2F6B45]',
    tags: ['meals hotel', 'tiffin centre', 'mess', 'digital menu', 'Tamil Nadu'],
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    author: AUTHOR,
    authorTitle: AUTHOR_TITLE,
    readTime: 7,
    faqSchema: mealsFaqs,
    content: [
        {
            type: 'p',
            text: 'A meals hotel, tiffin centre or mess can run a bilingual QR menu by photographing its menu board, checking the Tamil and English names, and adding a "today" category for the daily meals. Items that finish are marked sold out, and combos and veg and non-veg marks are set per dish.',
        },

        { type: 'h2', text: 'Why is a meals or tiffin menu different from a restaurant menu?' },
        {
            type: 'p',
            text: 'A restaurant menu is mostly fixed. A meals hotel or tiffin centre runs on time: tiffin in the morning, meals at noon, snacks and dosa in the evening. Some items exist only for one slot and some only until the batch finishes. The menu has to follow the clock, and a printed card cannot.',
        },
        {
            type: 'p',
            text: 'Many of these places also have a menu that exists only as a wall board or a handwritten slate. That is a good starting point: a photograph of the board is enough for the AI to read.',
        },

        { type: 'h2', text: 'How do I set up a bilingual menu for a meals hotel?' },
        {
            type: 'ol',
            items: [
                'Photograph the board or card. Take one photo per section if the board is large, so the AI reads clean lines.',
                'Let the AI read the dishes and prices, then open the review screen.',
                'Check every Tamil name and every English name. Fix spellings your customers would notice.',
                'Group dishes into categories that match the clock: Tiffin, Meals, Snacks, Evening.',
                'Check the matched photos. Replace any that do not look like your dish.',
                'Print the QR code for the tables and the counter.',
            ],
        },
        {
            type: 'p',
            text: `Setup is typically minutes for a menu of about 40 items and longer for a big menu, because the review is the slow part. The [setup guide](/guide/digital-menu-setup) shows where the time goes. Photos are ${PHOTO_CLAIM.toLowerCase()}, matched to your dish names.`,
        },

        { type: 'h2', text: 'How do I handle daily specials on a QR menu?' },
        {
            type: 'p',
            text: 'Create a category called "Today" or "இன்றைய சிறப்பு" and put the daily meals and specials in it. Each morning, edit the items from your phone: change the dish, the price or both. The QR on the table does not change, so there is nothing to reprint and no sticker to replace.',
        },
        {
            type: 'p',
            text: 'Keep the category near the top, so regulars see what is new before they scroll. If you run a weekly rotation, you can leave the items in place and switch them by marking each one sold out on the days it is not served.',
        },

        { type: 'h2', text: 'How do I mark items as sold out during the day?' },
        {
            type: 'p',
            text: 'Every item has a sold-out switch. When the idli batch finishes or the fish is gone, flip it and the item greys out on every table at the next scan. Flip it back when the next batch is ready. This is faster than deleting and retyping, and the price and photo stay in place.',
        },
        {
            type: 'p',
            text: 'For a busy lunch this matters more than anything else on the list. Staff stop saying "that is finished" at each table, and customers choose from what is actually available.',
        },

        { type: 'h2', text: 'How do I show combos and meal sets?' },
        {
            type: 'ul',
            items: [
                'Add each combo as its own item, such as "Tiffin set" or "Full meals with extra", with its own price.',
                'In the description, say what is inside, for example the dishes or the sides.',
                'Put combos in a category near the top of the relevant time slot.',
                'If a combo has a veg and a non-veg version, list them as two items rather than one with a note.',
            ],
        },

        { type: 'h2', text: 'How do veg and non-veg tags work?' },
        {
            type: 'p',
            text: 'Mark each dish as vegetarian or non-vegetarian in the review screen. The mark appears beside the dish, which is the first thing many families look for. For a strictly vegetarian hotel, say so in a banner so visitors do not have to ask.',
        },

        { type: 'h2', text: 'What does it cost, and what does vsite not do?' },
        {
            type: 'table',
            headers: ['Item', 'vsite'],
            rows: [
                ['Price', `₹${PRICE_INR_PER_MONTH} a month (₹${YEARLY} a year)`],
                ['Free trial', `${TRIAL_DAYS} days`],
                ['Commission on sales', 'None'],
                ['Item cap', 'None'],
                ['Menu edits', 'Unlimited, from your phone'],
            ],
        },
        {
            type: 'p',
            text: `What vsite does not do (yet): ${ORDERING_COMING_SOON_SHORT} Customers read the menu on their phone, and your staff take the order at the table or counter. Last verified: 30 September 2026.`,
        },
        {
            type: 'p',
            text: 'City pages for typical formats: [Chennai](/digital-menu/chennai), [Coimbatore](/digital-menu/coimbatore), [Madurai](/digital-menu/madurai) and [Thanjavur](/digital-menu/thanjavur). See the [demo](/demo) or [pricing](/pricing).',
        },
        ...faqBlocks(mealsFaqs),
    ],
};

const languageFaqs = [
    {
        q: 'Can a diner switch between Tamil and English on a vsite menu?',
        a: 'Yes. Each dish holds a Tamil name and an English name, and the diner switches the menu language with one tap. No app is needed, and both languages live in the same menu and QR code.',
    },
    {
        q: 'How does vsite read Tamil text from a photographed paper menu?',
        a: 'The AI reads the text in the photo, including Tamil, and turns it into items, prices and categories. It can misread characters, especially in handwriting or stylised fonts, so you check every name on a review screen before the menu goes live.',
    },
    {
        q: 'Does vsite support languages other than Tamil and English?',
        a: 'No. Tamil and English are the two menu languages today. Some other tools list many more languages, for example DineCard lists 15+ Indian languages including Tamil, as of September 2026, so choose by the languages your diners read.',
    },
    {
        q: 'What should I check in the review screen for Tamil names?',
        a: 'Check spelling, joined letters and the dish names your regulars actually use. Compare each Tamil name with its English name to make sure they mean the same dish, and check the price next to it.',
    },
    {
        q: 'Do I need to type Tamil on my phone to edit the menu?',
        a: 'Only for new names. Any phone with a Tamil keyboard works. For edits to prices and sold-out marks you do not type Tamil at all.',
    },
];

const languagePost: BlogPost = {
    slug: 'tamil-and-english-digital-menu-how-it-works',
    title: 'Tamil and English digital menu: how it works for diners and owners',
    description:
        'How a bilingual Tamil and English digital menu works: the language toggle diners use, how Tamil text is read from a paper menu, what owners must check in review, and the limits.',
    category: 'Guide',
    categoryClass: 'bg-[#EEEDFF] text-[#4340D4]',
    tags: ['Tamil menu', 'bilingual menu', 'Tamil and English', 'digital menu', 'Tamil Nadu'],
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    author: AUTHOR,
    authorTitle: AUTHOR_TITLE,
    readTime: 7,
    faqSchema: languageFaqs,
    content: [
        {
            type: 'p',
            text: 'On a Tamil and English digital menu, every dish holds both a Tamil name and an English name, and the diner switches between them with one tap. The owner photographs the paper menu, the AI reads it, and the owner checks both names in a review screen before the menu goes live.',
        },

        { type: 'h2', text: 'What does the diner see?' },
        {
            type: 'p',
            text: 'The diner scans the QR code with the normal phone camera and the menu opens in the browser. There is nothing to install. A language control switches the whole menu between Tamil and English, and the choice applies to every dish, category and description at once.',
        },
        {
            type: 'p',
            text: 'That means one table can be read two ways. A grandparent reads the Tamil names on one phone while a grandchild reads English on another, from the same printed code. The owner does not print two cards and does not have to explain a dish twice.',
        },

        { type: 'h2', text: 'How does the owner get Tamil text into the menu?' },
        {
            type: 'p',
            text: 'Most owners start from a paper menu or a wall board. The owner photographs it and the AI reads the text, including Tamil, and turns it into items, prices and categories. The owner can also type or edit any name by hand, using a normal Tamil keyboard on the phone.',
        },
        {
            type: 'ol',
            items: [
                'Take a clear photograph in good light, with the whole menu in frame and no glare.',
                'Let the AI read it. A menu of about 40 items typically takes minutes; a big menu takes longer.',
                'Open the review screen and go through every item.',
                'Correct anything the AI misread, then confirm the menu.',
            ],
        },

        { type: 'h2', text: 'What can go wrong with Tamil text?' },
        {
            type: 'p',
            text: 'Reading Tamil from a photo is harder than reading plain English print. The AI can misread characters where letters join, in handwriting, on faded boards, and in decorative fonts. A wrong letter can change the meaning of a dish name or make it unreadable to a customer. This is why review is not optional.',
        },
        {
            type: 'ul',
            items: [
                'Handwritten boards are the most likely to need corrections.',
                'Dish names written in Tamil script in a stylised font may be read less accurately than plain print.',
                'Prices are usually read well, but check every one, because a wrong price is the costliest mistake.',
                'A dish may be read correctly but given an English name that is not how your customers say it. Rename it.',
            ],
        },

        { type: 'h2', text: 'What should I check in the review screen?' },
        {
            type: 'table',
            headers: ['Check', 'Why it matters'],
            rows: [
                ['Tamil spelling of each dish', 'A misread letter can make the name unreadable or change it'],
                ['English name matches the Tamil name', 'The two must describe the same dish'],
                ['Price beside each item', 'A wrong price is the costliest error'],
                ['Category of each item', 'Customers look in the section they expect'],
                ['Veg or non-veg mark', 'Families look for it first'],
                ['Photo matched to the dish', `Photos are ${PHOTO_CLAIM.toLowerCase()}, so replace any that do not look like your dish`],
            ],
        },
        { type: 'p', text: 'Last verified: 30 September 2026.' },

        { type: 'h2', text: 'Which languages does vsite offer, and which does it not?' },
        {
            type: 'p',
            text: 'vsite offers Tamil and English. It does not offer Hindi, Telugu, Kannada, Malayalam or French. If many of your diners read those languages first, tell them so and use photos and short English descriptions, or consider a tool that lists more languages. DineCard, for example, lists 15+ Indian languages including Tamil, as of September 2026.',
        },
        {
            type: 'p',
            text: 'Which one is right depends on your diners. For most Tamil Nadu restaurants, Tamil and English cover nearly every customer. Border towns such as Hosur, and tourist towns, are where the limit is most likely to matter.',
        },

        { type: 'h2', text: 'Who should be the default language?' },
        {
            type: 'p',
            text: 'Choose by who walks in. A local meals hotel with regulars who read Tamil should lead with Tamil. A café near a college or an office district can lead with English. A tourist-facing restaurant is usually English first. Either way, the other language is one tap away.',
        },
        {
            type: 'p',
            text: `What vsite does not do (yet): ${ORDERING_COMING_SOON_SHORT} Diners read the menu in their language and order with your staff as they do now. Support is in Tamil on WhatsApp at ${CONTACT.whatsapp}.`,
        },
        {
            type: 'p',
            text: `${DISCLOSURE} To see a bilingual menu, open the [demo](/demo). Setup is explained in the [setup guide](/guide/digital-menu-setup), and plans are on the [pricing page](/pricing). For a city view, see [Chennai](/digital-menu/chennai) or [Ooty](/digital-menu/ooty).`,
        },
        ...faqBlocks(languageFaqs),
    ],
};

const chooseFaqs = [
    {
        q: 'What is the most important question to ask a digital menu vendor?',
        a: 'Ask what you pay after the trial ends and what is limited on that plan. Price after the trial, item caps and language support decide most of the real cost and fit for a Tamil Nadu restaurant.',
    },
    {
        q: 'Should I pick the cheapest digital menu software?',
        a: 'Not automatically. The lowest price can exclude photos, Tamil, a large menu or a feature you need. As of September 2026, DineCard lists ₹99 a month. Compare what is included, then price.',
    },
    {
        q: 'Can I test several tools before choosing?',
        a: `Yes, and you should. Trials run ${TRIAL_DAYS} days at vsite and 14 days at DineCard and Menulite, as of September 2026. Build your real menu in each, and ask each the same ten questions.`,
    },
    {
        q: 'How do I avoid being locked in to one vendor?',
        a: 'Keep your own copy of your item names, prices and photos, and ask each vendor what you can export. If a vendor cannot tell you, assume you will have to rebuild the menu if you leave.',
    },
];

const choosePost: BlogPost = {
    slug: 'how-to-choose-digital-menu-software-tamil-nadu-10-questions',
    title: 'How to choose digital menu software in Tamil Nadu: 10 questions to ask',
    description:
        'Ten questions to ask any digital menu vendor before you pay: item caps, Tamil, WhatsApp support, trial, price after trial, ordering, photos, exports, printing the QR and GST. With vsite\'s answers.',
    category: 'Guide',
    categoryClass: 'bg-[#F2EDE4] text-[#6B5B3E]',
    tags: ['choose digital menu software', 'checklist', 'Tamil Nadu', 'restaurant software'],
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    author: AUTHOR,
    authorTitle: AUTHOR_TITLE,
    readTime: 8,
    faqSchema: chooseFaqs,
    content: [
        {
            type: 'p',
            text: 'Ask every digital menu vendor the same ten questions: is there an item cap, is Tamil supported, who answers on WhatsApp, how long is the trial, what is the price after it, is ordering planned, where do photos come from, can I export, how do I print the QR, and is there GST billing.',
        },
        { type: 'p', text: `${DISCLOSURE} The answers below are vsite's. Put the same questions to every vendor, including us.` },

        { type: 'h2', text: '1. Is there a cap on the number of items?' },
        {
            type: 'p',
            text: 'Cheaper plans sometimes limit how many dishes you can list, and a large menu with portions and variations reaches a cap faster than you expect. vsite has no item cap. Ask every vendor for the limit in writing, and count your own items first.',
        },

        { type: 'h2', text: '2. Does it support Tamil properly?' },
        {
            type: 'p',
            text: 'Do not accept a feature list. Open a live menu in the vendor\'s demo on your own phone and read Tamil dish names. vsite offers Tamil and English, with a one-tap toggle. Other tools also support Tamil, including DineCard, Menulite, MenuKard, AviQR and eMenuQR, per their own sites, as of September 2026.',
        },

        { type: 'h2', text: '3. Who answers when something breaks, and in what language?' },
        {
            type: 'p',
            text: `A menu problem at 12:30 on a Sunday needs an answer, not a ticket number. vsite supports owners in Tamil on WhatsApp at ${CONTACT.whatsapp}. Ask every vendor who answers, in which language, and during which hours.`,
        },

        { type: 'h2', text: '4. How long is the free trial?' },
        {
            type: 'p',
            text: `vsite gives ${TRIAL_DAYS} days free and needs no card. DineCard and Menulite list 14 days, as of September 2026. A longer trial is better because you want a full week, including a weekend, of real service before you pay.`,
        },

        { type: 'h2', text: '5. What do I pay after the trial, and how is it billed?' },
        {
            type: 'p',
            text: `vsite is ₹${PRICE_INR_PER_MONTH} a month (₹${YEARLY} a year). Some plans are cheaper per month only when billed annually, for example Menulite's Starter at ₹799 a month billed annually, or ₹899 if paid monthly. Ask for the total you will pay in year one.`,
        },

        { type: 'h2', text: '6. Is ordering planned, and what does it cost?' },
        {
            type: 'p',
            text: `What vsite does not do (yet): ${ORDERING_COMING_SOON_SHORT} It is planned at no extra cost inside the same ₹${PRICE_INR_PER_MONTH} plan. Ask every vendor what is live today versus promised, and what they charge on payments when ordering is on.`,
        },

        { type: 'h2', text: '7. Where do the food photos come from?' },
        {
            type: 'p',
            text: `vsite gives ${PHOTO_CLAIM}, matched to your dish names; you can replace any of them. Some tools leave photography to you. Ask whether photos are included and who owns them.`,
        },

        { type: 'h2', text: '8. Can I export my menu if I leave?' },
        {
            type: 'p',
            text: 'Ask it of every vendor, and get the answer before you build your menu. Keep your own copy of item names, prices and photos either way. If you are a vsite customer or considering it, ask on WhatsApp what export options exist today rather than relying on a general claim from us.',
        },

        { type: 'h2', text: '9. How do I print the QR, and does it break when the menu changes?' },
        {
            type: 'p',
            text: 'A QR code should point to your menu\'s address, not to a version of it. With vsite the printed code keeps working when you change prices, add dishes or change the design. Ask whether any other tool makes you reprint when you change a setting.',
        },

        { type: 'h2', text: '10. Does it handle GST billing?' },
        {
            type: 'p',
            text: 'vsite supports GST-compliant billing fields for its own subscription. If you need a GST invoice for the subscription, say so during the trial. Ask every vendor whether their invoice carries your GSTIN.',
        },

        { type: 'h2', text: 'How do the answers compare at a glance?' },
        {
            type: 'table',
            headers: ['Question', 'vsite', 'DineCard (published)', 'Menulite (published)'],
            rows: [
                ['Price', `₹${PRICE_INR_PER_MONTH} a month`, '₹99 a month, ₹999 a year', 'Starter ₹799 a month billed annually (₹899 monthly)'],
                ['Trial', `${TRIAL_DAYS} days`, '14 days', '14 days'],
                ['Tamil', 'Yes (Tamil and English)', 'Yes (15+ Indian languages)', 'Yes'],
                ['Item cap', 'None', 'Ask the vendor', 'Ask the vendor'],
                ['Ordering', 'Coming soon, not live', 'Ask the vendor', 'Pro plan ₹1,399 to ₹1,499 includes ordering'],
            ],
        },
        { type: 'p', text: 'Last verified: 30 September 2026, from each vendor\'s published pages. Confirm before deciding.' },
        {
            type: 'p',
            text: 'Compare in detail on [vsite vs DineCard](/vs/dinecard) and [vsite vs MenuScan](/vs/menuscan), or read the [best digital menu software in India](/best-digital-menu-software-india) overview. The [setup guide](/guide/digital-menu-setup) and [pricing](/pricing) explain the rest.',
        },
        ...faqBlocks(chooseFaqs),
    ],
};

const setupFaqs = [
    {
        q: 'How long does it take to set up a digital menu?',
        a: 'Typically minutes for a menu of about 40 items, and longer for big menus. The photograph and the AI read are quick. Reviewing every name and price is the slow part, so the time scales with the number of items.',
    },
    {
        q: 'What is the slowest step in building a digital menu?',
        a: 'The review. The AI reads your menu quickly, but you should check every name, price and category, because a wrong price or a garbled Tamil name is what customers notice. Budget your time for this step.',
    },
    {
        q: 'Can I go live before the menu is perfect?',
        a: 'Yes. Fix prices and names first, then improve photos and design later. The QR address stays the same, so you can print and place it while you keep polishing.',
    },
    {
        q: 'Do I need to print anything to start?',
        a: 'You need the QR code somewhere customers can scan it, such as a printed sheet, a sticker or a table stand. The menu can be tested on your own phone before you print anything.',
    },
    {
        q: 'Does vsite setup include ordering?',
        a: `No. ${ORDERING_COMING_SOON_SHORT} Setup covers the menu: items, prices, photos, languages, design and the QR code.`,
    },
];

const setupPost: BlogPost = {
    slug: 'digital-menu-setup-time-what-really-takes-time',
    title: 'Digital menu setup time: what really takes time',
    description:
        'An honest breakdown of where the time goes when you build a digital menu: the photograph, the AI read, reviewing items, design choices and printing the QR. No made-up minute counts.',
    category: 'Guide',
    categoryClass: 'bg-[#EAF0F4] text-[#3D5A6C]',
    tags: ['digital menu setup', 'setup time', 'AI menu extraction', 'Tamil Nadu'],
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    author: AUTHOR,
    authorTitle: AUTHOR_TITLE,
    readTime: 6,
    faqSchema: setupFaqs,
    content: [
        {
            type: 'p',
            text: 'Setup is typically minutes for a menu of about 40 items, and longer for big menus. Most of that time is not the AI reading your menu, which is quick. It is you reviewing every name and price, because a wrong price or garbled Tamil name is the error customers notice.',
        },
        {
            type: 'p',
            text: 'We do not quote a precise minute count for every restaurant, because it depends on your menu and how carefully you review. Here is where the time goes, in order.',
        },

        { type: 'h2', text: 'How long does taking the photograph take?' },
        {
            type: 'p',
            text: 'Seconds, if the menu is one card. A longer menu needs one photo per section. The time that matters here is getting a clear shot: good light, the whole page in frame and no glare. A blurry photo means a worse read and a longer review, so retake it rather than fix errors later.',
        },

        { type: 'h2', text: 'How long does the AI take to read the menu?' },
        {
            type: 'p',
            text: 'The AI reads the dishes, prices and categories from the photo and builds the menu. For a typical menu this is the quickest step, and you can leave it while it works. Large menus and handwritten boards take longer and need more review afterwards.',
        },

        { type: 'h2', text: 'Why is reviewing the slowest step?' },
        {
            type: 'p',
            text: 'Because it is the step only you can do. The AI can misread a price, merge two dishes or miss a Tamil letter. You are the only one who knows what the dish is called and what it should cost. Count the items, and expect review time to grow with them.',
        },
        {
            type: 'ul',
            items: [
                'Check every price first. A wrong price is the costliest mistake.',
                'Check Tamil and English names side by side.',
                'Check categories, so diners find dishes where they expect them.',
                'Set veg and non-veg marks.',
                'Delete duplicates and items you no longer serve.',
            ],
        },

        { type: 'h2', text: 'How long do photos and design take?' },
        {
            type: 'p',
            text: `Photos are ${PHOTO_CLAIM.toLowerCase()}, matched to your dish names, so you do not shoot each one. You still glance through them and replace any that do not look like your dish. Choosing a design is quick: there are three to pick from, and you can change it later without touching the QR.`,
        },

        { type: 'h2', text: 'How long does printing the QR take?' },
        {
            type: 'p',
            text: 'Downloading and printing the code is fast. The real delay, if any, is getting it printed or made into a sticker or stand. Because the QR points to your menu\'s address and not to a version, you can print it early and keep editing behind it.',
        },

        { type: 'h2', text: 'Where does the time go, step by step?' },
        {
            type: 'table',
            headers: ['Step', 'How long it usually takes', 'What makes it longer'],
            rows: [
                ['Photograph the menu', 'Short', 'Poor light, glare, a long menu in many sections'],
                ['AI reads the menu', 'Short, runs while you wait', 'Large menus, handwriting, faded boards'],
                ['Review names and prices', 'The longest step; grows with item count', 'Many items, Tamil text that needs fixing, handwritten prices'],
                ['Check matched photos', 'Short to medium', 'Unusual local dishes that need a replacement photo'],
                ['Choose design', 'Short', 'Indecision between three designs'],
                ['Print the QR', 'Short to download; printing depends on your printer or shop', 'Waiting for stickers or stands'],
            ],
        },
        { type: 'p', text: 'Last verified: 30 September 2026. This is a qualitative guide; vsite does not publish a measured setup time.' },

        { type: 'h2', text: 'How can I make setup faster?' },
        {
            type: 'ol',
            items: [
                'Clean up your paper menu first: remove dishes you no longer make.',
                'Photograph in daylight, one section at a time.',
                'Review in one sitting, with a colleague who reads the Tamil names.',
                'Go live with the core menu, then add photos and details later.',
                'Use the free trial for the first build, so you learn where the time goes before you pay.',
            ],
        },
        {
            type: 'p',
            text: `What vsite does not do (yet): ${ORDERING_COMING_SOON_SHORT} Setup covers the menu, not ordering. The trial is ${TRIAL_DAYS} days and the plan is ₹${PRICE_INR_PER_MONTH} a month.`,
        },
        {
            type: 'p',
            text: `${DISCLOSURE} Step-by-step detail is in the [digital menu setup guide](/guide/digital-menu-setup) and the [cost and time guide](/guide/cost-and-time). See the [demo](/demo), [features](/features) or [pricing](/pricing).`,
        },
        ...faqBlocks(setupFaqs),
    ],
};

export const seoPosts: BlogPost[] = [pricePost, glossaryPost, mealsPost, languagePost, choosePost, setupPost];
