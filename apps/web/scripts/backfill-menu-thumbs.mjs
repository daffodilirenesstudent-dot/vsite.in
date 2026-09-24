// scripts/backfill-menu-thumbs.mjs
// Creates the missing `<name>.thumb.jpg` beside every image in the menu
// buckets, so photos uploaded before thumbnails existed (and the shared food
// library) are served small on the menu. See src/lib/menu/menuImages.ts.
//
// Safe by construction: dry run unless --apply; only ever ADDS files; never
// deletes, never overwrites (upsert false), never touches an original.
// Egress: each original is downloaded once (~165 MB for today's buckets).
//
// Run:  SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-menu-thumbs.mjs
//       SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-menu-thumbs.mjs --apply
//
// Image work uses @napi-rs/canvas, already installed as a dependency of
// pdfjs-dist; nothing new is added to package.json.

import { createClient } from '@supabase/supabase-js';
import { createCanvas, loadImage } from '@napi-rs/canvas';

// Must match THUMB_EDGE_PX / THUMB_QUALITY in src/lib/menu/menuImages.ts
// (the acceptance test enforces it).
const THUMB_EDGE_PX = 360;
const THUMB_QUALITY = 0.85;
const CACHE_SECONDS = '31536000';
const THUMB_SUFFIX = '.thumb.jpg';
const BUCKETS = ['product-images', 'default-images'];
const IMAGE_EXT = /\.(jpe?g|png|webp|avif|gif|bmp)$/i;
const CONCURRENCY = 4;

const APPLY = process.argv.includes('--apply');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://wdnruubljlwrduxnvuhr.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY env var before running');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/** Same rule as thumbObjectName() in menuImages.ts. */
function thumbName(name) {
  if (name.endsWith(THUMB_SUFFIX)) return null;
  const slash = name.lastIndexOf('/');
  const dot = name.lastIndexOf('.');
  return `${dot > slash + 1 ? name.slice(0, dot) : name}${THUMB_SUFFIX}`;
}

async function listAll(bucket, prefix = '') {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    for (const e of data) {
      const full = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id === null) out.push(...(await listAll(bucket, full))); // folder
      else out.push({ name: full, size: e.metadata?.size ?? 0 });
    }
    if (data.length < 1000) return out;
  }
}

/** Centre square, like the browser's makeMenuThumbnail(): what `object-fit: cover` shows. */
async function makeThumb(bytes) {
  const img = await loadImage(bytes);
  const side = Math.min(img.width, img.height);
  const edge = Math.min(THUMB_EDGE_PX, side);
  const canvas = createCanvas(edge, edge);
  canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, edge, edge);
  return canvas.encode('jpeg', Math.round(THUMB_QUALITY * 100));
}

async function backfill(bucket) {
  const files = await listAll(bucket);
  const names = new Set(files.map(f => f.name));
  const todo = files.filter(f => {
    const t = thumbName(f.name);
    return t && IMAGE_EXT.test(f.name) && !names.has(t);
  });
  const mb = todo.reduce((s, f) => s + f.size, 0) / 1048576;
  console.log(`${bucket}: ${files.length} files, ${todo.length} need a thumbnail (${mb.toFixed(1)} MB to read)`);
  if (!APPLY) return { made: 0, failed: 0, before: 0, after: 0 };

  const stats = { made: 0, failed: 0, before: 0, after: 0 };
  let next = 0;
  async function worker() {
    while (next < todo.length) {
      const f = todo[next++];
      try {
        const { data, error } = await supabase.storage.from(bucket).download(f.name);
        if (error) throw error;
        const bytes = Buffer.from(await data.arrayBuffer());
        const thumb = await makeThumb(bytes);
        const up = await supabase.storage.from(bucket).upload(thumbName(f.name), thumb, {
          contentType: 'image/jpeg', cacheControl: CACHE_SECONDS, upsert: false,
        });
        if (up.error) throw up.error;
        stats.made++; stats.before += bytes.length; stats.after += thumb.length;
      } catch (err) {
        stats.failed++;
        console.error(`  ✗ ${bucket}/${f.name}: ${err.message ?? err}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`  made ${stats.made}, failed ${stats.failed}, ` +
    `${(stats.before / 1048576).toFixed(1)} MB → ${(stats.after / 1048576).toFixed(1)} MB`);
  return stats;
}

console.log(APPLY ? 'APPLY: writing thumbnails' : 'DRY RUN: nothing is written (pass --apply to write)');
for (const b of BUCKETS) await backfill(b);
