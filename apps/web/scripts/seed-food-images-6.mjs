// scripts/seed-food-images-6.mjs
// Uploads images from "Food images 6/" to Supabase Storage,
// generates OpenAI embeddings (name + synonyms for richer accuracy),
// and upserts rows into default_images table.
// Run: node scripts/seed-food-images-6.mjs

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
const FOLDER       = path.join(ROOT, 'archive', 'seed-assets', 'food-images-6');

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
const IMAGES = [
  // ── PASTA ─────────────────────────────────────────────────────────────────
  {
    file: 'Americano white sacue chicken pasta.jpeg',
    slug: 'americano-white-sauce-chicken-pasta.jpeg',
    name: 'Americano White Sauce Chicken Pasta',
    embedText: 'americano white sauce chicken pasta alfredo chicken pasta creamy chicken pasta italian',
    description: 'Penne tossed with grilled chicken in a rich, creamy white sauce with garlic and herbs.\nCreamy, cheesy and comforting — a loaded chicken pasta that satisfies.',
  },
  {
    file: 'Americano white sauce pasta.jpeg',
    slug: 'americano-white-sauce-veg-pasta.jpeg',
    name: 'Americano White Sauce Pasta',
    embedText: 'americano white sauce pasta alfredo pasta creamy veg pasta italian white sauce',
    description: 'Penne in a smooth, garlicky white sauce with sauteed vegetables and fresh herbs.\nCreamy, mild and comforting — a classic white sauce pasta done right.',
  },
  {
    file: 'Mac N Cheese Chicken pasta.jpeg',
    slug: 'mac-n-cheese-chicken-pasta.jpeg',
    name: 'Mac N Cheese Chicken Pasta',
    embedText: 'mac n cheese chicken pasta macaroni cheese chicken creamy cheese pasta comfort food',
    description: 'Macaroni in a rich, gooey cheese sauce loaded with grilled chicken pieces.\nCheesy, indulgent and hearty — mac and cheese with a protein upgrade.',
  },
  {
    file: 'Mac n Cheesw veg pasta.jpeg',
    slug: 'mac-n-cheese-veg-pasta.jpeg',
    name: 'Mac N Cheese Veg Pasta',
    embedText: 'mac n cheese veg pasta macaroni cheese vegetarian pasta creamy cheese pasta',
    description: 'Macaroni in a rich, gooey cheese sauce with sauteed vegetables.\nCheesy, creamy and comforting — the classic mac and cheese, veggie style.',
  },
  {
    file: 'Mexicana Red sauce chicken pasta.jpeg',
    slug: 'mexicana-red-sauce-chicken-pasta.jpeg',
    name: 'Mexicana Red Sauce Chicken Pasta',
    embedText: 'mexicana red sauce chicken pasta arrabbiata chicken pasta spicy tomato chicken pasta',
    description: 'Penne tossed with chicken in a bold, spicy red sauce with bell peppers and jalapenos.\nSpicy, tangy and loaded — a pasta with Mexican-inspired heat.',
  },
  {
    file: 'hot Mexicana Red sauce chicken pasta.jpeg',
    slug: 'hot-mexicana-red-sauce-chicken-pasta.jpeg',
    name: 'Hot Mexicana Red Sauce Chicken Pasta',
    embedText: 'hot mexicana red sauce chicken pasta extra spicy arrabbiata chicken pasta fiery tomato pasta',
    description: 'Penne with chicken in an extra-fiery red sauce with dried chillies and jalapenos.\nScorching hot, tangy and bold — the hotter version for spice lovers.',
  },
  {
    file: 'Mexicana red sauce veg pasta.jpeg',
    slug: 'mexicana-red-sauce-veg-pasta.jpeg',
    name: 'Mexicana Red Sauce Veg Pasta',
    embedText: 'mexicana red sauce veg pasta arrabbiata veg pasta spicy tomato vegetable pasta',
    description: 'Penne with mixed vegetables in a bold, spicy red sauce with bell peppers and jalapenos.\nSpicy, tangy and colourful — a vegetarian pasta with Mexican heat.',
  },
  {
    file: 'White Sauce pasta.jpeg',
    slug: 'white-sauce-pasta-v6.jpeg',
    name: 'White Sauce Pasta',
    embedText: 'white sauce pasta alfredo pasta bechamel pasta creamy pasta italian veg pasta',
    description: 'Classic penne in a smooth, creamy bechamel sauce with garlic and fresh herbs.\nMild, creamy and elegant — a timeless white sauce pasta.',
  },

  // ── MOMOS ─────────────────────────────────────────────────────────────────
  {
    file: 'Chicken fried momos.jpeg',
    slug: 'chicken-fried-momos-v6.jpeg',
    name: 'Chicken Fried Momos',
    embedText: 'chicken fried momos crispy chicken momos pan fried chicken dumplings indo chinese starter',
    description: 'Juicy chicken dumplings pan-fried until crisp and golden, served with spicy red chutney.\nCrunchy outside, succulent inside — fried momos at their crispiest.',
  },
  {
    file: 'Chicken steamed momos.jpeg',
    slug: 'chicken-steamed-momos.jpeg',
    name: 'Chicken Steamed Momos',
    embedText: 'chicken steamed momos soft chicken dumplings chinese starter himalayan momo',
    description: 'Soft steamed dumplings filled with seasoned minced chicken, ginger and spring onions.\nDelicate, juicy and flavourful — classic steamed momos with fiery chutney.',
  },
  {
    file: 'Chicken tikka pan shot momo.jpeg',
    slug: 'chicken-tikka-pan-shot-momo.jpeg',
    name: 'Chicken Tikka Pan Shot Momo',
    embedText: 'chicken tikka pan shot momo tandoori momos tikka momos fusion momos starter',
    description: 'Chicken tikka-stuffed momos seared in a hot pan with spices and served sizzling.\nSmoky, spicy and fusion-forward — tikka meets momos in every bite.',
  },
  {
    file: 'Hot Chicken peri peri momos.jpeg',
    slug: 'hot-chicken-peri-peri-momos.jpeg',
    name: 'Hot Chicken Peri Peri Momos',
    embedText: 'hot chicken peri peri momos spicy chicken momos peri peri dumplings fusion starter',
    description: 'Crispy chicken momos tossed in a fiery peri peri sauce with chilli flakes.\nScorching, tangy and addictive — momos with African-inspired heat.',
  },
  {
    file: 'chicken peri peri momos.jpeg',
    slug: 'chicken-peri-peri-momos.jpeg',
    name: 'Chicken Peri Peri Momos',
    embedText: 'chicken peri peri momos spicy chicken dumplings peri peri momos fusion starter',
    description: 'Chicken momos tossed in tangy peri peri sauce with garlic, lemon and chilli.\nSpicy, tangy and bold — a fusion twist on classic chicken momos.',
  },
  {
    file: 'Fried corn momos.jpeg',
    slug: 'fried-corn-momos.jpeg',
    name: 'Fried Corn Momos',
    embedText: 'fried corn momos crispy corn dumplings sweet corn momos veg fried momos starter',
    description: 'Crispy fried momos stuffed with sweet corn, cheese and mild spices.\nCrunchy, sweet and cheesy — a kid-friendly momo with golden crunch.',
  },
  {
    file: 'Steamed corn momos.jpeg',
    slug: 'steamed-corn-momos.jpeg',
    name: 'Steamed Corn Momos',
    embedText: 'steamed corn momos soft corn dumplings sweet corn momos veg steamed momos',
    description: 'Soft steamed momos filled with sweet corn, cream cheese and herbs.\nMild, sweet and delicate — a light vegetarian momo with corn sweetness.',
  },
  {
    file: 'Panner momos.jpeg',
    slug: 'paneer-momos-v6.jpeg',
    name: 'Paneer Momos',
    embedText: 'paneer momos panner momos cottage cheese dumplings veg momos indian fusion starter',
    description: 'Steamed dumplings filled with spiced crumbled paneer, onions and fresh herbs.\nSoft, cheesy and flavourful — a paneer lover\'s momo.',
  },
  {
    file: 'Veg Momos.jpeg',
    slug: 'veg-momos-v6.jpeg',
    name: 'Veg Momos',
    embedText: 'veg momos vegetable momos steamed veg dumplings chinese starter',
    description: 'Soft steamed dumplings filled with finely chopped mixed vegetables and spices.\nLight, savoury and wholesome — classic veg momos with spicy chutney.',
  },
  {
    file: 'Veg momos Fried.jpeg',
    slug: 'veg-momos-fried-v6.jpeg',
    name: 'Veg Momos Fried',
    embedText: 'veg momos fried crispy veg dumplings pan fried vegetable momos indo chinese starter',
    description: 'Crispy pan-fried vegetable momos with a golden crust and savoury filling.\nCrunchy, savoury and satisfying — fried veg momos with extra crunch.',
  },
  {
    file: 'Veg momos with pan shot.jpeg',
    slug: 'veg-momos-pan-shot.jpeg',
    name: 'Veg Momos with Pan Shot',
    embedText: 'veg momos pan shot seared veg dumplings pan fried momos fusion starter',
    description: 'Vegetable momos seared in a hot pan with spices and served sizzling with chutney.\nSmoky, spicy and dramatic — pan-shot momos with extra char.',
  },

  // ── POPCORN / NUGGETS / TENDERS ───────────────────────────────────────────
  {
    file: 'Cheese Chicken popcorn.jpeg',
    slug: 'cheese-chicken-popcorn.jpeg',
    name: 'Cheese Chicken Popcorn',
    embedText: 'cheese chicken popcorn cheesy chicken bites crispy chicken nuggets snack starter',
    description: 'Bite-sized crispy chicken popcorn coated with melted cheese and seasoning.\nCrunchy, cheesy and moreish — pop-and-eat chicken bites with gooey cheese.',
  },
  {
    file: 'Hot and Sweet chicken popcorn.jpeg',
    slug: 'hot-sweet-chicken-popcorn.jpeg',
    name: 'Hot and Sweet Chicken Popcorn',
    embedText: 'hot and sweet chicken popcorn spicy sweet chicken bites crispy chicken snack starter',
    description: 'Crispy chicken popcorn glazed in a sweet-and-spicy sauce with chilli and honey.\nSweet, fiery and addictive — the perfect balance of heat and sweetness.',
  },
  {
    file: 'Cheese corn nuggest.jpeg',
    slug: 'cheese-corn-nuggets.jpeg',
    name: 'Cheese Corn Nuggets',
    embedText: 'cheese corn nuggets crispy corn cheese bites veg nuggets snack starter party food',
    description: 'Golden crispy nuggets stuffed with sweet corn and melted cheese.\nCrunchy, cheesy and sweet — a crowd-pleasing vegetarian snack.',
  },
  {
    file: 'Chicken Nuggest.jpeg',
    slug: 'chicken-nuggets-v6.jpeg',
    name: 'Chicken Nuggets',
    embedText: 'chicken nuggets crispy chicken bites breaded chicken snack kids meal starter',
    description: 'Golden crispy breaded chicken nuggets fried until perfectly crunchy.\nTender inside, crunchy outside — a classic snack for all ages.',
  },
  {
    file: 'Chicken Tenders.jpeg',
    slug: 'chicken-tenders.jpeg',
    name: 'Chicken Tenders',
    embedText: 'chicken tenders chicken strips breaded chicken fingers crispy chicken snack',
    description: 'Long, juicy chicken strips breaded and fried until golden and crispy.\nTender, crunchy and dippable — served with your choice of sauce.',
  },
  {
    file: 'Chilli garlic pops.jpeg',
    slug: 'chilli-garlic-pops.jpeg',
    name: 'Chilli Garlic Pops',
    embedText: 'chilli garlic pops spicy garlic chicken bites crispy garlic chicken snack starter',
    description: 'Crispy chicken pops tossed in a fiery chilli-garlic sauce with spring onions.\nGarlicky, spicy and crunchy — bold little bites with big flavour.',
  },

  // ── FRIES / LOADED FRIES ──────────────────────────────────────────────────
  {
    file: 'Classic French fries.jpeg',
    slug: 'classic-french-fries.jpeg',
    name: 'Classic French Fries',
    embedText: 'classic french fries golden fries crispy potato fries finger chips side dish',
    description: 'Golden crispy french fries seasoned with salt and served piping hot.\nCrunchy, salty and timeless — the side dish that goes with everything.',
  },
  {
    file: 'Peri peri French fries.jpeg',
    slug: 'peri-peri-french-fries.jpeg',
    name: 'Peri Peri French Fries',
    embedText: 'peri peri french fries spicy fries seasoned fries peri peri chips hot fries',
    description: 'Crispy french fries tossed in bold peri peri seasoning with chilli and herbs.\nSpicy, tangy and addictive — fries with a serious flavour kick.',
  },
  {
    file: 'Fried chicken loaded with fresh fries.jpeg',
    slug: 'fried-chicken-loaded-fries.jpeg',
    name: 'Fried Chicken Loaded Fries',
    embedText: 'fried chicken loaded fries chicken on fries crispy chicken with fries combo meal',
    description: 'Crispy golden fries topped with fried chicken pieces, sauce and fresh herbs.\nLoaded, indulgent and satisfying — fries and fried chicken in one glorious plate.',
  },
  {
    file: 'cheese chicken loaded with fresh fries.jpeg',
    slug: 'cheese-chicken-loaded-fries.jpeg',
    name: 'Cheese Chicken Loaded Fries',
    embedText: 'cheese chicken loaded fries cheesy chicken fries loaded fries combo nacho fries',
    description: 'Crispy fries loaded with fried chicken, melted cheese sauce and jalapenos.\nCheesy, crunchy and over-the-top — loaded fries taken to the max.',
  },
  {
    file: 'mac and cheese loaded frensh fries.jpeg',
    slug: 'mac-cheese-loaded-fries.jpeg',
    name: 'Mac and Cheese Loaded Fries',
    embedText: 'mac and cheese loaded french fries cheesy fries pasta fries fusion loaded fries',
    description: 'Crispy fries smothered in gooey mac and cheese sauce with herbs.\nCheesy, carby and outrageously indulgent — fries meet mac & cheese.',
  },
  {
    file: 'paneer loaded french fries.jpeg',
    slug: 'paneer-loaded-fries.jpeg',
    name: 'Paneer Loaded Fries',
    embedText: 'paneer loaded french fries cottage cheese fries veg loaded fries cheesy paneer fries',
    description: 'Crispy fries topped with spiced paneer cubes, cheese sauce and fresh herbs.\nLoaded, cheesy and vegetarian — paneer fries with serious indulgence.',
  },
  {
    file: 'Potato cheese balls.jpeg',
    slug: 'potato-cheese-balls.jpeg',
    name: 'Potato Cheese Balls',
    embedText: 'potato cheese balls cheesy potato bites aloo cheese balls crispy snack starter',
    description: 'Golden crispy potato balls with a gooey, melted cheese centre.\nCrunchy outside, cheesy inside — an irresistible party snack.',
  },

  // ── SANDWICHES ────────────────────────────────────────────────────────────
  {
    file: 'Chicken sandwich.jpeg',
    slug: 'chicken-sandwich-v6.jpeg',
    name: 'Chicken Sandwich',
    embedText: 'chicken sandwich grilled chicken sandwich toasted chicken bread club sandwich',
    description: 'Toasted sandwich filled with grilled chicken, lettuce, tomato, cheese and mayo.\nSimple, hearty and satisfying — a classic chicken sandwich.',
  },
  {
    file: 'Fried chicken sandwich.jpeg',
    slug: 'fried-chicken-sandwich.jpeg',
    name: 'Fried Chicken Sandwich',
    embedText: 'fried chicken sandwich crispy chicken sandwich breaded chicken sandwich',
    description: 'Crispy fried chicken patty in a toasted bun with lettuce, pickles and spicy mayo.\nCrunchy, juicy and bold — a fried chicken sandwich that hits different.',
  },
  {
    file: 'Corn Sandwich.jpeg',
    slug: 'corn-sandwich.jpeg',
    name: 'Corn Sandwich',
    embedText: 'corn sandwich sweet corn sandwich veg grilled sandwich toasted corn bread',
    description: 'Toasted sandwich with a creamy sweet corn, cheese and herb filling.\nSweet, cheesy and comforting — a vegetarian sandwich with corn goodness.',
  },
  {
    file: 'Paneer sandwich.jpeg',
    slug: 'paneer-sandwich.jpeg',
    name: 'Paneer Sandwich',
    embedText: 'paneer sandwich cottage cheese sandwich grilled paneer sandwich veg sandwich',
    description: 'Toasted sandwich filled with spiced paneer, capsicum, onion and cheese.\nProtein-rich, cheesy and filling — a paneer lover\'s grilled sandwich.',
  },
  {
    file: 'Veg Sandwich.jpeg',
    slug: 'veg-sandwich-v6.jpeg',
    name: 'Veg Sandwich',
    embedText: 'veg sandwich vegetable sandwich grilled veg sandwich toasted sandwich',
    description: 'Toasted sandwich loaded with fresh vegetables, cheese, chutney and herbs.\nCrunchy, fresh and wholesome — the everyday veg sandwich done right.',
  },

  // ── WRAPS ─────────────────────────────────────────────────────────────────
  {
    file: 'Chicken wrap.jpeg',
    slug: 'chicken-wrap-v6.jpeg',
    name: 'Chicken Wrap',
    embedText: 'chicken wrap grilled chicken tortilla wrap chicken roll shawarma wrap',
    description: 'Grilled chicken strips wrapped in a soft tortilla with lettuce, sauce and veggies.\nSmoky, fresh and portable — a chicken wrap packed with flavour.',
  },
  {
    file: 'chicken fried wrap.jpeg',
    slug: 'chicken-fried-wrap.jpeg',
    name: 'Chicken Fried Wrap',
    embedText: 'chicken fried wrap crispy chicken wrap breaded chicken tortilla roll',
    description: 'Crispy fried chicken strips wrapped in a tortilla with slaw, cheese and spicy mayo.\nCrunchy, creamy and loaded — a fried chicken wrap with serious crunch.',
  },
  {
    file: 'Corn chicken wrap.jpeg',
    slug: 'corn-chicken-wrap.jpeg',
    name: 'Corn Chicken Wrap',
    embedText: 'corn chicken wrap sweet corn chicken tortilla wrap combo wrap',
    description: 'Grilled chicken and sweet corn wrapped in a soft tortilla with cheese and sauce.\nSweet, savoury and filling — a comforting corn-chicken combo wrap.',
  },
  {
    file: 'corn wrap.jpeg',
    slug: 'corn-wrap.jpeg',
    name: 'Corn Wrap',
    embedText: 'corn wrap sweet corn veg wrap tortilla wrap veg roll',
    description: 'Sweet corn and cheese wrapped in a soft tortilla with fresh veggies and sauce.\nSweet, cheesy and light — a quick vegetarian wrap.',
  },
  {
    file: 'Peppy paneer wrap.jpeg',
    slug: 'peppy-paneer-wrap.jpeg',
    name: 'Peppy Paneer Wrap',
    embedText: 'peppy paneer wrap spicy paneer tortilla wrap cottage cheese roll veg wrap',
    description: 'Spiced paneer strips with capsicum and onion wrapped in a soft tortilla with tangy sauce.\nSpicy, cheesy and satisfying — a paneer wrap with peppy flavour.',
  },
  {
    file: 'Veg wrap.jpeg',
    slug: 'veg-wrap-v6.jpeg',
    name: 'Veg Wrap',
    embedText: 'veg wrap vegetable wrap tortilla veg roll healthy wrap',
    description: 'Fresh mixed vegetables wrapped in a soft tortilla with hummus, cheese and greens.\nLight, fresh and wholesome — a healthy veg wrap for any time.',
  },

  // ── SALADS ────────────────────────────────────────────────────────────────
  {
    file: 'Fresh Garden Veggie Salad.jpeg',
    slug: 'fresh-garden-veggie-salad.jpeg',
    name: 'Fresh Garden Veggie Salad',
    embedText: 'fresh garden veggie salad green salad mixed vegetable salad healthy salad light salad',
    description: 'Crisp garden vegetables — lettuce, cucumber, tomato, carrot — with a light vinaigrette.\nFresh, crunchy and clean — a wholesome salad straight from the garden.',
  },
  {
    file: 'Fresh creamy salad.jpeg',
    slug: 'fresh-creamy-salad.jpeg',
    name: 'Fresh Creamy Salad',
    embedText: 'fresh creamy salad mayo salad coleslaw creamy veg salad side salad',
    description: 'Fresh vegetables tossed in a light creamy dressing with herbs.\nCreamy, cool and refreshing — a comforting salad with smooth texture.',
  },
  {
    file: 'Protein power chicken salad.jpeg',
    slug: 'protein-power-chicken-salad.jpeg',
    name: 'Protein Power Chicken Salad',
    embedText: 'protein power chicken salad grilled chicken salad high protein salad gym salad healthy',
    description: 'Grilled chicken breast on a bed of greens with eggs, seeds, nuts and light dressing.\nProtein-packed, fresh and balanced — a power salad for fitness-focused eaters.',
  },
  {
    file: 'Veg Salad with Chicken Nugget.jpeg',
    slug: 'veg-salad-chicken-nugget.jpeg',
    name: 'Veg Salad with Chicken Nugget',
    embedText: 'veg salad with chicken nugget crispy chicken salad nugget salad combo healthy',
    description: 'Fresh garden salad topped with golden crispy chicken nuggets and tangy dressing.\nCrunchy, fresh and satisfying — salad meets comfort food.',
  },
  {
    file: 'Veg Salad with Chicken Patty.jpeg',
    slug: 'veg-salad-chicken-patty.jpeg',
    name: 'Veg Salad with Chicken Patty',
    embedText: 'veg salad with chicken patty grilled chicken patty salad protein salad combo',
    description: 'Fresh greens topped with a juicy grilled chicken patty and light dressing.\nHearty, fresh and protein-rich — a salad that doubles as a meal.',
  },
  {
    file: 'Veg Salad with Chicken Tikka.jpeg',
    slug: 'veg-salad-chicken-tikka.jpeg',
    name: 'Veg Salad with Chicken Tikka',
    embedText: 'veg salad with chicken tikka tandoori chicken salad grilled tikka salad indian fusion',
    description: 'Fresh salad greens topped with smoky tandoori chicken tikka and mint dressing.\nSmoky, fresh and Indian-fusion — tikka on a bed of greens.',
  },
  {
    file: 'Veg Salad with Paneer Tikka.jpeg',
    slug: 'veg-salad-paneer-tikka.jpeg',
    name: 'Veg Salad with Paneer Tikka',
    embedText: 'veg salad with paneer tikka tandoori paneer salad grilled paneer salad veg protein salad',
    description: 'Fresh salad greens topped with smoky grilled paneer tikka and mint dressing.\nSmoky, fresh and vegetarian — a paneer tikka salad with Indian flair.',
  },
  {
    file: 'Veg salad with veg nugget.jpeg',
    slug: 'veg-salad-veg-nugget.jpeg',
    name: 'Veg Salad with Veg Nugget',
    embedText: 'veg salad with veg nugget crispy veg nugget salad vegetarian combo salad healthy',
    description: 'Fresh garden salad topped with golden crispy vegetable nuggets and tangy dressing.\nCrunchy, light and veggie-friendly — salad with crispy veg bites.',
  },
  {
    file: 'Veggie and fruity salad.jpeg',
    slug: 'veggie-fruity-salad.jpeg',
    name: 'Veggie and Fruity Salad',
    embedText: 'veggie and fruity salad mixed fruit vegetable salad fresh salad healthy bowl',
    description: 'A vibrant mix of fresh vegetables and seasonal fruits with a light citrus dressing.\nSweet, tangy and refreshing — a colourful salad bursting with freshness.',
  },
  {
    file: 'Veggie patty Salad.jpeg',
    slug: 'veggie-patty-salad.jpeg',
    name: 'Veggie Patty Salad',
    embedText: 'veggie patty salad grilled veg patty salad protein veg salad healthy meal',
    description: 'Fresh salad greens topped with a grilled veggie patty and light herb dressing.\nHealthy, filling and balanced — a veggie patty that makes the salad a meal.',
  },
  {
    file: 'Smoothy fruite salad -.jpeg',
    slug: 'smoothie-fruit-salad.jpeg',
    name: 'Smoothie Fruit Salad',
    embedText: 'smoothie fruit salad fresh fruit bowl blended fruit salad dessert healthy bowl',
    description: 'Fresh seasonal fruits tossed in a light smoothie dressing with honey and mint.\nSweet, refreshing and wholesome — a fruit salad with smoothie vibes.',
  },

  // ── FRUIT BOWLS ───────────────────────────────────────────────────────────
  {
    file: 'Filipino Fruit bowl.jpeg',
    slug: 'filipino-fruit-bowl.jpeg',
    name: 'Filipino Fruit Bowl',
    embedText: 'filipino fruit bowl tropical fruit bowl halo halo fruit bowl asian fruit dessert',
    description: 'A colourful tropical fruit bowl with mango, banana, jackfruit and sweet cream.\nTropical, sweet and indulgent — Filipino-inspired fruit goodness.',
  },
  {
    file: 'Fruits Bowl with Nuts &Honey.jpeg',
    slug: 'fruit-bowl-nuts-honey.jpeg',
    name: 'Fruit Bowl with Nuts & Honey',
    embedText: 'fruit bowl with nuts and honey healthy fruit bowl granola fruit breakfast bowl',
    description: 'Fresh seasonal fruits topped with crunchy mixed nuts and a golden honey drizzle.\nSweet, crunchy and nutritious — a wholesome breakfast or dessert bowl.',
  },
  {
    file: 'Weight Loss Fruit Bowl.jpeg',
    slug: 'weight-loss-fruit-bowl.jpeg',
    name: 'Weight Loss Fruit Bowl',
    embedText: 'weight loss fruit bowl low calorie fruit bowl diet fruit bowl healthy breakfast',
    description: 'Light, low-calorie seasonal fruits with chia seeds, lemon and a touch of mint.\nClean, refreshing and guilt-free — a bowl designed for healthy eating.',
  },
  {
    file: 'weight loss healthy bowls fruits salads.jpeg',
    slug: 'weight-loss-healthy-bowl.jpeg',
    name: 'Weight Loss Healthy Bowl',
    embedText: 'weight loss healthy bowl diet salad bowl fruit salad healthy eating clean food',
    description: 'A balanced bowl of fresh fruits, greens, seeds and light dressing for clean eating.\nNutritious, light and balanced — a healthy bowl for the wellness-minded.',
  },

  // ── MOCKTAILS ─────────────────────────────────────────────────────────────
  {
    file: 'Blood orange moctail.jpeg',
    slug: 'blood-orange-mocktail.jpeg',
    name: 'Blood Orange Mocktail',
    embedText: 'blood orange mocktail citrus mocktail orange drink refreshing cold drink non alcoholic',
    description: 'Vibrant blood orange juice with lime, soda and crushed ice in a tall glass.\nTangy, bold and stunning — a citrus mocktail with a dramatic red hue.',
  },
  {
    file: 'Green apple moctail.jpeg',
    slug: 'green-apple-mocktail.jpeg',
    name: 'Green Apple Mocktail',
    embedText: 'green apple mocktail sour apple drink fruity mocktail cold drink refreshing non alcoholic',
    description: 'Chilled green apple juice with mint, lime and sparkling soda over crushed ice.\nTart, crisp and refreshing — a vibrant green cooler with apple zing.',
  },
  {
    file: 'Lemon mint moctails.jpeg',
    slug: 'lemon-mint-mocktail.jpeg',
    name: 'Lemon Mint Mocktail',
    embedText: 'lemon mint mocktail virgin mojito citrus mint drink cold drink refreshing non alcoholic',
    description: 'Fresh lemon and mint muddled with sugar and topped with chilled soda over crushed ice.\nZesty, minty and refreshing — a classic citrus-mint cooler.',
  },
  {
    file: 'Mango moctail.jpeg',
    slug: 'mango-mocktail.jpeg',
    name: 'Mango Mocktail',
    embedText: 'mango mocktail mango drink tropical mocktail aam panna cold drink non alcoholic',
    description: 'Rich mango pulp blended with lime, sugar and soda, served over crushed ice.\nSweet, tropical and luscious — a mango lover\'s dream cooler.',
  },
  {
    file: 'pine apple moctail.jpeg',
    slug: 'pineapple-mocktail.jpeg',
    name: 'Pineapple Mocktail',
    embedText: 'pineapple mocktail tropical drink pineapple cooler cold drink refreshing non alcoholic',
    description: 'Fresh pineapple juice with lime, mint and sparkling soda over crushed ice.\nTropical, tangy and effervescent — a pineapple cooler that sparkles.',
  },
  {
    file: 'strawberry moctail.jpeg',
    slug: 'strawberry-mocktail.jpeg',
    name: 'Strawberry Mocktail',
    embedText: 'strawberry mocktail berry mocktail strawberry drink cold drink pink drink non alcoholic',
    description: 'Fresh strawberry puree blended with lime, sugar and soda over crushed ice.\nSweet, fruity and pink — a berry mocktail bursting with freshness.',
  },
  {
    file: 'Water melon moctail.jpeg',
    slug: 'watermelon-mocktail.jpeg',
    name: 'Watermelon Mocktail',
    embedText: 'watermelon mocktail melon drink summer cooler cold drink refreshing non alcoholic',
    description: 'Fresh watermelon juice with mint, lime and soda over crushed ice.\nLight, refreshing and naturally sweet — the ultimate summer mocktail.',
  },
  {
    file: 'blue curacco.jpeg',
    slug: 'blue-curacao-mocktail.jpeg',
    name: 'Blue Curacao Mocktail',
    embedText: 'blue curacao mocktail blue lagoon blue drink cold drink party drink non alcoholic',
    description: 'Vibrant blue mocktail with blue curacao syrup, lime juice and chilled soda.\nStunning, sweet and tangy — a party-perfect blue drink.',
  },

  // ── PUNCH ─────────────────────────────────────────────────────────────────
  {
    file: 'Pomegranate punch.jpeg',
    slug: 'pomegranate-punch.jpeg',
    name: 'Pomegranate Punch',
    embedText: 'pomegranate punch anar punch fruit punch red punch cold drink refreshing',
    description: 'Fresh pomegranate juice with citrus, ginger and sparkling soda over crushed ice.\nDeep ruby red, tangy and antioxidant-rich — a power punch with a kick.',
  },
  {
    file: 'Water melon punch.jpeg',
    slug: 'watermelon-punch.jpeg',
    name: 'Watermelon Punch',
    embedText: 'watermelon punch melon punch fruit punch summer drink cold refreshing',
    description: 'Fresh watermelon blended with lime, mint and a hint of ginger over crushed ice.\nLight, sweet and ultra-refreshing — a summer punch that cools you down.',
  },
  {
    file: 'pine apple punch.jpeg',
    slug: 'pineapple-punch.jpeg',
    name: 'Pineapple Punch',
    embedText: 'pineapple punch tropical punch fruit punch cold drink summer cooler',
    description: 'Fresh pineapple juice with citrus, ginger and soda over crushed ice.\nTropical, tangy and energising — a pineapple punch with zesty kick.',
  },

  // ── SEAFOOD ───────────────────────────────────────────────────────────────
  {
    file: 'Fish Finger.jpeg',
    slug: 'fish-finger-v6.jpeg',
    name: 'Fish Finger',
    embedText: 'fish finger fish stick breaded fish crispy fried fish kids snack seafood starter',
    description: 'Golden crispy breadcrumb-coated fish fingers fried until perfectly crunchy.\nCrispy, flaky and kid-friendly — served with tartare sauce or ketchup.',
  },
  {
    file: 'Crab lolipop.jpeg',
    slug: 'crab-lollipop.jpeg',
    name: 'Crab Lollipop',
    embedText: 'crab lollipop crab claw fried crab seafood starter crispy crab lolipop',
    description: 'Crispy fried crab claws shaped into lollipops, seasoned with spices and served hot.\nCrunchy, succulent and premium — a seafood starter that impresses.',
  },
  {
    file: 'Lobster fried.jpeg',
    slug: 'lobster-fried.jpeg',
    name: 'Lobster Fried',
    embedText: 'lobster fried crispy lobster fried lobster tail premium seafood luxury starter',
    description: 'Whole lobster deep-fried golden with a crispy seasoned coating.\nCrunchy, luxurious and succulent — premium seafood at its indulgent best.',
  },
  {
    file: 'Tiger prawn.jpeg',
    slug: 'tiger-prawn.jpeg',
    name: 'Tiger Prawn',
    embedText: 'tiger prawn jumbo prawn king prawn grilled prawn premium seafood',
    description: 'Jumbo tiger prawns grilled or fried with garlic butter, lemon and fresh herbs.\nSucculent, meaty and premium — king-sized prawns with bold flavour.',
  },

  // ── VEGGIE FINGER ─────────────────────────────────────────────────────────
  {
    file: 'Veggie finger.jpeg',
    slug: 'veggie-finger.jpeg',
    name: 'Veggie Finger',
    embedText: 'veggie finger vegetable stick breaded veg finger crispy veg snack veg starter',
    description: 'Golden crispy breaded vegetable fingers with a savoury mixed veg filling.\nCrunchy, savoury and kid-friendly — the vegetarian answer to fish fingers.',
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nSeeding ${IMAGES.length} images from "Food images 6/"...\n`);

  let uploaded = 0;
  let updated = 0;
  let failed = 0;

  const batches = chunk(IMAGES, 5);

  for (const [batchIdx, batch] of batches.entries()) {
    console.log(`\n── Batch ${batchIdx + 1}/${batches.length} ──`);

    const results = await Promise.allSettled(
      batch.map(async (img) => {
        const filePath    = path.join(FOLDER, img.file);
        const storagePath = `cafe-foods/${img.slug}`;
        const imageUrl    = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;

        if (!fs.existsSync(filePath)) {
          throw new Error(`File not found: ${img.file}`);
        }
        const fileBuffer = fs.readFileSync(filePath);
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, fileBuffer, { contentType: 'image/jpeg', upsert: true });
        if (uploadError) {
          throw new Error(`Upload failed: ${img.slug} — ${uploadError.message}`);
        }
        console.log(`  ✓ Uploaded: ${img.slug}`);

        const embRes = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: img.embedText,
        });
        const embedding = embRes.data[0].embedding;

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
          throw new Error(`DB upsert failed: ${img.name} — ${dbError.message}`);
        }

        return { name: img.name, isUpdate: !!existing };
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value.isUpdate) {
          console.log(`  ✓ DB updated: ${result.value.name}`);
          updated++;
        } else {
          console.log(`  ✓ DB inserted: ${result.value.name}`);
          uploaded++;
        }
      } else {
        console.error(`  ✗ ${result.reason.message}`);
        failed++;
      }
    }

    if (batchIdx < batches.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\nDone! Batch-6 seeded.`);
  console.log(`  • New inserts: ${uploaded}`);
  console.log(`  • Updated:     ${updated}`);
  console.log(`  • Failed:      ${failed}\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
