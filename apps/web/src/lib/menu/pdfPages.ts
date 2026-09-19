// PDF menu → one JPEG per page, in the browser.
//
// A PDF is never sent to the server. Each page is rendered here and becomes an
// ordinary photo, so it travels the hardened photo pipeline unchanged: memory
// admission, magic-byte validation, one extraction call per page with its
// fallback ladder, and "page N couldn't be read" disclosure. The server has no
// PDF parser to attack and spends no RAM on PDF bytes.
//
// pdf.js (Mozilla, Apache-2.0) is loaded with a dynamic import the first time an
// owner picks a PDF, so it never enters the server bundle or any page that does
// not need it. The legacy build keeps older Android WebViews working.
// Dependency approved 2026-09-19 — see docs/PROGRESS.md.

export const MAX_PDF_PAGES = 15;
/** A 15-page menu PDF is typically well under 10MB; this bounds phone memory. */
export const MAX_PDF_BYTES = 25 * 1024 * 1024;

/** Same output as imageCompress: 1600px long edge, JPEG q0.82 (~200–500KB a page). */
const RENDER_LONG_EDGE = 1600;
const JPEG_QUALITY = 0.82;

export type PdfProblem =
  | 'PDF_TOO_MANY_PAGES' | 'PDF_NO_ROOM' | 'PDF_UNREADABLE' | 'PDF_PASSWORD' | 'PDF_TOO_LARGE';

export class PdfPagesError extends Error {
  constructor(readonly code: PdfProblem, readonly pages = 0, readonly room = 0) {
    super(code);
  }
}

export type PdfPlan = { ok: true } | { ok: false; code: PdfProblem; pages: number; room: number };

/** Whether a PDF of `totalPages` fits: at most 15 pages, and no more than the slots left. */
export function planPdfPages(totalPages: number, slotsLeft: number): PdfPlan {
  if (!Number.isFinite(totalPages) || totalPages < 1) {
    return { ok: false, code: 'PDF_UNREADABLE', pages: 0, room: slotsLeft };
  }
  if (totalPages > MAX_PDF_PAGES) {
    return { ok: false, code: 'PDF_TOO_MANY_PAGES', pages: totalPages, room: slotsLeft };
  }
  if (totalPages > slotsLeft) {
    return { ok: false, code: 'PDF_NO_ROOM', pages: totalPages, room: slotsLeft };
  }
  return { ok: true };
}

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
type PdfDocument = Awaited<ReturnType<PdfJs['getDocument']>['promise']>;

let pdfjsPromise: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      if (typeof window !== 'undefined') {
        // Parsing runs in a Web Worker, off the main thread, so a large PDF
        // does not freeze the page. The worker is a static file copied from
        // the installed package at build time (scripts/copy-pdf-worker.mjs);
        // the version query keeps a cached old worker from meeting a new API.
        pdfjs.GlobalWorkerOptions.workerSrc = `/pdfjs/pdf.worker.min.mjs?v=${pdfjs.version}`;
      }
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

interface OpenedPdf {
  doc: PdfDocument;
  /** Frees the worker and every page; the loading task owns them. */
  close(): Promise<void>;
}

async function openPdf(data: ArrayBuffer | Uint8Array): Promise<OpenedPdf> {
  const pdfjs = await loadPdfJs();
  // pdf.js transfers the buffer to its worker; hand it a copy.
  const bytes = data instanceof Uint8Array ? data.slice() : new Uint8Array(data.slice(0));
  const task = pdfjs.getDocument({ data: bytes });
  try {
    return { doc: await task.promise, close: () => task.destroy() };
  } catch (err) {
    await task.destroy().catch(() => undefined);
    const name = (err as { name?: string } | null)?.name;
    throw new PdfPagesError(name === 'PasswordException' ? 'PDF_PASSWORD' : 'PDF_UNREADABLE');
  }
}

/** Page count without rendering anything. */
export async function countPdfPages(data: ArrayBuffer | Uint8Array): Promise<number> {
  const { doc, close } = await openPdf(data);
  try {
    return doc.numPages;
  } finally {
    await close();
  }
}

/**
 * Render every page of `file` to a JPEG `File`, in page order.
 * Throws PdfPagesError when the PDF is too big, too long for the slots left,
 * locked with a password, or not a PDF at all — before rendering anything.
 */
export async function pdfToPageImages(
  file: File,
  slotsLeft: number,
  onProgress?: (done: number, total: number) => void,
): Promise<File[]> {
  if (file.size > MAX_PDF_BYTES) throw new PdfPagesError('PDF_TOO_LARGE');
  const { doc, close } = await openPdf(await file.arrayBuffer());
  try {
    const plan = planPdfPages(doc.numPages, slotsLeft);
    if (!plan.ok) throw new PdfPagesError(plan.code, plan.pages, plan.room);

    const base = file.name.replace(/\.pdf$/i, '') || 'menu';
    const pages: File[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const natural = page.getViewport({ scale: 1 });
      const scale = Math.min(3, RENDER_LONG_EDGE / Math.max(natural.width, natural.height));
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      // White, not transparent: a transparent page encodes to a black JPEG.
      await page.render({ canvas, viewport, background: '#ffffff' }).promise;
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));

      // Phones run out of canvas memory fast; release each page as we go.
      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;

      if (!blob) throw new PdfPagesError('PDF_UNREADABLE');
      pages.push(new File([blob], `${base}-page-${n}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }));
      onProgress?.(n, doc.numPages);
    }
    return pages;
  } finally {
    await close();
  }
}
