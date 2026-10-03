import { MetadataRoute } from 'next';

/**
 * robots.txt
 *
 * The wildcard rule already permits every well-behaved crawler, so the agents
 * below are listed EXPLICITLY rather than because they would otherwise be
 * blocked. Two reasons that is worth the lines:
 *
 *   1. Several of these bots are blocked by default at the CDN or WAF layer on
 *      many stacks. An explicit allow is the clearest possible signal of intent
 *      if that ever gets switched on here.
 *   2. Being answerable by AI assistants and search engines is a deliberate
 *      business decision for this product, not an accident of the wildcard.
 *
 * `/manage/`, `/api/` and `/onboarding/` stay closed to everyone: they are
 * behind auth, carry no public value, and `/shop/` (the actual product) is
 * deliberately left open so live menus can be found and cited.
 *
 * Private pages that must stay out of the index (/login, /signup, /auth/*,
 * /tmp-preview, /shop/preview) are NOT disallowed here: a crawler that cannot
 * fetch a page never sees its `noindex`. They carry a robots meta tag instead.
 */

/** Search engines. Listed so a future WAF default cannot silently block them. */
const SEARCH_AGENTS = [
    'Googlebot',
    'Bingbot',         // Bing, and the index ChatGPT search and Copilot draw on
    'Applebot',        // Apple Spotlight / Siri search
];

/** Crawlers that feed AI answers, training corpora, or both. */
const AI_AGENTS = [
    'GPTBot',            // OpenAI — ChatGPT browsing + training
    'OAI-SearchBot',     // OpenAI — ChatGPT search index
    'ChatGPT-User',      // OpenAI — user-initiated fetches
    'ClaudeBot',         // Anthropic — Claude
    'Claude-User',       // Anthropic — user-initiated fetches
    'PerplexityBot',     // Perplexity — retrieval index
    'Perplexity-User',   // Perplexity — user-initiated fetches
    'Google-Extended',   // Google — Gemini / AI Overviews grounding
    'Applebot-Extended', // Apple Intelligence
    'Amazonbot',         // Amazon — Alexa answers
    'Meta-ExternalAgent', // Meta AI
    'CCBot',             // Common Crawl — feeds many downstream models
];

const DISALLOW = ['/manage/', '/api/', '/onboarding/'];

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            { userAgent: '*', allow: '/', disallow: DISALLOW },
            ...[...SEARCH_AGENTS, ...AI_AGENTS].map((userAgent) => ({
                userAgent,
                allow: '/',
                disallow: DISALLOW,
            })),
        ],
        sitemap: 'https://vsite.in/sitemap.xml',
        host: 'https://vsite.in',
    };
}
