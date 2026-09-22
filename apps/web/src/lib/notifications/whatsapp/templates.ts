/**
 * The WhatsApp template registry — one entry per v1 event.
 *
 * Each entry is the contract with a template approved in WhatsApp Manager:
 * its name, its category, the exact copy that was submitted, and which of our
 * params fill {{1}}, {{2}}, … in order. `copy` is the source of truth for what
 * to submit (see docs/whatsapp-templates.md); if Meta's version drifts from it,
 * sends fail with 132000 (param count) and the row goes `dead`, visibly.
 *
 * Every template is UTILITY: it is about the owner's own store and plan and
 * contains no offer. Promotional wording gets a template re-categorised as
 * MARKETING, which is ~6× the price and frequency-capped.
 */

export type WhatsAppEvent =
    | 'welcome'
    | 'trial_ending'
    | 'trial_ended'
    | 'payment_receipt'
    | 'plan_expiring'
    | 'plan_expires_today'
    | 'plan_expired';

export type TemplateParams = Record<string, string>;

interface TemplateDef {
    name: string;
    category: 'UTILITY';
    /** Param key whose value is a public image URL for an IMAGE header. */
    headerImage?: string;
    /** Param keys for {{1}}, {{2}}, … in the body, in order. */
    body: readonly string[];
    /** The exact body submitted to Meta. */
    copy: string;
    /** Footer submitted to Meta (static, no params). */
    footer?: string;
}

const FOOTER = 'vsite.in · Smart QR Menu';

export const TEMPLATES: Record<WhatsAppEvent, TemplateDef> = {
    welcome: {
        name: 'vsite_welcome_qr',
        category: 'UTILITY',
        headerImage: 'qrImageUrl',
        body: ['shopName', 'menuUrl', 'trialEndsOn'],
        copy:
            'Congratulations! {{1}} is now live on vsite.\n\n' +
            'Your QR code is attached. Print it and place it on your tables or counter — customers scan it to see your menu.\n\n' +
            'Menu link: {{2}}\n\n' +
            'Your free trial is active until {{3}}. You can edit your menu anytime from your dashboard.',
        footer: FOOTER,
    },
    trial_ending: {
        name: 'vsite_trial_ending',
        category: 'UTILITY',
        body: ['shopName', 'trialEndsOn', 'priceInr'],
        copy:
            'Your free trial for {{1}} ends on {{2}}.\n\n' +
            'After that, customers who scan your QR code will not see your menu. ' +
            'To keep it live, activate your plan (₹{{3}}/month) at vsite.in/manage/subscription.',
        footer: FOOTER,
    },
    trial_ended: {
        name: 'vsite_trial_ended',
        category: 'UTILITY',
        body: ['shopName', 'priceInr'],
        copy:
            'The free trial for {{1}} has ended, so your QR menu is now offline.\n\n' +
            'Your menu and photos are saved. Activate your plan (₹{{2}}/month) at vsite.in/manage/subscription to bring it back instantly.',
        footer: FOOTER,
    },
    payment_receipt: {
        name: 'vsite_payment_receipt',
        category: 'UTILITY',
        body: ['amountInr', 'validTill'],
        copy:
            'Payment received: ₹{{1}} for your vsite Smart QR Menu plan.\n\n' +
            'Your menu is live until {{2}}. Your invoice is available at vsite.in/manage/subscription.',
        footer: FOOTER,
    },
    plan_expiring: {
        name: 'vsite_plan_expiring',
        category: 'UTILITY',
        body: ['shopName', 'expiresOn'],
        copy:
            'Your vsite plan for {{1}} expires on {{2}}.\n\n' +
            'Renew at vsite.in/manage/subscription to keep your QR menu live without interruption.',
        footer: FOOTER,
    },
    plan_expires_today: {
        name: 'vsite_plan_expires_today',
        category: 'UTILITY',
        body: ['shopName'],
        copy:
            'Your vsite plan for {{1}} expires today.\n\n' +
            'Renew at vsite.in/manage/subscription so customers can keep scanning your QR menu.',
        footer: FOOTER,
    },
    plan_expired: {
        name: 'vsite_plan_expired',
        category: 'UTILITY',
        body: ['shopName'],
        copy:
            'Your vsite plan for {{1}} has expired, so your QR menu is now offline.\n\n' +
            'Your menu is saved. Renew at vsite.in/manage/subscription to bring it back instantly.',
        footer: FOOTER,
    },
};

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
