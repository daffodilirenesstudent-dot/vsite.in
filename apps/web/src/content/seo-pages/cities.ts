/**
 * City landing pages: the Tamil Nadu coverage layer.
 *
 * "digital menu Chennai", "QR menu Coimbatore", "hotel menu Madurai" are the
 * queries an owner actually types, and increasingly says in Tamil into a phone.
 *
 * ─── THESE ARE NOT DOORWAY PAGES ─────────────────────────────────────────────
 * A page per city with the name swapped is spam, and an AI engine has nothing
 * to quote from it. Every entry carries text that is true of THAT city and not
 * of the others: its own opening answer, the kinds of food business typical
 * there, a menu-setup scenario for that city's format, a language note and
 * questions worded for that city. Acceptance test `seo-content.test.ts` fails
 * if any of those repeat across cities.
 *
 * Content rules: general, widely known, non-numerical local knowledge only. No
 * restaurant counts, rankings, local statistics or named local businesses, and
 * never "we serve <city>". The shared parts (price, trial, what the product
 * does) are identical everywhere because they ARE the same everywhere.
 *
 * The rule for adding one: if you cannot write `knownFor`, `businesses` and
 * `scenario` without looking anything up, leave the city out.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface CityPage {
    /** URL slug: /digital-menu/<slug> */
    slug: string;
    /** English name, as used in copy. */
    city: string;
    /** Tamil name, used in copy and schema so vernacular queries can match. */
    tamil: string;
    /** District, where it differs from the city name. */
    district?: string;
    /** Defaults to Tamil Nadu. Set only where that would be wrong. */
    region?: string;
    /** Food this place is widely known for (general knowledge, no numbers). */
    knownFor: string;
    /** Well-known areas. Three is enough. */
    areas: string[];
    /** Answer-first opening paragraph, 40-60 words, unique to the city. */
    intro: string;
    /** The kinds of food business typical here, one sentence. */
    businesses: string;
    /** One thing true about menus in this city that is not true elsewhere. */
    localTruth: string;
    /** A menu-setup scenario for the city's typical format. */
    scenario: string;
    /** How Tamil and English menus matter for this city's diners. */
    languageNote: string;
    /** The question owners in this city actually ask. */
    localFaq: { q: string; a: string };
    /** Two more questions, worded for this city. */
    extraFaqs: { q: string; a: string }[];
}

import { MORE_CITY_PAGES } from './citiesMore';

