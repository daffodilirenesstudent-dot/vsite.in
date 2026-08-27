/**
 * Public contact and identity details — single source of truth.
 *
 * These were previously typed by hand into every page that needed them, which
 * is how `/contact` and `/demo` ended up carrying the real WhatsApp number
 * while the homepage still had a placeholder. One module, one place to change
 * them, and the marketing pages can never drift apart again.
 *
 * CLIENT-SAFE: no server-only imports. Marketing components are client
 * components and import this directly.
 */

/** Bare digits with country code — the shape wa.me requires. */
export const WHATSAPP_NUMBER = '919360706659';

/** Human-readable, for display next to the link. */
export const WHATSAPP_DISPLAY = '+91 93607 06659';

export const SUPPORT_EMAIL = 'official@vsite.in';

export const FOUNDER_NAME = 'G Sri Gowtham';
export const FOUNDER_TITLE = 'Founder, vsite';
export const FOUNDER_LOCATION = 'Tamil Nadu';

/**
 * Initials for the founder avatar, derived rather than hardcoded so they stay
 * correct if the name is edited above. Takes the last two name parts, since
 * South Indian names commonly lead with an initial.
 */
export const FOUNDER_INITIALS = FOUNDER_NAME.trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

/**
 * Builds a wa.me link, optionally with a prefilled first message.
 *
 * A prefilled message matters more than it looks: it removes the "what do I
 * even say" pause, and it tells us which page the person came from without
 * any tracking.
 */
export function whatsappUrl(message?: string): string {
    const base = `https://wa.me/${WHATSAPP_NUMBER}`;
    return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
