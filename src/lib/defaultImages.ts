// Supabase Storage bucket that holds the default food/product image library.
// All URLs stored in public.default_images.image_url come from this bucket.
export const DEFAULT_IMAGE_BUCKET = 'default-images';

export const DEFAULT_IMAGE_BUCKET_PREFIX =
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${DEFAULT_IMAGE_BUCKET}`;

// Internal alias used within this module
const BUCKET_PREFIX = DEFAULT_IMAGE_BUCKET_PREFIX;

// Returns true if a given image URL came from our default image library.
// Used to decide whether a user-uploaded image should be preserved
// instead of being overwritten by an auto-match.
export function isDefaultImage(imageUrl: string): boolean {
  if (!imageUrl) return false;
  return imageUrl.includes(`/storage/v1/object/public/${DEFAULT_IMAGE_BUCKET}/`);
}

// ── Keyword → default image map ────────────────────────────────────────────────
// Used as a fast O(1) fallback when the vector similarity search returns no
// result (e.g. embedding model unavailable, new item with no close match).
// Keys are lowercase keywords; the value is the storage path under the bucket.
// Add more entries here as new images are seeded.

interface DefaultImageEntry {
  path: string;           // Storage object path (after bucket prefix)
  description: string;   // 2-line description shown in the product inventory card
}

const KEYWORD_MAP: Record<string, DefaultImageEntry> = {
  // ── Biryani ─────────────────────────────────────────────────────────────────
  biryani:         { path: 'cafe-foods/biriyani.jpeg',          description: 'Fragrant basmati rice slow-cooked with spices, topped with caramelised onions and fresh mint.\nA rich, aromatic one-pot meal served with raita and salan.' },
  biriyani:        { path: 'cafe-foods/biriyani.jpeg',          description: 'Fragrant basmati rice slow-cooked with spices, topped with caramelised onions and fresh mint.\nA rich, aromatic one-pot meal served with raita and salan.' },
  'dum biryani':   { path: 'cafe-foods/biriyani.jpeg',          description: 'Fragrant basmati rice slow-cooked with spices, topped with caramelised onions and fresh mint.\nA rich, aromatic one-pot meal served with raita and salan.' },
  'veg biryani':   { path: 'cafe-foods/biriyani.jpeg',          description: 'Fragrant basmati rice slow-cooked with spices, topped with caramelised onions and fresh mint.\nA rich, aromatic one-pot meal served with raita and salan.' },
  'chicken biryani': { path: 'cafe-foods/biriyani.jpeg',        description: 'Fragrant basmati rice slow-cooked with spices, topped with caramelised onions and fresh mint.\nA rich, aromatic one-pot meal served with raita and salan.' },
  'mutton biryani': { path: 'cafe-foods/mutton-biriyani.jpeg',  description: 'Slow-cooked tender mutton layered with saffron-infused basmati rice, fried onions and whole spices.\nA robust, deeply flavoured biryani — rich, hearty and utterly indulgent.' },
  'egg biryani':   { path: 'cafe-foods/egg-biriyani.jpeg',      description: 'Fragrant basmati rice layered with spiced boiled eggs, caramelised onions and fresh herbs.\nA vegetarian-friendly biryani with rich masala flavours and a saffron aroma.' },

  // ── Dosa ────────────────────────────────────────────────────────────────────
  dosa:            { path: 'cafe-foods/dosa.jpeg',              description: 'Golden crispy rice and lentil crepe fermented overnight for the perfect tang and crunch.\nServed with coconut chutney, tomato chutney, sambar and spiced potato filling.' },
  'masala dosa':   { path: 'cafe-foods/dosa.jpeg',              description: 'Golden crispy rice and lentil crepe fermented overnight for the perfect tang and crunch.\nServed with coconut chutney, tomato chutney, sambar and spiced potato filling.' },
  'plain dosa':    { path: 'cafe-foods/dosa.jpeg',              description: 'Golden crispy rice and lentil crepe fermented overnight for the perfect tang and crunch.\nServed with coconut chutney, tomato chutney, sambar and spiced potato filling.' },
  'paper dosa':    { path: 'cafe-foods/dosa.jpeg',              description: 'Golden crispy rice and lentil crepe fermented overnight for the perfect tang and crunch.\nServed with coconut chutney, tomato chutney, sambar and spiced potato filling.' },
  'rava dosa':     { path: 'cafe-foods/dosa.jpeg',              description: 'Golden crispy rice and lentil crepe fermented overnight for the perfect tang and crunch.\nServed with coconut chutney, tomato chutney, sambar and spiced potato filling.' },
  'set dosa':      { path: 'cafe-foods/dosa.jpeg',              description: 'Golden crispy rice and lentil crepe fermented overnight for the perfect tang and crunch.\nServed with coconut chutney, tomato chutney, sambar and spiced potato filling.' },
  'ghee dosa':     { path: 'cafe-foods/dosa.jpeg',              description: 'Golden crispy rice and lentil crepe fermented overnight for the perfect tang and crunch.\nServed with coconut chutney, tomato chutney, sambar and spiced potato filling.' },

  // ── Parotta ─────────────────────────────────────────────────────────────────
  parotta:         { path: 'cafe-foods/parotta.jpeg',           description: 'Flaky layered South Indian parotta made with maida, pan-fried golden and crispy.\nBest enjoyed with spicy chicken or vegetable salna and onion raita.' },
  paratha:         { path: 'cafe-foods/parotta.jpeg',           description: 'Flaky layered South Indian parotta made with maida, pan-fried golden and crispy.\nBest enjoyed with spicy chicken or vegetable salna and onion raita.' },
  parrota:         { path: 'cafe-foods/parotta.jpeg',           description: 'Flaky layered South Indian parotta made with maida, pan-fried golden and crispy.\nBest enjoyed with spicy chicken or vegetable salna and onion raita.' },
  'coin parotta':  { path: 'cafe-foods/parotta.jpeg',           description: 'Flaky layered South Indian parotta made with maida, pan-fried golden and crispy.\nBest enjoyed with spicy chicken or vegetable salna and onion raita.' },
  'kerala parotta': { path: 'cafe-foods/parotta.jpeg',          description: 'Flaky layered South Indian parotta made with maida, pan-fried golden and crispy.\nBest enjoyed with spicy chicken or vegetable salna and onion raita.' },

  // ── Grilled Chicken ─────────────────────────────────────────────────────────
  'grill chicken': { path: 'cafe-foods/grill-chicken.jpeg',     description: 'Whole chicken marinated in spiced yoghurt and char-grilled to smoky perfection.\nJuicy inside, beautifully charred outside — served with mint chutney and lime.' },
  'grilled chicken': { path: 'cafe-foods/grill-chicken.jpeg',   description: 'Whole chicken marinated in spiced yoghurt and char-grilled to smoky perfection.\nJuicy inside, beautifully charred outside — served with mint chutney and lime.' },
  'tandoori chicken': { path: 'cafe-foods/grill-chicken.jpeg',  description: 'Whole chicken marinated in spiced yoghurt and char-grilled to smoky perfection.\nJuicy inside, beautifully charred outside — served with mint chutney and lime.' },
  'bbq chicken':   { path: 'cafe-foods/grill-chicken.jpeg',     description: 'Whole chicken marinated in spiced yoghurt and char-grilled to smoky perfection.\nJuicy inside, beautifully charred outside — served with mint chutney and lime.' },
  'roast chicken': { path: 'cafe-foods/grill-chicken.jpeg',     description: 'Whole chicken marinated in spiced yoghurt and char-grilled to smoky perfection.\nJuicy inside, beautifully charred outside — served with mint chutney and lime.' },

  // ── Grilled Paneer ──────────────────────────────────────────────────────────
  paneer:          { path: 'cafe-foods/grill-paneer.jpeg',      description: 'Silky paneer cubes and vibrant peppers skewered and grilled over charcoal.\nSmoky, lightly charred and served with fresh mint chutney — a veggie grill favourite.' },
  'paneer tikka':  { path: 'cafe-foods/grill-paneer.jpeg',      description: 'Silky paneer cubes and vibrant peppers skewered and grilled over charcoal.\nSmoky, lightly charred and served with fresh mint chutney — a veggie grill favourite.' },
  'grill paneer':  { path: 'cafe-foods/grill-paneer.jpeg',      description: 'Silky paneer cubes and vibrant peppers skewered and grilled over charcoal.\nSmoky, lightly charred and served with fresh mint chutney — a veggie grill favourite.' },
  'grilled paneer': { path: 'cafe-foods/grill-paneer.jpeg',     description: 'Silky paneer cubes and vibrant peppers skewered and grilled over charcoal.\nSmoky, lightly charred and served with fresh mint chutney — a veggie grill favourite.' },

  // ── Chicken Noodles ─────────────────────────────────────────────────────────
  'chicken noodles': { path: 'cafe-foods/chicken-noodles.jpeg', description: 'Stir-fried egg noodles tossed with tender chicken strips and crunchy colourful vegetables.\nBold Indo-Chinese flavours with soy, chilli sauce and spring onions.' },
  'hakka noodles': { path: 'cafe-foods/chicken-noodles.jpeg',   description: 'Stir-fried egg noodles tossed with tender chicken strips and crunchy colourful vegetables.\nBold Indo-Chinese flavours with soy, chilli sauce and spring onions.' },
  'chow mein':     { path: 'cafe-foods/chicken-noodles.jpeg',   description: 'Stir-fried egg noodles tossed with tender chicken strips and crunchy colourful vegetables.\nBold Indo-Chinese flavours with soy, chilli sauce and spring onions.' },
  noodles:         { path: 'cafe-foods/chicken-noodles.jpeg',   description: 'Stir-fried egg noodles tossed with tender chicken strips and crunchy colourful vegetables.\nBold Indo-Chinese flavours with soy, chilli sauce and spring onions.' },

  // ── Chicken Fried Rice ──────────────────────────────────────────────────────
  'chicken rice':  { path: 'cafe-foods/chicken-rice.jpeg',      description: 'Wok-tossed rice with juicy chicken, mixed vegetables and a hint of soy and sesame.\nA satisfying Indo-Chinese classic served hot and fresh.' },
  'fried rice':    { path: 'cafe-foods/chicken-rice.jpeg',      description: 'Wok-tossed rice with juicy chicken, mixed vegetables and a hint of soy and sesame.\nA satisfying Indo-Chinese classic served hot and fresh.' },
  'chicken fried rice': { path: 'cafe-foods/chicken-rice.jpeg', description: 'Wok-tossed rice with juicy chicken, mixed vegetables and a hint of soy and sesame.\nA satisfying Indo-Chinese classic served hot and fresh.' },
  'veg fried rice': { path: 'cafe-foods/chicken-rice.jpeg',     description: 'Wok-tossed rice with juicy chicken, mixed vegetables and a hint of soy and sesame.\nA satisfying Indo-Chinese classic served hot and fresh.' },
  'egg fried rice': { path: 'cafe-foods/chicken-rice.jpeg',     description: 'Wok-tossed rice with juicy chicken, mixed vegetables and a hint of soy and sesame.\nA satisfying Indo-Chinese classic served hot and fresh.' },

  // ── Lemon Juice ─────────────────────────────────────────────────────────────
  'lemon juice':   { path: 'cafe-foods/lemon-juice.jpeg',       description: 'Freshly squeezed lemon juice over crushed ice with a hint of mint and a lemon slice.\nRefreshing and cooling — sweet, salted or spiced to your taste.' },
  'lime juice':    { path: 'cafe-foods/lemon-juice.jpeg',       description: 'Freshly squeezed lemon juice over crushed ice with a hint of mint and a lemon slice.\nRefreshing and cooling — sweet, salted or spiced to your taste.' },
  lemonade:        { path: 'cafe-foods/lemon-juice.jpeg',       description: 'Freshly squeezed lemon juice over crushed ice with a hint of mint and a lemon slice.\nRefreshing and cooling — sweet, salted or spiced to your taste.' },
  'nimbu pani':    { path: 'cafe-foods/lemon-juice.jpeg',       description: 'Freshly squeezed lemon juice over crushed ice with a hint of mint and a lemon slice.\nRefreshing and cooling — sweet, salted or spiced to your taste.' },
  'fresh lime':    { path: 'cafe-foods/lemon-juice.jpeg',       description: 'Freshly squeezed lemon juice over crushed ice with a hint of mint and a lemon slice.\nRefreshing and cooling — sweet, salted or spiced to your taste.' },

  // ── Lemon Soda ──────────────────────────────────────────────────────────────
  'lemon soda':    { path: 'cafe-foods/lemon-soda.jpeg',        description: 'Zingy lemon soda with berries and mint served over ice — bubbly and ultra-refreshing.\nThe perfect fizzy cooler for any South Indian meal.' },
  'lime soda':     { path: 'cafe-foods/lemon-soda.jpeg',        description: 'Zingy lemon soda with berries and mint served over ice — bubbly and ultra-refreshing.\nThe perfect fizzy cooler for any South Indian meal.' },
  soda:            { path: 'cafe-foods/lemon-soda.jpeg',        description: 'Zingy lemon soda with berries and mint served over ice — bubbly and ultra-refreshing.\nThe perfect fizzy cooler for any South Indian meal.' },
  'soda water':    { path: 'cafe-foods/lemon-soda.jpeg',        description: 'Zingy lemon soda with berries and mint served over ice — bubbly and ultra-refreshing.\nThe perfect fizzy cooler for any South Indian meal.' },

  // ── Atho Noodles ────────────────────────────────────────────────────────────
  atho:              { path: 'cafe-foods/veg-atho-noodles.jpeg',     description: 'Burmese Atho noodles tossed with colourful vegetables, tofu, crispy onions and peanuts.\nLight yet flavourful, with tangy tamarind, crunchy toppings and a hint of chilli.' },
  'veg atho':        { path: 'cafe-foods/veg-atho-noodles.jpeg',     description: 'Burmese Atho noodles tossed with colourful vegetables, tofu, crispy onions and peanuts.\nLight yet flavourful, with tangy tamarind, crunchy toppings and a hint of chilli.' },
  'atho noodles':    { path: 'cafe-foods/veg-atho-noodles.jpeg',     description: 'Burmese Atho noodles tossed with colourful vegetables, tofu, crispy onions and peanuts.\nLight yet flavourful, with tangy tamarind, crunchy toppings and a hint of chilli.' },
  'non veg atho':    { path: 'cafe-foods/non-veg-atho-noodles.jpeg', description: 'Myanmar-style Atho noodles in rich spiced broth with egg, crispy onions and peanuts.\nA bold, tangy noodle bowl packed with texture and deep umami flavour.' },
  'non veg atho noodles': { path: 'cafe-foods/non-veg-atho-noodles.jpeg', description: 'Myanmar-style Atho noodles in rich spiced broth with egg, crispy onions and peanuts.\nA bold, tangy noodle bowl packed with texture and deep umami flavour.' },
  'burmese noodles': { path: 'cafe-foods/non-veg-atho-noodles.jpeg', description: 'Myanmar-style Atho noodles in rich spiced broth with egg, crispy onions and peanuts.\nA bold, tangy noodle bowl packed with texture and deep umami flavour.' },

  // ── Chicken Shawarma ────────────────────────────────────────────────────────
  'chicken shawarma': { path: 'cafe-foods/chicken-shawarma.jpeg', description: 'Tender marinated chicken slow-roasted on a vertical spit, wrapped in soft flatbread with garlic sauce and pickled vegetables.\nA Middle Eastern street-food favourite — juicy, smoky and full of bold spices.' },
  shawarma:           { path: 'cafe-foods/chicken-shawarma.jpeg', description: 'Tender marinated chicken slow-roasted on a vertical spit, wrapped in soft flatbread with garlic sauce and pickled vegetables.\nA Middle Eastern street-food favourite — juicy, smoky and full of bold spices.' },

  // ── Veg Shawarma ────────────────────────────────────────────────────────────
  'veg shawarma':     { path: 'cafe-foods/veg-shawarma.jpeg',    description: 'Crispy spiced vegetables and paneer wrapped in soft flatbread with garlic sauce and fresh salad.\nA vegetarian twist on the Middle Eastern classic — filling and full of flavour.' },

  // ── Chicken Tikka ───────────────────────────────────────────────────────────
  'chicken tikka':    { path: 'cafe-foods/chicken-tikka.jpeg',   description: 'Boneless chicken pieces marinated in spiced yoghurt and char-grilled in a tandoor until smoky and juicy.\nServed with mint chutney, sliced onions and a squeeze of lime.' },
  tikka:              { path: 'cafe-foods/chicken-tikka.jpeg',   description: 'Boneless chicken pieces marinated in spiced yoghurt and char-grilled in a tandoor until smoky and juicy.\nServed with mint chutney, sliced onions and a squeeze of lime.' },

  // ── Egg Biryani ─────────────────────────────────────────────────────────────
  'egg biriyani':     { path: 'cafe-foods/egg-biriyani.jpeg',    description: 'Fragrant basmati rice layered with spiced boiled eggs, caramelised onions and fresh herbs.\nA vegetarian-friendly biryani with rich masala flavours and a saffron aroma.' },

  // ── Bread Omelette ──────────────────────────────────────────────────────────
  'bread omelette':   { path: 'cafe-foods/bread-omelette.jpeg',  description: 'Fluffy spiced egg omelette cooked with onions, green chilli and coriander, sandwiched between buttered bread slices.\nA quick, hearty breakfast or snack — crispy on the outside, soft inside.' },
  omelette:           { path: 'cafe-foods/bread-omelette.jpeg',  description: 'Fluffy spiced egg omelette cooked with onions, green chilli and coriander, sandwiched between buttered bread slices.\nA quick, hearty breakfast or snack — crispy on the outside, soft inside.' },

  // ── Brownie ─────────────────────────────────────────────────────────────────
  brownie:            { path: 'cafe-foods/brownie.jpeg',         description: 'Rich, fudgy chocolate brownie baked with dark chocolate and butter for a dense, moist crumb.\nServed warm with a dusting of powdered sugar or a scoop of vanilla ice cream.' },
  'chocolate brownie': { path: 'cafe-foods/brownie.jpeg',        description: 'Rich, fudgy chocolate brownie baked with dark chocolate and butter for a dense, moist crumb.\nServed warm with a dusting of powdered sugar or a scoop of vanilla ice cream.' },

  // ── Burger ──────────────────────────────────────────────────────────────────
  burger:             { path: 'cafe-foods/burger.jpeg',          description: 'Juicy grilled patty stacked with fresh lettuce, tomato, cheese and house sauce in a toasted sesame bun.\nA classic crowd-pleaser — crispy, saucy and satisfying with every bite.' },
  'veg burger':       { path: 'cafe-foods/burger.jpeg',          description: 'Juicy grilled patty stacked with fresh lettuce, tomato, cheese and house sauce in a toasted sesame bun.\nA classic crowd-pleaser — crispy, saucy and satisfying with every bite.' },
  'chicken burger':   { path: 'cafe-foods/burger.jpeg',          description: 'Juicy grilled patty stacked with fresh lettuce, tomato, cheese and house sauce in a toasted sesame bun.\nA classic crowd-pleaser — crispy, saucy and satisfying with every bite.' },

  // ── Butter Naan / Naan ──────────────────────────────────────────────────────
  'butter naan':      { path: 'cafe-foods/butter-naan.jpeg',     description: 'Soft leavened flatbread baked in a tandoor and generously brushed with melted butter.\nLight, fluffy and slightly charred — perfect with any curry or dal.' },
  naan:               { path: 'cafe-foods/naan.jpeg',            description: 'Soft, pillowy leavened bread baked in a tandoor — plain, garlic or stuffed with paneer or keema.\nThe perfect accompaniment to any North Indian curry or dal.' },
  'garlic naan':      { path: 'cafe-foods/naan.jpeg',            description: 'Soft, pillowy leavened bread baked in a tandoor — plain, garlic or stuffed with paneer or keema.\nThe perfect accompaniment to any North Indian curry or dal.' },

  // ── Chicken Leg Lollipop ────────────────────────────────────────────────────
  'chicken lollipop': { path: 'cafe-foods/chicken-leg-lollipop.jpeg', description: 'Chicken drumsticks marinated in spicy red masala and deep-fried to a crispy, juicy finish.\nA fun finger food — boldly spiced, crunchy outside and succulent inside.' },
  lollipop:           { path: 'cafe-foods/chicken-leg-lollipop.jpeg', description: 'Chicken drumsticks marinated in spicy red masala and deep-fried to a crispy, juicy finish.\nA fun finger food — boldly spiced, crunchy outside and succulent inside.' },
  'leg piece':        { path: 'cafe-foods/chicken-leg-lollipop.jpeg', description: 'Chicken drumsticks marinated in spicy red masala and deep-fried to a crispy, juicy finish.\nA fun finger food — boldly spiced, crunchy outside and succulent inside.' },

  // ── Chicken 65 ──────────────────────────────────────────────────────────────
  'chicken 65':       { path: 'cafe-foods/chicken-65.jpeg',      description: 'Bite-sized chicken pieces deep-fried in a fiery red spice marinade with curry leaves and green chilli.\nA South Indian classic starter — crispy, tangy and intensely flavourful.' },

  // ── Chicken BBQ ─────────────────────────────────────────────────────────────
  'chicken bbq':      { path: 'cafe-foods/chicken-bbq.jpeg',     description: 'Chicken pieces marinated in smoky BBQ sauce and grilled over open flame until charred and caramelised.\nSweet, smoky and tender — served with coleslaw and dipping sauce.' },

  // ── Chicken Kebab ───────────────────────────────────────────────────────────
  'chicken kebab':    { path: 'cafe-foods/chicken-kebab.jpeg',   description: 'Minced chicken blended with herbs and spices, shaped on skewers and grilled in a tandoor.\nSmooth, smoky and aromatic — served with green chutney and sliced onions.' },
  kebab:              { path: 'cafe-foods/chicken-kebab.jpeg',   description: 'Minced chicken blended with herbs and spices, shaped on skewers and grilled in a tandoor.\nSmooth, smoky and aromatic — served with green chutney and sliced onions.' },

  // ── Pizza ───────────────────────────────────────────────────────────────────
  'chicken pizza':    { path: 'cafe-foods/chicken-pizza.jpeg',   description: 'Thin or thick crust pizza topped with spiced chicken, mozzarella, capsicum and tangy tomato sauce.\nGolden, bubbly and loaded with toppings — a crowd favourite at any table.' },
  'veg pizza':        { path: 'cafe-foods/veg-pizza.jpeg',       description: 'Crispy pizza base topped with tangy tomato sauce, mozzarella, capsicum, corn and olives.\nGolden, cheesy and loaded with vegetables — a hearty vegetarian treat.' },
  pizza:              { path: 'cafe-foods/veg-pizza.jpeg',       description: 'Crispy pizza base topped with tangy tomato sauce, mozzarella, capsicum, corn and olives.\nGolden, cheesy and loaded with vegetables — a hearty vegetarian treat.' },

  // ── Chicken Tandoori ────────────────────────────────────────────────────────
  'chicken tandoori': { path: 'cafe-foods/chicken-tandoori.jpeg', description: 'Whole chicken marinated overnight in yoghurt, lemon and red spices, roasted in a clay tandoor oven.\nJuicy inside with a beautifully charred crust — served with onion rings and chutney.' },

  // ── Cool Drinks ─────────────────────────────────────────────────────────────
  'cool drinks':      { path: 'cafe-foods/cool-drinks.jpeg',     description: 'Chilled soft drinks and sodas served ice-cold — Pepsi, Coke, Sprite, Thumbs Up and more.\nThe perfect refresher to pair with any spicy South Indian meal.' },
  'soft drinks':      { path: 'cafe-foods/cool-drinks.jpeg',     description: 'Chilled soft drinks and sodas served ice-cold — Pepsi, Coke, Sprite, Thumbs Up and more.\nThe perfect refresher to pair with any spicy South Indian meal.' },
  'cold drinks':      { path: 'cafe-foods/cool-drinks.jpeg',     description: 'Chilled soft drinks and sodas served ice-cold — Pepsi, Coke, Sprite, Thumbs Up and more.\nThe perfect refresher to pair with any spicy South Indian meal.' },
  pepsi:              { path: 'cafe-foods/cool-drinks.jpeg',     description: 'Chilled soft drinks and sodas served ice-cold — Pepsi, Coke, Sprite, Thumbs Up and more.\nThe perfect refresher to pair with any spicy South Indian meal.' },
  coke:               { path: 'cafe-foods/cool-drinks.jpeg',     description: 'Chilled soft drinks and sodas served ice-cold — Pepsi, Coke, Sprite, Thumbs Up and more.\nThe perfect refresher to pair with any spicy South Indian meal.' },

  // ── Crab Fry ────────────────────────────────────────────────────────────────
  'crab fry':         { path: 'cafe-foods/crab-fry.jpeg',        description: 'Fresh crab pieces tossed in a fiery South Indian masala with curry leaves, pepper and coastal spices.\nDeep, bold seafood flavours — spicy, aromatic and absolutely finger-licking.' },
  crab:               { path: 'cafe-foods/crab-fry.jpeg',        description: 'Fresh crab pieces tossed in a fiery South Indian masala with curry leaves, pepper and coastal spices.\nDeep, bold seafood flavours — spicy, aromatic and absolutely finger-licking.' },

  // ── Curd Rice ───────────────────────────────────────────────────────────────
  'curd rice':        { path: 'cafe-foods/curd-rice.jpeg',       description: 'Soft cooked rice mixed with fresh yoghurt and tempered with mustard seeds, curry leaves and ginger.\nCooling, comforting and easy on the stomach — a South Indian staple.' },
  'thayir sadam':     { path: 'cafe-foods/curd-rice.jpeg',       description: 'Soft cooked rice mixed with fresh yoghurt and tempered with mustard seeds, curry leaves and ginger.\nCooling, comforting and easy on the stomach — a South Indian staple.' },

  // ── Fish Fry ────────────────────────────────────────────────────────────────
  'fish fry':         { path: 'cafe-foods/fish-fry.jpeg',        description: 'Fresh fish fillets coated in spiced masala and pan-fried or deep-fried until crispy and golden.\nCrunchy outside, flaky and juicy inside — best with lemon and onion salad.' },
  fish:               { path: 'cafe-foods/fish-fry.jpeg',        description: 'Fresh fish fillets coated in spiced masala and pan-fried or deep-fried until crispy and golden.\nCrunchy outside, flaky and juicy inside — best with lemon and onion salad.' },

  // ── French Fries ────────────────────────────────────────────────────────────
  'french fries':     { path: 'cafe-foods/french-fry.jpeg',      description: 'Golden crispy potato strips deep-fried to perfection and lightly salted.\nA universally loved snack — crunchy, hot and great with ketchup or dips.' },
  'french fry':       { path: 'cafe-foods/french-fry.jpeg',      description: 'Golden crispy potato strips deep-fried to perfection and lightly salted.\nA universally loved snack — crunchy, hot and great with ketchup or dips.' },
  fries:              { path: 'cafe-foods/french-fry.jpeg',      description: 'Golden crispy potato strips deep-fried to perfection and lightly salted.\nA universally loved snack — crunchy, hot and great with ketchup or dips.' },

  // ── Full Meals ──────────────────────────────────────────────────────────────
  'full meals':       { path: 'cafe-foods/full-meals.jpeg',      description: 'Traditional South Indian thali with steamed rice, sambar, rasam, kootu, papad, pickle and payasam.\nA complete balanced meal served on a banana leaf — wholesome and satisfying.' },
  'meals':            { path: 'cafe-foods/full-meals.jpeg',      description: 'Traditional South Indian thali with steamed rice, sambar, rasam, kootu, papad, pickle and payasam.\nA complete balanced meal served on a banana leaf — wholesome and satisfying.' },
  thali:              { path: 'cafe-foods/full-meals.jpeg',      description: 'Traditional South Indian thali with steamed rice, sambar, rasam, kootu, papad, pickle and payasam.\nA complete balanced meal served on a banana leaf — wholesome and satisfying.' },

  // ── Ice Cream ───────────────────────────────────────────────────────────────
  'ice cream':        { path: 'cafe-foods/ice-cream.jpeg',       description: 'Creamy, chilled ice cream scoops in classic and seasonal flavours — vanilla, chocolate, strawberry and more.\nA sweet, indulgent finish to any meal.' },
  icecream:           { path: 'cafe-foods/ice-cream.jpeg',       description: 'Creamy, chilled ice cream scoops in classic and seasonal flavours — vanilla, chocolate, strawberry and more.\nA sweet, indulgent finish to any meal.' },

  // ── Kadai Chicken ───────────────────────────────────────────────────────────
  'kadai chicken':    { path: 'cafe-foods/kadai-chicken.jpeg',   description: 'Chicken cooked in a wok with freshly ground spices, capsicum, onion and tomato in a rich masala gravy.\nRobust, aromatic and slightly dry — best mopped up with naan or roti.' },
  'karahi chicken':   { path: 'cafe-foods/kadai-chicken.jpeg',   description: 'Chicken cooked in a wok with freshly ground spices, capsicum, onion and tomato in a rich masala gravy.\nRobust, aromatic and slightly dry — best mopped up with naan or roti.' },

  // ── Lassi ───────────────────────────────────────────────────────────────────
  lassi:              { path: 'cafe-foods/lassi.jpeg',           description: 'Thick, chilled yoghurt drink blended smooth — sweet, salted or flavoured with mango or rose.\nCreamy, refreshing and the perfect antidote to spicy food.' },
  'mango lassi':      { path: 'cafe-foods/lassi.jpeg',           description: 'Thick, chilled yoghurt drink blended smooth — sweet, salted or flavoured with mango or rose.\nCreamy, refreshing and the perfect antidote to spicy food.' },

  // ── Malai Chicken ───────────────────────────────────────────────────────────
  'malai chicken':    { path: 'cafe-foods/malai-chicken.jpeg',   description: 'Tender chicken marinated in cream, cheese and mild spices, grilled to a silky, melt-in-mouth finish.\nDelicately spiced with a rich, creamy texture — a mild and luxurious kebab.' },
  'malai tikka':      { path: 'cafe-foods/malai-chicken.jpeg',   description: 'Tender chicken marinated in cream, cheese and mild spices, grilled to a silky, melt-in-mouth finish.\nDelicately spiced with a rich, creamy texture — a mild and luxurious kebab.' },

  // ── Mutton Biryani ──────────────────────────────────────────────────────────
  'mutton biriyani':  { path: 'cafe-foods/mutton-biriyani.jpeg', description: 'Slow-cooked tender mutton layered with saffron-infused basmati rice, fried onions and whole spices.\nA robust, deeply flavoured biryani — rich, hearty and utterly indulgent.' },

  // ── Paneer Butter Masala ────────────────────────────────────────────────────
  'paneer butter masala': { path: 'cafe-foods/paneer-butter-masala.jpeg', description: 'Soft paneer cubes simmered in a velvety tomato, butter and cashew gravy with aromatic spices.\nRich, creamy and mildly spiced — the quintessential North Indian vegetarian curry.' },
  'butter paneer':    { path: 'cafe-foods/paneer-butter-masala.jpeg', description: 'Soft paneer cubes simmered in a velvety tomato, butter and cashew gravy with aromatic spices.\nRich, creamy and mildly spiced — the quintessential North Indian vegetarian curry.' },

  // ── Prawn Biryani ───────────────────────────────────────────────────────────
  'prawn biryani':    { path: 'cafe-foods/prawn-biriyani.jpeg',  description: 'Plump prawns cooked with fragrant basmati rice, coastal spices, fried onions and fresh coriander.\nA succulent seafood biryani — bold, aromatic and irresistibly flavourful.' },
  'prawn biriyani':   { path: 'cafe-foods/prawn-biriyani.jpeg',  description: 'Plump prawns cooked with fragrant basmati rice, coastal spices, fried onions and fresh coriander.\nA succulent seafood biryani — bold, aromatic and irresistibly flavourful.' },
  prawn:              { path: 'cafe-foods/prawn-biriyani.jpeg',  description: 'Plump prawns cooked with fragrant basmati rice, coastal spices, fried onions and fresh coriander.\nA succulent seafood biryani — bold, aromatic and irresistibly flavourful.' },

  // ── Roti / Chapathi ─────────────────────────────────────────────────────────
  roti:               { path: 'cafe-foods/roti-chapathi.jpeg',   description: 'Soft whole-wheat flatbread rolled thin and cooked on a tawa until lightly puffed and golden.\nLight, healthy and versatile — pairs perfectly with any curry, dal or sabzi.' },
  chapathi:           { path: 'cafe-foods/roti-chapathi.jpeg',   description: 'Soft whole-wheat flatbread rolled thin and cooked on a tawa until lightly puffed and golden.\nLight, healthy and versatile — pairs perfectly with any curry, dal or sabzi.' },
  chapati:            { path: 'cafe-foods/roti-chapathi.jpeg',   description: 'Soft whole-wheat flatbread rolled thin and cooked on a tawa until lightly puffed and golden.\nLight, healthy and versatile — pairs perfectly with any curry, dal or sabzi.' },

  // ── Veg Noodles ─────────────────────────────────────────────────────────────
  'veg noodles':      { path: 'cafe-foods/veg-noodles.jpeg',     description: 'Stir-fried egg noodles tossed with colourful vegetables in soy, chilli and sesame sauce.\nA quick Indo-Chinese favourite — flavourful, light and satisfying.' },

  // ── Veg Salad ───────────────────────────────────────────────────────────────
  'veg salad':        { path: 'cafe-foods/veg-salad.jpeg',       description: 'Fresh garden salad with crisp lettuce, cucumber, tomato, carrot and a tangy lemon dressing.\nLight, crunchy and refreshing — a healthy starter or side.' },
  salad:              { path: 'cafe-foods/veg-salad.jpeg',       description: 'Fresh garden salad with crisp lettuce, cucumber, tomato, carrot and a tangy lemon dressing.\nLight, crunchy and refreshing — a healthy starter or side.' },

  // ── White Rice ──────────────────────────────────────────────────────────────
  'white rice':       { path: 'cafe-foods/white-rice.jpeg',      description: 'Soft, fluffy steamed white rice cooked to perfection — plain, simple and comforting.\nThe essential South Indian base — best with sambar, rasam, curd or any curry.' },
  'steamed rice':     { path: 'cafe-foods/white-rice.jpeg',      description: 'Soft, fluffy steamed white rice cooked to perfection — plain, simple and comforting.\nThe essential South Indian base — best with sambar, rasam, curd or any curry.' },
  rice:               { path: 'cafe-foods/white-rice.jpeg',      description: 'Soft, fluffy steamed white rice cooked to perfection — plain, simple and comforting.\nThe essential South Indian base — best with sambar, rasam, curd or any curry.' },

  // ── Batch 3 ─────────────────────────────────────────────────────────────────

  // ── Mushroom Soup ───────────────────────────────────────────────────────────
  'mushroom soup':    { path: 'cafe-foods/mushroom-soup.jpeg',   description: 'Velvety cream of mushroom soup simmered with garlic, herbs and fresh mushrooms.\nRich, warming and silky-smooth — served with toasted bread or croutons on the side.' },
  'cream of mushroom': { path: 'cafe-foods/mushroom-soup.jpeg',  description: 'Velvety cream of mushroom soup simmered with garlic, herbs and fresh mushrooms.\nRich, warming and silky-smooth — served with toasted bread or croutons on the side.' },

  // ── Mushroom Tikka ──────────────────────────────────────────────────────────
  'mushroom tikka':   { path: 'cafe-foods/mushroom-tikka.jpeg',  description: 'Plump button mushrooms marinated in spiced yoghurt and grilled in a tandoor until smoky and charred.\nA vegetarian starter with bold tandoori flavours — served with mint chutney and sliced onions.' },
  mushroom:           { path: 'cafe-foods/mushroom-tikka.jpeg',  description: 'Plump button mushrooms marinated in spiced yoghurt and grilled in a tandoor until smoky and charred.\nA vegetarian starter with bold tandoori flavours — served with mint chutney and sliced onions.' },

  // ── Chicken Soup ────────────────────────────────────────────────────────────
  'chicken soup':     { path: 'cafe-foods/chicken-soup.jpeg',    description: 'Comforting clear chicken broth simmered with vegetables, ginger and aromatic spices.\nLight, nourishing and warming — perfect as a starter or on a rainy day.' },
  'chicken broth':    { path: 'cafe-foods/chicken-soup.jpeg',    description: 'Comforting clear chicken broth simmered with vegetables, ginger and aromatic spices.\nLight, nourishing and warming — perfect as a starter or on a rainy day.' },
  'clear soup':       { path: 'cafe-foods/chicken-soup.jpeg',    description: 'Comforting clear chicken broth simmered with vegetables, ginger and aromatic spices.\nLight, nourishing and warming — perfect as a starter or on a rainy day.' },
  soup:               { path: 'cafe-foods/chicken-soup.jpeg',    description: 'Comforting clear chicken broth simmered with vegetables, ginger and aromatic spices.\nLight, nourishing and warming — perfect as a starter or on a rainy day.' },

  // ── Ghee Roast Dosa ─────────────────────────────────────────────────────────
  'ghee roast dosa':  { path: 'cafe-foods/ghee-roast-dosa.jpeg', description: 'Crispy golden dosa generously roasted in clarified butter on a hot tawa until deep amber and crunchy.\nRich, buttery and intensely flavoured — served with coconut chutney and spiced potato filling.' },
  'ghee roast dose':  { path: 'cafe-foods/ghee-roast-dosa.jpeg', description: 'Crispy golden dosa generously roasted in clarified butter on a hot tawa until deep amber and crunchy.\nRich, buttery and intensely flavoured — served with coconut chutney and spiced potato filling.' },
  'ghee roast':       { path: 'cafe-foods/ghee-roast-dosa.jpeg', description: 'Crispy golden dosa generously roasted in clarified butter on a hot tawa until deep amber and crunchy.\nRich, buttery and intensely flavoured — served with coconut chutney and spiced potato filling.' },

  // ── Lemon Rice ──────────────────────────────────────────────────────────────
  'lemon rice':       { path: 'cafe-foods/lemon-rice.jpeg',      description: 'Steamed rice tossed with fresh lemon juice, turmeric, mustard seeds, curry leaves and roasted peanuts.\nBright, tangy and nutty — a quick South Indian staple that is light yet satisfying.' },
  chitranna:          { path: 'cafe-foods/lemon-rice.jpeg',      description: 'Steamed rice tossed with fresh lemon juice, turmeric, mustard seeds, curry leaves and roasted peanuts.\nBright, tangy and nutty — a quick South Indian staple that is light yet satisfying.' },
  'elumichai sadam':  { path: 'cafe-foods/lemon-rice.jpeg',      description: 'Steamed rice tossed with fresh lemon juice, turmeric, mustard seeds, curry leaves and roasted peanuts.\nBright, tangy and nutty — a quick South Indian staple that is light yet satisfying.' },

  // ── Mint Mojito ─────────────────────────────────────────────────────────────
  'mint mojito':      { path: 'cafe-foods/mint-mojito.jpeg',     description: 'Chilled sparkling drink with fresh mint leaves, lime juice and a hint of sugar over crushed ice.\nCool, zesty and refreshing — the perfect non-alcoholic mocktail for any weather.' },
  mojito:             { path: 'cafe-foods/mint-mojito.jpeg',     description: 'Chilled sparkling drink with fresh mint leaves, lime juice and a hint of sugar over crushed ice.\nCool, zesty and refreshing — the perfect non-alcoholic mocktail for any weather.' },
  mocktail:           { path: 'cafe-foods/mint-mojito.jpeg',     description: 'Chilled sparkling drink with fresh mint leaves, lime juice and a hint of sugar over crushed ice.\nCool, zesty and refreshing — the perfect non-alcoholic mocktail for any weather.' },

  // ── Onion Dosa ──────────────────────────────────────────────────────────────
  'onion dosa':       { path: 'cafe-foods/onion-dosa.jpeg',      description: 'Crispy fermented rice crepe topped with finely chopped onions and green chilli, cooked on a hot tawa.\nA savoury South Indian classic — light, crunchy and full of flavour, served with chutneys.' },
  'vengaya dosa':     { path: 'cafe-foods/onion-dosa.jpeg',      description: 'Crispy fermented rice crepe topped with finely chopped onions and green chilli, cooked on a hot tawa.\nA savoury South Indian classic — light, crunchy and full of flavour, served with chutneys.' },

  // ── Paneer Fried Rice ───────────────────────────────────────────────────────
  'paneer fried rice': { path: 'cafe-foods/paneer-fried-rice.jpeg', description: 'Wok-tossed basmati rice with golden paneer cubes, mixed vegetables and Indo-Chinese sauces.\nSmoky, flavourful and satisfying — a delicious fusion of Indian and Chinese cooking.' },
  'cottage cheese rice': { path: 'cafe-foods/paneer-fried-rice.jpeg', description: 'Wok-tossed basmati rice with golden paneer cubes, mixed vegetables and Indo-Chinese sauces.\nSmoky, flavourful and satisfying — a delicious fusion of Indian and Chinese cooking.' },

  // ── Sambar Rice ─────────────────────────────────────────────────────────────
  'sambar rice':      { path: 'cafe-foods/sambar-rice.jpeg',     description: 'Soft steamed rice mixed with tangy tamarind sambar, tempered with mustard seeds and curry leaves.\nA soul-warming South Indian comfort dish — simple, nutritious and deeply satisfying.' },
  'sambar sadam':     { path: 'cafe-foods/sambar-rice.jpeg',     description: 'Soft steamed rice mixed with tangy tamarind sambar, tempered with mustard seeds and curry leaves.\nA soul-warming South Indian comfort dish — simple, nutritious and deeply satisfying.' },
  sambar:             { path: 'cafe-foods/sambar-rice.jpeg',     description: 'Soft steamed rice mixed with tangy tamarind sambar, tempered with mustard seeds and curry leaves.\nA soul-warming South Indian comfort dish — simple, nutritious and deeply satisfying.' },

  // ── Dragon Chicken ──────────────────────────────────────────────────────────
  'dragon chicken':   { path: 'cafe-foods/dragon-chicken.jpeg',  description: 'Crispy fried chicken strips tossed in a fiery dragon sauce with capsicum, onions and dried red chillies.\nAn Indo-Chinese crowd favourite — bold, spicy and intensely addictive.' },
  'dragon':           { path: 'cafe-foods/dragon-chicken.jpeg',  description: 'Crispy fried chicken strips tossed in a fiery dragon sauce with capsicum, onions and dried red chillies.\nAn Indo-Chinese crowd favourite — bold, spicy and intensely addictive.' },
  'spicy dragon':     { path: 'cafe-foods/dragon-chicken.jpeg',  description: 'Crispy fried chicken strips tossed in a fiery dragon sauce with capsicum, onions and dried red chillies.\nAn Indo-Chinese crowd favourite — bold, spicy and intensely addictive.' },

  // ── Fish Curry ──────────────────────────────────────────────────────────────
  'fish curry':       { path: 'cafe-foods/fish-curry.jpeg',      description: 'Fresh fish pieces slow-cooked in a fiery South Indian masala with tamarind, tomato and coastal spices.\nBold, tangy and deeply flavoured — best served with steamed rice or dosa.' },
  'fish masala':      { path: 'cafe-foods/fish-curry.jpeg',      description: 'Fresh fish pieces slow-cooked in a fiery South Indian masala with tamarind, tomato and coastal spices.\nBold, tangy and deeply flavoured — best served with steamed rice or dosa.' },
  'fish gravy':       { path: 'cafe-foods/fish-curry.jpeg',      description: 'Fresh fish pieces slow-cooked in a fiery South Indian masala with tamarind, tomato and coastal spices.\nBold, tangy and deeply flavoured — best served with steamed rice or dosa.' },

  // ── Tomato Rice ─────────────────────────────────────────────────────────────
  'tomato rice':      { path: 'cafe-foods/tomato-rice.jpeg',     description: 'Steamed rice cooked with ripe tomatoes, onions, mustard seeds and aromatic spices.\nTangy, mildly spiced and comforting — a quick South Indian one-pot meal.' },
  'thakkali sadam':   { path: 'cafe-foods/tomato-rice.jpeg',     description: 'Steamed rice cooked with ripe tomatoes, onions, mustard seeds and aromatic spices.\nTangy, mildly spiced and comforting — a quick South Indian one-pot meal.' },
  'tomato pulao':     { path: 'cafe-foods/tomato-rice.jpeg',     description: 'Steamed rice cooked with ripe tomatoes, onions, mustard seeds and aromatic spices.\nTangy, mildly spiced and comforting — a quick South Indian one-pot meal.' },

  // ── Uthappam ────────────────────────────────────────────────────────────────
  uthappam:           { path: 'cafe-foods/uthappam.jpeg',        description: 'Thick, soft fermented rice pancake topped with onions, tomatoes, green chilli and coriander.\nA wholesome South Indian breakfast — fluffy inside, slightly crisp outside, served with sambar.' },
  uttapam:            { path: 'cafe-foods/uthappam.jpeg',        description: 'Thick, soft fermented rice pancake topped with onions, tomatoes, green chilli and coriander.\nA wholesome South Indian breakfast — fluffy inside, slightly crisp outside, served with sambar.' },
  oothappam:          { path: 'cafe-foods/uthappam.jpeg',        description: 'Thick, soft fermented rice pancake topped with onions, tomatoes, green chilli and coriander.\nA wholesome South Indian breakfast — fluffy inside, slightly crisp outside, served with sambar.' },

  // ── Veg Rice ────────────────────────────────────────────────────────────────
  'veg rice':         { path: 'cafe-foods/veg-rice.jpeg',        description: 'Fluffy steamed rice cooked with seasonal vegetables, mild spices and a tempering of mustard and curry leaves.\nLight, healthy and comforting — pairs well with any curry, dal or raita.' },
  'vegetable rice':   { path: 'cafe-foods/veg-rice.jpeg',        description: 'Fluffy steamed rice cooked with seasonal vegetables, mild spices and a tempering of mustard and curry leaves.\nLight, healthy and comforting — pairs well with any curry, dal or raita.' },
  'mixed veg rice':   { path: 'cafe-foods/veg-rice.jpeg',        description: 'Fluffy steamed rice cooked with seasonal vegetables, mild spices and a tempering of mustard and curry leaves.\nLight, healthy and comforting — pairs well with any curry, dal or raita.' },
};

// ── Public API ─────────────────────────────────────────────────────────────────

import { bestFuzzyMatch, normaliseDishKey } from './fuzzyMatch';

export interface DefaultImageMatch {
  image_url: string;
  description: string;
  /** Confidence in [0..1]. 1.0 = exact keyword hit, 0.95 = substring, fuzzy >= 0.80. */
  confidence?: number;
}

/**
 * Keyword-based matcher with three tiers — exact → substring → fuzzy.
 * Returns the image URL, description, and a confidence score.
 *
 * Used:
 *  1. Server-side during onboarding and bulk-import as a cheap fallback
 *     before the (paid) embedding call.
 *  2. Client-side in the product inventory to fill placeholder images.
 *
 * Fuzzy tier (NEW) handles typos like "panner" → paneer, "biryni" → biryani,
 * "manchao" → manchow at an 80% word-match threshold.
 */
export function matchByKeyword(productName: string): DefaultImageMatch | null {
  const lower = productName.toLowerCase().trim();
  if (!lower) return null;

  // Tier 1 — exact key match
  if (KEYWORD_MAP[lower]) {
    const e = KEYWORD_MAP[lower];
    return { image_url: `${BUCKET_PREFIX}/${e.path}`, description: e.description, confidence: 1.0 };
  }

  // Tier 2 — substring match (longest key wins — most specific)
  let bestKey = '';
  for (const key of Object.keys(KEYWORD_MAP)) {
    if (lower.includes(key) && key.length > bestKey.length) bestKey = key;
  }
  if (bestKey) {
    const e = KEYWORD_MAP[bestKey];
    return { image_url: `${BUCKET_PREFIX}/${e.path}`, description: e.description, confidence: 0.95 };
  }

  // Tier 3 — fuzzy / phonetic match (handles typos at 80%+ word similarity)
  // We try both:
  //   a) Full-string fuzzy match against every keyword
  //   b) Token-by-token fuzzy match (catches "spcy panner tikka" → "paneer tikka")
  const allKeys = Object.keys(KEYWORD_MAP);
  const wholeMatch = bestFuzzyMatch(lower, allKeys, 0.80);
  if (wholeMatch) {
    const e = KEYWORD_MAP[wholeMatch.key];
    return { image_url: `${BUCKET_PREFIX}/${e.path}`, description: e.description, confidence: wholeMatch.score };
  }

  // Token-level fuzzy — useful when the product name has extra adjectives
  // ("Spicy Panner Masala" — fuzzy each word against keyword tokens).
  const queryTokens = normaliseDishKey(lower).split(' ').filter(t => t.length >= 4);
  if (queryTokens.length > 0) {
    let tokenBest: { key: string; score: number } | null = null;
    for (const tok of queryTokens) {
      const m = bestFuzzyMatch(tok, allKeys, 0.85);
      if (m && (!tokenBest || m.score > tokenBest.score)) tokenBest = m;
    }
    if (tokenBest) {
      const e = KEYWORD_MAP[tokenBest.key];
      return { image_url: `${BUCKET_PREFIX}/${e.path}`, description: e.description, confidence: tokenBest.score * 0.9 };
    }
  }

  return null;
}
