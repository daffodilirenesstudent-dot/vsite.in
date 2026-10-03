/**
 * The WhatsApp template registry — one entry per v1 event.
 *
 * Each entry is the contract with a template approved in WhatsApp Manager:
 * its name, its category, the exact copy that was submitted, and which of our
 * params fill {{1}}, {{2}}, … in order. `copy` is the source of truth for what
 * to submit (see docs/whatsapp-setup.md); if Meta's version drifts from it,
 * sends fail with 132000 (param count) and the row goes `dead`, visibly.
 *
 * `category` is what Meta APPROVED, not what we asked for. Everything is about
 * the owner's own store and plan, and was submitted as UTILITY; Meta filed the
 * two trial templates as MARKETING (they name the plan price) and the owner
 * accepted that on 2026-10-03. Marketing sends cost more and are subject to
 * Meta's per-user marketing cap (131049, deferred a day — see health.ts) and to
 * the owner turning marketing messages off (131050, dead). The category is not
 * sent with a message; it documents the contract and is guarded by tests.
 */

import { SITE_URL } from '@/lib/platform/brand';

export type WhatsAppEvent =
    | 'welcome'
    | 'store_live'
    | 'trial_ending'
    | 'trial_ended'
    | 'payment_receipt'
    | 'plan_expiring'
    | 'plan_expires_today'
    | 'plan_expired';

export type TemplateParams = Record<string, string>;

export type TemplateCategory = 'UTILITY' | 'MARKETING';

interface TemplateDef {
    name: string;
    category: TemplateCategory;
    /** Param key whose value is a public image URL for an IMAGE header. */
    headerImage?: string;
    /**
     * Static TEXT header submitted to Meta — the one line an owner reads in
     * under a second. Never sent by the code (no variables), so it can be
     * reworded in WhatsApp Manager without a deploy. Plain text: no emoji.
     */
    headerText?: string;
    /** Param keys for {{1}}, {{2}}, … in the body, in order. */
    body: readonly string[];
    /** The exact body submitted to Meta. */
    copy: string;
    /** Footer submitted to Meta (static, no params). */
    footer?: string;
    /** Static URL button submitted to Meta. Not sent by the code. */
    button?: { text: string; url: string };
}

/*
 * House style (research 2026-10-02 — Meta utility rules + scannability):
 *   - Header says what happened; the body gives the facts. Read in < 1 s.
 *   - The fact that matters (shop, date, amount) is *bold*.
 *   - One emoji, first, as a status icon: 🎉 live · ⏳ ending · ⚠️ offline · ✅ paid.
 *   - Facts, not persuasion. "Renew now", "!" and urgency get a template
 *     re-filed as MARKETING (Meta's own example of marketing is "Your
 *     subscription will expire on {{date}}! Renew today…").
 *   - The action is the button, so the body carries no URL to read.
 */
const FOOTER = 'vsite · Smart QR Menu';
const DASHBOARD = { text: 'Manage menu', url: 'https://vsite.in/manage/dashboard' };
const PLAN = { text: 'View plan', url: 'https://vsite.in/manage/subscription' };

