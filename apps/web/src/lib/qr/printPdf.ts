import type { PrintLayout } from '@/lib/qr/printKit';

/**
 * A print-ready PDF from a layout and one rendered poster (PNG data URL,
 * already at print resolution). Every card on the sheet is the same image;
 * jsPDF stores it once and draws it per card.
 */
export async function buildPrintPdf(layout: PrintLayout, cardPng: string): Promise<ArrayBuffer> {
    const { jsPDF } = await import('jspdf');
    const { w, h } = layout.pageMm;
    // No stream compression: the page holds a handful of drawing instructions,
    // and the poster itself is already PNG-compressed.
    const doc = new jsPDF({ unit: 'mm', format: [w, h], orientation: layout.orientation });

    // Lossless (Flate) so every QR edge stays sharp. Uncompressed, the A4
    // print-shop file was 26.7 MB — too big to WhatsApp to a print shop;
    // compressed it is about 1.7 MB.
    for (const card of layout.cards) {
        doc.addImage(cardPng, 'PNG', card.x, card.y, card.w, card.h, 'poster', 'FAST');
    }

    if (layout.cutLines.length > 0) {
        // Light dashed lines: visible enough to cut along, faint enough not to
        // matter if the scissors wander.
        doc.setDrawColor(160, 160, 160);
        doc.setLineWidth(0.2);
        doc.setLineDashPattern([2, 1.5], 0);
        for (const l of layout.cutLines) doc.line(l.x1, l.y1, l.x2, l.y2);
    }

    return doc.output('arraybuffer');
}
