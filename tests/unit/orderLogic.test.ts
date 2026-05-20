/**
 * Unit tests for pure order-system logic — zero DB calls, zero network.
 * Tests: sanitizeName, sha256Short, generateOrderNumber, cart math,
 *        signOrderToken / verifyOrderToken, buildOrderConfirmationEmail,
 *        subtotal rounding, exponential backoff formula.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  signOrderToken,
  verifyOrderToken,
  buildOrderConfirmationEmail,
} from '@/lib/orderEmail';

// ── Replicated pure helpers (not exported from route, so we copy them) ────────

function sanitizeName(s: string, max: number): string {
  return s.replace(/[\x00-\x1F\x7F-\x9F]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function sha256Short(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 40);
}

function generateOrderNumber(): string {
  const n = (crypto.randomBytes(4).readUInt32BE(0) % 9_000_000) + 1_000_000;
  return String(n);
}

function roundSubtotal(value: number): number {
  return Math.round(value * 100) / 100;
}

// Exponential backoff formula used in process-emails cron
function retryDelayMs(attempt: number): number {
  return Math.pow(2, attempt) * 60_000;
}

// Cart math (replicated from QRMenuTemplate)
interface CartItem { id: string; name: string; price: number; qty: number; variantSize?: string }

function addToCart(cart: CartItem[], item: CartItem): CartItem[] {
  const existing = cart.find(i => i.id === item.id && i.variantSize === item.variantSize);
  if (existing) {
    return cart.map(i =>
      i.id === item.id && i.variantSize === item.variantSize
        ? { ...i, price: item.price, qty: Math.min(99, i.qty + item.qty) }
        : i,
    );
  }
  return [...cart, item];
}

function replaceInCart(cart: CartItem[], id: string, variantSize: string | undefined, price: number, qty: number): CartItem[] {
  if (qty <= 0) return cart.filter(i => !(i.id === id && i.variantSize === variantSize));
  return cart.map(i =>
    i.id === id && i.variantSize === variantSize
      ? { ...i, price, qty }
      : i,
  );
}

function cartSubtotal(cart: CartItem[]): number {
  return Math.round(cart.reduce((sum, i) => sum + i.price * i.qty, 0) * 100) / 100;
}

// Consolidates items with same name+variantSize (display-layer dedup)
function consolidateItems(items: CartItem[]): CartItem[] {
  const map = new Map<string, CartItem>();
  for (const item of items) {
    const key = `${item.name}||${item.variantSize ?? ''}`;
    const existing = map.get(key);
    if (existing) {
      map.set(key, { ...existing, qty: existing.qty + item.qty });
    } else {
      map.set(key, { ...item });
    }
  }
  return Array.from(map.values());
}

// ── 1. sanitizeName ───────────────────────────────────────────────────────────

describe('sanitizeName', () => {
  it('trims whitespace', () => {
    expect(sanitizeName('  John  ', 80)).toBe('John');
  });

  it('collapses multiple spaces to one', () => {
    expect(sanitizeName('John   Doe', 80)).toBe('John Doe');
  });

  it('strips control characters (null bytes, tabs, newlines)', () => {
    expect(sanitizeName('John\x00Doe', 80)).toBe('JohnDoe');
    expect(sanitizeName('John\nDoe', 80)).toBe('JohnDoe');
    expect(sanitizeName('John\tDoe', 80)).toBe('JohnDoe');
  });

  it('strips high control characters \\x7F-\\x9F (DEL, C1)', () => {
    expect(sanitizeName('John\x7FDoe', 80)).toBe('JohnDoe');
    expect(sanitizeName('John\x9FDoe', 80)).toBe('JohnDoe');
  });

  it('keeps Unicode letters and normal punctuation', () => {
    expect(sanitizeName('Rájesh K.', 80)).toBe('Rájesh K.');
  });

  it('truncates to max length', () => {
    const long = 'A'.repeat(100);
    expect(sanitizeName(long, 80).length).toBe(80);
  });

  it('returns empty string for all-control input', () => {
    expect(sanitizeName('\x00\x01\x02', 80)).toBe('');
  });

  it('handles empty string', () => {
    expect(sanitizeName('', 80)).toBe('');
  });
});

// ── 2. sha256Short ────────────────────────────────────────────────────────────

describe('sha256Short', () => {
  it('returns a 40-character hex string', () => {
    const h = sha256Short('hello');
    expect(h).toHaveLength(40);
    expect(h).toMatch(/^[0-9a-f]{40}$/);
  });

  it('is deterministic — same input → same output', () => {
    expect(sha256Short('site::abc123')).toBe(sha256Short('site::abc123'));
  });

  it('differs for different inputs', () => {
    expect(sha256Short('site::abc')).not.toBe(sha256Short('ip::abc'));
  });

  it('handles empty string without throwing', () => {
    expect(() => sha256Short('')).not.toThrow();
    expect(sha256Short('')).toHaveLength(40);
  });

  it('handles unicode input', () => {
    const h = sha256Short('पानी पूरी');
    expect(h).toHaveLength(40);
  });
});

// ── 3. generateOrderNumber ────────────────────────────────────────────────────

describe('generateOrderNumber', () => {
  it('returns a 7-digit string', () => {
    const num = generateOrderNumber();
    expect(num).toMatch(/^\d{7}$/);
  });

  it('is in range [1000000, 9999999]', () => {
    for (let i = 0; i < 20; i++) {
      const n = parseInt(generateOrderNumber(), 10);
      expect(n).toBeGreaterThanOrEqual(1_000_000);
      expect(n).toBeLessThanOrEqual(9_999_999);
    }
  });

  it('generates distinct values (no trivial collision in 50 samples)', () => {
    const nums = new Set(Array.from({ length: 50 }, generateOrderNumber));
    expect(nums.size).toBeGreaterThan(40);
  });
});

// ── 4. Subtotal rounding ──────────────────────────────────────────────────────

describe('roundSubtotal', () => {
  it('rounds to 2 decimal places', () => {
    expect(roundSubtotal(10.005)).toBeCloseTo(10.01, 5);
  });

  it('handles exact integers', () => {
    expect(roundSubtotal(100)).toBe(100);
  });

  it('handles 0.1 + 0.2 float drift', () => {
    const raw = 0.1 + 0.2; // 0.30000000000000004
    expect(roundSubtotal(raw)).toBe(0.30);
  });

  it('handles large values', () => {
    expect(roundSubtotal(99999.999)).toBeCloseTo(100000, 0);
  });

  it('handles zero', () => {
    expect(roundSubtotal(0)).toBe(0);
  });
});

// ── 5. Cart math ──────────────────────────────────────────────────────────────

const ITEM_A: CartItem = { id: 'id-a', name: 'Burger', price: 120, qty: 1 };
const ITEM_B: CartItem = { id: 'id-b', name: 'Fries',  price: 60,  qty: 2 };

describe('addToCart', () => {
  it('adds a new item to an empty cart', () => {
    const cart = addToCart([], ITEM_A);
    expect(cart).toHaveLength(1);
    expect(cart[0]).toMatchObject({ id: 'id-a', qty: 1, price: 120 });
  });

  it('increments qty when same id+variant exists', () => {
    const cart = addToCart([ITEM_A], { ...ITEM_A, qty: 2 });
    expect(cart).toHaveLength(1);
    expect(cart[0].qty).toBe(3);
  });

  it('updates price when merging (avoids stale cached price)', () => {
    const oldItem = { ...ITEM_A, price: 100 };
    const newItem = { ...ITEM_A, price: 120, qty: 1 };
    const cart = addToCart([oldItem], newItem);
    expect(cart[0].price).toBe(120);
  });

  it('caps qty at 99', () => {
    const big = { ...ITEM_A, qty: 98 };
    const cart = addToCart([big], { ...ITEM_A, qty: 5 });
    expect(cart[0].qty).toBe(99);
  });

  it('treats same id but different variantSize as separate items', () => {
    const sm: CartItem = { id: 'id-a', name: 'Burger', price: 100, qty: 1, variantSize: 'Small' };
    const lg: CartItem = { id: 'id-a', name: 'Burger', price: 150, qty: 1, variantSize: 'Large' };
    const cart = addToCart([sm], lg);
    expect(cart).toHaveLength(2);
  });

  it('does not mutate the original cart array', () => {
    const original = [ITEM_A];
    addToCart(original, ITEM_B);
    expect(original).toHaveLength(1);
  });
});

describe('replaceInCart', () => {
  it('removes item when qty is 0', () => {
    const cart = replaceInCart([ITEM_A, ITEM_B], 'id-a', undefined, 120, 0);
    expect(cart).toHaveLength(1);
    expect(cart[0].id).toBe('id-b');
  });

  it('removes item when qty is negative', () => {
    const cart = replaceInCart([ITEM_A], 'id-a', undefined, 120, -1);
    expect(cart).toHaveLength(0);
  });

  it('updates qty and price for existing item', () => {
    const cart = replaceInCart([ITEM_A], 'id-a', undefined, 130, 3);
    expect(cart[0].qty).toBe(3);
    expect(cart[0].price).toBe(130);
  });

  it('does not affect other items', () => {
    const cart = replaceInCart([ITEM_A, ITEM_B], 'id-a', undefined, 120, 5);
    const b = cart.find(i => i.id === 'id-b');
    expect(b?.qty).toBe(2);
  });
});

describe('cartSubtotal', () => {
  it('sums price * qty for all items', () => {
    const cart = [ITEM_A, ITEM_B]; // 120*1 + 60*2 = 240
    expect(cartSubtotal(cart)).toBe(240);
  });

  it('returns 0 for empty cart', () => {
    expect(cartSubtotal([])).toBe(0);
  });

  it('rounds floating point results to 2 decimals', () => {
    const cart: CartItem[] = [
      { id: '1', name: 'X', price: 0.1, qty: 3 },  // 0.30000000000000004
    ];
    expect(cartSubtotal(cart)).toBe(0.30);
  });

  it('handles items with variantSize', () => {
    const cart: CartItem[] = [
      { id: '1', name: 'Chai', price: 25, qty: 2, variantSize: 'Small' },
      { id: '1', name: 'Chai', price: 40, qty: 1, variantSize: 'Large' },
    ];
    expect(cartSubtotal(cart)).toBe(90); // 50 + 40
  });
});

// ── 6. signOrderToken / verifyOrderToken ──────────────────────────────────────

describe('signOrderToken + verifyOrderToken', () => {
  beforeEach(() => {
    process.env.ORDER_EMAIL_SECRET = 'test-secret-key';
  });

  it('signs and verifies a valid token round-trip', () => {
    const orderId = 'order-123-abc';
    const token = signOrderToken(orderId);
    expect(token).toBeTruthy();
    const result = verifyOrderToken(token);
    expect(result).toBe(orderId);
  });

  it('returns null for tampered token', () => {
    const token = signOrderToken('order-xyz');
    const tampered = token.slice(0, -5) + 'XXXXX';
    expect(verifyOrderToken(tampered)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(verifyOrderToken('')).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(verifyOrderToken('not.a.valid.token')).toBeNull();
    expect(verifyOrderToken('aGVsbG8=')).toBeNull();
  });

  it('returns null for an expired token', () => {
    // Forge a token with exp in the past by manipulating Date
    const realDate = Date.now;
    // Sign the token now
    const token = signOrderToken('order-future');
    // Advance time by 73 hours (TTL is 72h)
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 73 * 60 * 60 * 1000);
    const result = verifyOrderToken(token);
    vi.spyOn(Date, 'now').mockRestore();
    expect(result).toBeNull();
  });

  it('generated token is URL-safe base64 (no +, /, =)', () => {
    const token = signOrderToken('order-url-safe-check');
    expect(token).not.toMatch(/[+/=]/);
  });
});

// ── 7. buildOrderConfirmationEmail ────────────────────────────────────────────

describe('buildOrderConfirmationEmail', () => {
  const baseParams = {
    customerName: 'Priya Sharma',
    orderNumber: '1234567',
    orderId: 'ord-uuid-001',
    tokenNumber: '42',
    shopSlug: 'my-cafe',
    shopName: 'My Cafe',
    subtotal: 280.50,
    paymentMethod: 'online' as const,
    items: [
      { name: 'Masala Dosa', qty: 2, price: 80 },
      { name: 'Filter Coffee', qty: 1, price: 120.50 },
    ],
  };

  it('returns subject and htmlbody', () => {
    const { subject, htmlbody } = buildOrderConfirmationEmail(baseParams);
    expect(subject).toBeTruthy();
    expect(htmlbody).toBeTruthy();
  });

  it('subject includes shop name and token number', () => {
    const { subject } = buildOrderConfirmationEmail(baseParams);
    expect(subject).toContain('My Cafe');
    expect(subject).toContain('42');
  });

  it('subject uses Order Number label when tokenNumber is null', () => {
    const { subject } = buildOrderConfirmationEmail({ ...baseParams, tokenNumber: null });
    expect(subject).toContain('Order Number');
    expect(subject).toContain('1234567');
  });

  it('HTML contains customer name', () => {
    const { htmlbody } = buildOrderConfirmationEmail(baseParams);
    expect(htmlbody).toContain('Priya Sharma');
  });

  it('HTML contains shop name', () => {
    const { htmlbody } = buildOrderConfirmationEmail(baseParams);
    expect(htmlbody).toContain('My Cafe');
  });

  it('HTML contains item names', () => {
    const { htmlbody } = buildOrderConfirmationEmail(baseParams);
    expect(htmlbody).toContain('Masala Dosa');
    expect(htmlbody).toContain('Filter Coffee');
  });

  it('HTML contains formatted subtotal', () => {
    const { htmlbody } = buildOrderConfirmationEmail(baseParams);
    expect(htmlbody).toContain('280.50');
  });

  it('HTML includes order link with signed token', () => {
    const { htmlbody } = buildOrderConfirmationEmail(baseParams);
    expect(htmlbody).toContain('/shop/my-cafe/order/ord-uuid-001');
    expect(htmlbody).toContain('?t=');
  });

  it('HTML includes menu link', () => {
    const { htmlbody } = buildOrderConfirmationEmail(baseParams);
    expect(htmlbody).toContain('/shop/my-cafe');
  });

  it('HTML renders variantSize when present', () => {
    const withVariant = {
      ...baseParams,
      items: [{ name: 'Chai', qty: 1, price: 25, variantSize: 'Small' }],
    };
    const { htmlbody } = buildOrderConfirmationEmail(withVariant);
    expect(htmlbody).toContain('Small');
  });

  it('HTML shows "Show this token" hint for token orders', () => {
    const { htmlbody } = buildOrderConfirmationEmail(baseParams);
    expect(htmlbody).toContain('Show this token');
  });

  it('HTML does NOT show token hint when tokenNumber is null', () => {
    const { htmlbody } = buildOrderConfirmationEmail({ ...baseParams, tokenNumber: null });
    expect(htmlbody).not.toContain('Show this token');
  });

  it('is a pure function — calling twice with same args gives same result', () => {
    const result1 = buildOrderConfirmationEmail(baseParams);
    const result2 = buildOrderConfirmationEmail(baseParams);
    expect(result1.subject).toBe(result2.subject);
    // htmlbody contains a signed token whose exp depends on Date.now — allow minor difference
    expect(result1.htmlbody.length).toBeCloseTo(result2.htmlbody.length, -2);
  });
});

// ── 8. Exponential backoff formula ────────────────────────────────────────────

describe('retryDelayMs (email cron backoff)', () => {
  it('attempt 0 → 1 minute', () => {
    expect(retryDelayMs(0)).toBe(60_000);
  });

  it('attempt 1 → 2 minutes', () => {
    expect(retryDelayMs(1)).toBe(120_000);
  });

  it('attempt 2 → 4 minutes', () => {
    expect(retryDelayMs(2)).toBe(240_000);
  });

  it('attempt 3 → 8 minutes', () => {
    expect(retryDelayMs(3)).toBe(480_000);
  });

  it('attempt 4 → 16 minutes (max retry)', () => {
    expect(retryDelayMs(4)).toBe(960_000);
  });

  it('delays are strictly increasing', () => {
    const delays = [0, 1, 2, 3, 4].map(retryDelayMs);
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThan(delays[i - 1]);
    }
  });
});

// ── 9. Counter number formatting ──────────────────────────────────────────────

describe('counter number formatting (C01..C99)', () => {
  function formatCounter(seq: number): string {
    return `C${String(seq).padStart(2, '0')}`;
  }

  it('formats 1 as C01', () => {
    expect(formatCounter(1)).toBe('C01');
  });

  it('formats 9 as C09', () => {
    expect(formatCounter(9)).toBe('C09');
  });

  it('formats 10 as C10', () => {
    expect(formatCounter(10)).toBe('C10');
  });

  it('formats 99 as C99', () => {
    expect(formatCounter(99)).toBe('C99');
  });
});

// ── 10. UUID validation regex (used in API input checks) ──────────────────────

describe('UUID validation (order/item ID format)', () => {
  const uuidRe = /^[0-9a-f-]{36}$/i;

  it('accepts a valid v4 UUID', () => {
    expect(uuidRe.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('rejects a UUID that is too short', () => {
    expect(uuidRe.test('550e8400-e29b-41d4-a716')).toBe(false);
  });

  it('rejects a UUID with special chars', () => {
    expect(uuidRe.test('550e8400-e29b-41d4-a716-44665544000!')).toBe(false);
  });

  it('accepts uppercase UUID (case-insensitive flag)', () => {
    expect(uuidRe.test('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(uuidRe.test('')).toBe(false);
  });
});

// ── 11. consolidateItems (display-layer dedup) ────────────────────────────────

describe('consolidateItems', () => {
  it('returns single item unchanged', () => {
    const items = [{ id: 'a', name: 'Dosa', price: 80, qty: 1 }];
    expect(consolidateItems(items)).toEqual(items);
  });

  it('merges two entries with the same name and no variantSize', () => {
    // Exact scenario from production bug: same display name, different UUIDs
    const items = [
      { id: 'uuid-dosa-1', name: 'Dosa', price: 80, qty: 1 },
      { id: 'uuid-dosa-2', name: 'Dosa', price: 80, qty: 1 },
    ];
    const result = consolidateItems(items);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Dosa');
    expect(result[0].qty).toBe(2);
  });

  it('merges three duplicate-name entries summing qty correctly', () => {
    const items = [
      { id: 'uuid-1', name: 'Parotta', price: 30, qty: 1 },
      { id: 'uuid-2', name: 'Parotta', price: 30, qty: 2 },
      { id: 'uuid-3', name: 'Parotta', price: 30, qty: 1 },
    ];
    const result = consolidateItems(items);
    expect(result).toHaveLength(1);
    expect(result[0].qty).toBe(4);
  });

  it('does NOT merge items with same name but different variantSize', () => {
    const items = [
      { id: 'uuid-1', name: 'Chai', price: 20, qty: 1, variantSize: 'Small' },
      { id: 'uuid-2', name: 'Chai', price: 30, qty: 1, variantSize: 'Large' },
    ];
    const result = consolidateItems(items);
    expect(result).toHaveLength(2);
  });

  it('merges items with same name and same variantSize', () => {
    const items = [
      { id: 'uuid-1', name: 'Chai', price: 20, qty: 1, variantSize: 'Small' },
      { id: 'uuid-2', name: 'Chai', price: 20, qty: 2, variantSize: 'Small' },
    ];
    const result = consolidateItems(items);
    expect(result).toHaveLength(1);
    expect(result[0].qty).toBe(3);
  });

  it('preserves distinct items when names differ', () => {
    const items = [
      { id: 'uuid-1', name: 'Dosa', price: 80, qty: 1 },
      { id: 'uuid-2', name: 'Idli', price: 50, qty: 2 },
    ];
    const result = consolidateItems(items);
    expect(result).toHaveLength(2);
  });

  it('handles real-world order: "Veg Atho" vs "Veg atho" (case-sensitive — not merged)', () => {
    // DB has two distinct products differing only by case; they are different menu items
    const items = [
      { id: 'uuid-1', name: 'Veg Atho', price: 100, qty: 1 },
      { id: 'uuid-2', name: 'Veg atho', price: 100, qty: 1 },
    ];
    const result = consolidateItems(items);
    // Case-sensitive: these are distinct keys, not merged
    expect(result).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(consolidateItems([])).toEqual([]);
  });
});
