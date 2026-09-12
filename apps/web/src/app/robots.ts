import { MetadataRoute } from 'next';

/**
 * robots.txt
 *
 * The wildcard rule already permits every well-behaved crawler, so the AI
 * agents below are listed EXPLICITLY rather than because they would otherwise
 * be blocked. Two reasons that is worth the lines:
 *
 *   1. Several of these bots are blocked by default at the CDN or WAF layer on
 *      many stacks. An explicit allow is the clearest possible signal of intent
 *      if that ever gets switched on here.
 *   2. Being answerable by AI assistants is a deliberate business decision for
 *      this product, not an accident of the wildcard. Whoever reads this file
 *      next should see the choice, not infer it.
 *
 * `/manage/`, `/api/` and `/onboarding/` stay closed to everyone: they are
 * behind auth, carry no public value, and `/shop/` — the actual product — is
 * deliberately left open so live menus can be found and cited.
 */

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
    'CCBot',             // Common Crawl — feeds many downstream models
];

const DISALLOW = ['/manage/', '/api/', '/onboarding/'];

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            { userAgent: '*', allow: '/', disallow: DISALLOW },
            ...AI_AGENTS.map((userAgent) => ({
                userAgent,
                allow: '/',
                disallow: DISALLOW,
            })),
        ],
        sitemap: 'https://vsite.in/sitemap.xml',
        host: 'https://vsite.in',
    };
}