const CORE_CITY_PAGES: CityPage[] = [
    {
        slug: 'chennai',
        city: 'Chennai',
        tamil: 'சென்னை',
        knownFor: 'filter coffee, Chettinad meals, and a restaurant scene that runs from Sowcarpet chaat to T. Nagar fine dining',
        areas: ['T. Nagar', 'Anna Nagar', 'Besant Nagar'],
        intro:
            'A Chennai restaurant can put its menu on a QR code for Rs 299 a month. Photograph the paper menu, let the AI read it, check the prices, and print the QR. Diners read it in Tamil or English, and you change any price from your phone without reprinting.',
        businesses:
            'Chennai has everything from tiffin hotels and filter-coffee counters to multi-cuisine family restaurants, biryani specialists, bakeries, cloud kitchens and cafés, often several formats on one street.',
        localTruth:
            'Chennai menus carry more variety per page than most of the state. A single Anna Nagar restaurant may run South Indian tiffin, North Indian gravies, Chinese and a separate biryani list. That is four categories a paper menu handles badly and a digital menu handles by letting the diner jump to the one they came for.',
        scenario:
            'Take a multi-cuisine family restaurant with four sections. Photograph each section on its own so the AI reads clean categories, then review the Tamil and English names side by side. Put biryani and tiffin in separate categories so a diner on a phone reaches either in one tap. Mark the day\'s unavailable items as sold out instead of crossing them out on a card.',
        languageNote:
            'Chennai diners read English comfortably but often speak Tamil, and office groups and visiting relatives are mixed. A menu that shows both names lets the younger diner read in English and the grandparent read in Tamil from the same QR.',
        localFaq: {
            q: 'Do Chennai restaurants need a Tamil menu if most customers read English?',
            a: 'Most Chennai restaurants serve both kinds of reader. Tamil costs nothing extra on vsite because you can type each dish name in Tamil, English or both on the same menu. It matters most for the customers least likely to ask for help reading the menu.',
        },
        extraFaqs: [
            {
                q: 'I run a cloud kitchen in Chennai with no dining room. Do I need a QR menu?',
                a: 'A QR menu still helps if you share one link on WhatsApp, Instagram or Google instead of a PDF, because the link always shows current prices and sold-out items. The printed QR is for dine-in and pickup counters, so skip printing it if you have neither.',
            },
            {
                q: 'My Chennai restaurant has two outlets with slightly different menus. Can vsite handle that?',
                a: 'Yes, vsite supports multiple outlets, so each branch can hold its own items and prices under one account. That suits a business with a shared core menu and local variations between neighbourhoods.',
            },
        ],
    },
    {
        slug: 'coimbatore',
        city: 'Coimbatore',
        tamil: 'கோயம்புத்தூர்',
        knownFor: 'Kongunadu food, arisi paruppu sadam, and one of the densest café scenes outside Chennai',
        areas: ['R.S. Puram', 'Peelamedu', 'Race Course'],
        intro:
            'Coimbatore cafés and meals hotels can publish a Tamil and English QR menu for Rs 299 a month, with a 7-day free trial. Seasonal café menus are edited from a phone in minutes, and long-running Kongu meals hotels keep their familiar dish names in Tamil.',
        businesses:
            'Coimbatore mixes long-established Kongu meals hotels, bakeries and snack shops with a young café, dessert and bistro belt, plus hostel messes and tiffin centres serving its many colleges and industries.',
        localTruth:
            'Coimbatore has an unusual split: traditional Kongu meals hotels that have run the same menu for decades, and a young café belt around Race Course that changes its menu every few weeks. The second group reprints constantly, and that reprinting bill is the clearest reason to go digital here.',
        scenario:
            'A Race Course café that rotates a seasonal menu keeps a base list of coffees and all-day plates, then adds a "this month" category from the phone. When the season ends, mark those items sold out or delete them. Nothing is reprinted and the QR on the table stays the same.',
        languageNote:
            'Coimbatore meals hotels often have regulars who read Tamil only, while college and IT crowds in cafés read English first. Two names per dish let one menu serve both without printing two cards.',
        localFaq: {
            q: 'Can I change my café menu every few weeks without reprinting in Coimbatore?',
            a: 'Yes. You edit an item or add a special from your phone and every table sees it on its next scan. The printed QR never changes, so there is nothing on the table to replace when the menu rotates.',
        },
        extraFaqs: [
            {
                q: 'My Coimbatore hotel has run the same menu for decades. Is it worth switching?',
                a: 'The gain is smaller for a fixed menu, but price changes still cost a reprint on paper. Ingredient costs move, and a digital price edit is a minute of work. Many owners start by keeping the paper card and adding the QR beside it.',
            },
            {
                q: 'Does vsite work for hostel messes near the colleges in Coimbatore?',
                a: 'Yes. A mess can publish a weekly meal plan as a menu, with veg and non-veg marks and sold-out toggles for items that finish early. Students scan once and see what is being served without asking the counter.',
            },
        ],
    },
    {
        slug: 'madurai',
        city: 'Madurai',
        tamil: 'மதுரை',
        district: 'Madurai',
        knownFor: 'jigarthanda, kari dosai, and mess food served late into the night',
        areas: ['Simmakkal', 'Anna Nagar', 'K.K. Nagar'],
        intro:
            'A Madurai hotel, mess or café can turn its menu or wall board into a QR menu for Rs 299 a month. Photograph the board, check the prices the AI reads, and pilgrims and visitors see dishes, photos and prices in Tamil or English before they ask.',
        businesses:
            'Madurai has late-night messes and street-side hotels, kari dosai and parotta shops, jigarthanda and sweet counters, and hotel-restaurants serving the steady flow of temple visitors.',
        localTruth:
            'Madurai eats late, and much of its trade happens at messes and stalls where the menu is a board on the wall rather than a card on the table. A QR menu is often the first written, priced menu those customers have seen, which matters most to a visitor who does not know what jigarthanda costs and will not ask.',
        scenario:
            'A hotel-restaurant near the temple area runs three services: early tiffin, a meals lunch and a late-night parotta counter. Set up one category per service and mark breakfast items sold out after the morning rush. Visiting families scanning at the table see what is on now rather than the whole day\'s list.',
        languageNote:
            'Madurai locals read Tamil, while visitors from other states and abroad usually need English. Because each dish can carry both names and a photo, a family unfamiliar with kari dosai can work out what it is without staff explaining it.',
        localFaq: {
            q: 'My mess has no printed menu at all, only a board. Is vsite still useful?',
            a: 'Especially then. Photograph the board and vsite reads it into a digital menu with prices. You add photos matched from a curated library, and you change the board and the menu from the same phone.',
        },
        extraFaqs: [
            {
                q: 'Is a QR menu useful for a small Madurai jigarthanda or sweet shop?',
                a: 'Yes. Drinks and sweets are chosen by sight, so a photo and price per item helps a first-time visitor decide. A sweet shop lists sizes as items, and a one-tap sold-out toggle handles the day a flavour finishes.',
            },
            {
                q: 'My Madurai hotel is busy during festival weeks. Can I show a special festival menu?',
                a: 'Add a festival category, mark items sold out when the rush ends, and remove it afterwards. Banners are available to highlight it at the top of the menu. Nothing on the table changes because the QR stays the same.',
            },
        ],
    },
    {
        slug: 'tiruchirappalli',
        city: 'Tiruchirappalli',
        tamil: 'திருச்சிராப்பள்ளி',
        district: 'Trichy',
        knownFor: 'Trichy-style biryani, kadai dosai, and hotels serving pilgrims and students in equal number',
        areas: ['Thillai Nagar', 'Srirangam', 'Cantonment'],
        intro:
            'Trichy hotels serving both pilgrims and students can run one QR menu in Tamil and English for Rs 299 a month. Items tied to a time of day, like breakfast, are switched with a sold-out toggle instead of separate printed cards.',
        businesses:
            'Trichy has hotels near Srirangam and the bus stand, biryani and kadai dosai shops, college-area tiffin centres, bakeries and family restaurants in Thillai Nagar and Cantonment.',
        localTruth:
            'Trichy runs on two clocks: Srirangam temple footfall that peaks around darshan hours, and a student population near the colleges that eats at entirely different times. Restaurants serving both often want different items visible at different hours, which is a sold-out toggle rather than a reprint.',
        scenario:
            'A Thillai Nagar hotel starts the day with tiffin, moves to biryani and meals at noon, and ends with dosa and parotta. Build one category per time block. As each block ends, mark its items sold out and the next block is what diners see. Staff never carry a different card.',
        languageNote:
            'Srirangam draws visitors from across the country and many families from smaller towns, while students are largely bilingual. An English-and-Tamil menu with photos handles both without extra printing.',
        localFaq: {
            q: 'Can I hide items that are only available at certain times in Trichy?',
            a: 'Yes. Mark an item sold out and it greys out on every table instantly, then bring it back with one tap. A hotel can use this for breakfast items after late morning rather than printing separate menus.',
        },
        extraFaqs: [
            {
                q: 'Does a QR menu suit a Trichy biryani shop with a short menu?',
                a: 'A short menu is the easiest to set up: one photo, a quick review, and you are done. The benefit is changing the price of mutton or chicken the day costs rise, and showing combo items prominently.',
            },
            {
                q: 'Students near Trichy colleges have small budgets. Can the menu show combos?',
                a: 'Yes. Add combos as ordinary items with their own price, such as a dosa-and-tea set, and put them in a category at the top. Students see the value options first instead of scrolling through the full list.',
            },
        ],
    },
    {
        slug: 'salem',
        city: 'Salem',
        tamil: 'சேலம்',
        knownFor: 'Salem-style thattu vadai set, mutton curry and a strong sago and textile-town lunch trade',
        areas: ['Fairlands', 'Hasthampatti', 'Five Roads'],
        intro:
            'A Salem restaurant serving mostly regulars can use a QR menu to show what is new and what is finished today. It costs Rs 299 a month with a 7-day trial, reads your paper menu from a photo, and shows dishes in Tamil and English.',
        businesses:
            'Salem has family mess-style restaurants, mutton and biryani hotels, thattu vadai snack stalls, bakeries and mango-season juice and sweet shops, mostly serving a steady local clientele.',
        localTruth:
            'Salem restaurants serve a heavily repeat local trade rather than tourists, which changes what the menu is for. Regulars already know what they want, so the menu earns its place by showing what is new and what is finished, not by listing everything.',
        scenario:
            'A Fairlands mutton hotel with loyal regulars adds a "today" category at the top for the day\'s specials and marks the first dish to run out as sold out by mid-afternoon. Regulars see the change on the same QR they already scanned, and nobody has to ask the waiter what is left.',
        languageNote:
            'Most Salem diners are comfortable in Tamil first. Tamil dish names suit them, and adding the English name beside each one helps the occasional visitor or younger family member.',
        localFaq: {
            q: 'My customers are regulars who know the menu. What does a digital menu add in Salem?',
            a: 'Two things regulars actually use: seeing immediately what is sold out today, and seeing the specials you have added. Both change daily, and both are invisible on a printed card.',
        },
        extraFaqs: [
            {
                q: 'Is Rs 299 a month worth it for a small Salem tiffin shop?',
                a: 'Compare it with your own reprint cost: Rs 299 times 12 is Rs 3,588 a year. If you print more than that in a year, or lose sales to wrong prices on an old card, it covers itself. If your menu never changes, the case is weaker.',
            },
            {
                q: 'Can I add seasonal Salem items like mango specials to the menu?',
                a: 'Yes. Add the items when the season starts and mark them sold out or remove them when it ends. A seasonal banner also helps regulars notice the new item the first time they scan.',
            },
        ],
    },
    {
        slug: 'tirunelveli',
        city: 'Tirunelveli',
        tamil: 'திருநெல்வேலி',
        knownFor: 'halwa, Nellai-style parotta and mutton, and iruttu kadai sweets',
        areas: ['Town', 'Palayamkottai', 'Junction'],
        intro:
            'Tirunelveli sweet shops and hotels can publish a photo-led QR menu for Rs 299 a month. Visitors who do not know halwa or Nellai-style parotta can see each item, its photo and its price, in Tamil or English, before they choose.',
        businesses:
            'Tirunelveli has sweet and snack shops built around halwa, parotta and mutton hotels, bakeries, tiffin centres in Palayamkottai and eateries serving travellers near the junction.',
        localTruth:
            'Tirunelveli sells a lot of halwa to people who are not from Tirunelveli. Sweet shops and hotels here get outside footfall that needs photographs and prices before buying, because they do not know the product.',
        scenario:
            'A sweet shop near the junction lists each sweet as an item with its weight in the name, such as quarter-kilo and half-kilo, each with a price. Travellers with a short wait scan the QR on the counter, compare photos and decide fast, instead of asking staff to explain every sweet.',
        languageNote:
            'Local customers read Tamil, but travellers changing trains at the junction often do not. English names next to each Tamil name and a photo let a first-time buyer choose without help.',
        localFaq: {
            q: 'I run a sweet shop, not a restaurant. Does vsite work for me in Tirunelveli?',
            a: 'Yes. Sweet shops and bakeries use the same menu: items, weights, prices and photos. Photos matter more for you than for a restaurant, because a visitor buying halwa for the first time chooses largely by sight.',
        },
        extraFaqs: [
            {
                q: 'My Tirunelveli parotta hotel sells mutton dishes that depend on the day\'s supply. Can I show that?',
                a: 'Yes. Mark a dish sold out when it finishes and bring it back the next morning with one tap. Customers stop asking for something that is gone, and staff stop apologising at the table.',
            },
            {
                q: 'How do I show festival sweet boxes on my Tirunelveli menu?',
                a: 'Add each box as an item with its contents in the description and a photo, inside a festival category. Use a banner to highlight it, and remove it or mark it sold out after the festival. Nothing to reprint.',
            },
        ],
    },
    {
        slug: 'erode',
        city: 'Erode',
        tamil: 'ஈரோடு',
        knownFor: 'Kongu meals, turmeric-market trade lunches and roadside biryani',
        areas: ['Perundurai Road', 'Brough Road', 'R.N. Pudur'],
        intro:
            'Erode hotels that feed market traders and shift workers can use a plain, quick-to-read QR menu for Rs 299 a month. It opens in the phone browser with no app, and you change prices from your phone when trading costs move.',
        businesses:
            'Erode has Kongu meals hotels serving traders and textile and turmeric-market crowds, roadside biryani places and dhabas on the highways, tiffin centres, bakeries and family restaurants.',
        localTruth:
            'Erode restaurants feed a market town: traders eating fast, at fixed hours, often the same order daily. Speed of decision matters more than browsing, so the value here is a menu that is clear and quick to scan on a mid-range phone, not one that looks impressive.',
        scenario:
            'A meals hotel near Brough Road has a fixed lunch, so the menu is short: the meals types, a few sides, and a non-veg list. Put the lunch set at the top as a single item, with extras below. A trader scanning at the table sees the price and the day\'s sold-out items in one screen.',
        languageNote:
            'Most diners here read Tamil, so Tamil dish names are the natural choice. Adding English beside them helps visiting suppliers and highway travellers who stop to eat.',
        localFaq: {
            q: 'Will the menu work well on an ordinary phone and slow data in Erode?',
            a: 'The menu is an ordinary web page with no app to install, built to be light. Speed still depends on the phone and the network signal, so test it on a mid-range phone in your own dining room during the free trial.',
        },
        extraFaqs: [
            {
                q: 'My Erode hotel serves the same lunch daily. What does a QR menu change for me?',
                a: 'A fixed lunch does not need much, but the price and the sides change over time. Update them once from your phone instead of rewriting a board, and mark what has finished so late customers do not ask.',
            },
            {
                q: 'Can highway biryani shops near Erode use vsite?',
                a: 'Yes. A roadside shop can put the QR on the counter or a stand. Travellers who have never stopped there see the menu and prices at once. Sold-out toggles handle the days the biryani finishes early.',
            },
        ],
    },
    {
        slug: 'vellore',
        city: 'Vellore',
        tamil: 'வேலூர்',
        knownFor: 'hotels serving CMC patients and attendants, biryani and North Indian food for out-of-state visitors',
        areas: ['Katpadi', 'Bagayam', 'Officers Line'],
        intro:
            'Vellore restaurants near the hospital and colleges can show a Tamil and English menu with a photo beside each dish for Rs 299 a month. Visitors who cannot read Tamil, and students eating on a budget, both see what a dish is and what it costs.',
        businesses:
            'Vellore has hotels and messes near the hospital serving patients and attendants, North Indian and biryani restaurants for out-of-state visitors, and tiffin centres and hostel messes around the colleges.',
        localTruth:
            'Vellore has more non-Tamil-speaking customers than most towns its size, because the CMC hospital draws patients and families from across India. Restaurants near it constantly explain dishes to people who cannot read a Tamil menu and have not eaten the food before.',
        scenario:
            'A Katpadi restaurant serving attendants from several states adds clear veg and non-veg marks to every dish and a plain description to the ones that need it, such as what a rasam meal includes. Plain food such as idli and curd rice sits in its own category so attendants find it fast.',
        languageNote:
            'Vellore menus need English more than most Tamil Nadu towns, and for many visitors Hindi or Telugu is the first language. vsite shows Tamil and English today; other languages are not offered, so descriptions and photos carry the rest.',
        localFaq: {
            q: 'Many of my Vellore customers do not read Tamil. Does the menu help them?',
            a: 'Every dish carries an English name, an optional description and a photo, so a visitor who has never eaten a dish can see what it is. That removes most of the explaining your staff do at the table. Hindi and other languages are not offered yet.',
        },
        extraFaqs: [
            {
                q: 'Can I mark plain or light food for patients on my Vellore menu?',
                a: 'You can put plain dishes such as idli, kanji or curd rice in a separate category and describe them simply. vsite does not give medical or dietary advice, so keep descriptions to what the dish contains.',
            },
            {
                q: 'Do Vellore hostel messes near the colleges use a QR menu?',
                a: 'They can. A mess lists each day\'s meals as categories, marks veg and non-veg, and updates what is being served from a phone. Students scan once and see the day\'s food without queueing at the counter.',
            },
        ],
    },
    {
        slug: 'thoothukudi',
        city: 'Thoothukudi',
        tamil: 'தூத்துக்குடி',
        district: 'Thoothukudi',
        knownFor: 'macaroons, seafood and port-town fish curry',
        areas: ['Palayamkottai Road', 'Bryant Nagar', 'Millerpuram'],
        intro:
            'Thoothukudi seafood restaurants can keep fish prices current with a QR menu for Rs 299 a month. Change a price from your phone when the catch or market moves, and every table sees it on the next scan in Tamil or English.',
        businesses:
            'Thoothukudi has seafood hotels and fish-curry meals places, bakeries and macaroon and sweet shops, tiffin stalls and restaurants serving the port and its visitors.',
        localTruth:
            'Seafood menus change with the catch, which is the hardest thing a printed menu can be asked to do. A Thoothukudi restaurant printing fish prices is printing a guess; a digital menu lets today\'s price be today\'s price.',
        scenario:
            'A seafood meals hotel keeps a "today\'s catch" category at the top with whatever fish came in that morning, each with a per-plate price. When the catch is gone, mark it sold out. Regular items such as meals and fry sit below and rarely change.',
        languageNote:
            'Fish names vary by region, and a Tamil name the locals know may be unfamiliar to a visitor from elsewhere. Adding an English name and a photo lets visitors recognise what they are choosing.',
        localFaq: {
            q: 'My fish prices change with the market. Can the menu keep up in Thoothukudi?',
            a: 'Yes. Change a price from your phone and every table sees it on the next scan. Restaurants with market-linked prices are the clearest case for a digital menu, because a printed price is out of date the day it is printed.',
        },
        extraFaqs: [
            {
                q: 'Can I sell macaroons by weight from a Thoothukudi bakery menu?',
                a: 'Yes. List each size or weight as an item with its own price, add a photo, and mark items sold out when a batch finishes. It works the same as any restaurant item.',
            },
            {
                q: 'How do I handle fish that is only available on some days?',
                a: 'Keep the fish on the menu and use the sold-out toggle on days it is not in. You avoid deleting and retyping the item, and its price and photo are ready when it returns.',
            },
        ],
    },
    {
        slug: 'thanjavur',
        city: 'Thanjavur',
        tamil: 'தஞ்சாவூர்',
        knownFor: 'traditional Thanjavur meals, temple-town tiffin and a steady tourist trade',
        areas: ['Big Temple area', 'South Rampart', 'Medical College Road'],
        intro:
            'Thanjavur hotels that serve visitors eating once can give them a clear menu with photos, in Tamil and English, for Rs 299 a month. A stranger sees your signature dishes and prices at a glance, without waiting for staff to explain.',
        businesses:
            'Thanjavur has traditional meals hotels and temple-town tiffin places, hotel-restaurants catering to tourist groups near the Big Temple, sweet and snack shops, and family restaurants serving local regulars.',
        localTruth:
            'Thanjavur restaurants serve a rotating cast of visitors who will eat there once. There is no benefit in a menu regulars have memorised; the job is helping a stranger choose quickly and confidently, which is what photographs do.',
        scenario:
            'A hotel-restaurant near the temple that gets tour groups puts its signature meals at the top, each with a photo and a one-line description in English. A group leader scans once and shares the link with the whole party, who all read the same menu on their own phones.',
        languageNote:
            'Thanjavur visitors include Tamil-speaking families on temple trips and out-of-state and international tourists. Tamil and English names can sit together on the same menu and the same QR code, so both groups read it.',
        localFaq: {
            q: 'Most of my customers are tourists eating here once. What should my Thanjavur menu show?',
            a: 'Photos and clear descriptions of your signature dishes, placed first. vsite matches a photo from a curated library to each dish and lets you choose what sits at the top, so a first-time visitor sees your best items before the long list.',
        },
        extraFaqs: [
            {
                q: 'Can a Thanjavur hotel share its menu with a tour group in advance?',
                a: 'Yes. Your menu has its own web address, so a guide can send the link to a group before they arrive. It always shows current prices, which a forwarded PDF does not.',
            },
            {
                q: 'How should a traditional Thanjavur meals hotel describe a full meals plate?',
                a: 'List the meals as one item and describe what is on the plate in the description: the rice, the side dishes, the sweet. A photo of the full leaf helps a visitor understand it is a complete meal, not a single dish.',
            },
        ],
    },
    {
        slug: 'tiruppur',
        city: 'Tiruppur',
        tamil: 'திருப்பூர்',
        knownFor: 'fast lunch trade for garment workers, Kongu meals and late-night biryani',
        areas: ['Kumaran Road', 'Palladam Road', 'Avinashi Road'],
        intro:
            'Tiruppur hotels that serve garment-shift crowds can post a short QR menu that is read in seconds. It costs Rs 299 a month, shows Tamil and English, and lets you change prices or mark items finished from your phone during the rush.',
        businesses:
            'Tiruppur has quick-service meals hotels and canteens timed to factory shifts, late-night biryani and parotta shops, tiffin stalls, tea and snack counters and some family restaurants.',
        localTruth:
            'Tiruppur eats to a factory shift pattern: large volume in narrow windows. Menus here are read in seconds by people with limited time, and anything that slows the choice costs a table turn.',
        scenario:
            'A meals hotel on Kumaran Road serves a short lunch to shift workers in a narrow window. The menu leads with the day\'s meals price and two or three extras. During the rush, the owner marks a dish sold out the moment it finishes, so late arrivals do not wait and find out.',
        languageNote:
            'Tiruppur\'s workforce includes many people who moved from other states, so English and photos help a newcomer, while long-time residents read Tamil. The photo does most of the work where neither language is first.',
        localFaq: {
            q: 'We are extremely busy at lunch in Tiruppur. Will a QR menu slow service down?',
            a: 'It should not, because customers can read while they are being seated instead of waiting for a free menu card. Your staff still take the order as they do today. Test it during one lunch in the trial and see.',
        },
        extraFaqs: [
            {
                q: 'Can a Tiruppur factory canteen or tea shop use vsite?',
                a: 'Yes, anything with items and prices can be a menu. A tea and snack counter lists each item and price, and a sold-out toggle covers the snack that finished. Keep it short so it is read in seconds.',
            },
            {
                q: 'My Tiruppur biryani shop opens late at night. Does the menu work then?',
                a: 'The menu is a web page available at any hour, so a late shift sees current prices too. You edit from your phone whenever you need to, and there are no shop hours for the software.',
            },
        ],
    },
    {
        slug: 'kanyakumari',
        city: 'Kanyakumari',
        tamil: 'கன்னியாகுமரி',
        knownFor: 'seafood, Kerala-influenced dishes and a tourist trade at sunrise and sunset',
        areas: ['Beach Road', 'Main Road', 'Kovalam Road'],
        intro:
            'Kanyakumari restaurants serve visitors from every state, so a QR menu in English and Tamil with photos saves repeated explaining. It costs Rs 299 a month, carries veg and non-veg marks on each dish, and works with any phone camera.',
        businesses:
            'Kanyakumari has tourist-facing hotels and seafood restaurants along Beach Road, simple meals and tiffin places for pilgrims and day visitors, and cafés and sweet shops near the sunrise and sunset viewpoints.',
        localTruth:
            'Kanyakumari is almost entirely a visitor market, and its restaurants face a menu problem most do not: customers arrive from every state in India and abroad, with no shared assumption about what any dish contains.',
        scenario:
            'A Beach Road restaurant writes each dish name in English with the Tamil name beside it, a short description of the main ingredients, and a photo. Seafood items are marked non-veg, and a small vegetarian category sits at the top for the many pilgrim families who look for it first.',
        languageNote:
            'Kanyakumari is an English-first menu for most of its customers, but local Tamil-speaking families and staff still need Tamil to check what was asked for. Holding both names for every dish keeps the counter and the table reading the same list.',
        localFaq: {
            q: 'My customers come from all over India. How does a digital menu help in Kanyakumari?',
            a: 'Photographs and written descriptions do the work your staff currently do by explaining. Vegetarian and non-vegetarian marks appear on every dish, which visitors look for first. Only Tamil and English are offered, so descriptions matter.',
        },
        extraFaqs: [
            {
                q: 'Can my Kanyakumari restaurant use a different rate for the tourist season?',
                a: 'Update your prices from your phone when the season changes. There is no extra charge for edits, and the QR on the table stays the same, so the change is live on the next scan.',
            },
            {
                q: 'Do my Kanyakumari diners need internet to read the menu?',
                a: 'Diners load the menu on their own phone data or your Wi-Fi, so they need a signal. Sea-facing places can have patchy coverage, so check a scan at your farthest table during the trial.',
            },
        ],
    },
    {
        slug: 'ooty',
        city: 'Ooty',
        tamil: 'உதகமண்டலம்',
        district: 'Nilgiris',
        knownFor: 'hill-station cafés, homemade chocolate and varkey, and a strong seasonal tourist trade',
        areas: ['Charing Cross', 'Commercial Road', 'Coonoor Road'],
        intro:
            'Ooty cafés and restaurants can run one QR menu that works in English for tourists and Tamil for local diners, for Rs 299 a month. Prices and items change with the season from your phone, so nothing is reprinted when the crowds come or go.',
        businesses:
            'Ooty has hill-station cafés and bakeries, homemade chocolate and varkey shops, tourist-facing restaurants on Commercial Road and Charing Cross, and small tea and snack places serving residents and estate workers.',
        localTruth:
            'Ooty runs a season. Menus, prices and even opening hours change between peak and off-season, and printing for a season you are not sure about is exactly the cost a digital menu removes.',
        scenario:
            'A Charing Cross café builds its menu around hot drinks and baked items, and adds a "peak season" category of breakfast platters for the holidays. In the off-season the owner marks those items sold out or removes them and adjusts prices, all from a phone while the QR on the table stays put.',
        languageNote:
            'Ooty serves tourists who read English and a local Tamil-speaking community. vsite offers Tamil and English, so the local diner reads Tamil while visitors read English, and photos carry any gap beyond that.',
        localFaq: {
            q: 'My menu and prices change between season and off-season in Ooty. Is that a problem?',
            a: 'No. Change them as often as you like at no extra cost. You can add a seasonal category and remove it when the season ends, without touching the rest of the menu or the QR on the table.',
        },
        extraFaqs: [
            {
                q: 'Can an Ooty chocolate or bakery shop list products by weight and flavour?',
                a: 'Yes. List each flavour and pack size as an item with a price and a photo. A sold-out toggle covers flavours that finish during the peak weeks, so a visitor never picks something that is gone.',
            },
            {
                q: 'Will tourists in Ooty actually scan a QR code?',
                a: 'Most visitors carry a phone with a camera and are used to scanning, but some will still ask for a paper card. Keep a single printed page for them, and let the QR handle everyone else.',
            },
        ],
    },
];

export const CITY_PAGES: CityPage[] = [...CORE_CITY_PAGES, ...MORE_CITY_PAGES];

export const CITY_SLUGS = CITY_PAGES.map((c) => c.slug);

export function getCityPage(slug: string): CityPage | undefined {
    return CITY_PAGES.find((c) => c.slug === slug);
}
