/**
 * City landing pages — the Tamil Nadu coverage layer.
 *
 * ─── WHY THESE EXIST ─────────────────────────────────────────────────────────
 * The sitemap carried 101 URLs and not one location page. "digital menu
 * Chennai", "QR menu Coimbatore", "hotel menu Madurai" are the highest-intent,
 * lowest-competition queries this product has, and they are also what a diner
 * or owner actually types — and increasingly says, in Tamil, into a phone.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ─── THESE ARE NOT DOORWAY PAGES ─────────────────────────────────────────────
 * A page per city with the name swapped is spam. Google says so explicitly, it
 * reads as spam to a human, and an AI engine will not cite it because there is
 * nothing in it to quote. So every entry below carries facts that are true of
 * THAT city and false of the others: the food it is known for, the streets and
 * areas where its restaurants actually are, what its menus look like, and a
 * question its owners specifically ask.
 *
 * The rule for adding one: if you cannot write `knownFor`, `areas` and
 * `localTruth` without looking anything up, you do not know the city well
 * enough to publish a page about it. Leave it out. Thirteen real pages beat
 * thirty-eight hollow ones — for rankings, for citations, and for the owner who
 * reads it and decides whether you understand his business.
 */

export interface CityPage {
    /** URL slug: /digital-menu-<slug> */
    slug: string;
    /** English name, as used in copy. */
    city: string;
    /** Tamil name — used in copy and schema so vernacular queries can match. */
    tamil: string;
    /** District, where it differs from the city name. */
    district?: string;
    /** The food this place is genuinely known for. */
    knownFor: string;
    /** Real areas where the restaurants are. Three is enough. */
    areas: string[];
    /**
     * One thing true about menus in this city that would not be true elsewhere.
     * This is the sentence that makes the page worth reading — and the passage
     * an AI engine is most likely to quote.
     */
    localTruth: string;
    /** The question owners in this city actually ask. */
    localFaq: { q: string; a: string };
}

