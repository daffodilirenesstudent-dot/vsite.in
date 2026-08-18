import Link from 'next/link';
import Navbar from './Navbar';
import FooterCTA from './FooterCTA';
import type { ContentBlock } from '@/content/blog/types';

export type SeoLandingData = {
    slug: string;
    h1: string;
    subtitle: string;
    ctaPrimary?: { label: string; href: string };
    ctaSecondary?: { label: string; href: string };
    // Feature grid shown near the top
    features: { icon: string; title: string; description: string }[];
    // Long-form body using the shared ContentBlock format
    content: ContentBlock[];
    // Internal-link cluster shown near the bottom — critical for sitelinks
    relatedLinks?: { label: string; href: string }[];
    // FAQ items become a FAQPage JSON-LD block AND a visible accordion
    faqs: { q: string; a: string }[];
};

function renderBlock(block: ContentBlock, idx: number) {
    switch (block.type) {
        case 'p':
            return <p key={idx} className="text-slate-700 leading-relaxed">{block.text}</p>;
        case 'h2':
            return <h2 key={idx} className="text-2xl font-bold text-slate-900 mt-10 mb-3">{block.text}</h2>;
        case 'h3':
            return <h3 key={idx} className="text-lg font-semibold text-slate-900 mt-6 mb-2">{block.text}</h3>;
        case 'ul':
            return (
                <ul key={idx} className="list-disc list-inside space-y-1.5 text-slate-700">
                    {block.items.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
            );
        case 'ol':
            return (
                <ol key={idx} className="list-decimal list-inside space-y-1.5 text-slate-700">
                    {block.items.map((item, i) => <li key={i}>{item}</li>)}
                </ol>
            );
        case 'table':
            return (
                <div key={idx} className="overflow-x-auto my-2">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="bg-slate-100">
                                {block.headers.map((h, i) => (
                                    <th key={i} className="text-left px-3 py-2 font-semibold text-slate-800 border border-slate-200">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {block.rows.map((row, i) => (
                                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                    {row.map((cell, j) => (
                                        <td key={j} className="px-3 py-2 text-slate-700 border border-slate-200">{cell}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        case 'callout':
            return (
                <div key={idx} className="bg-primary/8 border-l-4 border-primary rounded-r-xl px-5 py-4 my-2">
                    <p className="text-primary font-semibold text-sm leading-relaxed">{block.text}</p>
                </div>
            );
        default:
            return null;
    }
}

export default function SeoLanding({ data }: { data: SeoLandingData }) {
    const primary = data.ctaPrimary ?? { label: 'Start Free Trial', href: '/signup' };
    const secondary = data.ctaSecondary ?? { label: 'View Pricing', href: '/pricing' };

    return (
        <>
            <Navbar />

            {/* Hero */}
            <section className="bg-gradient-to-br from-violet-50 via-purple-50 to-slate-50 pt-24 pb-16">
                <div className="max-w-4xl mx-auto px-4 text-center">
                    <p className="text-primary text-xs font-bold uppercase tracking-widest">vsite</p>
                    <h1 className="text-4xl sm:text-5xl font-extrabold font-display text-slate-900 mt-4 leading-tight">
                        {data.h1}
                    </h1>
                    <p className="text-slate-600 mt-5 text-lg leading-relaxed max-w-2xl mx-auto">
                        {data.subtitle}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
                        <Link
                            href={primary.href}
                            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-7 py-3 text-sm font-bold text-white shadow-md shadow-primary/25 hover:bg-primary-dark transition-colors"
                        >
                            {primary.label}
                            <span className="material-symbols-outlined text-base">arrow_forward</span>
                        </Link>
                        <Link
                            href={secondary.href}
                            className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-7 py-3 text-sm font-bold text-slate-800 hover:border-slate-400 transition-colors"
                        >
                            {secondary.label}
                        </Link>
                    </div>
                    <p className="text-xs text-slate-400 mt-4">7-day free trial · No credit card · Setup in 3 minutes</p>
                </div>
            </section>

            {/* Feature grid */}
            {data.features.length > 0 && (
                <section className="bg-white py-16">
                    <div className="max-w-5xl mx-auto px-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                            {data.features.map((f) => (
                                <div
                                    key={f.title}
                                    className="rounded-2xl border border-slate-200 p-6 bg-white hover:shadow-md transition-shadow"
                                >
                                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                                        <span className="material-symbols-outlined text-primary text-xl">{f.icon}</span>
                                    </div>
                                    <h3 className="font-bold text-slate-900">{f.title}</h3>
                                    <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{f.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* Long-form content body */}
            <section className="bg-white pb-16">
                <div className="max-w-3xl mx-auto px-4 space-y-5">
                    {data.content.map((block, idx) => renderBlock(block, idx))}
                </div>
            </section>

            {/* FAQs */}
            {data.faqs.length > 0 && (
                <section className="bg-background-light py-16">
                    <div className="max-w-3xl mx-auto px-4">
                        <h2 className="text-2xl font-bold text-slate-900 mb-8">Frequently Asked Questions</h2>
                        <div className="space-y-3">
                            {data.faqs.map((faq) => (
                                <details
                                    key={faq.q}
                                    className="group bg-white rounded-2xl border border-slate-200 p-5 open:shadow-sm transition-shadow"
                                >
                                    <summary className="font-semibold text-slate-900 cursor-pointer list-none flex items-start justify-between gap-3">
                                        <span>{faq.q}</span>
                                        <span className="material-symbols-outlined text-slate-400 text-xl shrink-0 group-open:rotate-180 transition-transform">
                                            expand_more
                                        </span>
                                    </summary>
                                    <p className="text-slate-600 mt-3 text-sm leading-relaxed">{faq.a}</p>
                                </details>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* Related / internal-link cluster — directly feeds Google sitelinks */}
            {data.relatedLinks && data.relatedLinks.length > 0 && (
                <section className="bg-white py-14">
                    <div className="max-w-3xl mx-auto px-4">
                        <h2 className="text-lg font-bold text-slate-900 mb-5">Related</h2>
                        <div className="flex flex-wrap gap-2">
                            {data.relatedLinks.map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className="text-sm bg-slate-100 hover:bg-primary/10 hover:text-primary text-slate-700 px-4 py-2 rounded-full transition-colors"
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            <FooterCTA />
        </>
    );
}

/**
 * Builds the JSON-LD payload set that every SEO landing page should emit.
 * Returns an array of strings (stringified JSON) — the page renders them as
 * <script type="application/ld+json"> tags. This is what unlocks FAQPage /
 * rich result eligibility for "People Also Ask" and sitelink candidates.
 */
export function buildLandingSchemas(args: {
    slug: string;
    title: string;
    description: string;
    faqs: { q: string; a: string }[];
    breadcrumbLabel: string;
}): string[] {
    const BASE_URL = 'https://vsite.in';
    const url = `${BASE_URL}/${args.slug}`;

    const webpage = {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: args.title,
        description: args.description,
        url,
        publisher: {
            '@type': 'Organization',
            name: 'vsite',
            url: BASE_URL,
            logo: { '@type': 'ImageObject', url: `${BASE_URL}/logo.png` },
        },
    };

    const breadcrumbs = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
            { '@type': 'ListItem', position: 2, name: args.breadcrumbLabel, item: url },
        ],
    };

    const schemas = [JSON.stringify(webpage), JSON.stringify(breadcrumbs)];

    if (args.faqs.length > 0) {
        const faqSchema = {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: args.faqs.map(({ q, a }) => ({
                '@type': 'Question',
                name: q,
                acceptedAnswer: { '@type': 'Answer', text: a },
            })),
        };
        schemas.push(JSON.stringify(faqSchema));
    }

    return schemas;
}
