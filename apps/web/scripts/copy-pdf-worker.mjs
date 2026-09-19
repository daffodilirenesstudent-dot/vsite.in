// Copies the pdf.js worker into public/ before `next build` / `next dev`.
//
// Next 14 minifies any worker it bundles with Terser, which cannot parse the
// pdf.js worker. Serving it as a plain static file sidesteps that, keeps it
// same-origin, and — because it is copied from the installed package on every
// build — guarantees the worker version matches the API version (pdf.js refuses
// to run otherwise). The output is gitignored.

import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(web, 'node_modules', 'pdfjs-dist');
const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const outDir = join(web, 'public', 'pdfjs');

mkdirSync(outDir, { recursive: true });
copyFileSync(join(pkgDir, 'legacy', 'build', 'pdf.worker.min.mjs'), join(outDir, 'pdf.worker.min.mjs'));
console.info(`[copy-pdf-worker] pdf.js ${version} worker → public/pdfjs/pdf.worker.min.mjs`);
