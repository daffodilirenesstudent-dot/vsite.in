import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
    ORDERING_FROZEN,
    TRIAL_DURATION_MS,
    SELLABLE_PLANS,
    normalizePlan,
    isOrderingPlan,
    isPlanSellable,
} from '@/lib/platform/productFlags';

describe('product freeze — plan normalization', () => {
    it('is frozen', () => {
        expect(ORDERING_FROZEN).toBe(true);
    });

    it('collapses every ordering plan to qr_menu', () => {
        expect(normalizePlan('qr_order')).toBe('qr_menu');
        expect(normalizePlan('pay_eat')).toBe('qr_menu');
        expect(normalizePlan('pro')).toBe('qr_menu');
    });

    it('leaves the smart QR menu plan (and its legacy alias) intact', () => {
        expect(normalizePlan('qr_menu')).toBe('qr_menu');
        expect(normalizePlan('base')).toBe('base');
    });

    it('defaults a missing plan to qr_menu', () => {
        expect(normalizePlan(null)).toBe('qr_menu');
        expect(normalizePlan(undefined)).toBe('qr_menu');
    });

    it('identifies the frozen ordering plans by every production slug', () => {
        expect(isOrderingPlan('qr_order')).toBe(true);
        expect(isOrderingPlan('pay_eat')).toBe(true);
        expect(isOrderingPlan('pro')).toBe(true);
        expect(isOrderingPlan('qr_menu')).toBe(false);
        expect(isOrderingPlan('base')).toBe(false);
    });
});

describe('product freeze — purchasable plans', () => {
    it('sells only the smart QR menu', () => {
        expect([...SELLABLE_PLANS]).toEqual(['qr_menu']);
        expect(isPlanSellable('qr_menu')).toBe(true);
    });

    it('refuses to sell the frozen ordering plans', () => {
        expect(isPlanSellable('qr_order')).toBe(false);
        expect(isPlanSellable('pay_eat')).toBe(false);
    });
});

describe('trial duration', () => {
    it('is 7 days', () => {
        expect(TRIAL_DURATION_MS).toBe(7 * 24 * 60 * 60 * 1000);
    });

    // The 14-vs-7 split across seven files was a live bug: the dashboard
    // expired the trial at day 7 while the public menu stayed up to day 14.
    it('is defined exactly once in src/, in productFlags.ts', () => {
        const hits: string[] = [];
        const walk = (dir: string) => {
            for (const entry of readdirSync(dir)) {
                const p = join(dir, entry);
                if (statSync(p).isDirectory()) { walk(p); continue; }
                if (!/\.(ts|tsx)$/.test(entry)) continue;
                if (/TRIAL_DURATION_MS\s*=\s*\d/.test(readFileSync(p, 'utf8'))) hits.push(p);
            }
        };
        walk('src');
        expect(hits.length).toBe(1);
        expect(hits[0].endsWith('productFlags.ts')).toBe(true);
    });
});
