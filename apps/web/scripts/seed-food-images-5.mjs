// scripts/seed-food-images-5.mjs
// Uploads images from "food image 5/" to Supabase Storage,
// generates OpenAI embeddings (name + synonyms for richer accuracy),
// and upserts rows into default_images table.
// Run: node scripts/seed-food-images-5.mjs

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
const FOLDER       = path.join(ROOT, 'archive', 'seed-assets', 'food-images-5');

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
  // ── BIRYANI ───────────────────────────────────────────────────────────────
  {
    file: '65 Briyani.jpeg',
    slug: '65-biryani.jpeg',
    name: '65 Biryani',
    embedText: '65 biryani chicken 65 biryani spicy fried chicken biryani hyderabadi biryani indian rice dish',
    description: 'Fiery chicken 65 pieces layered over fragrant basmati rice and slow-cooked with spices.\nBold, spicy and packed with flavour — a mashup of two all-time favourites in one pot.',
  },
  {
    file: 'Chicken Briyani.jpeg',
    slug: 'chicken-biryani-v5.jpeg',
    name: 'Chicken Biryani',
    embedText: 'chicken biryani chicken briyani hyderabadi biryani dum biryani indian rice dish non veg biryani',
    description: 'Tender chicken pieces layered with aromatic basmati rice, saffron and whole spices, slow-cooked dum style.\nRich, fragrant and deeply satisfying — the king of Indian rice dishes.',
  },
  {
    file: 'Chicken Tikka Briyani.jpeg',
    slug: 'chicken-tikka-biryani.jpeg',
    name: 'Chicken Tikka Biryani',
    embedText: 'chicken tikka biryani tikka biryani grilled chicken biryani smoky biryani indian rice',
    description: 'Smoky tandoori chicken tikka pieces layered with fragrant basmati rice and aromatic spices.\nCharred, bold and irresistible — biryani meets tandoor in every spoonful.',
  },
  {
    file: 'Egg briyani.jpeg',
    slug: 'egg-biryani.jpeg',
    name: 'Egg Biryani',
    embedText: 'egg biryani egg briyani boiled egg biryani anda biryani indian rice dish budget biryani',
    description: 'Fragrant basmati rice layered with spiced boiled eggs and aromatic masala.\nSimple, hearty and budget-friendly — a comforting biryani that never disappoints.',
  },
  {
    file: 'Mutton Briyani.jpeg',
    slug: 'mutton-biryani-v5.jpeg',
    name: 'Mutton Biryani',
    embedText: 'mutton biryani mutton briyani goat biryani lamb biryani hyderabadi dum biryani indian rice',
    description: 'Slow-cooked mutton on the bone layered with saffron-scented basmati rice and whole spices.\nRich, succulent and deeply aromatic — the ultimate celebration biryani.',
  },
  {
    file: 'Plain Briyani.jpeg',
    slug: 'plain-biryani.jpeg',
    name: 'Plain Biryani',
    embedText: 'plain biryani sada biryani kuska biryani rice only biryani veg biryani base',
    description: 'Fragrant basmati rice cooked with whole spices, saffron and fried onions — no meat, pure flavour.\nLight, aromatic and versatile — pairs beautifully with any curry or raita.',
  },
  {
    file: 'Prawn Briyani.jpeg',
    slug: 'prawn-biryani.jpeg',
    name: 'Prawn Biryani',
    embedText: 'prawn biryani shrimp biryani seafood biryani coastal biryani indian rice dish',
    description: 'Juicy prawns layered with fragrant basmati rice, coconut and coastal spices.\nLight, aromatic and bursting with seafood flavour — a coastal delicacy.',
  },
  {
    file: 'Tandoori Chicken briyani.jpeg',
    slug: 'tandoori-chicken-biryani.jpeg',
    name: 'Tandoori Chicken Biryani',
    embedText: 'tandoori chicken biryani smoky chicken biryani grilled chicken biryani tandoor biryani',
    description: 'Smoky tandoori chicken pieces layered with aromatic basmati rice and charred spices.\nBold, smoky and aromatic — tandoor-kissed biryani that stands out.',
  },
  {
    file: 'Veg briyani vegetable Briyani.jpeg',
    slug: 'veg-biryani-v5.jpeg',
    name: 'Veg Biryani',
    embedText: 'veg biryani vegetable biryani mixed veg biryani indian rice dish vegetarian biryani',
    description: 'Colourful mixed vegetables layered with fragrant basmati rice, saffron and whole spices.\nAromatic, hearty and flavourful — a vegetarian biryani that rivals the meaty ones.',
  },

  // ── PULAO ─────────────────────────────────────────────────────────────────
  {
    file: 'Chicken Pulao.jpeg',
    slug: 'chicken-pulao-v5.jpeg',
    name: 'Chicken Pulao',
    embedText: 'chicken pulao chicken pilaf one pot rice chicken rice indian rice dish light biryani',
    description: 'Tender chicken cooked with basmati rice, whole spices and caramelised onions in one pot.\nLight, fragrant and fuss-free — comfort food at its simplest best.',
  },
  {
    file: 'EGG Pulao.jpeg',
    slug: 'egg-pulao.jpeg',
    name: 'Egg Pulao',
    embedText: 'egg pulao egg pilaf anda pulao boiled egg rice indian rice dish quick meal',
    description: 'Fluffy basmati rice tossed with spiced boiled eggs, fried onions and whole spices.\nQuick, satisfying and homely — a simple one-pot meal for any day.',
  },
  {
    file: 'Paneer Pulao.jpeg',
    slug: 'paneer-pulao.jpeg',
    name: 'Paneer Pulao',
    embedText: 'paneer pulao paneer pilaf cottage cheese rice veg pulao indian rice dish',
    description: 'Fluffy basmati rice cooked with soft paneer cubes, peas and aromatic whole spices.\nMild, creamy and comforting — a vegetarian rice dish that satisfies.',
  },
  {
    file: 'Veg Pulao.jpeg',
    slug: 'veg-pulao-v5.jpeg',
    name: 'Veg Pulao',
    embedText: 'veg pulao vegetable pulao mixed veg pilaf indian rice dish light rice',
    description: 'Fluffy basmati rice cooked with mixed vegetables, whole spices and a touch of ghee.\nLight, aromatic and wholesome — a classic everyday Indian rice dish.',
  },

  // ── FRIED RICE ────────────────────────────────────────────────────────────
  {
    file: 'Chicken fried rice.jpeg',
    slug: 'chicken-fried-rice-v5.jpeg',
    name: 'Chicken Fried Rice',
    embedText: 'chicken fried rice indo chinese fried rice wok tossed rice chicken rice',
    description: 'Wok-tossed rice with juicy chicken pieces, vegetables, soy sauce and a hint of chilli.\nSmoky, savoury and addictive — Indo-Chinese comfort food at its best.',
  },
  {
    file: 'Egg Fried Rice.jpeg',
    slug: 'egg-fried-rice-v5.jpeg',
    name: 'Egg Fried Rice',
    embedText: 'egg fried rice anda fried rice indo chinese rice wok tossed egg rice',
    description: 'Fluffy rice wok-tossed with scrambled eggs, spring onions, soy sauce and vegetables.\nQuick, smoky and satisfying — a classic Indo-Chinese staple.',
  },
  {
    file: 'Egg Schezwan Fried Rice.jpeg',
    slug: 'egg-schezwan-fried-rice.jpeg',
    name: 'Egg Schezwan Fried Rice',
    embedText: 'egg schezwan fried rice spicy egg rice szechuan fried rice indo chinese spicy rice',
    description: 'Fiery wok-tossed rice with scrambled eggs, schezwan sauce, chilli and crunchy vegetables.\nBold, spicy and smoky — for those who like their fried rice with extra heat.',
  },
  {
    file: 'Gopi Fried rice.jpeg',
    slug: 'gobi-fried-rice.jpeg',
    name: 'Gobi Fried Rice',
    embedText: 'gobi fried rice cauliflower fried rice gopi fried rice veg fried rice indo chinese',
    description: 'Wok-tossed rice with crispy cauliflower florets, vegetables and soy sauce.\nSmoky, crunchy and flavourful — a veggie fried rice with real bite.',
  },
  {
    file: 'Mixed Fried rice.jpeg',
    slug: 'mixed-fried-rice.jpeg',
    name: 'Mixed Fried Rice',
    embedText: 'mixed fried rice combination fried rice chicken egg veg fried rice indo chinese',
    description: 'Wok-tossed rice loaded with chicken, egg, prawns and mixed vegetables in soy sauce.\nThe ultimate all-in-one fried rice — smoky, savoury and packed with everything.',
  },
  {
    file: 'Mushroom Fried Rice .jpeg',
    slug: 'mushroom-fried-rice-v5a.jpeg',
    name: 'Mushroom Fried Rice',
    embedText: 'mushroom fried rice indo chinese mushroom rice wok tossed rice veg fried rice',
    description: 'Wok-tossed rice with sliced mushrooms, spring onions, soy sauce and a hint of pepper.\nEarthy, smoky and umami-rich — a mushroom lover\'s fried rice.',
  },
  {
    file: 'Mushroom fried rice.jpeg',
    slug: 'mushroom-fried-rice-v5b.jpeg',
    name: 'Mushroom Fried Rice',
    embedText: 'mushroom fried rice mushroom rice wok fried chinese rice veg rice',
    description: 'Fragrant rice wok-tossed with sauteed mushrooms, garlic, soy and crunchy vegetables.\nSavoury, aromatic and satisfying — earthy mushroom goodness in every bite.',
  },
  {
    file: 'Paneer Fried rice.jpeg',
    slug: 'paneer-fried-rice.jpeg',
    name: 'Paneer Fried Rice',
    embedText: 'paneer fried rice cottage cheese fried rice veg fried rice indo chinese',
    description: 'Wok-tossed rice with golden paneer cubes, vegetables, soy sauce and spring onions.\nSmoky, protein-rich and satisfying — a vegetarian twist on classic fried rice.',
  },
  {
    file: 'Veg fried rice.jpeg',
    slug: 'veg-fried-rice-v5.jpeg',
    name: 'Veg Fried Rice',
    embedText: 'veg fried rice vegetable fried rice indo chinese rice wok tossed veg rice',
    description: 'Wok-tossed rice with crunchy mixed vegetables, soy sauce, garlic and spring onions.\nSmoky, colourful and quick — the go-to Indo-Chinese veg rice.',
  },
  {
    file: 'Veg schezwan fried rice.jpeg',
    slug: 'veg-schezwan-fried-rice.jpeg',
    name: 'Veg Schezwan Fried Rice',
    embedText: 'veg schezwan fried rice spicy veg rice szechuan fried rice indo chinese',
    description: 'Fiery wok-tossed rice with schezwan sauce, chilli, garlic and crunchy vegetables.\nBold, spicy and packed with heat — a spice lover\'s dream fried rice.',
  },

  // ── NOODLES ───────────────────────────────────────────────────────────────
  {
    file: 'Chicken Noodles.jpeg',
    slug: 'chicken-noodles-v5.jpeg',
    name: 'Chicken Noodles',
    embedText: 'chicken noodles chicken hakka noodles indo chinese noodles wok tossed noodles',
    description: 'Wok-tossed hakka noodles with juicy chicken strips, vegetables and soy-chilli sauce.\nSmoky, slurpy and loaded with flavour — Indo-Chinese noodles done right.',
  },
  {
    file: 'Egg noodles.jpeg',
    slug: 'egg-noodles-v5.jpeg',
    name: 'Egg Noodles',
    embedText: 'egg noodles egg hakka noodles indo chinese noodles anda noodles wok tossed',
    description: 'Wok-tossed hakka noodles with scrambled eggs, spring onions and soy-chilli sauce.\nSmoky, eggy and addictive — a quick noodle fix for any meal.',
  },
  {
    file: 'Veg Schezwan noodles.jpeg',
    slug: 'veg-schezwan-noodles.jpeg',
    name: 'Veg Schezwan Noodles',
    embedText: 'veg schezwan noodles spicy veg noodles szechuan noodles indo chinese hot noodles',
    description: 'Fiery wok-tossed noodles with schezwan sauce, garlic, chilli and crunchy vegetables.\nBold, spicy and smoky — noodles with serious heat for spice lovers.',
  },

  // ── CHICKEN STARTERS / DRY ────────────────────────────────────────────────
  {
    file: 'Chicken 65.jpeg',
    slug: 'chicken-65-v5.jpeg',
    name: 'Chicken 65',
    embedText: 'chicken 65 spicy fried chicken south indian chicken starter crispy chicken bar snack',
    description: 'Crispy deep-fried chicken tossed in fiery red chilli, curry leaves and yoghurt marinade.\nCrunchy outside, juicy inside — the iconic South Indian bar snack.',
  },
  {
    file: 'Chicken BBQ.jpeg',
    slug: 'chicken-bbq.jpeg',
    name: 'Chicken BBQ',
    embedText: 'chicken bbq barbecue chicken grilled chicken smoky chicken starter tandoor chicken',
    description: 'Smoky barbecue chicken pieces grilled until charred and glazed with tangy BBQ sauce.\nBold, smoky and finger-licking — perfect party starter or side.',
  },
  {
    file: 'Chicken Bharra.jpeg',
    slug: 'chicken-bharra.jpeg',
    name: 'Chicken Bharra',
    embedText: 'chicken bharra stuffed whole chicken roasted chicken north indian chicken tandoori',
    description: 'Whole chicken stuffed with spiced mince, eggs and nuts, roasted until golden and juicy.\nShowstopper, rich and celebratory — a Mughlai feast centrepiece.',
  },
  {
    file: 'Chicken lollypop.jpeg',
    slug: 'chicken-lollipop-v5.jpeg',
    name: 'Chicken Lollipop',
    embedText: 'chicken lollipop lollypop drumette fried chicken starter indo chinese bar snack',
    description: 'Crispy fried chicken drumettes shaped into lollipops and tossed in spicy chilli sauce.\nCrunchy, saucy and fun to eat — the ultimate Indo-Chinese party starter.',
  },
  {
    file: 'Chicken lolypop with Garlic Sauce.jpeg',
    slug: 'chicken-lollipop-garlic-sauce.jpeg',
    name: 'Chicken Lollipop with Garlic Sauce',
    embedText: 'chicken lollipop garlic sauce lollypop drumette fried chicken garlic chicken starter',
    description: 'Crispy chicken lollipops drizzled with rich, creamy garlic sauce and spring onions.\nCrunchy meets creamy — an irresistible lollipop upgrade with garlicky goodness.',
  },
  {
    file: 'Chicken salt and pepper.jpeg',
    slug: 'chicken-salt-and-pepper.jpeg',
    name: 'Chicken Salt and Pepper',
    embedText: 'chicken salt and pepper salt pepper chicken dry chicken starter indo chinese crispy chicken',
    description: 'Crispy chicken pieces tossed with crushed black pepper, salt, curry leaves and green chillies.\nPeppery, crunchy and addictive — a dry starter that packs a punch.',
  },
  {
    file: 'Chili Wings Fry.jpeg',
    slug: 'chilli-wings-fry.jpeg',
    name: 'Chilli Wings Fry',
    embedText: 'chilli wings fry spicy chicken wings fried wings hot wings bar snack starter',
    description: 'Crispy fried chicken wings tossed in fiery chilli sauce with garlic and spring onions.\nSpicy, crunchy and finger-licking — wings with serious heat.',
  },
  {
    file: 'Chilli Chicken Dry.jpeg',
    slug: 'chilli-chicken-dry-v5.jpeg',
    name: 'Chilli Chicken Dry',
    embedText: 'chilli chicken dry indo chinese dry chilli chicken spicy chicken starter bell pepper chicken',
    description: 'Crispy chicken chunks tossed with green chillies, bell peppers, soy and garlic in a dry wok.\nBold, spicy and smoky — the Indo-Chinese classic everyone orders.',
  },
  {
    file: 'Cocktail chicken Tikka.jpeg',
    slug: 'cocktail-chicken-tikka.jpeg',
    name: 'Cocktail Chicken Tikka',
    embedText: 'cocktail chicken tikka mini chicken tikka bite size tikka tandoori starter party snack',
    description: 'Bite-sized tandoori chicken tikka pieces marinated in spiced yoghurt and grilled golden.\nSmoky, juicy and perfect for sharing — party-sized tikka bites.',
  },
  {
    file: 'Dragon chicken.jpeg',
    slug: 'dragon-chicken.jpeg',
    name: 'Dragon Chicken',
    embedText: 'dragon chicken spicy crispy chicken indo chinese hot chicken starter fiery chicken',
    description: 'Crispy chicken tossed in a fiery dragon sauce with dried red chillies and Sichuan pepper.\nIntensely spicy, crunchy and addictive — not for the faint-hearted.',
  },
  {
    file: 'Fried Wings.jpeg',
    slug: 'fried-wings.jpeg',
    name: 'Fried Wings',
    embedText: 'fried wings crispy chicken wings deep fried wings golden wings bar snack starter',
    description: 'Golden crispy chicken wings deep-fried until perfectly crunchy and seasoned with spices.\nSimple, crunchy and juicy — classic fried wings that never go wrong.',
  },
  {
    file: 'Garlic Chicken.jpeg',
    slug: 'garlic-chicken.jpeg',
    name: 'Garlic Chicken',
    embedText: 'garlic chicken lehsuni chicken indo chinese garlic chicken dry chicken starter',
    description: 'Crispy chicken pieces tossed in a bold garlic sauce with spring onions and chilli flakes.\nGarlicky, crunchy and aromatic — a garlic lover\'s dream starter.',
  },
  {
    file: 'Grill Chicken.jpeg',
    slug: 'grill-chicken.jpeg',
    name: 'Grill Chicken',
    embedText: 'grill chicken grilled chicken roast chicken healthy chicken protein starter',
    description: 'Juicy chicken pieces marinated and grilled until charred with smoky, caramelised edges.\nClean, smoky and protein-packed — healthy grilled chicken done right.',
  },
  {
    file: 'Grill chicken with veg.jpeg',
    slug: 'grill-chicken-with-veg.jpeg',
    name: 'Grill Chicken with Veg',
    embedText: 'grill chicken with vegetables grilled chicken veg platter healthy meal protein plate',
    description: 'Grilled chicken served alongside charred vegetables and a light herb dressing.\nHealthy, balanced and flavourful — a complete protein-packed plate.',
  },
  {
    file: 'Lemony Chicken.jpeg',
    slug: 'lemony-chicken.jpeg',
    name: 'Lemony Chicken',
    embedText: 'lemony chicken lemon chicken citrus chicken tangy chicken starter chinese lemon chicken',
    description: 'Crispy chicken pieces glazed in a tangy lemon sauce with a hint of honey and garlic.\nBright, tangy and sweet — a refreshing twist on crispy chicken.',
  },
  {
    file: 'Peri peri chicken.jpeg',
    slug: 'peri-peri-chicken.jpeg',
    name: 'Peri Peri Chicken',
    embedText: 'peri peri chicken african spice chicken grilled spicy chicken hot chicken',
    description: 'Chicken grilled with fiery peri peri marinade — chilli, lemon, garlic and paprika.\nBold, smoky and seriously spicy — grilled perfection with African heat.',
  },

  // ── CHICKEN CURRIES ───────────────────────────────────────────────────────
  {
    file: 'Butter chicken.jpeg',
    slug: 'butter-chicken-v5.jpeg',
    name: 'Butter Chicken',
    embedText: 'butter chicken murgh makhani creamy chicken curry tomato chicken north indian gravy',
    description: 'Tender tandoori chicken simmered in a rich, velvety tomato-butter-cream sauce.\nCreamy, mildly spiced and universally loved — the crown jewel of North Indian curries.',
  },
  {
    file: 'Chicken Patiala.jpeg',
    slug: 'chicken-patiala.jpeg',
    name: 'Chicken Patiala',
    embedText: 'chicken patiala punjabi chicken curry rich creamy chicken north indian chicken gravy',
    description: 'Rich Punjabi chicken curry simmered in a creamy cashew-onion gravy with aromatic spices.\nRoyal, creamy and indulgent — a Patiala speciality fit for a king.',
  },
  {
    file: 'Chicken RARA.jpeg',
    slug: 'chicken-rara.jpeg',
    name: 'Chicken Rara',
    embedText: 'chicken rara rara chicken keema chicken mince chicken curry double chicken punjabi',
    description: 'Chunky chicken pieces cooked with spiced chicken mince in a rich, spicy gravy.\nDouble the chicken, double the flavour — a bold Punjabi speciality.',
  },
  {
    file: 'Chicken chettinad.jpeg',
    slug: 'chicken-chettinad-v5.jpeg',
    name: 'Chicken Chettinad',
    embedText: 'chicken chettinad chettinad chicken south indian chicken curry spicy pepper chicken tamil',
    description: 'Fiery chicken curry with freshly ground Chettinad spices, black pepper and fennel.\nBold, aromatic and intensely flavourful — Tamil Nadu\'s most famous chicken curry.',
  },
  {
    file: 'Chicken Tikka masala.jpeg',
    slug: 'chicken-tikka-masala-v5.jpeg',
    name: 'Chicken Tikka Masala',
    embedText: 'chicken tikka masala tikka masala curry creamy tomato chicken tandoori chicken gravy',
    description: 'Smoky tandoori chicken tikka pieces simmered in a creamy, spiced tomato masala gravy.\nRich, creamy and smoky — the world-famous curry that needs no introduction.',
  },
  {
    file: 'Dhaba style chicken curry.jpeg',
    slug: 'dhaba-style-chicken-curry.jpeg',
    name: 'Dhaba Style Chicken Curry',
    embedText: 'dhaba style chicken curry highway chicken curry rustic chicken north indian home style chicken',
    description: 'Rustic, hearty chicken curry cooked the highway dhaba way with bold spices and mustard oil.\nNo-frills, spicy and soul-satisfying — the way truck-stop dhabas make it.',
  },
  {
    file: 'Home style chicken curry.jpeg',
    slug: 'home-style-chicken-curry.jpeg',
    name: 'Home Style Chicken Curry',
    embedText: 'home style chicken curry everyday chicken curry simple chicken gravy comfort food',
    description: 'Simple, everyday chicken curry with onion-tomato gravy and classic home spices.\nComforting, familiar and homely — like amma\'s kitchen, every single time.',
  },
  {
    file: 'Kadai chicken.jpeg',
    slug: 'kadai-chicken-v5.jpeg',
    name: 'Kadai Chicken',
    embedText: 'kadai chicken karahi chicken bell pepper chicken north indian chicken curry semi dry',
    description: 'Chicken pieces cooked with bell peppers, tomatoes and freshly ground kadai masala.\nSemi-dry, spicy and aromatic — a North Indian classic cooked in the kadai.',
  },
  {
    file: 'Pudina Chicken.jpeg',
    slug: 'pudina-chicken.jpeg',
    name: 'Pudina Chicken',
    embedText: 'pudina chicken mint chicken green chicken curry herby chicken south indian',
    description: 'Chicken cooked in a vibrant green gravy of fresh mint, coriander and green chillies.\nHerby, fresh and aromatic — a vibrant green curry bursting with flavour.',
  },
  {
    file: 'Punjab Murgh masala.jpeg',
    slug: 'punjab-murgh-masala.jpeg',
    name: 'Punjab Murgh Masala',
    embedText: 'punjab murgh masala punjabi chicken masala north indian chicken curry spicy chicken',
    description: 'Bold Punjabi chicken masala cooked with onion-tomato base, yoghurt and aromatic spices.\nRich, spicy and robust — authentic Punjab chicken masala with full-bodied flavour.',
  },

  // ── CHICKEN TANDOOR / TIKKA ───────────────────────────────────────────────
  {
    file: 'Achari chicken tandoori.jpeg',
    slug: 'achari-chicken-tandoori.jpeg',
    name: 'Achari Chicken Tandoori',
    embedText: 'achari chicken tandoori pickle marinated chicken tandoor grilled chicken north indian starter',
    description: 'Chicken marinated in tangy pickle spices and roasted in the tandoor until smoky and charred.\nTangy, smoky and bold — a pickle-lover\'s take on tandoori chicken.',
  },
  {
    file: 'Achari chicken tikka.jpeg',
    slug: 'achari-chicken-tikka.jpeg',
    name: 'Achari Chicken Tikka',
    embedText: 'achari chicken tikka pickle tikka tangy chicken tikka tandoor grilled starter',
    description: 'Boneless chicken tikka marinated with tangy achari spices and grilled in the tandoor.\nTangy, smoky and aromatic — tikka with a bold pickle twist.',
  },
  {
    file: 'Banjara Chicken Tikka.jpeg',
    slug: 'banjara-chicken-tikka.jpeg',
    name: 'Banjara Chicken Tikka',
    embedText: 'banjara chicken tikka nomadic style tikka rustic chicken tandoor grilled chicken starter',
    description: 'Rustic-style chicken tikka marinated in bold Banjara spices and charred in the tandoor.\nSmoky, rustic and intensely spiced — a nomadic flavour experience.',
  },
  {
    file: 'Chicken Tandoori.jpeg',
    slug: 'chicken-tandoori-v5.jpeg',
    name: 'Chicken Tandoori',
    embedText: 'chicken tandoori tandoori chicken whole leg tandoor grilled yoghurt marinated chicken',
    description: 'Classic tandoori chicken marinated in spiced yoghurt and roasted in the clay tandoor.\nSmoky, juicy and vibrant red — the iconic Indian grilled chicken.',
  },
  {
    file: 'Chicken Tikka Plater.jpeg',
    slug: 'chicken-tikka-platter.jpeg',
    name: 'Chicken Tikka Platter',
    embedText: 'chicken tikka platter tikka plate assorted tikka tandoor chicken starter sharing platter',
    description: 'Generous platter of boneless chicken tikka with mint chutney, onion rings and lemon.\nSmoky, juicy and perfect for sharing — a tandoori feast on a plate.',
  },
  {
    file: 'Chicken Tikka.jpeg',
    slug: 'chicken-tikka-v5.jpeg',
    name: 'Chicken Tikka',
    embedText: 'chicken tikka boneless tikka tandoor grilled chicken yoghurt marinated tikka starter',
    description: 'Boneless chicken chunks marinated in spiced yoghurt and char-grilled in the tandoor.\nSmoky, tender and juicy — the classic tandoori tikka everyone loves.',
  },
  {
    file: 'Malai Chicken Tikka.jpeg',
    slug: 'malai-chicken-tikka-v5.jpeg',
    name: 'Malai Chicken Tikka',
    embedText: 'malai chicken tikka cream tikka mild tikka cashew chicken tikka tandoor grilled',
    description: 'Boneless chicken marinated in rich cream, cashew paste and mild spices, grilled in tandoor.\nCreamy, melt-in-mouth and delicately spiced — tikka for those who like it mild.',
  },
  {
    file: 'Pudhina Chicken tikka.jpeg',
    slug: 'pudina-chicken-tikka.jpeg',
    name: 'Pudina Chicken Tikka',
    embedText: 'pudina chicken tikka mint chicken tikka green tikka herby tikka tandoor grilled',
    description: 'Chicken tikka marinated in fresh mint, coriander and green chilli paste, grilled in tandoor.\nHerby, fresh and vibrant green — a refreshing twist on classic tikka.',
  },

  // ── MUTTON ────────────────────────────────────────────────────────────────
  {
    file: 'Mutton CHukka.jpeg',
    slug: 'mutton-chukka.jpeg',
    name: 'Mutton Chukka',
    embedText: 'mutton chukka dry mutton fry south indian mutton varuval chettinad mutton pepper mutton',
    description: 'Tender mutton pieces dry-roasted with freshly ground pepper, fennel and curry leaves.\nBold, peppery and intensely flavourful — a South Indian mutton classic.',
  },

  // ── PANEER ────────────────────────────────────────────────────────────────
  {
    file: 'Anghara paneer Tikka.jpeg',
    slug: 'angara-paneer-tikka.jpeg',
    name: 'Angara Paneer Tikka',
    embedText: 'angara paneer tikka smoky paneer tikka charcoal flavoured paneer tandoor grilled veg starter',
    description: 'Paneer tikka infused with live charcoal smoke and grilled until beautifully charred.\nIntensely smoky, bold and dramatic — tikka with real angara (live coal) flavour.',
  },
  {
    file: 'Assorted Panner Tikka.jpeg',
    slug: 'assorted-paneer-tikka.jpeg',
    name: 'Assorted Paneer Tikka',
    embedText: 'assorted paneer tikka mixed paneer tikka variety tikka platter veg tandoor starter',
    description: 'A colourful assortment of paneer tikka varieties — malai, achari, pudina and classic.\nSmoky, varied and perfect for sharing — a tikka sampler platter.',
  },
  {
    file: 'Chilli Paneer Dry.jpeg',
    slug: 'chilli-paneer-dry-v5.jpeg',
    name: 'Chilli Paneer Dry',
    embedText: 'chilli paneer dry indo chinese paneer starter bell pepper paneer spicy paneer',
    description: 'Crispy paneer cubes tossed with green chillies, bell peppers, soy and garlic in a dry wok.\nBold, spicy and smoky — the vegetarian answer to chilli chicken.',
  },
  {
    file: 'Dhaba type panner.jpeg',
    slug: 'dhaba-style-paneer.jpeg',
    name: 'Dhaba Style Paneer',
    embedText: 'dhaba style paneer rustic paneer curry highway paneer north indian paneer',
    description: 'Rustic paneer curry cooked the dhaba way with bold spices, onion-tomato and mustard oil.\nNo-frills, hearty and packed with flavour — paneer the highway dhaba way.',
  },
  {
    file: 'Kabuli Panner Tikka.jpeg',
    slug: 'kabuli-paneer-tikka.jpeg',
    name: 'Kabuli Paneer Tikka',
    embedText: 'kabuli paneer tikka stuffed paneer tikka dry fruit paneer tandoor grilled veg starter',
    description: 'Paneer tikka stuffed with dry fruits and cream, grilled golden in the tandoor.\nRich, creamy and luxurious — a royal tikka with Kabuli-inspired filling.',
  },
  {
    file: 'Kadai Panner -.jpeg',
    slug: 'kadai-paneer-v5a.jpeg',
    name: 'Kadai Paneer',
    embedText: 'kadai paneer karahi paneer bell pepper paneer north indian paneer curry semi dry',
    description: 'Paneer cubes cooked with bell peppers, tomatoes and freshly ground kadai masala.\nSemi-dry, spicy and aromatic — a North Indian paneer classic.',
  },
  {
    file: 'Kadai panner.jpeg',
    slug: 'kadai-paneer-v5b.jpeg',
    name: 'Kadai Paneer',
    embedText: 'kadai paneer karahi paneer capsicum paneer spicy paneer curry north indian',
    description: 'Soft paneer cubes tossed with capsicum, onion and tomato in a bold kadai masala gravy.\nRobust, chunky and flavourful — kadai paneer the way you crave it.',
  },
  {
    file: 'Malai panner tikka.jpeg',
    slug: 'malai-paneer-tikka.jpeg',
    name: 'Malai Paneer Tikka',
    embedText: 'malai paneer tikka cream paneer tikka mild paneer tikka tandoor grilled veg starter',
    description: 'Soft paneer marinated in rich cream, cashew paste and mild spices, grilled in tandoor.\nCreamy, delicate and melt-in-mouth — the mildest, most luxurious tikka.',
  },
  {
    file: 'Palak Panner.jpeg',
    slug: 'palak-paneer-v5.jpeg',
    name: 'Palak Paneer',
    embedText: 'palak paneer spinach paneer saag paneer north indian green curry veg curry',
    description: 'Soft paneer cubes simmered in a vibrant, creamy spinach gravy with garlic and spices.\nIron-rich, creamy and comforting — the iconic North Indian green curry.',
  },
  {
    file: 'Paneer 65.jpeg',
    slug: 'paneer-65-v5.jpeg',
    name: 'Paneer 65',
    embedText: 'paneer 65 crispy paneer spicy fried paneer south indian paneer starter veg 65',
    description: 'Crispy fried paneer cubes tossed in fiery red chilli, curry leaves and yoghurt marinade.\nCrunchy, spicy and addictive — the vegetarian version of the iconic 65.',
  },
  {
    file: 'Paneer Lawabdar.jpeg',
    slug: 'paneer-lababdar.jpeg',
    name: 'Paneer Lababdar',
    embedText: 'paneer lababdar lawabdar rich paneer curry creamy tomato paneer mughlai paneer',
    description: 'Soft paneer in a rich, creamy tomato-cashew gravy with aromatic Mughlai spices.\nLuxurious, creamy and mildly spiced — paneer fit for royalty.',
  },
  {
    file: 'Paneer Tikka Plater.jpeg',
    slug: 'paneer-tikka-platter.jpeg',
    name: 'Paneer Tikka Platter',
    embedText: 'paneer tikka platter tikka plate assorted paneer tikka tandoor veg starter sharing',
    description: 'Generous platter of grilled paneer tikka with mint chutney, onion rings and lemon.\nSmoky, colourful and great for sharing — a vegetarian tandoori feast.',
  },
  {
    file: 'Paneer butter masala.jpeg',
    slug: 'paneer-butter-masala-v5.jpeg',
    name: 'Paneer Butter Masala',
    embedText: 'paneer butter masala paneer makhani creamy paneer curry tomato paneer butter paneer',
    description: 'Soft paneer cubes simmered in a rich, velvety tomato-butter-cream sauce.\nCreamy, mildly spiced and universally loved — the vegetarian butter chicken.',
  },
  {
    file: 'Pudina panner Tikka.jpeg',
    slug: 'pudina-paneer-tikka.jpeg',
    name: 'Pudina Paneer Tikka',
    embedText: 'pudina paneer tikka mint paneer tikka green paneer tikka herby veg tikka tandoor',
    description: 'Paneer tikka marinated in fresh mint, coriander and green chilli paste, grilled in tandoor.\nHerby, fresh and vibrant — a minty vegetarian tikka delight.',
  },
  {
    file: 'Shahi panner.jpeg',
    slug: 'shahi-paneer-v5.jpeg',
    name: 'Shahi Paneer',
    embedText: 'shahi paneer royal paneer curry cream cashew paneer mughlai paneer rich veg curry',
    description: 'Soft paneer in a luxurious cream-cashew-saffron gravy with aromatic whole spices.\nRoyal, rich and mildly sweet — the Mughlai paneer that lives up to its name.',
  },

  // ── VEG CURRIES / SUBZI ───────────────────────────────────────────────────
  {
    file: 'Alo gopi subzi.jpeg',
    slug: 'aloo-gobi-subzi.jpeg',
    name: 'Aloo Gobi Subzi',
    embedText: 'aloo gobi subzi potato cauliflower dry curry sabzi north indian veg side dish',
    description: 'Potato and cauliflower cooked dry with turmeric, cumin and simple home spices.\nHomely, comforting and everyday — the quintessential North Indian sabzi.',
  },
  {
    file: 'Dal Dhadka.jpeg',
    slug: 'dal-tadka-v5.jpeg',
    name: 'Dal Tadka',
    embedText: 'dal tadka dhadka yellow dal toor dal tempered lentils north indian dal everyday curry',
    description: 'Yellow toor dal tempered with ghee, cumin, garlic, dried red chillies and curry leaves.\nComforting, protein-rich and soul-warming — the everyday Indian lentil staple.',
  },
  {
    file: 'Dal fry subzi.jpeg',
    slug: 'dal-fry-v5.jpeg',
    name: 'Dal Fry',
    embedText: 'dal fry fried dal masala dal spiced lentils restaurant style dal north indian',
    description: 'Mixed lentils cooked with onion-tomato masala and tempered with ghee and spices.\nRich, smoky and restaurant-style — dal fry with that extra punch of flavour.',
  },
  {
    file: 'Dragon Gopi.jpeg',
    slug: 'dragon-gobi.jpeg',
    name: 'Dragon Gobi',
    embedText: 'dragon gobi dragon cauliflower spicy crispy gobi indo chinese fiery gobi starter',
    description: 'Crispy cauliflower tossed in fiery dragon sauce with dried red chillies and Sichuan pepper.\nIntensely spicy, crunchy and bold — the dragon-fire version of gobi manchurian.',
  },
  {
    file: 'Gopi manchurian dry.jpeg',
    slug: 'gobi-manchurian-dry.jpeg',
    name: 'Gobi Manchurian Dry',
    embedText: 'gobi manchurian dry cauliflower manchurian indo chinese veg starter crispy gobi',
    description: 'Crispy cauliflower florets tossed in tangy soy-chilli-garlic sauce with spring onions.\nCrunchy, saucy and addictive — the king of Indo-Chinese veg starters.',
  },
  {
    file: 'Kadai Veg subzi.jpeg',
    slug: 'kadai-veg-subzi.jpeg',
    name: 'Kadai Veg Subzi',
    embedText: 'kadai veg subzi mixed vegetable kadai bell pepper veg curry north indian semi dry',
    description: 'Mixed vegetables cooked with bell peppers, tomatoes and freshly ground kadai masala.\nSemi-dry, spicy and colourful — a hearty kadai vegetable medley.',
  },
  {
    file: 'Mix veg Makhanwala subzi.jpeg',
    slug: 'mix-veg-makhanwala.jpeg',
    name: 'Mix Veg Makhanwala',
    embedText: 'mix veg makhanwala butter veg curry creamy vegetable curry makhani sabzi north indian',
    description: 'Mixed vegetables simmered in a rich, creamy butter-tomato makhani sauce.\nCreamy, mild and colourful — a veg lover\'s version of makhani goodness.',
  },
  {
    file: 'Sarson ka saag.jpeg',
    slug: 'sarson-ka-saag.jpeg',
    name: 'Sarson Ka Saag',
    embedText: 'sarson ka saag mustard greens curry punjabi saag north indian winter curry',
    description: 'Slow-cooked mustard greens with spinach, ginger and a generous dollop of white butter.\nEarthy, warming and deeply Punjabi — best with hot makki ki roti.',
  },
  {
    file: 'Veg Diwani Handi.jpeg',
    slug: 'veg-diwani-handi.jpeg',
    name: 'Veg Diwani Handi',
    embedText: 'veg diwani handi mixed veg handi pot vegetable curry mughlai veg north indian',
    description: 'Mixed vegetables cooked in a creamy, aromatic gravy and served in a traditional handi pot.\nRich, royal and comforting — a Mughlai vegetable curry with festive charm.',
  },
  {
    file: 'Veg Kofta Curry.jpeg',
    slug: 'veg-kofta-curry.jpeg',
    name: 'Veg Kofta Curry',
    embedText: 'veg kofta curry vegetable kofta malai kofta mixed veg balls gravy north indian',
    description: 'Deep-fried mixed vegetable kofta balls simmered in a rich, creamy onion-tomato gravy.\nIndulgent, hearty and festive — a North Indian classic for special meals.',
  },
  {
    file: 'Veg kohiapuri.jpeg',
    slug: 'veg-kolhapuri.jpeg',
    name: 'Veg Kolhapuri',
    embedText: 'veg kolhapuri kohlapuri spicy mixed veg curry maharashtrian veg hot curry',
    description: 'Mixed vegetables in a fiery Kolhapuri masala with red chillies and roasted spices.\nBold, spicy and robust — a Maharashtrian curry that brings serious heat.',
  },
  {
    file: 'Veg manchurien dry.jpeg',
    slug: 'veg-manchurian-dry-v5.jpeg',
    name: 'Veg Manchurian Dry',
    embedText: 'veg manchurian dry mixed vegetable manchurian indo chinese veg starter crispy balls',
    description: 'Crispy mixed vegetable balls tossed in tangy soy-chilli-garlic sauce with spring onions.\nCrunchy, saucy and moreish — a classic Indo-Chinese veg starter.',
  },
  {
    file: 'malai Kofta.jpeg',
    slug: 'malai-kofta-v5.jpeg',
    name: 'Malai Kofta',
    embedText: 'malai kofta cream kofta paneer potato balls creamy gravy north indian rich veg curry',
    description: 'Soft paneer-potato kofta balls simmered in a rich, creamy cashew-tomato gravy.\nMelt-in-mouth, luxurious and indulgent — the crown jewel of vegetarian curries.',
  },
  {
    file: 'Mustered potato.jpeg',
    slug: 'mustard-potato.jpeg',
    name: 'Mustard Potato',
    embedText: 'mustard potato sarson aloo mustard seed potato dry curry veg side dish',
    description: 'Baby potatoes tossed in a tangy mustard seed and turmeric tempering.\nTangy, simple and rustic — a flavourful potato side with mustard zing.',
  },

  // ── MUSHROOM ──────────────────────────────────────────────────────────────
  {
    file: 'Achari Mushroom.jpeg',
    slug: 'achari-mushroom.jpeg',
    name: 'Achari Mushroom',
    embedText: 'achari mushroom pickle mushroom tangy mushroom curry spiced mushroom indian starter',
    description: 'Mushrooms cooked in a bold, tangy pickle-spice masala with mustard and fenugreek.\nTangy, earthy and aromatic — mushroom with a punchy achari twist.',
  },
  {
    file: 'Afkhani Mushroom.jpeg',
    slug: 'afghani-mushroom.jpeg',
    name: 'Afghani Mushroom',
    embedText: 'afghani mushroom cream mushroom mild mushroom tikka grilled mushroom veg starter',
    description: 'Mushrooms marinated in a mild cream-cashew paste and grilled until golden.\nCreamy, mild and smoky — a delicate mushroom tikka for cream lovers.',
  },
  {
    file: 'Mushroom 65.jpeg',
    slug: 'mushroom-65.jpeg',
    name: 'Mushroom 65',
    embedText: 'mushroom 65 crispy mushroom spicy fried mushroom south indian veg 65 starter',
    description: 'Crispy fried mushrooms tossed in fiery red chilli, curry leaves and yoghurt marinade.\nCrunchy, spicy and earthy — the vegetarian 65 that packs a punch.',
  },
  {
    file: 'Mushroom Salt & Pepper.jpeg',
    slug: 'mushroom-salt-and-pepper.jpeg',
    name: 'Mushroom Salt & Pepper',
    embedText: 'mushroom salt and pepper crispy mushroom pepper mushroom indo chinese veg starter',
    description: 'Crispy mushrooms tossed with crushed black pepper, salt, curry leaves and green chillies.\nPeppery, crunchy and earthy — a mushroom starter with bold simplicity.',
  },
  {
    file: 'Mushroom masala.jpeg',
    slug: 'mushroom-masala-v5.jpeg',
    name: 'Mushroom Masala',
    embedText: 'mushroom masala mushroom curry spicy mushroom gravy north indian mushroom',
    description: 'Juicy mushrooms simmered in a rich onion-tomato masala with aromatic spices.\nEarthy, saucy and comforting — a mushroom curry that goes with everything.',
  },

  // ── FISH / PRAWN / SEAFOOD ────────────────────────────────────────────────
  {
    file: 'Chilli Prawn.jpeg',
    slug: 'chilli-prawn.jpeg',
    name: 'Chilli Prawn',
    embedText: 'chilli prawn spicy prawn indo chinese prawn starter bell pepper prawn',
    description: 'Juicy prawns tossed with green chillies, bell peppers, soy and garlic in a spicy wok.\nBold, spicy and succulent — an Indo-Chinese prawn showstopper.',
  },
  {
    file: 'Fish 65 hot.jpeg',
    slug: 'fish-65-hot.jpeg',
    name: 'Fish 65 Hot',
    embedText: 'fish 65 hot extra spicy fish fry crispy fried fish south indian fish starter',
    description: 'Extra-spicy crispy fried fish tossed in fiery red chilli and curry leaves.\nCrunchy, scorching hot and addictive — fish 65 with the heat turned all the way up.',
  },
  {
    file: 'Fish 65.jpeg',
    slug: 'fish-65-v5.jpeg',
    name: 'Fish 65',
    embedText: 'fish 65 crispy fried fish spicy fish fry south indian fish starter',
    description: 'Crispy fried fish pieces tossed in fiery red chilli, curry leaves and yoghurt marinade.\nCrunchy outside, flaky inside — a South Indian fish lover\'s go-to starter.',
  },
  {
    file: 'Fish Curry.jpeg',
    slug: 'fish-curry-v5.jpeg',
    name: 'Fish Curry',
    embedText: 'fish curry meen kulambu south indian fish curry coastal fish gravy tamarind fish',
    description: 'Fresh fish simmered in a tangy tamarind-based curry with spices and coconut.\nTangy, spicy and aromatic — a classic South Indian fish curry.',
  },
  {
    file: 'Fish Finger.jpeg',
    slug: 'fish-finger.jpeg',
    name: 'Fish Finger',
    embedText: 'fish finger fish stick breaded fish fried fish crispy fish kids snack starter',
    description: 'Golden crispy breadcrumb-coated fish fingers fried until perfectly crunchy.\nCrispy, flaky and kid-friendly — served with tartare sauce or ketchup.',
  },
  {
    file: 'Prawn  65.jpeg',
    slug: 'prawn-65-v5.jpeg',
    name: 'Prawn 65',
    embedText: 'prawn 65 crispy prawn spicy fried prawn south indian prawn starter seafood 65',
    description: 'Crispy fried prawns tossed in fiery red chilli, curry leaves and yoghurt marinade.\nCrunchy, spicy and succulent — the seafood version of the beloved 65.',
  },
  {
    file: 'Prawn Curry.jpeg',
    slug: 'prawn-curry-v5.jpeg',
    name: 'Prawn Curry',
    embedText: 'prawn curry shrimp curry coastal prawn gravy coconut prawn curry seafood curry',
    description: 'Juicy prawns simmered in a rich, spiced coconut-tomato curry with curry leaves.\nSucculent, aromatic and coastal — a prawn curry that transports you to the seaside.',
  },
  {
    file: 'Prawn Fry.jpeg',
    slug: 'prawn-fry.jpeg',
    name: 'Prawn Fry',
    embedText: 'prawn fry fried prawn crispy prawn masala prawn dry prawn starter seafood',
    description: 'Juicy prawns shallow-fried with spices, curry leaves, garlic and a squeeze of lemon.\nCrispy, spicy and buttery — a simple prawn fry that steals the show.',
  },
  {
    file: 'Prawn salt & Pepper.jpeg',
    slug: 'prawn-salt-and-pepper.jpeg',
    name: 'Prawn Salt & Pepper',
    embedText: 'prawn salt and pepper crispy prawn pepper prawn indo chinese prawn starter seafood',
    description: 'Crispy prawns tossed with crushed black pepper, salt, curry leaves and green chillies.\nPeppery, crunchy and succulent — a prawn starter with bold simplicity.',
  },

  // ── EGG ───────────────────────────────────────────────────────────────────
  {
    file: 'Egg bhurji.jpeg',
    slug: 'egg-bhurji.jpeg',
    name: 'Egg Bhurji',
    embedText: 'egg bhurji scrambled egg indian style anda bhurji spiced scrambled egg street food',
    description: 'Spiced Indian scrambled eggs cooked with onions, tomatoes, green chillies and fresh coriander.\nQuick, flavourful and homely — street-style egg bhurji at its finest.',
  },
  {
    file: 'Egg curry.jpeg',
    slug: 'egg-curry-v5.jpeg',
    name: 'Egg Curry',
    embedText: 'egg curry anda curry boiled egg gravy spiced egg masala north indian curry',
    description: 'Boiled eggs simmered in a rich onion-tomato gravy with aromatic whole spices.\nSimple, hearty and protein-packed — a comforting everyday egg curry.',
  },

  // ── KEBAB ─────────────────────────────────────────────────────────────────
  {
    file: 'Cheese Seekh Kebab.jpeg',
    slug: 'cheese-seekh-kebab.jpeg',
    name: 'Cheese Seekh Kebab',
    embedText: 'cheese seekh kebab cheese stuffed kebab minced meat kebab tandoor grilled kebab',
    description: 'Minced meat seekh kebabs stuffed with molten cheese and grilled in the tandoor.\nSmoky outside, cheesy inside — kebabs with a gooey, indulgent surprise.',
  },
  {
    file: 'Corn malai Kebab.jpeg',
    slug: 'corn-malai-kebab.jpeg',
    name: 'Corn Malai Kebab',
    embedText: 'corn malai kebab cream corn kebab veg kebab sweet corn tikki tandoor starter',
    description: 'Soft corn and cream kebabs shaped on skewers and grilled golden in the tandoor.\nMild, creamy and sweet — a delicate vegetarian kebab that melts in your mouth.',
  },
  {
    file: 'Dahi seekh kebab.jpeg',
    slug: 'dahi-seekh-kebab.jpeg',
    name: 'Dahi Seekh Kebab',
    embedText: 'dahi seekh kebab yoghurt seekh kebab soft kebab hung curd kebab veg starter',
    description: 'Soft seekh kebabs made with hung curd and mild spices, grilled until lightly charred.\nCreamy, delicate and melt-in-mouth — a refreshing, cooling kebab.',
  },
  {
    file: 'Hara Bhara Kebab.jpeg',
    slug: 'hara-bhara-kebab.jpeg',
    name: 'Hara Bhara Kebab',
    embedText: 'hara bhara kebab green kebab spinach peas kebab veg starter healthy kebab',
    description: 'Green patties made with spinach, peas, potatoes and fresh herbs, pan-fried golden.\nCrispy, herby and vibrant — a healthy vegetarian kebab bursting with green goodness.',
  },
  {
    file: 'Hariyalo Alo tikka.jpeg',
    slug: 'hariyali-aloo-tikka.jpeg',
    name: 'Hariyali Aloo Tikka',
    embedText: 'hariyali aloo tikka green potato tikka mint coriander potato tandoor grilled veg',
    description: 'Baby potatoes marinated in green mint-coriander paste and grilled in the tandoor.\nHerby, smoky and vibrant — a refreshing green potato tikka.',
  },
  {
    file: 'Veg Seekh kebab.jpeg',
    slug: 'veg-seekh-kebab.jpeg',
    name: 'Veg Seekh Kebab',
    embedText: 'veg seekh kebab vegetable seekh mixed veg kebab tandoor grilled veg starter',
    description: 'Spiced mixed vegetable seekh kebabs shaped on skewers and grilled in the tandoor.\nSmoky, herby and perfectly charred — vegetarian seekh done right.',
  },

  // ── TANDOORI VEG ──────────────────────────────────────────────────────────
  {
    file: 'Tandoori alo.jpeg',
    slug: 'tandoori-aloo.jpeg',
    name: 'Tandoori Aloo',
    embedText: 'tandoori aloo tandoor potato grilled potato spiced potato veg tandoor starter',
    description: 'Baby potatoes marinated in spiced yoghurt and roasted golden in the tandoor.\nSmoky, crispy and soft inside — tandoor-kissed potatoes with real flavour.',
  },
  {
    file: 'Tandoori Gopi.jpeg',
    slug: 'tandoori-gobi.jpeg',
    name: 'Tandoori Gobi',
    embedText: 'tandoori gobi tandoor cauliflower grilled gobi roasted cauliflower veg tandoor',
    description: 'Cauliflower florets marinated in spiced yoghurt and charred in the tandoor.\nSmoky, crispy-edged and tender — a stunning vegetarian tandoor dish.',
  },
  {
    file: 'Tandhoori Alo paratha.jpeg',
    slug: 'tandoori-aloo-paratha.jpeg',
    name: 'Tandoori Aloo Paratha',
    embedText: 'tandoori aloo paratha stuffed potato paratha tandoor baked bread indian bread',
    description: 'Potato-stuffed paratha baked in the tandoor until crispy and flaky.\nSmoky, crispy and filling — a tandoor-baked upgrade of the classic aloo paratha.',
  },
  {
    file: 'Mini Tandoori Plater.jpeg',
    slug: 'mini-tandoori-platter.jpeg',
    name: 'Mini Tandoori Platter',
    embedText: 'mini tandoori platter assorted tandoor starter non veg sharing platter mixed grill',
    description: 'A compact platter of assorted tandoori starters — tikka, seekh, wings and more.\nSmoky, varied and perfect for two — a mini tandoor feast.',
  },
  {
    file: 'Mini veg Tandoori plater.jpeg',
    slug: 'mini-veg-tandoori-platter.jpeg',
    name: 'Mini Veg Tandoori Platter',
    embedText: 'mini veg tandoori platter assorted veg tandoor paneer tikka veg kebab sharing platter',
    description: 'A compact platter of assorted vegetarian tandoori starters — paneer tikka, seekh and more.\nSmoky, colourful and great for sharing — a veggie tandoor sampler.',
  },
  {
    file: 'Tandoori Non veg plater.jpeg',
    slug: 'tandoori-non-veg-platter.jpeg',
    name: 'Tandoori Non Veg Platter',
    embedText: 'tandoori non veg platter mixed grill non veg platter assorted chicken tandoor sharing',
    description: 'Grand platter loaded with tandoori chicken, tikka, seekh kebab, wings and malai tikka.\nSmoky, meaty and spectacular — a tandoor feast for the whole table.',
  },
  {
    file: 'Tandoori Veg plater.jpeg',
    slug: 'tandoori-veg-platter.jpeg',
    name: 'Tandoori Veg Platter',
    embedText: 'tandoori veg platter assorted veg tandoor paneer tikka veg kebab mushroom tikka sharing',
    description: 'Grand platter of assorted veg tandoori items — paneer tikka, mushroom, corn kebab and more.\nSmoky, varied and vibrant — a vegetarian tandoor showpiece.',
  },

  // ── SOYA CHAAP ────────────────────────────────────────────────────────────
  {
    file: 'Malai Soya Chaap.jpeg',
    slug: 'malai-soya-chaap.jpeg',
    name: 'Malai Soya Chaap',
    embedText: 'malai soya chaap cream soya chaap mild soya tikka veg protein tandoor',
    description: 'Soft soya chaap marinated in rich cream and mild spices, grilled until golden.\nCreamy, mild and protein-packed — the vegetarian\'s answer to malai tikka.',
  },
  {
    file: 'Pudina soya chaap.jpeg',
    slug: 'pudina-soya-chaap.jpeg',
    name: 'Pudina Soya Chaap',
    embedText: 'pudina soya chaap mint soya chaap green soya tikka herby veg protein',
    description: 'Soya chaap marinated in fresh mint-coriander paste and grilled until charred.\nHerby, fresh and vibrant — a minty green soya chaap with tandoor smoke.',
  },

  // ── AFGHANI / BBQ ─────────────────────────────────────────────────────────
  {
    file: 'Afghani BBQ.jpeg',
    slug: 'afghani-bbq.jpeg',
    name: 'Afghani BBQ',
    embedText: 'afghani bbq cream barbecue mild grilled chicken afghani tikka starter',
    description: 'Creamy Afghani-style barbecue chicken grilled with mild cream-cashew marinade.\nMild, smoky and creamy — a gentle, luxurious take on barbecue.',
  },
  {
    file: 'Afghani chicken.jpeg',
    slug: 'afghani-chicken.jpeg',
    name: 'Afghani Chicken',
    embedText: 'afghani chicken cream chicken mild chicken tikka white gravy chicken starter',
    description: 'Chicken marinated in a mild cream-cheese-cashew paste and grilled until golden.\nCreamy, delicate and melt-in-mouth — Afghani-style chicken for cream lovers.',
  },
  {
    file: 'Irani BBQ.jpeg',
    slug: 'irani-bbq.jpeg',
    name: 'Irani BBQ',
    embedText: 'irani bbq persian barbecue saffron chicken grilled chicken starter middle eastern',
    description: 'Chicken grilled with an Irani-style saffron, yoghurt and lime marinade.\nAromatic, tangy and subtly sweet — a Persian-inspired barbecue with elegance.',
  },

  // ── BREADS ────────────────────────────────────────────────────────────────
  {
    file: 'Butten Naan.jpeg',
    slug: 'butter-naan-v5.jpeg',
    name: 'Butter Naan',
    embedText: 'butter naan buttered naan tandoor bread indian bread soft naan',
    description: 'Soft, fluffy naan baked in the tandoor and brushed generously with melted butter.\nPillowy, buttery and warm — the perfect bread to scoop up any curry.',
  },
  {
    file: 'Cheese Garlic naan.jpeg',
    slug: 'cheese-garlic-naan.jpeg',
    name: 'Cheese Garlic Naan',
    embedText: 'cheese garlic naan stuffed naan cheesy bread garlic bread tandoor indian bread',
    description: 'Naan stuffed with melted cheese and roasted garlic, baked golden in the tandoor.\nGooey, garlicky and irresistible — the ultimate indulgent naan.',
  },
  {
    file: 'Cheese naan.jpeg',
    slug: 'cheese-naan.jpeg',
    name: 'Cheese Naan',
    embedText: 'cheese naan stuffed cheese bread cheesy naan tandoor bread indian bread',
    description: 'Soft naan stuffed with molten cheese and baked until golden and bubbly.\nCheesy, stretchy and decadent — a cheese lover\'s dream bread.',
  },
  {
    file: 'Cheese parath.jpeg',
    slug: 'cheese-paratha.jpeg',
    name: 'Cheese Paratha',
    embedText: 'cheese paratha stuffed cheese flatbread cheesy paratha indian bread breakfast',
    description: 'Flaky paratha stuffed with melted cheese, pan-fried until golden and crispy.\nCheesy, buttery and comforting — a paratha that kids and adults both love.',
  },
  {
    file: 'Dhaniya Roti.jpeg',
    slug: 'dhaniya-roti.jpeg',
    name: 'Dhaniya Roti',
    embedText: 'dhaniya roti coriander roti herby flatbread green roti indian bread',
    description: 'Whole wheat roti infused with fresh coriander and mild spices, cooked on tawa.\nHerby, fragrant and healthy — a green twist on the everyday roti.',
  },
  {
    file: 'Garlic butter Naan.jpeg',
    slug: 'garlic-butter-naan.jpeg',
    name: 'Garlic Butter Naan',
    embedText: 'garlic butter naan garlic naan buttered garlic bread tandoor indian bread aromatic',
    description: 'Soft tandoor naan topped with roasted garlic and brushed with melted butter.\nAromatic, garlicky and irresistible — naan that steals the spotlight from the curry.',
  },
  {
    file: 'Garlic rotti.jpeg',
    slug: 'garlic-roti.jpeg',
    name: 'Garlic Roti',
    embedText: 'garlic roti garlic flatbread garlic chapati indian bread aromatic bread',
    description: 'Whole wheat roti infused with roasted garlic and a touch of butter.\nSimple, aromatic and flavourful — an everyday roti with garlicky punch.',
  },
  {
    file: 'Laccha Paratha.jpeg',
    slug: 'laccha-paratha-v5.jpeg',
    name: 'Laccha Paratha',
    embedText: 'laccha paratha layered paratha flaky paratha tandoor bread north indian bread',
    description: 'Multi-layered flaky paratha baked in the tandoor until crispy and golden.\nButtery, flaky and layered — each tear reveals another crispy sheet.',
  },
  {
    file: 'Methi paratha.jpeg',
    slug: 'methi-paratha.jpeg',
    name: 'Methi Paratha',
    embedText: 'methi paratha fenugreek paratha herby flatbread green paratha indian bread breakfast',
    description: 'Whole wheat paratha kneaded with fresh fenugreek leaves and mild spices, pan-fried golden.\nHerby, slightly bitter and wholesome — a healthy, flavourful flatbread.',
  },
  {
    file: 'Missi Roti.jpeg',
    slug: 'missi-roti.jpeg',
    name: 'Missi Roti',
    embedText: 'missi roti besan roti gram flour flatbread rajasthani roti protein bread',
    description: 'Spiced gram flour and whole wheat roti cooked on tawa with onions and chilli.\nProtein-rich, rustic and flavourful — a Rajasthani classic that pairs with everything.',
  },
  {
    file: 'Pudhina Paratha.jpeg',
    slug: 'pudina-paratha.jpeg',
    name: 'Pudina Paratha',
    embedText: 'pudina paratha mint paratha green paratha herby flatbread indian bread',
    description: 'Whole wheat paratha infused with fresh mint paste and mild spices, pan-fried golden.\nMinty, fragrant and refreshing — a cool green paratha with herby freshness.',
  },
  {
    file: 'Butter Roti.jpeg',
    slug: 'butter-roti.jpeg',
    name: 'Butter Roti',
    embedText: 'butter roti buttered chapati soft roti indian bread everyday bread',
    description: 'Soft whole wheat roti brushed with a generous layer of melted butter.\nSimple, warm and comforting — the everyday Indian bread, elevated with butter.',
  },
  {
    file: 'plain Roti.jpeg',
    slug: 'plain-roti-v5.jpeg',
    name: 'Plain Roti',
    embedText: 'plain roti chapati phulka whole wheat bread indian bread everyday flatbread',
    description: 'Simple whole wheat roti cooked on tawa until puffed and lightly charred.\nSoft, healthy and everyday — the timeless Indian flatbread staple.',
  },

  // ── BURGERS ───────────────────────────────────────────────────────────────
  {
    file: 'Chicken dynamite burger.jpeg',
    slug: 'chicken-dynamite-burger.jpeg',
    name: 'Chicken Dynamite Burger',
    embedText: 'chicken dynamite burger spicy chicken burger crispy chicken sandwich fast food',
    description: 'Crispy fried chicken patty loaded with dynamite sauce, lettuce, cheese and pickles.\nSpicy, crunchy and explosive — a burger with serious kick.',
  },
  {
    file: 'Classic chicken burger.jpeg',
    slug: 'classic-chicken-burger.jpeg',
    name: 'Classic Chicken Burger',
    embedText: 'classic chicken burger grilled chicken burger chicken sandwich fast food',
    description: 'Juicy grilled chicken patty with fresh lettuce, tomato, cheese and mayo in a toasted bun.\nSimple, juicy and satisfying — the classic chicken burger done right.',
  },
  {
    file: 'Crunchy Veg burger.jpeg',
    slug: 'crunchy-veg-burger.jpeg',
    name: 'Crunchy Veg Burger',
    embedText: 'crunchy veg burger crispy vegetable burger veg patty burger fast food',
    description: 'Crispy vegetable patty with fresh lettuce, onions, cheese and tangy sauce in a toasted bun.\nCrunchy, fresh and satisfying — a veggie burger with real crunch.',
  },
  {
    file: 'Dynamite veg burger.jpeg',
    slug: 'dynamite-veg-burger.jpeg',
    name: 'Dynamite Veg Burger',
    embedText: 'dynamite veg burger spicy veg burger crispy vegetable burger fast food hot',
    description: 'Crispy veg patty loaded with dynamite sauce, jalapenos, lettuce and cheese.\nSpicy, crunchy and explosive — the vegetarian dynamite experience.',
  },
  {
    file: 'Hot and Spicy veg burger.jpeg',
    slug: 'hot-spicy-veg-burger.jpeg',
    name: 'Hot and Spicy Veg Burger',
    embedText: 'hot and spicy veg burger spicy vegetable burger chilli veg burger fast food',
    description: 'Spicy veg patty with chilli sauce, jalapenos, lettuce and cheese in a toasted bun.\nFiery, crunchy and bold — for those who like their veg burgers with heat.',
  },
  {
    file: 'Hot and spicy chicken burger.jpeg',
    slug: 'hot-spicy-chicken-burger.jpeg',
    name: 'Hot and Spicy Chicken Burger',
    embedText: 'hot and spicy chicken burger spicy chicken burger chilli chicken sandwich fast food',
    description: 'Spicy crispy chicken patty with chilli sauce, jalapenos, lettuce and cheese.\nFiery, crunchy and intense — a chicken burger that brings the heat.',
  },
  {
    file: 'Juice Veg burger.jpeg',
    slug: 'juicy-veg-burger.jpeg',
    name: 'Juicy Veg Burger',
    embedText: 'juicy veg burger fresh vegetable burger healthy veg burger fast food',
    description: 'Juicy vegetable patty with fresh greens, tomato, cheese and mayo in a soft bun.\nFresh, juicy and wholesome — a lighter, healthier veg burger option.',
  },
  {
    file: 'Juice chicken burger.jpeg',
    slug: 'juicy-chicken-burger.jpeg',
    name: 'Juicy Chicken Burger',
    embedText: 'juicy chicken burger fresh chicken burger grilled chicken sandwich fast food',
    description: 'Thick juicy chicken patty with fresh greens, tomato, cheese and mayo in a soft bun.\nJuicy, hearty and satisfying — a burger built for chicken lovers.',
  },
  {
    file: 'Mac and Cheese veg burger.jpeg',
    slug: 'mac-cheese-veg-burger.jpeg',
    name: 'Mac and Cheese Veg Burger',
    embedText: 'mac and cheese veg burger cheesy veg burger pasta burger fusion burger fast food',
    description: 'Crispy veg patty topped with creamy mac and cheese, lettuce and tangy sauce.\nCheesy, indulgent and creative — a fusion burger with gooey mac & cheese.',
  },
  {
    file: 'Mac and cheese chicken burger.jpeg',
    slug: 'mac-cheese-chicken-burger.jpeg',
    name: 'Mac and Cheese Chicken Burger',
    embedText: 'mac and cheese chicken burger cheesy chicken burger pasta burger fusion fast food',
    description: 'Juicy chicken patty topped with creamy mac and cheese, lettuce and tangy sauce.\nCheesy, indulgent and loaded — chicken meets mac & cheese in burger form.',
  },
  {
    file: 'No bun chicken burger.jpeg',
    slug: 'no-bun-chicken-burger.jpeg',
    name: 'No Bun Chicken Burger',
    embedText: 'no bun chicken burger bunless burger lettuce wrap burger low carb chicken burger keto',
    description: 'Juicy chicken patty wrapped in fresh lettuce with cheese, tomato and sauce — no bun.\nLighter, fresher and low-carb — all the burger flavour without the bread.',
  },
  {
    file: 'Spicy chicken burger.jpeg',
    slug: 'spicy-chicken-burger.jpeg',
    name: 'Spicy Chicken Burger',
    embedText: 'spicy chicken burger chilli chicken burger hot chicken sandwich fast food',
    description: 'Crispy spiced chicken patty with chilli mayo, lettuce, tomato and cheese in a toasted bun.\nSpicy, crunchy and bold — a burger with a proper chilli kick.',
  },
  {
    file: 'Veg paneer burger.jpeg',
    slug: 'veg-paneer-burger.jpeg',
    name: 'Veg Paneer Burger',
    embedText: 'veg paneer burger paneer patty burger cottage cheese burger vegetarian fast food',
    description: 'Crispy paneer patty with fresh lettuce, onions, cheese and tangy sauce in a toasted bun.\nCrispy, cheesy and protein-rich — a paneer burger with real substance.',
  },
  {
    file: 'chicken burger.jpeg',
    slug: 'chicken-burger-v5.jpeg',
    name: 'Chicken Burger',
    embedText: 'chicken burger basic chicken burger simple chicken sandwich fast food',
    description: 'Classic chicken patty with lettuce, tomato and mayo in a soft sesame bun.\nSimple, satisfying and no-frills — the everyday chicken burger.',
  },

  // ── TOAST / BREAKFAST ─────────────────────────────────────────────────────
  {
    file: 'High Protein Veg toast.jpeg',
    slug: 'high-protein-veg-toast.jpeg',
    name: 'High Protein Veg Toast',
    embedText: 'high protein veg toast vegetable toast healthy breakfast protein toast avocado toast',
    description: 'Toasted bread loaded with protein-rich vegetables, hummus and seeds.\nHealthy, filling and nutritious — a power-packed breakfast toast.',
  },
  {
    file: 'Nutella banana toast.jpeg',
    slug: 'nutella-banana-toast.jpeg',
    name: 'Nutella Banana Toast',
    embedText: 'nutella banana toast chocolate banana toast sweet breakfast dessert toast',
    description: 'Crispy toast spread with Nutella and topped with fresh banana slices.\nSweet, chocolatey and indulgent — a breakfast treat everyone loves.',
  },
  {
    file: 'Peanut butter banana Toast.jpeg',
    slug: 'peanut-butter-banana-toast.jpeg',
    name: 'Peanut Butter Banana Toast',
    embedText: 'peanut butter banana toast pb toast healthy breakfast protein toast',
    description: 'Crispy toast spread with peanut butter and topped with sliced bananas and honey drizzle.\nNutty, sweet and protein-packed — a healthy, satisfying breakfast toast.',
  },
  {
    file: 'high protein chicken Toast.jpeg',
    slug: 'high-protein-chicken-toast.jpeg',
    name: 'High Protein Chicken Toast',
    embedText: 'high protein chicken toast chicken breast toast healthy breakfast protein meal',
    description: 'Toasted bread loaded with grilled chicken, vegetables and a protein-rich spread.\nHealthy, filling and muscled-up — a power breakfast for fitness lovers.',
  },
  {
    file: 'high protein veg wrap.jpeg',
    slug: 'high-protein-veg-wrap.jpeg',
    name: 'High Protein Veg Wrap',
    embedText: 'high protein veg wrap vegetable wrap healthy wrap protein wrap tortilla',
    description: 'Whole wheat wrap filled with protein-rich vegetables, paneer, hummus and greens.\nHealthy, portable and filling — a balanced meal wrapped and ready to go.',
  },

  // ── BREAKFAST BOWLS ───────────────────────────────────────────────────────
  {
    file: 'Choco Flake with fruit.jpeg',
    slug: 'choco-flake-with-fruit.jpeg',
    name: 'Choco Flake with Fruit',
    embedText: 'choco flake with fruit chocolate cereal bowl fruit bowl breakfast cereal',
    description: 'Crunchy chocolate cereal flakes served with fresh fruits and cold milk.\nChocolatey, crunchy and fun — a breakfast bowl that kids and adults love.',
  },
  {
    file: 'Corn Flake with fruit up.jpeg',
    slug: 'corn-flake-with-fruit.jpeg',
    name: 'Corn Flake with Fruit',
    embedText: 'corn flake with fruit cereal bowl fruit bowl breakfast cereal healthy breakfast',
    description: 'Crispy corn flakes served with fresh seasonal fruits and chilled milk.\nLight, crunchy and refreshing — a classic breakfast bowl to start the day.',
  },
  {
    file: 'Muesli Flakes with Fruits.jpeg',
    slug: 'muesli-flakes-with-fruits.jpeg',
    name: 'Muesli Flakes with Fruits',
    embedText: 'muesli flakes with fruits muesli bowl granola bowl healthy breakfast oats nuts',
    description: 'Crunchy muesli with oats, nuts, seeds and fresh fruits served with milk or yoghurt.\nHealthy, wholesome and crunchy — a nutrient-packed breakfast bowl.',
  },
  {
    file: 'Oats with fruit up.jpeg',
    slug: 'oats-with-fruit.jpeg',
    name: 'Oats with Fruit',
    embedText: 'oats with fruit oatmeal bowl porridge bowl healthy breakfast fiber breakfast',
    description: 'Warm oatmeal topped with fresh seasonal fruits, honey and a sprinkle of nuts.\nWarm, wholesome and nutritious — a healthy breakfast that fuels the morning.',
  },

  // ── DRINKS ────────────────────────────────────────────────────────────────
  {
    file: 'Badam Milk.jpeg',
    slug: 'badam-milk.jpeg',
    name: 'Badam Milk',
    embedText: 'badam milk almond milk indian almond drink saffron almond milk dessert drink',
    description: 'Rich almond milk blended with saffron, cardamom and sugar, served chilled or warm.\nCreamy, nutty and aromatic — a classic Indian dessert drink with saffron luxury.',
  },
  {
    file: 'Rose Milk.jpeg',
    slug: 'rose-milk-v5.jpeg',
    name: 'Rose Milk',
    embedText: 'rose milk rose sharbat pink milk rose flavoured milk cold drink tamil drink',
    description: 'Chilled milk blended with rose syrup and a hint of basil seeds.\nFragrant, pink and refreshing — a beloved South Indian summer cooler.',
  },

  // ── CHINESE PLATTER ───────────────────────────────────────────────────────
  {
    file: 'Chinese Plater.jpeg',
    slug: 'chinese-platter.jpeg',
    name: 'Chinese Platter',
    embedText: 'chinese platter combo platter indo chinese assorted chinese starter sharing plate',
    description: 'Assorted Indo-Chinese starters — spring rolls, manchurian, crispy chilli and fried rice.\nA loaded sharing platter with something for everyone — crunchy, saucy and bold.',
  },

  // ── CHEESE / SNACKS ───────────────────────────────────────────────────────
  {
    file: 'Cheese ball.jpeg',
    slug: 'cheese-ball.jpeg',
    name: 'Cheese Ball',
    embedText: 'cheese ball fried cheese balls cheesy snack crispy cheese starter party snack',
    description: 'Golden crispy cheese balls with a gooey, molten cheese centre.\nCrunchy outside, stretchy cheesy inside — an irresistible party snack.',
  },
  {
    file: 'French Fries.jpeg',
    slug: 'french-fries-v5.jpeg',
    name: 'French Fries',
    embedText: 'french fries chips fried potato crispy fries fast food side dish finger chips',
    description: 'Golden crispy french fries seasoned with salt and served piping hot.\nCrunchy, salty and addictive — the universal side dish everyone orders.',
  },

  // ── DESSERT ───────────────────────────────────────────────────────────────
  {
    file: 'vanila ice cream cake.jpeg',
    slug: 'vanilla-ice-cream-cake.jpeg',
    name: 'Vanilla Ice Cream Cake',
    embedText: 'vanilla ice cream cake ice cream cake dessert cake frozen cake birthday cake',
    description: 'Layered ice cream cake with vanilla ice cream, sponge and a drizzle of chocolate sauce.\nCold, creamy and celebratory — a frozen dessert cake for special moments.',
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
  console.log(`\nSeeding ${IMAGES.length} images from "food image 5/"...\n`);

  let uploaded = 0;
  let updated = 0;
  let failed = 0;

  // Process in batches of 5 to avoid rate limits
  const batches = chunk(IMAGES, 5);

  for (const [batchIdx, batch] of batches.entries()) {
    console.log(`\n── Batch ${batchIdx + 1}/${batches.length} ──`);

    const results = await Promise.allSettled(
      batch.map(async (img) => {
        const filePath    = path.join(FOLDER, img.file);
        const storagePath = `cafe-foods/${img.slug}`;
        const imageUrl    = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;

        // 1. Upload to Supabase Storage
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

    // Small delay between batches to be kind to rate limits
    if (batchIdx < batches.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\nDone! Batch-5 seeded.`);
  console.log(`  • New inserts: ${uploaded}`);
  console.log(`  • Updated:     ${updated}`);
  console.log(`  • Failed:      ${failed}\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
