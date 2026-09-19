/**
 * PDF menu upload — acceptance (AC14).
 *
 * Owners can pick a PDF menu of up to 15 pages. Each page is rendered to a JPEG
 * in the browser (pdf.js) and then travels the same pipeline as a photo, so the
 * server never parses PDF bytes. Photos and PDF pages share the 15-slot limit.
 *
 * Rendering needs a canvas, which Node has not got; page counting does not, so
 * the real pdf.js is exercised here on PDFs generated in the test.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  MAX_PDF_PAGES, planPdfPages, countPdfPages,
} from '@/lib/menu/pdfPages';
import { pdfMessage } from '@/app/onboarding/scanMessages';

/** A minimal, valid PDF with `n` blank pages and a correct xref table. */
function makePdf(n: number): Uint8Array {
  const objects: string[] = [];
  const kids = Array.from({ length: n }, (_, i) => `${i + 3} 0 R`).join(' ');
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
  for (let i = 0; i < n; i++) objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>');
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xrefAt = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

const SRC = join(__dirname, '..', '..', 'src');
const WEB = join(__dirname, '..', '..');

describe('AC14: PDF menus up to 15 pages', () => {
  it('the limit is 15 pages', () => {
    expect(MAX_PDF_PAGES).toBe(15);
  });

  it('plans a PDF against the pages allowed and the slots left', () => {
    expect(planPdfPages(15, 15)).toEqual({ ok: true });
    expect(planPdfPages(3, 5)).toEqual({ ok: true });
    expect(planPdfPages(16, 15)).toMatchObject({ ok: false, code: 'PDF_TOO_MANY_PAGES', pages: 16 });
    expect(planPdfPages(6, 4)).toMatchObject({ ok: false, code: 'PDF_NO_ROOM', pages: 6, room: 4 });
    expect(planPdfPages(0, 15)).toMatchObject({ ok: false, code: 'PDF_UNREADABLE' });
  });

  it('counts pages with the real pdf.js', async () => {
    expect(await countPdfPages(makePdf(3))).toBe(3);
    expect(await countPdfPages(makePdf(16))).toBe(16);
  }, 30_000);

  it('a file that is not a PDF is refused as unreadable', async () => {
    await expect(countPdfPages(new TextEncoder().encode('not a pdf at all'))).rejects.toMatchObject({ code: 'PDF_UNREADABLE' });
  }, 30_000);

  it('every PDF problem is explained in English and Tamil, with the numbers', () => {
    const tamil = /[஀-௿]/;
    const tooMany = pdfMessage('PDF_TOO_MANY_PAGES', { pages: 22 });
    expect(tooMany.en).toMatch(/22/);
    expect(tooMany.en).toMatch(/15/);
    expect(tooMany.ta).toMatch(tamil);
    expect(tooMany.ta).toMatch(/22/);
    const noRoom = pdfMessage('PDF_NO_ROOM', { pages: 6, room: 4 });
    expect(noRoom.en).toMatch(/6/);
    expect(noRoom.en).toMatch(/4/);
    expect(noRoom.ta).toMatch(tamil);
    for (const code of ['PDF_UNREADABLE', 'PDF_PASSWORD', 'PDF_TOO_LARGE'] as const) {
      const m = pdfMessage(code, {});
      expect(m.en.length).toBeGreaterThan(10);
      expect(m.ta).toMatch(tamil);
    }
  });

  it('pdf.js is pinned to an exact version', () => {
    const pkg = JSON.parse(readFileSync(join(WEB, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['pdfjs-dist']).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('the upload control accepts PDFs and turns them into pages', () => {
    const page = readFileSync(join(SRC, 'app', 'onboarding', 'page.tsx'), 'utf8');
    expect(page).toMatch(/accept="image\/\*,application\/pdf"/);
    expect(page).toMatch(/pdfToPageImages/);
    expect(page).not.toMatch(/PDF_NOT_SUPPORTED/);
  });

  it('pdf.js never reaches the server bundle: only the browser helper loads it, lazily', () => {
    const helper = readFileSync(join(SRC, 'lib', 'menu', 'pdfPages.ts'), 'utf8');
    expect(helper).not.toMatch(/^import .*pdfjs-dist/m);
    expect(helper).toMatch(/await import\(['"]pdfjs-dist/);
    const route = readFileSync(join(SRC, 'app', 'api', 'onboarding', 'extract', 'route.ts'), 'utf8');
    expect(route).not.toMatch(/pdf/i);
  });
});
