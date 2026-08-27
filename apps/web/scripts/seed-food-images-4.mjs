// scripts/seed-food-images-4.mjs
// Uploads images from "food images 4/" to Supabase Storage,
// generates OpenAI embeddings (name + synonyms for richer accuracy),
// and upserts rows into default_images table.
// Run: node scripts/seed-food-images-4.mjs

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..', '..');

// ── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://wdnruubljlwrduxnvuhr.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY   = process.env.OPENAI_API_KEY;
const BUCKET       = 'default-images';
const FOLDER       = path.join(ROOT, 'archive', 'seed-assets', 'food-images-4');

if (!SERVICE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY env var before running');
  process.exit(1);
}
if (!OPENAI_KEY) {
  console.error('Set OPENAI_API_KEY env var before running');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const openai   = new OpenAI({ apiKey: OPENAI_KEY });

// ── Image catalogue ──────────────────────────────────────────────────────────
// Embedding text = name + synonyms + category context.
// Rich text makes cosine similarity accurate against misspellings,
// regional names and category-level queries.
const IMAGES = [
  // ── MOCKTAILS / SODAS ──────────────────────────────────────────────────────
  {
    file: 'Blue langoon mocktail.jpeg',
    slug: 'blue-lagoon-mocktail.jpeg',
    name: 'Blue Lagoon Mocktail',
    embedText: 'blue lagoon mocktail blue curacao mocktail cold drink refreshing beverage non alcoholic',
    description: 'Chilled blue mocktail with lime juice, sparkling soda and a splash of blue curacao syrup over crushed ice.\nVibrant, refreshing and slightly tangy — a stunning party drink served with a lemon wheel.',
  },
  {
    file: 'Pink start mocktail.jpeg',
    slug: 'pink-start-mocktail.jpeg',
    name: 'Pink Start Mocktail',
    embedText: 'pink start mocktail rose mocktail strawberry mocktail cold drink refreshing beverage',
    description: 'Refreshing pink mocktail blended with rose syrup, lime juice and chilled soda over ice.\nFloral, fruity and lightly sweet — a delightful non-alcoholic drink with a beautiful pink hue.',
  },
  {
    file: 'bhangra coke.jpeg',
    slug: 'bhangra-coke.jpeg',
    name: 'Bhangra Coke',
    embedText: 'bhangra coke masala coke spiced coke indian cola drink chaat masala soda',
    description: 'Chilled cola spiced with chaat masala, fresh lime juice and a hint of black salt over ice.\nA bold Indian twist on cola — tangy, zesty and irresistibly refreshing on a hot day.',
  },
  {
    file: 'classic mojito.jpeg',
    slug: 'classic-mojito.jpeg',
    name: 'Classic Mojito',
    embedText: 'classic mojito mint lime mocktail cold drink refreshing beverage non alcoholic',
    description: 'Sparkling mocktail muddled with fresh mint, lime juice and sugar over crushed ice and topped with soda.\nCool, crisp and herby — the timeless mocktail that hits the spot every time.',
  },
  {
    file: 'fire and ice mocktails.jpeg',
    slug: 'fire-and-ice-mocktail.jpeg',
    name: 'Fire and Ice Mocktail',
    embedText: 'fire and ice mocktail layered mocktail chilli mocktail spicy sweet drink non alcoholic',
    description: 'Striking layered mocktail with chilli-infused syrup, citrus and chilled soda over crushed ice.\nA bold contrast of fiery heat and icy cool — a showstopper drink with serious flavour.',
  },
  {
    file: 'mint mojito.jpeg',
    slug: 'mint-mojito-v2.jpeg',
    name: 'Mint Mojito',
    embedText: 'mint mojito mocktail mint lemon drink cold drink refreshing beverage non alcoholic',
    description: 'Chilled sparkling drink with fresh mint leaves, lime juice and a hint of sugar over crushed ice.\nCool, zesty and refreshing — the perfect non-alcoholic mocktail for any weather.',
  },
  {
    file: 'pina colada mocktail.jpeg',
    slug: 'pina-colada-mocktail.jpeg',
    name: 'Pina Colada Mocktail',
    embedText: 'pina colada mocktail pineapple coconut tropical drink non alcoholic creamy mocktail',
    description: 'Creamy tropical mocktail blended with fresh pineapple, coconut cream and crushed ice.\nLush, frothy and indulgent — a holiday in a glass, garnished with pineapple and a cherry.',
  },

  // ── JUICES ─────────────────────────────────────────────────────────────────
  {
    file: 'Kiwi juice.jpeg',
    slug: 'kiwi-juice.jpeg',
    name: 'Kiwi Juice',
    embedText: 'kiwi juice fresh kiwi drink fruit juice cold drink healthy beverage',
    description: 'Fresh kiwi blended into a smooth, vibrant green juice with a hint of lime and sugar.\nTangy, sweet and packed with vitamin C — a refreshing cooler bursting with tropical flavour.',
  },
  {
    file: 'apple juice.jpeg',
    slug: 'apple-juice.jpeg',
    name: 'Apple Juice',
    embedText: 'apple juice fresh apple drink fruit juice cold drink healthy beverage',
    description: 'Freshly pressed apple juice served chilled with no added sugar.\nNaturally sweet, crisp and revitalising — a wholesome drink that pairs with any meal.',
  },
  {
    file: 'fresh lemon juice.jpeg',
    slug: 'fresh-lemon-juice.jpeg',
    name: 'Fresh Lemon Juice',
    embedText: 'fresh lemon juice nimbu pani lemonade citrus drink cold drink refreshing beverage',
    description: 'Classic chilled lemonade made with fresh lemon juice, sugar and a pinch of salt over ice.\nTart, sweet and incredibly refreshing — a timeless quencher for hot summer days.',
  },
  {
    file: 'fresh lemon soda .jpeg',
    slug: 'fresh-lemon-soda.jpeg',
    name: 'Fresh Lemon Soda',
    embedText: 'fresh lemon soda nimbu soda fizzy lime drink cold drink refreshing beverage masala soda',
    description: 'Sparkling soda mixed with fresh lemon juice, a hint of sugar and a touch of black salt.\nFizzy, tangy and zesty — an instant pick-me-up that revives you in seconds.',
  },
  {
    file: 'orange juice.jpeg',
    slug: 'orange-juice.jpeg',
    name: 'Orange Juice',
    embedText: 'orange juice fresh orange drink fruit juice cold drink healthy beverage breakfast',
    description: 'Freshly squeezed orange juice served chilled with no added sugar.\nBright, juicy and full of vitamin C — a classic breakfast staple that energises your morning.',
  },
  {
    file: 'pineapple juice.jpeg',
    slug: 'pineapple-juice.jpeg',
    name: 'Pineapple Juice',
    embedText: 'pineapple juice fresh pineapple drink tropical fruit juice cold drink healthy beverage',
    description: 'Sweet and tangy pineapple juice freshly blended and served over ice.\nTropical, refreshing and naturally sweet — a sunshine drink in every sip.',
  },
  {
    file: 'pomegranate juice.jpeg',
    slug: 'pomegranate-juice.jpeg',
    name: 'Pomegranate Juice',
    embedText: 'pomegranate juice anar juice fresh fruit juice cold drink healthy beverage antioxidant',
    description: 'Freshly pressed pomegranate seeds blended into a deep ruby red juice.\nRich, slightly tangy and packed with antioxidants — a healthy and indulgent cooler.',
  },
  {
    file: 'watermelon juice.jpeg',
    slug: 'watermelon-juice.jpeg',
    name: 'Watermelon Juice',
    embedText: 'watermelon juice tarbooz juice fresh fruit juice cold drink summer beverage',
    description: 'Chilled watermelon juice blended fresh with a hint of lime and a pinch of salt.\nUltra-refreshing, light and naturally sweet — the ultimate summer thirst quencher.',
  },

  // ── TEAS ───────────────────────────────────────────────────────────────────
  {
    file: 'black tea.jpeg',
    slug: 'black-tea.jpeg',
    name: 'Black Tea',
    embedText: 'black tea kala chai plain tea hot beverage breakfast tea no milk',
    description: 'Bold, robust black tea brewed fresh and served piping hot without milk.\nStrong, aromatic and warming — enjoy plain or with a slice of lemon and honey.',
  },
  {
    file: 'elachi comdamon tea.jpeg',
    slug: 'elaichi-cardamom-tea.jpeg',
    name: 'Elaichi Cardamom Tea',
    embedText: 'elaichi tea cardamom tea masala chai indian tea hot beverage spiced tea',
    description: 'Classic Indian chai brewed with milk, fresh ginger and freshly crushed green cardamom pods.\nFragrant, comforting and gently spiced — the soulful cup that defines Indian tea time.',
  },
  {
    file: 'ginger tea.jpeg',
    slug: 'ginger-tea.jpeg',
    name: 'Ginger Tea',
    embedText: 'ginger tea adrak chai indian tea hot beverage spiced tea masala chai',
    description: 'Strong masala chai brewed with milk and a generous knob of crushed fresh ginger.\nWarming, zingy and immune-boosting — a perfect cup on a chilly or rainy day.',
  },
  {
    file: 'lemon tea.jpeg',
    slug: 'lemon-tea.jpeg',
    name: 'Lemon Tea',
    embedText: 'lemon tea hot lemon tea citrus tea no milk hot beverage light tea',
    description: 'Light black tea infused with fresh lemon juice and a touch of honey, served piping hot.\nBright, fragrant and soothing — a clean, citrusy cup that cleanses the palate.',
  },
  {
    file: 'tea.jpeg',
    slug: 'milk-tea.jpeg',
    name: 'Tea',
    embedText: 'tea milk tea chai masala chai indian tea hot beverage classic tea',
    description: 'Traditional Indian milk tea brewed with black tea leaves, milk and a touch of sugar.\nWarm, comforting and aromatic — the perfect everyday cup served piping hot.',
  },

  // ── LASSI / COOLERS ────────────────────────────────────────────────────────
  {
    file: 'Flavored lassi.jpeg',
    slug: 'flavored-lassi.jpeg',
    name: 'Flavored Lassi',
    embedText: 'flavored lassi sweet lassi mango lassi rose lassi cold drink yoghurt drink indian beverage',
    description: 'Thick chilled yoghurt drink whisked with fruit pulp, sugar and a hint of cardamom.\nSweet, creamy and cooling — a classic Indian cooler garnished with nuts and rose petals.',
  },
  {
    file: 'butter milk .jpeg',
    slug: 'butter-milk.jpeg',
    name: 'Butter Milk',
    embedText: 'butter milk chaas masala chaas spiced yoghurt drink cold drink indian beverage',
    description: 'Refreshing buttermilk seasoned with roasted cumin, ginger, curry leaves and fresh coriander.\nLight, tangy and cooling — the perfect drink to balance a spicy Indian meal.',
  },
  {
    file: 'jal jeera pani.jpeg',
    slug: 'jal-jeera-pani.jpeg',
    name: 'Jal Jeera Pani',
    embedText: 'jal jeera pani spiced cumin drink indian cooler mint cumin water summer drink',
    description: 'Tangy spiced drink made with cumin, mint, tamarind, black salt and chilli chilled with ice.\nZesty, digestive and ultra-refreshing — a classic North Indian summer cooler.',
  },
  {
    file: 'jal jeera.jpeg',
    slug: 'jal-jeera.jpeg',
    name: 'Jal Jeera',
    embedText: 'jal jeera spiced cumin water indian cooler digestive drink summer beverage',
    description: 'Chilled spiced water infused with roasted cumin, mint, lime and black salt.\nTart, savoury and aromatic — a traditional Indian welcome drink that aids digestion.',
  },

  // ── MILKSHAKES ─────────────────────────────────────────────────────────────
  {
    file: 'kitkat milkshake.jpeg',
    slug: 'kitkat-milkshake.jpeg',
    name: 'KitKat Milkshake',
    embedText: 'kitkat milkshake chocolate milkshake thick shake dessert drink kid favourite',
    description: 'Thick chocolate milkshake blended with crushed KitKat wafers, milk and a scoop of vanilla ice cream.\nCreamy, indulgent and loaded with chocolate crunch — topped with whipped cream and chocolate sauce.',
  },
  {
    file: 'nutcase milkshake.jpeg',
    slug: 'nutcase-milkshake.jpeg',
    name: 'Nutcase Milkshake',
    embedText: 'nutcase milkshake nut milkshake almond cashew shake dessert drink thick shake',
    description: 'Rich milkshake blended with roasted almonds, cashews, milk and a scoop of vanilla ice cream.\nNutty, creamy and indulgent — a wholesome treat topped with chopped nuts and whipped cream.',
  },
  {
    file: 'oreo milkshake.jpeg',
    slug: 'oreo-milkshake.jpeg',
    name: 'Oreo Milkshake',
    embedText: 'oreo milkshake cookies and cream milkshake thick shake dessert drink chocolate cookie shake',
    description: 'Creamy milkshake blended with crushed Oreo cookies, milk and a scoop of vanilla ice cream.\nDecadent, cookies-and-cream perfection — topped with whipped cream and an Oreo on the rim.',
  },
  {
    file: 'milk shake ice cream.jpeg',
    slug: 'milkshake-ice-cream.jpeg',
    name: 'Ice Cream Milkshake',
    embedText: 'milkshake ice cream thick shake vanilla milkshake classic milkshake dessert drink',
    description: 'Classic thick milkshake blended with cold milk and generous scoops of vanilla ice cream.\nSilky, smooth and indulgent — topped with whipped cream, sprinkles and a cherry.',
  },

  // ── ICE CREAM / DESSERTS ───────────────────────────────────────────────────
  {
    file: 'brownie with ice cream.jpeg',
    slug: 'brownie-with-ice-cream.jpeg',
    name: 'Brownie with Ice Cream',
    embedText: 'brownie with ice cream sizzling brownie chocolate brownie dessert sweet warm dessert',
    description: 'Warm fudgy chocolate brownie served with a scoop of vanilla ice cream and chocolate sauce.\nGooey, rich and irresistibly indulgent — the ultimate hot and cold dessert combo.',
  },
  {
    file: 'coco brownie.jpeg',
    slug: 'coco-brownie.jpeg',
    name: 'Coco Brownie',
    embedText: 'coco brownie chocolate brownie cocoa brownie dessert sweet square cake fudge brownie',
    description: 'Rich and fudgy chocolate brownie made with premium cocoa and walnuts.\nDense, moist and deeply chocolatey — a chocoholic’s dream served warm with a dusting of cocoa.',
  },
  {
    file: 'gulab jamun.jpeg',
    slug: 'gulab-jamun.jpeg',
    name: 'Gulab Jamun',
    embedText: 'gulab jamun indian sweet milk dumplings sugar syrup dessert sweet mithai',
    description: 'Soft milk dumplings deep fried golden and soaked in cardamom-spiced sugar syrup.\nSweet, melt-in-mouth and aromatic — a beloved Indian dessert best served warm.',
  },
  {
    file: 'ice cream 2 sccops.jpeg',
    slug: 'ice-cream-two-scoops.jpeg',
    name: 'Ice Cream Two Scoops',
    embedText: 'ice cream two scoops double scoop ice cream dessert sweet cold dessert vanilla chocolate',
    description: 'Two generous scoops of premium ice cream — choose your favourite flavours.\nCreamy, dreamy and indulgent — served in a chilled bowl with a wafer biscuit.',
  },
  {
    file: 'vanila ice cream.jpeg',
    slug: 'vanilla-ice-cream.jpeg',
    name: 'Vanilla Ice Cream',
    embedText: 'vanilla ice cream classic ice cream plain ice cream dessert sweet cold dessert',
    description: 'A classic scoop of smooth, creamy vanilla ice cream made with real vanilla bean.\nSimple, comforting and timeless — perfect on its own or with toppings of your choice.',
  },

  // ── MOMOS ──────────────────────────────────────────────────────────────────
  {
    file: 'chicken fired momos.jpeg',
    slug: 'chicken-fried-momos.jpeg',
    name: 'Chicken Fried Momos',
    embedText: 'chicken fried momos crispy momos pan fried dumplings chinese starter chicken dumpling',
    description: 'Juicy chicken dumplings pan-fried until crisp and golden, served with spicy red chutney.\nCrunchy outside, succulent inside — a beloved Indo-Chinese street food favourite.',
  },
  {
    file: 'chicken momos.jpeg',
    slug: 'chicken-momos.jpeg',
    name: 'Chicken Momos',
    embedText: 'chicken momos steamed chicken dumplings chinese starter himalayan dumpling tibetan momo',
    description: 'Soft steamed dumplings filled with seasoned minced chicken, ginger and spring onions.\nDelicate, juicy and flavourful — served with fiery red chilli chutney on the side.',
  },
  {
    file: 'chicken tandoori momos.jpeg',
    slug: 'chicken-tandoori-momos.jpeg',
    name: 'Chicken Tandoori Momos',
    embedText: 'chicken tandoori momos tandoor momos grilled chicken dumplings smoky momos chinese fusion starter',
    description: 'Steamed chicken momos coated in spiced tandoori marinade and grilled until smoky and charred.\nBold, smoky and irresistibly addictive — served with mint chutney and a creamy dip.',
  },
  {
    file: 'paneer fried momos .jpeg',
    slug: 'paneer-fried-momos.jpeg',
    name: 'Paneer Fried Momos',
    embedText: 'paneer fried momos crispy momos pan fried paneer dumplings veg dumpling chinese starter',
    description: 'Spiced paneer dumplings pan-fried until crisp and golden, served with spicy red chutney.\nCrunchy outside, soft and cheesy inside — a vegetarian momo lover’s dream.',
  },
  {
    file: 'paneer tandoori momos.jpeg',
    slug: 'paneer-tandoori-momos.jpeg',
    name: 'Paneer Tandoori Momos',
    embedText: 'paneer tandoori momos tandoor momos grilled paneer dumplings smoky veg momos chinese fusion starter',
    description: 'Steamed paneer momos coated in spiced tandoori marinade and grilled until smoky and charred.\nVegetarian, bold and smoky — served with mint chutney and a creamy dip.',
  },
  {
    file: 'veg fried momos.jpeg',
    slug: 'veg-fried-momos.jpeg',
    name: 'Veg Fried Momos',
    embedText: 'veg fried momos crispy momos pan fried vegetable dumplings chinese starter veg dumpling',
    description: 'Crunchy pan-fried vegetable momos stuffed with cabbage, carrots, beans and spring onions.\nCrispy outside, savoury inside — served with spicy red chilli chutney.',
  },
  {
    file: 'veg stramed momos.jpeg',
    slug: 'veg-steamed-momos.jpeg',
    name: 'Veg Steamed Momos',
    embedText: 'veg steamed momos vegetable dumplings chinese starter himalayan dumpling tibetan momo',
    description: 'Soft steamed dumplings filled with seasoned mixed vegetables, ginger and spring onions.\nLight, delicate and savoury — served with fiery red chilli chutney.',
  },
  {
    file: 'veg tanshoori momos.jpeg',
    slug: 'veg-tandoori-momos.jpeg',
    name: 'Veg Tandoori Momos',
    embedText: 'veg tandoori momos tandoor momos grilled vegetable dumplings smoky veg momos chinese fusion starter',
    description: 'Steamed vegetable momos coated in spiced tandoori marinade and grilled until smoky and charred.\nVegetarian, bold and smoky — served with mint chutney and a creamy dip.',
  },

  // ── CHAAT ──────────────────────────────────────────────────────────────────
  {
    file: 'bhel puri.jpeg',
    slug: 'bhel-puri.jpeg',
    name: 'Bhel Puri',
    embedText: 'bhel puri puffed rice chaat indian street food savoury snack mumbai chaat',
    description: 'Crunchy puffed rice tossed with onions, tomatoes, sev, chutneys, lime and coriander.\nTangy, sweet and crispy all at once — Mumbai street food at its finest.',
  },
  {
    file: 'chaat plater.jpeg',
    slug: 'chaat-platter.jpeg',
    name: 'Chaat Platter',
    embedText: 'chaat platter assorted chaat indian street food snack platter pani puri bhel sev puri',
    description: 'An assorted platter of classic Indian chaat — bhel puri, sev puri, pani puri and dahi puri.\nA tangy, crunchy, sweet-and-spicy explosion — the ultimate Indian street food experience.',
  },
  {
    file: 'curd cahi pappadi chaat.jpeg',
    slug: 'dahi-papdi-chaat.jpeg',
    name: 'Dahi Papdi Chaat',
    embedText: 'dahi papdi chaat curd chaat papdi chaat indian street food yoghurt chaat sweet tangy',
    description: 'Crispy papdi topped with boiled potatoes, chickpeas, whisked yoghurt, sweet and tangy chutneys.\nCreamy, crunchy and packed with flavour — a North Indian chaat classic.',
  },
  {
    file: 'dahi curd  puri .jpeg',
    slug: 'dahi-puri.jpeg',
    name: 'Dahi Puri',
    embedText: 'dahi puri curd puri indian street food chaat yoghurt puri tangy sweet',
    description: 'Crispy puri shells stuffed with potatoes, chickpeas and topped with whisked yoghurt and chutneys.\nA cool, tangy and crunchy chaat — a refreshing twist on classic pani puri.',
  },
  {
    file: 'masala puri .jpeg',
    slug: 'masala-puri.jpeg',
    name: 'Masala Puri',
    embedText: 'masala puri spicy peas chaat indian street food bangalore chaat green peas curry',
    description: 'Crushed puri smothered in spicy green peas gravy and topped with onions, sev and coriander.\nWarm, spicy and tangy — a Bangalore street food classic that’s comforting and bold.',
  },
  {
    file: 'pani puri plate.jpeg',
    slug: 'pani-puri-plate.jpeg',
    name: 'Pani Puri Plate',
    embedText: 'pani puri plate gol gappa puchka indian street food chaat spicy water filled puri',
    description: 'Crispy hollow puris filled with spiced potato, chickpeas and tangy mint-tamarind water.\nA burst of flavour in every bite — sweet, spicy, sour and crunchy all at once.',
  },

  // ── SOUPS ──────────────────────────────────────────────────────────────────
  {
    file: 'best mushroom soup .jpeg',
    slug: 'best-mushroom-soup.jpeg',
    name: 'Mushroom Soup',
    embedText: 'mushroom soup cream of mushroom hot soup starter creamy soup',
    description: 'Velvety cream of mushroom soup simmered with garlic, herbs and fresh mushrooms.\nRich, warming and silky-smooth — served with toasted bread or croutons on the side.',
  },
  {
    file: 'coriander soup.jpeg',
    slug: 'coriander-soup.jpeg',
    name: 'Coriander Soup',
    embedText: 'coriander soup cilantro soup clear soup herb soup starter light soup',
    description: 'Light clear soup simmered with fresh coriander, ginger, garlic and a touch of lemon.\nAromatic, herbaceous and warming — a healthy starter that opens the appetite.',
  },
  {
    file: 'cream of tomato soup.jpeg',
    slug: 'cream-of-tomato-soup.jpeg',
    name: 'Cream of Tomato Soup',
    embedText: 'cream of tomato soup tomato soup hot soup starter creamy soup classic',
    description: 'Creamy tomato soup simmered with fresh tomatoes, herbs and a swirl of fresh cream.\nRich, tangy and comforting — served with croutons and a drizzle of cream on top.',
  },
  {
    file: 'hot veg soup .jpeg',
    slug: 'hot-veg-soup.jpeg',
    name: 'Hot Veg Soup',
    embedText: 'hot veg soup hot and sour vegetable soup chinese soup indo chinese starter clear soup',
    description: 'Hot Indo-Chinese vegetable soup with crunchy veggies, soy sauce and a kick of black pepper.\nWarming, spicy and savoury — a classic starter that wakes up your taste buds.',
  },
  {
    file: 'manchow soup .jpeg',
    slug: 'manchow-soup.jpeg',
    name: 'Manchow Soup',
    embedText: 'manchow soup indo chinese soup veg manchow chinese starter spicy soup crispy noodle topping',
    description: 'Thick spicy Indo-Chinese soup with finely chopped vegetables, garlic, soy and topped with fried noodles.\nBold, tangy and addictive — a satisfying starter with crispy crunch.',
  },
  {
    file: 'sweet corn soup .jpeg',
    slug: 'sweet-corn-soup.jpeg',
    name: 'Sweet Corn Soup',
    embedText: 'sweet corn soup corn soup chinese soup veg starter mild soup creamy corn',
    description: 'Velvety soup with sweet corn kernels, finely chopped vegetables and a hint of white pepper.\nMild, creamy and comforting — a family favourite that’s perfect for all ages.',
  },

  // ── SALADS ─────────────────────────────────────────────────────────────────
  {
    file: 'green salad.jpeg',
    slug: 'green-salad.jpeg',
    name: 'Green Salad',
    embedText: 'green salad fresh salad veg salad side dish healthy salad cucumber onion tomato',
    description: 'Fresh garden salad with cucumber, tomato, onion, carrot and crisp lettuce.\nCrunchy, hydrating and light — a perfect side that adds freshness to any meal.',
  },
  {
    file: 'roasted pappad salad.jpeg',
    slug: 'roasted-papad-salad.jpeg',
    name: 'Roasted Papad Salad',
    embedText: 'roasted papad salad papad chaat fresh veg salad indian side dish crispy salad',
    description: 'Crispy roasted papad topped with chopped onions, tomatoes, cucumber, coriander and chaat masala.\nCrunchy, tangy and addictive — an Indian salad with a satisfying snap.',
  },
  {
    file: 'tandoori chicken salad .jpeg',
    slug: 'tandoori-chicken-salad.jpeg',
    name: 'Tandoori Chicken Salad',
    embedText: 'tandoori chicken salad grilled chicken salad protein salad healthy salad indian fusion',
    description: 'Smoky tandoori chicken pieces tossed with crisp lettuce, cucumber, onions and a tangy dressing.\nProtein-packed, smoky and refreshing — a healthy fusion of Indian and salad cultures.',
  },

  // ── OTHER ──────────────────────────────────────────────────────────────────
  {
    file: 'Chicken fry.jpeg',
    slug: 'chicken-fry.jpeg',
    name: 'Chicken Fry',
    embedText: 'chicken fry fried chicken chicken roast south indian chicken fry starter dry chicken',
    description: 'Tender chicken pieces marinated in South Indian spices and shallow fried until golden and crisp.\nBold, peppery and aromatic — a perfect dry chicken starter or side dish.',
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nSeeding ${IMAGES.length} images from "food images 4/"...\n`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const img of IMAGES) {
    const filePath    = path.join(FOLDER, img.file);
    const storagePath = `cafe-foods/${img.slug}`;
    const imageUrl    = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;

    // 1. Upload to Supabase Storage
    if (!fs.existsSync(filePath)) {
      console.error(`  ✗ File not found: ${img.file}`);
      failed++;
      continue;
    }
    const fileBuffer = fs.readFileSync(filePath);
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) {
      console.error(`  ✗ Upload failed: ${img.slug} — ${uploadError.message}`);
      failed++;
      continue;
    }
    console.log(`  ✓ Uploaded: ${img.slug}`);

    // 2. Generate embedding — rich text for higher accuracy
    const embRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: img.embedText,
    });
    const embedding = embRes.data[0].embedding;

    // 3. Upsert into default_images table
    const { data: existing } = await supabase
      .from('default_images')
      .select('id')
      .eq('image_url', imageUrl)
      .maybeSingle();

    const payload = { image_url: imageUrl, description: img.description, embedding };
    const { error: dbError } = existing
      ? await supabase.from('default_images').update(payload).eq('image_url', imageUrl)
      : await supabase.from('default_images').insert(payload);

    if (dbError) {
      console.error(`  ✗ DB upsert failed: ${img.name} — ${dbError.message}`);
      failed++;
    } else {
      console.log(`  ✓ DB upserted: ${img.name}${existing ? ' (updated)' : ''}`);
      if (existing) skipped++;
      else uploaded++;
    }
  }

  console.log(`\nDone! Batch-4 seeded.`);
  console.log(`  • New inserts: ${uploaded}`);
  console.log(`  • Updated:     ${skipped}`);
  console.log(`  • Failed:      ${failed}\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
