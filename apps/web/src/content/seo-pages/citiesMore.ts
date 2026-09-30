import type { CityPage } from './cities';

/**
 * Second batch of city pages. Same rules as cities.ts: general, non-numerical
 * local knowledge only, and every text field unique to the city.
 */
export const MORE_CITY_PAGES: CityPage[] = [
    {
        slug: 'karur',
        city: 'Karur',
        tamil: 'கரூர்',
        knownFor: 'a textile and home-furnishing trade town with hotels built around traders and visiting buyers',
        areas: ['Jawahar Bazaar', 'Thanthonimalai', 'Bus Stand area'],
        intro:
            'Karur hotels feeding textile traders and visiting buyers can publish a QR menu in Tamil and English for Rs 299 a month. A buyer who is in town for two days sees current prices and dishes on their phone, and you edit them whenever costs change.',
        businesses:
            'Karur has hotels and meals places near the bazaar and bus stand serving traders, tiffin shops, biryani and non-veg restaurants, bakeries and family restaurants for a business-travel crowd.',
        localTruth:
            'Karur is a trade town, so a large share of its diners are buyers and agents passing through for a day or two, not residents. They eat in a hurry, often as a group, and they want the price and the dish clear before anyone asks.',
        scenario:
            'A hotel near the bus stand that hosts buyers keeps a short list of meals and tiffin at the top, plus a "for a group" category with platters priced per plate. The owner shares the menu link with a regular agent who forwards it to visiting clients before they arrive.',
        languageNote:
            'Local traders read Tamil, while buyers from other states often rely on English and photos. Holding both names for each dish lets a mixed group at one table read the same menu.',
        localFaq: {
            q: 'My Karur hotel mostly serves visiting traders and buyers. What should my menu emphasise?',
            a: 'Put your quick meals and group platters first, with photos and clear prices. Visitors have no history with your place, so the menu has to do the introducing. Keep descriptions short and mark veg and non-veg clearly.',
        },
        extraFaqs: [
            {
                q: 'Can I send my Karur restaurant menu to a buyer before they arrive in town?',
                a: 'Yes. The menu has its own link, so you can send it on WhatsApp to an agent or buyer. Unlike a forwarded photo of a card, it always shows current prices.',
            },
            {
                q: 'Is the free trial enough to test vsite in a Karur hotel?',
                a: 'The trial runs 7 days and needs no card. That covers a full week of trade, including a weekend, which is enough to see whether customers actually scan and whether price edits are easy for your staff.',
            },
        ],
    },
    {
        slug: 'dindigul',
        city: 'Dindigul',
        tamil: 'திண்டுக்கல்',
        knownFor: 'Dindigul-style biryani, which is known across the state',
        areas: ['Nagal Nagar', 'Bus Stand', 'Palani Road'],
        intro:
            'A Dindigul biryani hotel can put its menu on a QR code for Rs 299 a month, with portions, prices and photos in Tamil and English. Travellers who stop because of the biryani\'s name see what to order, and you change prices when meat costs move.',
        businesses:
            'Dindigul is best known for its biryani hotels, alongside highway stops serving travellers, tiffin centres, parotta and non-veg shops, and bakeries on the main roads.',
        localTruth:
            'The name Dindigul biryani sells itself beyond the town, so many customers arrive with one dish in mind and then decide on sides and extras. The menu matters less for the main dish than for what goes with it: portions, combos and add-ons.',
        scenario:
            'A biryani hotel lists each variety as an item with a portion in the name, then puts raita, egg and side dishes in an "add-ons" category beneath it. Mutton prices change with the market, so the owner edits them from the phone instead of reprinting the card.',
        languageNote:
            'Locals order in Tamil and travellers on the highway often read English. Two names per dish let a bus-stand crowd and a family from elsewhere read the same QR.',
        localFaq: {
            q: 'Customers come to my Dindigul hotel for one dish. Why would I need a full menu online?',
            a: 'Because the second and third items decide your bill. A menu that shows add-ons, combos and a photo for each side helps a customer who came for biryani add something, without the staff having to suggest it each time.',
        },
        extraFaqs: [
            {
                q: 'Mutton prices shift often in Dindigul. How do I keep the biryani price right?',
                a: 'Edit the price from your phone and the next scan shows it. There is no reprint and no extra charge for changes, so you can match the price to cost whenever it moves.',
            },
            {
                q: 'Can I show full, half and family portions for biryani?',
                a: 'Yes. List each portion as its own item with its own price, or put the size in the name. Then mark a size sold out when it finishes, for example the family pack late in the evening.',
            },
        ],
    },
    {
        slug: 'kumbakonam',
        city: 'Kumbakonam',
        tamil: 'கும்பகோணம்',
        knownFor: 'degree coffee, temple-town tiffin and traditional vegetarian meals',
        areas: ['Mahamaham Tank area', 'Big Bazaar Street', 'Nageswaran Koil Street'],
        intro:
            'Kumbakonam vegetarian hotels and coffee shops can run a QR menu in Tamil and English for Rs 299 a month. Temple visitors see tiffin, meals and degree coffee with prices, and you update items from your phone when a preparation runs out.',
        businesses:
            'Kumbakonam has traditional vegetarian hotels and tiffin places near the temples, degree coffee shops, sweet and snack stalls, and small family restaurants serving pilgrims and locals.',
        localTruth:
            'Kumbakonam is a temple town with a strong vegetarian food culture, so the menu question is less about variety and more about timing: which tiffin is available at which hour, and what is ready on festival days.',
        scenario:
            'A vegetarian hotel organises its menu by time: morning tiffin, meals at noon, and evening snacks with coffee. Each block is a category, and the owner marks items sold out as batches finish. On festival days a special category is added and then removed the next day.',
        languageNote:
            'Most diners read Tamil, and pilgrim groups from other states rely on English and photos. A vegetarian-only menu benefits from clear dish descriptions because many visiting diners do not know the local tiffin names.',
        localFaq: {
            q: 'My Kumbakonam hotel is strictly vegetarian. Do I still need veg marks on the menu?',
            a: 'You can keep the menu simple, but a clear note that every item is vegetarian helps visitors relax. Mark items as veg and say so in the description or a banner, so no one has to ask at the counter.',
        },
        extraFaqs: [
            {
                q: 'Can I put degree coffee and snack combos on a Kumbakonam menu?',
                a: 'Yes. Add the combo as an item with its own price and photo, such as coffee with a snack. Put it near the top of the evening category so visitors see it before the individual items.',
            },
            {
                q: 'How should I handle a temple festival rush in my Kumbakonam hotel?',
                a: 'Shorten the menu for the day by marking slow items sold out, and add a festival special with a banner. After the festival, reverse both. The QR on the tables does not change.',
            },
        ],
    },
    {
        slug: 'nagercoil',
        city: 'Nagercoil',
        tamil: 'நாகர்கோவில்',
        district: 'Kanyakumari',
        knownFor: 'Nanjil-style meals with coconut-rich curries, fish and banana chips',
        areas: ['Vadasery', 'Kottar', 'Court Road'],
        intro:
            'Nagercoil meals hotels serving Nanjil-style food can publish a QR menu in Tamil and English for Rs 299 a month. Customers see fish, meals and banana chips with photos, and the owner edits prices from a phone when supplies change.',
        businesses:
            'Nagercoil has meals hotels serving Nanjil-style food, fish and seafood restaurants, bakeries and banana chip and snack shops, tiffin places and family restaurants serving local residents and visitors heading to Kanyakumari.',
        localTruth:
            'Nagercoil cooking has its own character, with coconut-heavy curries and preparations that differ from the rest of Tamil Nadu. That makes a menu with descriptions and photos more useful here, because a visitor cannot guess what a local dish is from its name.',
        scenario:
            'A meals hotel writes each Nanjil-style dish with its Tamil name and a short English description of what it contains, and gives fish items a category of their own. Banana chips and snacks are sold by weight, each weight as an item with its own price.',
        languageNote:
            'Local diners read Tamil and speak a distinct regional dialect, while visitors stopping on the way to Kanyakumari read English. The menu holds both the Tamil name the locals use and an English explanation.',
        localFaq: {
            q: 'Local dish names in Nagercoil are not known outside the district. How do I explain them?',
            a: 'Add an English description and a photo to each local dish. Visitors then see what it is without asking. Write the description as the ingredients and the way it is served, in plain words.',
        },
        extraFaqs: [
            {
                q: 'Can a Nagercoil banana chip shop use a menu with weights and prices?',
                a: 'Yes. List each pack size as an item with a price, add a photo, and mark a variety sold out when it finishes. It is an ordinary menu with shorter items.',
            },
            {
                q: 'Does vsite work for Nagercoil hotels that get visitors on the way to Kanyakumari?',
                a: 'Yes. Passing visitors can scan the QR at the table and read in English, while locals read Tamil. You can also share the menu link so a traveller sees it before they stop.',
            },
        ],
    },
    {
        slug: 'pollachi',
        city: 'Pollachi',
        tamil: 'பொள்ளாச்சி',
        knownFor: 'a coconut-farming region known for tender coconut, coconut-based food and a weekly market',
        areas: ['Mahalingapuram', 'Udumalai Road', 'Market Road'],
        intro:
            'Pollachi hotels in the coconut belt can put a Tamil and English QR menu on the table for Rs 299 a month. Coconut-based dishes, tender coconut and farm-style meals appear with photos, and visitors from nearby cities know what they are choosing.',
        businesses:
            'Pollachi has farm-style meals hotels, tender coconut and juice stalls, tiffin places, roadside restaurants catering to weekend visitors from nearby cities, and small bakeries and snack shops.',
        localTruth:
            'Pollachi is a market and farming town that also sees weekend visitors from larger cities. Menus here often serve two audiences at once: farm-gate locals who want a quick meal and visitors looking for a country-style experience.',
        scenario:
            'A farm-style restaurant lists a daily meals item and a separate "country special" category with photos and plain descriptions for visiting families. Weekend prices and weekday prices differ, and the owner edits the card from the phone on Friday evening and again on Monday.',
        languageNote:
            'Local diners read Tamil, while weekend visitors from larger cities read English comfortably. A menu that shows both names lets the table share one phone and one menu.',
        localFaq: {
            q: 'My Pollachi restaurant gets busy on weekends with visitors. Can the menu change by day?',
            a: 'You change prices and items from your phone as often as you like, including Friday evening and Monday morning. There is no scheduling tool, so you make the edit yourself at the time you want it.',
        },
        extraFaqs: [
            {
                q: 'Can a Pollachi tender coconut or juice stall use a QR menu?',
                a: 'Yes. A stall lists each drink with a size and price. Put the QR on the counter or a sign so customers who stop on the road can check prices without asking.',
            },
            {
                q: 'How should a Pollachi farm restaurant describe country-style dishes for visitors?',
                a: 'Write the dish name in Tamil and English, then a short line on what it contains and how it is served, and add a photo. Keep the language plain, since visitors decide from the description and image.',
            },
        ],
    },
    {
        slug: 'hosur',
        city: 'Hosur',
        tamil: 'ஓசூர்',
        district: 'Krishnagiri',
        knownFor: 'an industrial town near Bengaluru with a mixed Tamil, Kannada and Telugu population',
        areas: ['Bagalur Road', 'Racecourse Road', 'Bus Stand area'],
        intro:
            'Hosur restaurants and canteens serving factory workers and IT commuters can publish a Tamil and English QR menu for Rs 299 a month. Photos help diners who read neither language first, and prices update from your phone as costs change.',
        businesses:
            'Hosur has canteens and tiffin hotels around industrial areas, meals hotels, biryani and Andhra-style restaurants, bakeries and cafés serving commuters, and family restaurants along the main roads.',
        localTruth:
            'Hosur sits at a crossroads: it is a Tamil Nadu town next to Karnataka, with workers and families from several states and language groups. Diners here are the least likely in the state to share one mother tongue at a table.',
        scenario:
            'A tiffin hotel near an industrial area puts its breakfast and lunch sets first with photos and clear veg and non-veg marks, because workers from several states choose by image. The owner marks items sold out as batches finish, so the late arrivals do not queue for something that is gone.',
        languageNote:
            'vsite offers Tamil and English. Many diners in Hosur read Kannada or Telugu first, so the photo and a short English description carry more weight here. Those two languages are not supported, so we do not claim them.',
        localFaq: {
            q: 'Many of my Hosur customers read Kannada or Telugu. Does vsite support those languages?',
            a: 'No. vsite shows Tamil and English menus today. For diners who read neither, a photo and a short English description work best. If Kannada or Telugu is essential to your business, consider that before you sign up.',
        },
        extraFaqs: [
            {
                q: 'Can a Hosur factory canteen use vsite for a daily set menu?',
                a: 'Yes. Post the day\'s set menu as items with a price, update it each morning from your phone, and mark anything that finishes as sold out. Workers scan once and see what is being served.',
            },
            {
                q: 'Is a QR menu useful for a Hosur café near the IT offices?',
                a: 'Yes. Commuters scan, read and decide in seconds. A short menu with clear prices and photos suits that. Weekly changes are a phone edit, with no reprint and no change to the QR on the table.',
            },
        ],
    },
    {
        slug: 'puducherry',
        city: 'Puducherry',
        tamil: 'புதுச்சேரி',
        region: 'Puducherry',
        knownFor: 'a French-influenced seafront town with cafés, bakeries and a mix of Tamil, French-style and international food',
        areas: ['White Town', 'MG Road', 'Mission Street'],
        intro:
            'Puducherry cafés and restaurants can run a Tamil and English QR menu for Rs 299 a month. Tourists on the seafront read English while locals read Tamil, and you change items and prices from your phone as the seasons and crowds shift.',
        businesses:
            'Puducherry has seafront cafés and bakeries, French-style and continental restaurants, seafood and Tamil meals places, guesthouse kitchens, and small tiffin and snack shops serving residents.',
        localTruth:
            'Puducherry is a tourist town with a cafe culture, where many menus mix Tamil dishes with continental ones. The menu has to introduce a dish to a visitor and still look right to a resident who knows it well.',
        scenario:
            'A café in White Town keeps two sections: local Tamil meals and seafood, and a continental list of breads, coffee and desserts. Each has photos and English descriptions for visitors, with Tamil names for local dishes. A seasonal special is added for peak weeks and removed after.',
        languageNote:
            'Puducherry visitors mostly read English, and locals read Tamil. vsite shows Tamil and English, and does not offer French, so a French-style dish is described in English with a photo.',
        localFaq: {
            q: 'My Puducherry café gets many foreign visitors. Can the menu be in French?',
            a: 'No. vsite offers Tamil and English today, not French. English descriptions with photos work for most visitors, and Tamil names keep the menu familiar for local diners.',
        },
        extraFaqs: [
            {
                q: 'Does vsite work for a Puducherry guesthouse kitchen serving guests?',
                a: 'Yes. A guesthouse can list its breakfast and dinner as a short menu, update what is on offer each day, and share the link with guests before arrival. There is no ordering feature yet, so guests tell staff what they want.',
            },
            {
                q: 'Puducherry is not in Tamil Nadu. Is vsite available there?',
                a: 'Puducherry is a Union Territory with a Tamil-speaking majority. vsite is a web service and works anywhere with a phone signal, but our support is from Tamil Nadu, in Tamil and English, on WhatsApp.',
            },
        ],
    },
];
