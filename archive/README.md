# archive/

Frozen products and non-code assets. **Tracked in git, never built.**

DigitalOcean App Platform builds only `apps/web/` (Source Directory =
`apps/web`), so nothing here is deploy context or affects build cost.

| Path | What | Status |
|---|---|---|
| `print-bridge/` | Windows thermal-printer bridge (Node + NSIS installer) | Frozen |
| `kot-station-app/` | Android KOT station (Gradle) | Frozen |
| `netlify/`, `netlify.toml` | Netlify functions + config | Retired — DigitalOcean only |
| `vercel.json` | Vercel cron declarations | Retired — DigitalOcean only |
| `design/`, `design-system/`, `mockups/`, `logos/` | Design source files | Reference |
| `seed-assets/` | Source images for `scripts/seed-food-images-*.mjs` | Already uploaded to Supabase |
| `docs/` | Superseded documentation | Reference |

## seed-assets

All 311 slugs declared across the four seed scripts are already present
in the live `default_images` table (353 rows, bucket `default-images`).
These local folders are the upload source, kept for re-seeding.

**Known gap:** `food-images-6/` holds 95 files but only 74 are wired
into a seed script; `food-images-3/` holds 16 with 14 wired. 23 images
have never been seeded.

## Binaries

`*.exe` is gitignored. `print-bridge/dist/bys-print-bridge.exe` exists
on disk but is not tracked. Distribute it via Supabase Storage.