export const CITY_PAGES: CityPage[] = [
    {
        slug: 'chennai',
        city: 'Chennai',
        tamil: 'சென்னை',
        knownFor: 'filter coffee, Chettinad meals, and a restaurant scene that runs from Sowcarpet chaat to T. Nagar fine dining',
        areas: ['T. Nagar', 'Anna Nagar', 'Besant Nagar'],
        localTruth:
            'Chennai menus carry more variety per page than anywhere else in the state — a single Anna Nagar restaurant may run South Indian tiffin, North Indian gravies, Chinese and a separate biryani list. That is four categories a paper menu handles badly and a digital menu handles by letting the diner filter to the one they came for.',
        localFaq: {
            q: 'Do Chennai restaurants need a Tamil menu if most customers read English?',
            a: 'Most Chennai restaurants serve both. The practical answer is that Tamil costs nothing to add on vsite — dish names appear in both languages and the diner switches with one tap — and it matters most for the customers least likely to ask for help reading the menu.',
        },
    },
    {
        slug: 'coimbatore',
        city: 'Coimbatore',
        tamil: 'கோயம்புத்தூர்',
        knownFor: 'Kongunadu food, arisi paruppu sadam, and one of the densest café scenes outside Chennai',
        areas: ['R.S. Puram', 'Peelamedu', 'Race Course'],
        localTruth:
            'Coimbatore has an unusual split: traditional Kongu meals hotels that have run the same menu for decades, and a young café belt around Race Course that changes its menu every few weeks. The second group reprints menus constantly, and that reprinting bill is the single clearest reason to go digital here.',
        localFaq: {
            q: 'Can I change my café menu weekly without reprinting in Coimbatore?',
            a: 'Yes — that is the main reason Coimbatore cafés move to vsite. You change a price or add a special from your phone and every QR code on every table shows it immediately. The printed QR sticker never changes, so nothing on the table needs replacing.',
        },
    },
    {
        slug: 'madurai',
        city: 'Madurai',
        tamil: 'மதுரை',
        district: 'Madurai',
        knownFor: 'jigarthanda, kari dosai, and mess food served late into the night',
        areas: ['Simmakkal', 'Anna Nagar', 'K.K. Nagar'],
        localTruth:
            'Madurai eats late, and much of its trade happens at messes and stalls where the menu is a board on the wall rather than a card on the table. A QR menu is often the first written, priced menu those customers have ever seen — which matters most for the visitor who does not know what jigarthanda costs and will not ask.',
        localFaq: {
            q: 'My mess has no printed menu at all, only a board. Is vsite still useful?',
            a: 'Especially then. Photograph the board and vsite reads it into a digital menu with prices and photos. Customers see what a dish looks like before ordering, and you change the board and the menu from the same phone.',
        },
    },
    {
        slug: 'tiruchirappalli',
        city: 'Tiruchirappalli',
        tamil: 'திருச்சிராப்பள்ளி',
        district: 'Trichy',
        knownFor: 'Trichy-style biryani, kadai dosai, and hotels serving pilgrims and students in equal number',
        areas: ['Thillai Nagar', 'Srirangam', 'Cantonment'],
        localTruth:
            'Trichy runs on two clocks — Srirangam temple footfall that peaks around darshan hours, and a student population near the colleges that eats at entirely different times. Restaurants serving both often want different items visible at different hours, which is a sold-out toggle rather than a reprint.',
        localFaq: {
            q: 'Can I hide items that are only available at certain times?',
            a: 'Yes. Mark an item sold out and it greys out on every table instantly, then bring it back with one tap. Trichy hotels use this for breakfast items after 11am rather than printing separate menus.',
        },
    },
    {
        slug: 'salem',
        city: 'Salem',
        tamil: 'சேலம்',
        knownFor: 'Salem-style thattu vadai set, mutton curry and a strong sago and textile-town lunch trade',
        areas: ['Fairlands', 'Hasthampatti', 'Five Roads'],
        localTruth:
            'Salem restaurants serve a heavily repeat local trade rather than tourists, which changes what the menu is for: regulars already know what they want, so the menu earns its place by showing what is new and what is finished, not by listing everything.',
        localFaq: {
            q: 'My customers are regulars who know the menu. What does a digital menu add?',
            a: 'Two things regulars actually use: seeing immediately what is sold out today, and seeing the specials you have added. Both change daily, and both are invisible on a printed card.',
        },
    },
    {
        slug: 'tirunelveli',
        city: 'Tirunelveli',
        tamil: 'திருநெல்வேலி',
        knownFor: 'halwa, Nellai-style parotta and mutton, and iruttu kadai sweets',
        areas: ['Town', 'Palayamkottai', 'Junction'],
        localTruth:
            'Tirunelveli sells a lot of halwa to people who are not from Tirunelveli. Sweet shops and hotels here get steady outside footfall who need photographs and prices before they buy, because they do not know the product.',
        localFaq: {
            q: 'I run a sweet shop, not a restaurant. Does vsite work for me?',
            a: 'Yes. Sweet shops and bakeries use the same menu — items, weights, prices and photos. Photos matter more for you than for a restaurant, because a visitor buying halwa for the first time is choosing entirely by sight.',
        },
    },
    {
        slug: 'erode',
        city: 'Erode',
        tamil: 'ஈரோடு',
        knownFor: 'Kongu meals, turmeric-market trade lunches and roadside biryani',
        areas: ['Perundurai Road', 'Brough Road', 'R.N. Pudur'],
        localTruth:
            'Erode restaurants feed a market town — traders eating fast, at fixed hours, often the same order daily. Speed of ordering matters more than browsing, so the value here is a menu that loads in two seconds on a mid-range phone, not one that looks impressive.',
        localFaq: {
            q: 'Will the menu load quickly on an ordinary phone and slow data?',
            a: 'That is what it is built for. The menu is a lightweight web page that opens in about two seconds on 4G, with no app to download and nothing to install.',
        },
    },
    {
        slug: 'vellore',
        city: 'Vellore',
        tamil: 'வேலூர்',
        knownFor: 'hotels serving CMC patients and attendants, biryani and North Indian food for out-of-state visitors',
        areas: ['Katpadi', 'Bagayam', 'Officers Line'],
        localTruth:
            'Vellore has more non-Tamil-speaking customers than almost any comparable town, because CMC draws patients and families from across India and abroad. Restaurants near the hospital constantly explain dishes to people who cannot read a Tamil menu and have never eaten the food.',
        localFaq: {
            q: 'Many of my customers do not read Tamil. Does the menu help them?',
            a: 'Every dish carries an English name, a description and a photo, so a visitor who has never eaten a particular dish can see what it is before ordering. That removes most of the explaining your staff currently do at the table.',
        },
    },
    {
        slug: 'thoothukudi',
        city: 'Thoothukudi',
        tamil: 'தூத்துக்குடி',
        district: 'Thoothukudi',
        knownFor: 'macaroons, seafood and port-town fish curry',
        areas: ['Palayamkottai Road', 'Bryant Nagar', 'Millerpuram'],
        localTruth:
            'Seafood menus change with the catch, which is the hardest thing a printed menu can be asked to do. A Thoothukudi restaurant printing fish prices is printing a guess; a digital menu lets today’s price be today’s price.',
        localFaq: {
            q: 'My fish prices change with the market. Can the menu keep up?',
            a: 'Yes — change a price from your phone and every table sees it on the next scan. Restaurants with market-linked prices are the clearest case for a digital menu, because a printed price is out of date the day it is printed.',
        },
    },
    {
        slug: 'thanjavur',
        city: 'Thanjavur',
        tamil: 'தஞ்சாவூர்',
        knownFor: 'traditional Thanjavur meals, temple-town tiffin and a steady tourist trade',
        areas: ['Big Temple area', 'South Rampart', 'Medical College Road'],
        localTruth:
            'Thanjavur restaurants serve a rotating cast of visitors who will eat there once. There is no benefit in a menu regulars have memorised; the entire job is helping a stranger choose quickly and confidently, which is exactly what photographs do.',
        localFaq: {
            q: 'Most of my customers are tourists eating here once. What should my menu show?',
            a: 'Photos and clear descriptions of your signature dishes, marked as recommended. vsite generates a photo for every dish and lets you flag your best sellers so a first-time visitor sees them first.',
        },
    },
    {
        slug: 'tiruppur',
        city: 'Tiruppur',
        tamil: 'திருப்பூர்',
        knownFor: 'fast lunch trade for garment workers, Kongu meals and late-night biryani',
        areas: ['Kumaran Road', 'Palladam Road', 'Avinashi Road'],
        localTruth:
            'Tiruppur eats to a factory shift pattern — huge volume in narrow windows. Menus here are read in seconds by people with limited time, and anything that slows the choice costs a table turn.',
        localFaq: {
            q: 'We are extremely busy at lunch. Will a QR menu slow service down?',
            a: 'It usually speeds it up, because customers read and decide while they are being seated instead of waiting for a menu card to be free. Your staff still take the order exactly as they do now.',
        },
    },
    {
        slug: 'kanyakumari',
        city: 'Kanyakumari',
        tamil: 'கன்னியாகுமரி',
        knownFor: 'seafood, Kerala-influenced dishes and a tourist trade at sunrise and sunset',
        areas: ['Beach Road', 'Main Road', 'Kovalam Road'],
        localTruth:
            'Kanyakumari is almost entirely a visitor market, and its restaurants face a menu problem most do not: customers arrive from every state in India and abroad, with no shared assumption about what any dish contains.',
        localFaq: {
            q: 'My customers come from all over India. How does a digital menu help?',
            a: 'Photographs and written descriptions do the work your staff currently do by explaining. Vegetarian and non-vegetarian marks appear on every dish, which visitors look for first.',
        },
    },
    {
        slug: 'ooty',
        city: 'Ooty',
        tamil: 'உதகமண்டலம்',
        district: 'Nilgiris',
        knownFor: 'hill-station cafés, homemade chocolate and varkey, and a strong seasonal tourist trade',
        areas: ['Charing Cross', 'Commercial Road', 'Coonoor Road'],
        localTruth:
            'Ooty runs a season. Menus, prices and even opening hours change between peak and off-season, and printing for a season you are not sure about is exactly the cost a digital menu removes.',
        localFaq: {
            q: 'My menu and prices change between season and off-season. Is that a problem?',
            a: 'No — change them as often as you like at no extra cost. Many Nilgiris cafés keep two versions and switch over in a few minutes when the season turns.',
        },
    },
];

export const CITY_SLUGS = CITY_PAGES.map((c) => c.slug);

export function getCityPage(slug: string): CityPage | undefined {
    return CITY_PAGES.find((c) => c.slug === slug);
}
