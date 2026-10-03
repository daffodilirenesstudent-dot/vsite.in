import type { BlogPost } from '@/content/blog/types';
import { ORG_ID, SITE_ORIGIN } from '@/lib/seo/entity';

export type InlinePart =
    | { type: 'text'; text: string }
    | { type: 'link'; text: string; href: string; external: boolean };

const LINK_RE = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/**
 * Splits `text with [a link](/path)` into text and link parts.
 *
 * Only site-relative paths ("/x", not "//x") and http(s) URLs become links;
 * anything else (javascript:, data:, protocol-relative) is left as the literal
 * text the author typed. The parts are rendered as React nodes, never HTML.
 */
export function parseInline(text: string): InlinePart[] {
    const parts: InlinePart[] = [];
    let last = 0;
    const push = (t: string) => {
        if (!t) return;
        const prev = parts[parts.length - 1];
        if (prev && prev.type === 'text') prev.text += t;
        else parts.push({ type: 'text', text: t });
    };

    for (const m of text.matchAll(LINK_RE)) {
        const [whole, label, href] = m;
        const index = m.index ?? 0;
        push(text.slice(last, index));
        const internal = href.startsWith('/') && !href.startsWith('//');
        const external = /^https?:\/\//i.test(href);
        if (internal || external) parts.push({ type: 'link', text: label, href, external });
        else push(whole);
        last = index + whole.length;
    }
    push(text.slice(last));
    return parts;
}

/** Newest by publishedAt (ties by updatedAt), independent of array order. */
export function newestPost(posts: readonly BlogPost[]): BlogPost {
    return [...posts].sort(
        (a, b) =>
            b.publishedAt.localeCompare(a.publishedAt) || b.updatedAt.localeCompare(a.updatedAt),
    )[0];
}

/** Same category and shared tags first, newest as the tie-break. */
export function relatedPosts(posts: readonly BlogPost[], current: BlogPost, limit = 3): BlogPost[] {
    const tags = new Set(current.tags.map((t) => t.toLowerCase()));
    const score = (p: BlogPost) =>
        (p.category === current.category ? 2 : 0) +
        p.tags.filter((t) => tags.has(t.toLowerCase())).length * 1;
    return posts
        .filter((p) => p.slug !== current.slug)
        .map((p) => ({ p, s: score(p) }))
        .sort((x, y) => y.s - x.s || y.p.publishedAt.localeCompare(x.p.publishedAt))
        .slice(0, limit)
        .map((x) => x.p);
}

export function buildArticleSchema(post: BlogPost) {
    const url = `${SITE_ORIGIN}/blog/${post.slug}`;
    return {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: post.title,
        description: post.description,
        image: `${SITE_ORIGIN}/og-image.png`,
        datePublished: post.publishedAt,
        dateModified: post.updatedAt,
        // The byline is the company, not an invented person.
        author: { '@id': ORG_ID },
        publisher: { '@id': ORG_ID },
        url,
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        keywords: post.tags.join(', '),
    };
}