export const TEMPLATES: Record<WhatsAppEvent, TemplateDef> = {
    welcome: {
        name: 'vsite_welcome_qr',
        category: 'UTILITY',
        headerImage: 'qrImageUrl',
        body: ['shopName', 'menuUrl', 'trialEndsOn'],
        copy:
            '🎉 *{{1}}* is now live on vsite.\n\n' +
            'Your QR code is above. Print it and place it on your tables or counter — customers scan it to see your menu.\n\n' +
            'Menu link: {{2}}\n' +
            'Free trial until: *{{3}}*\n\n' +
            'Tap below to edit your menu anytime.',
        footer: FOOTER,
        button: DASHBOARD,
    },
    /*
     * The QR for a store that opened WITHOUT a trial (one free trial per
     * account) and went live by paying — it never got the welcome. Shares the
     * welcome's idempotency key (`welcome:<siteId>`, storeLive.ts), so a store
     * gets exactly one QR message, whichever way it went live.
     */
    store_live: {
        name: 'vsite_store_live_qr',
        category: 'UTILITY',
        headerImage: 'qrImageUrl',
        body: ['shopName', 'menuUrl'],
        copy:
            '🎉 *{{1}}* is now live on vsite.\n\n' +
            'Your QR code is above. Print it and place it on your tables or counter — customers scan it to see your menu.\n\n' +
            'Menu link: {{2}}\n\n' +
            'Tap below to edit your menu anytime.',
        footer: FOOTER,
        button: DASHBOARD,
    },
    trial_ending: {
        name: 'vsite_trial_ending',
        category: 'MARKETING',
        headerText: 'Free trial ending soon',
        body: ['shopName', 'trialEndsOn', 'priceInr'],
        copy:
            '⏳ The free trial for *{{1}}* ends on *{{2}}*.\n\n' +
            'After that date, customers who scan your QR code will not see your menu. The Smart QR Menu plan is ₹{{3}}/month.',
        footer: FOOTER,
        button: PLAN,
    },
    trial_ended: {
        name: 'vsite_trial_ended',
        category: 'MARKETING',
        headerText: 'Free trial ended',
        body: ['shopName', 'priceInr'],
        copy:
            '⚠️ The free trial for *{{1}}* has ended. Your QR menu is now offline for customers.\n\n' +
            'Your menu and photos are saved. It goes live again as soon as the plan (₹{{2}}/month) is active.',
        footer: FOOTER,
        button: PLAN,
    },
    payment_receipt: {
        name: 'vsite_payment_receipt',
        category: 'UTILITY',
        headerText: 'Payment received',
        body: ['amountInr', 'validTill'],
        copy:
            '✅ We received *₹{{1}}* for your Smart QR Menu plan.\n\n' +
            'Your menu is live until *{{2}}*. Your invoice is in the dashboard.',
        footer: FOOTER,
        button: { text: 'View invoice', url: 'https://vsite.in/manage/subscription' },
    },
    plan_expiring: {
        name: 'vsite_plan_expiring',
        category: 'UTILITY',
        headerText: 'Plan ending soon',
        body: ['shopName', 'expiresOn'],
        copy:
            '⏳ The vsite plan for *{{1}}* ends on *{{2}}*.\n\n' +
            'After that date, customers who scan your QR code will not see your menu.',
        footer: FOOTER,
        button: PLAN,
    },
    plan_expires_today: {
        name: 'vsite_plan_expires_today',
        category: 'UTILITY',
        headerText: 'Plan ends within 24 hours',
        body: ['shopName'],
        copy:
            '⏳ The vsite plan for *{{1}}* ends within the next 24 hours.\n\n' +
            'After that, customers who scan your QR code will not see your menu.',
        footer: FOOTER,
        button: PLAN,
    },
    plan_expired: {
        name: 'vsite_plan_expired',
        category: 'UTILITY',
        headerText: 'Plan ended',
        body: ['shopName'],
        copy:
            '⚠️ The vsite plan for *{{1}}* has ended. Your QR menu is now offline for customers.\n\n' +
            'Your menu is saved. It goes live again as soon as the plan is active.',
        footer: FOOTER,
        button: PLAN,
    },
};

/**
 * The two public links a QR message carries, derived from the store's slug
 * only. The enqueue side and the send-time check both use this, so "is this
 * the QR of this store?" is one string comparison, never a guess.
 */
export function storeLinks(slug: string): { menuUrl: string; qrImageUrl: string } {
    return { menuUrl: `${SITE_URL}/shop/${slug}`, qrImageUrl: `${SITE_URL}/api/qr/${slug}` };
}

/** Language every v1 template is approved in. Stored per outbox row. */
export const DEFAULT_TEMPLATE_LANGUAGE = 'en';

/** Meta's text-param limits: no newlines/tabs, no more than 4 consecutive spaces. */
const MAX_PARAM_LEN = 200;

function cleanParam(value: string): string {
    return value.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, MAX_PARAM_LEN);
}

function required(params: TemplateParams, key: string, event: WhatsAppEvent): string {
    const v = params[key];
    const cleaned = typeof v === 'string' ? cleanParam(v) : '';
    if (!cleaned) throw new Error(`[whatsapp] template ${event} is missing param "${key}"`);
    return cleaned;
}

export type TemplateComponent =
    | { type: 'header'; parameters: Array<{ type: 'image'; image: { link: string } }> }
    | { type: 'body'; parameters: Array<{ type: 'text'; text: string }> };

/** Build the `template.components` array for a send. Throws on a missing param. */
export function buildComponents(event: WhatsAppEvent, params: TemplateParams): TemplateComponent[] {
    const def = TEMPLATES[event];
    const components: TemplateComponent[] = [];
    if (def.headerImage) {
        components.push({
            type: 'header',
            parameters: [{ type: 'image', image: { link: required(params, def.headerImage, event) } }],
        });
    }
    components.push({
        type: 'body',
        parameters: def.body.map(key => ({ type: 'text' as const, text: required(params, key, event) })),
    });
    return components;
}

/** "29 Sept 2026", in India time regardless of the server's zone. */
export function formatDateIST(iso: string | number | Date): string {
    return new Date(iso).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
    });
}
