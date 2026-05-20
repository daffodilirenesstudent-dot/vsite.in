'use strict';

const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

function sanitize(str) {
  return (str || '').replace(/[^\x20-\x7E]/g, '?');
}

function col(str, len) {
  const s = sanitize(str);
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
}

// Right-align `right` within a total width, with `left` on the left side
function twoCol(left, right, width) {
  const l = sanitize(left);
  const r = sanitize(right);
  const gap = width - l.length - r.length;
  if (gap <= 0) return sanitize(left).slice(0, width - r.length - 1) + ' ' + r;
  return l + ' '.repeat(gap) + r;
}

function centered(str, width) {
  const s   = sanitize(str).slice(0, width);
  const pad = Math.max(0, Math.floor((width - s.length) / 2));
  return ' '.repeat(pad) + s;
}

// ── KOT slip ─────────────────────────────────────────────────────────────────

function buildKot({ siteName, label, orderNumber, createdAt, items, paperWidth = 32 }) {
  const chunks  = [];
  const divider = '-'.repeat(paperWidth);

  const push = (bytes) => chunks.push(Buffer.from(bytes));
  const text = (str)   => chunks.push(Buffer.from(sanitize(str) + '\n', 'ascii'));

  push([ESC, 0x40]);          // ESC @ — initialize
  push([ESC, 0x61, 0x01]);    // center

  push([GS, 0x21, 0x11]);     // double width + height
  text('KOT');
  push([GS, 0x21, 0x00]);     // normal size

  push([ESC, 0x61, 0x00]);    // left
  text(siteName || 'Kitchen');
  push([GS, 0x21, 0x10]);     // double height
  text(`Order #${orderNumber}`);
  push([GS, 0x21, 0x00]);

  text(label || 'Takeaway');

  const time = new Date(createdAt).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
  text(`Time: ${time}`);
  text(divider);

  items.forEach(({ qty, name, variant }) => {
    const qtyStr  = String(qty).padStart(2, ' ') + 'x';
    const nameStr = name + (variant ? ` [${variant}]` : '');
    text(`${qtyStr} ${col(nameStr, paperWidth - 4)}`);
  });

  text(divider);
  push([GS, 0x56, 0x00]);     // Full cut

  return Buffer.concat(chunks);
}

// ── Bill / Receipt ───────────────────────────────────────────────────────────
// items: [{qty, name, variant, price, total}]  (price and total in paise/cents or rupees — caller decides)
// subtotal, taxLabel, taxAmount, grandTotal: numbers formatted as strings by caller, OR pass raw numbers
// currencySymbol: defaults to 'Rs.'

function buildBill({
  siteName,
  label,
  orderNumber,
  createdAt,
  items,
  subtotal,
  taxLabel,
  taxAmount,
  grandTotal,
  currencySymbol = 'Rs.',
  footerText,
  paperWidth = 42,
}) {
  const chunks  = [];
  const divider = '-'.repeat(paperWidth);
  const W       = paperWidth;

  const push = (bytes) => chunks.push(Buffer.from(bytes));
  const text = (str)   => chunks.push(Buffer.from(sanitize(str) + '\n', 'ascii'));
  const line = ()      => text(divider);

  const fmt = (n) => {
    if (n === undefined || n === null) return '';
    const num = typeof n === 'string' ? parseFloat(n) : n;
    return isNaN(num) ? String(n) : num.toFixed(2);
  };

  push([ESC, 0x40]);          // initialize

  // Header — centered site name (bold)
  push([ESC, 0x61, 0x01]);    // center
  push([ESC, 0x45, 0x01]);    // bold on
  text(siteName || 'Receipt');
  push([ESC, 0x45, 0x00]);    // bold off
  text('Tax Invoice');
  push([ESC, 0x61, 0x00]);    // left

  line();

  // Order meta
  const date = new Date(createdAt);
  const dateStr = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  text(twoCol(`Order #${orderNumber}`, label || 'Takeaway', W));
  text(twoCol(dateStr, timeStr, W));

  line();

  // Column headers
  const qW  = 3;   // qty
  const prW = 7;   // unit price
  const ttW = 8;   // total
  const nmW = W - qW - prW - ttW - 3; // name column

  push([ESC, 0x45, 0x01]);    // bold headers
  text(
    col('Qty', qW) + ' ' +
    col('Item', nmW) + ' ' +
    col('Price', prW) + ' ' +
    col('Total', ttW)
  );
  push([ESC, 0x45, 0x00]);
  line();

  // Items
  items.forEach(({ qty, name, variant, price, total }) => {
    const nameStr = name + (variant ? ` (${variant})` : '');
    text(
      col(String(qty ?? ''), qW) + ' ' +
      col(nameStr, nmW) + ' ' +
      col(fmt(price), prW) + ' ' +
      col(fmt(total), ttW)
    );
  });

  line();

  // Totals section
  if (subtotal !== undefined && subtotal !== null) {
    text(twoCol('Subtotal', `${currencySymbol} ${fmt(subtotal)}`, W));
  }
  if (taxAmount !== undefined && taxAmount !== null && taxAmount !== 0) {
    const lbl = taxLabel || 'Tax';
    text(twoCol(lbl, `${currencySymbol} ${fmt(taxAmount)}`, W));
  }

  line();
  push([ESC, 0x45, 0x01]);    // bold grand total
  push([GS,  0x21, 0x01]);    // slightly taller
  text(twoCol('TOTAL', `${currencySymbol} ${fmt(grandTotal ?? subtotal)}`, W));
  push([GS,  0x21, 0x00]);
  push([ESC, 0x45, 0x00]);
  line();

  // Footer
  push([ESC, 0x61, 0x01]);    // center
  text(footerText || 'Thank you! Visit again.');
  push([ESC, 0x61, 0x00]);

  // Feed + cut
  push([ESC, 0x64, 0x03]);    // feed 3 lines
  push([GS,  0x56, 0x00]);    // full cut

  return Buffer.concat(chunks);
}

module.exports = { buildKot, buildBill };
