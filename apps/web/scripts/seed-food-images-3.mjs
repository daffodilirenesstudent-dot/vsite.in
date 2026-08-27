// scripts/seed-food-images-3.mjs
// Uploads images from "food images 3/" to Supabase Storage,
// generates OpenAI embeddings (name + description for richer accuracy),
// and upserts rows into default_images table.
// Run: node scripts/seed-food-images-3.mjs

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://wdnruubljlwrduxnvuhr.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY   = process.env.OPENAI_API_KEY;
const BUCKET       = 'default-images';
const FOLDER       = path.join(ROOT, 'food images 3');

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
// Embedding text = name + synonyms + first line of description
// This richer text makes cosine similarity much more accurate —
// "sambar rice" finds "sambar sadam", "pongal" finds "savoury rice" etc.
const IMAGES = [
  {
    file: 'Mushroom Soup.jpeg',
    slug: 'mushroom-soup.jpeg',
    name: 'Mushroom Soup',
    embedText: 'mushroom soup cream of mushroom hot soup starter',
    description: 'Velvety cream of mushroom soup simmered with garlic, herbs and fresh mushrooms.\nRich, warming and silky-smooth — served with toasted bread or croutons on the side.',
  },
  {
    file: 'Mushroom Tikka.jpeg',
    slug: 'mushroom-tikka.jpeg',
    name: 'Mushroom Tikka',
    embedText: 'mushroom tikka grilled mushroom tandoor mushroom starter veg tikka',
    description: 'Plump button mushrooms marinated in spiced yoghurt and grilled in a tandoor until smoky and charred.\nA vegetarian starter with bold tandoori flavours — served with mint chutney and sliced onions.',
  },
  {
    file: 'chicken soup.jpeg',
    slug: 'chicken-soup.jpeg',
    name: 'Chicken Soup',
    embedText: 'chicken soup hot soup clear soup chicken broth starter',
    description: 'Comforting clear chicken broth simmered with vegetables, ginger and aromatic spices.\nLight, nourishing and warming — perfect as a starter or on a rainy day.',
  },
  {
    file: 'ghee roast dose.jpeg',
    slug: 'ghee-roast-dosa.jpeg',
    name: 'Ghee Roast Dosa',
    embedText: 'ghee roast dosa ghee dosa roast dosa crispy dosa tawa dosa breakfast',
    description: 'Crispy golden dosa generously roasted in clarified butter on a hot tawa until deep amber and crunchy.\nRich, buttery and intensely flavoured — served with coconut chutney and spiced potato filling.',
  },
  {
    file: 'lemon rice.jpeg',
    slug: 'lemon-rice.jpeg',
    name: 'Lemon Rice',
    embedText: 'lemon rice chitranna elumichai sadam tangy rice south indian rice',
    description: 'Steamed rice tossed with fresh lemon juice, turmeric, mustard seeds, curry leaves and roasted peanuts.\nBright, tangy and nutty — a quick South Indian staple that is light yet satisfying.',
  },
  {
    file: 'mint mojito.jpeg',
    slug: 'mint-mojito.jpeg',
    name: 'Mint Mojito',
    embedText: 'mint mojito mocktail mint lemon drink cold drink refreshing beverage',
    description: 'Chilled sparkling drink with fresh mint leaves, lime juice and a hint of sugar over crushed ice.\nCool, zesty and refreshing — the perfect non-alcoholic mocktail for any weather.',
  },
  {
    file: 'onion dosa.jpeg',
    slug: 'onion-dosa.jpeg',
    name: 'Onion Dosa',
    embedText: 'onion dosa vengaya dosa crispy dosa breakfast south indian dosa',
    description: 'Crispy fermented rice crepe topped with finely chopped onions and green chilli, cooked on a hot tawa.\nA savoury South Indian classic — light, crunchy and full of flavour, served with chutneys.',
  },
  {
    file: 'panner fried rice.jpeg',
    slug: 'paneer-fried-rice.jpeg',
    name: 'Paneer Fried Rice',
    embedText: 'paneer fried rice cottage cheese rice indo chinese fried rice veg',
    description: 'Wok-tossed basmati rice with golden paneer cubes, mixed vegetables and Indo-Chinese sauces.\nSmoky, flavourful and satisfying — a delicious fusion of Indian and Chinese cooking.',
  },
  {
    file: 'sambar rice .jpeg',
    slug: 'sambar-rice.jpeg',
    name: 'Sambar Rice',
    embedText: 'sambar rice sambar sadam lentil rice south indian comfort food',
    description: 'Soft steamed rice mixed with tangy tamarind sambar, tempered with mustard seeds and curry leaves.\nA soul-warming South Indian comfort dish — simple, nutritious and deeply satisfying.',
  },
  {
    file: 'spicy dragon chicken .jpeg',
    slug: 'dragon-chicken.jpeg',
    name: 'Dragon Chicken',
    embedText: 'dragon chicken spicy chicken indo chinese chilli chicken starter',
    description: 'Crispy fried chicken strips tossed in a fiery dragon sauce with capsicum, onions and dried red chillies.\nAn Indo-Chinese crowd favourite — bold, spicy and intensely addictive.',
  },
  {
    file: 'spicy fish side dish.jpeg',
    slug: 'fish-curry.jpeg',
    name: 'Fish Curry',
    embedText: 'fish curry spicy fish gravy fish masala coastal fish curry side dish',
    description: 'Fresh fish pieces slow-cooked in a fiery South Indian masala with tamarind, tomato and coastal spices.\nBold, tangy and deeply flavoured — best served with steamed rice or dosa.',
  },
  {
    file: 'tomato rice.jpeg',
    slug: 'tomato-rice.jpeg',
    name: 'Tomato Rice',
    embedText: 'tomato rice thakkali sadam tomato pulao south indian rice',
    description: 'Steamed rice cooked with ripe tomatoes, onions, mustard seeds and aromatic spices.\nTangy, mildly spiced and comforting — a quick South Indian one-pot meal.',
  },
  {
    file: 'uthappam dosa.jpeg',
    slug: 'uthappam.jpeg',
    name: 'Uthappam',
    embedText: 'uthappam uttapam oothappam thick dosa south indian pancake breakfast',
    description: 'Thick, soft fermented rice pancake topped with onions, tomatoes, green chilli and coriander.\nA wholesome South Indian breakfast — fluffy inside, slightly crisp outside, served with sambar.',
  },
  {
    file: 'veg rice.jpeg',
    slug: 'veg-rice.jpeg',
    name: 'Veg Rice',
    embedText: 'veg rice vegetable rice mixed vegetable rice plain rice side dish',
    description: 'Fluffy steamed rice cooked with seasonal vegetables, mild spices and a tempering of mustard and curry leaves.\nLight, healthy and comforting — pairs well with any curry, dal or raita.',
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nSeeding ${IMAGES.length} images from "food images 3/"...\n`);

  for (const img of IMAGES) {
    const filePath    = path.join(FOLDER, img.file);
    const storagePath = `cafe-foods/${img.slug}`;
    const imageUrl    = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;

    // 1. Upload to Supabase Storage
    if (!fs.existsSync(filePath)) {
      console.error(`  ✗ File not found: ${img.file}`);
      continue;
    }
    const fileBuffer = fs.readFileSync(filePath);
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) {
      console.error(`  ✗ Upload failed: ${img.slug} — ${uploadError.message}`);
      continue;
    }
    console.log(`  ✓ Uploaded: ${img.slug}`);

    // 2. Generate embedding — use rich text (name + synonyms) for higher accuracy
    //    The seed vector captures both name variations AND food category context,
    //    so cosine similarity at query time works even with misspellings or regional names.
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
    } else {
      console.log(`  ✓ DB upserted: ${img.name}`);
    }
  }

  console.log('\nDone! All batch-3 images seeded.\n');
}

main().catch(err => { console.error(err); process.exit(1); });
