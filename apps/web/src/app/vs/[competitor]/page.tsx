import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Check, ExternalLink } from 'lucide-react';
import { COMPETITORS, VSITE_ADVANTAGES, getCompetitor } from '@/content/seo-pages/competitors';
import { PLAN_PRICES_INR } from '@/lib/platform/productFlags';
import { whatsappUrl } from '@/lib/platform/brand';

/**
 * /vs/<competitor> — fair, sourced comparison pages.
 *
 * ─── WHY "FAIR" IS NOT A NICETY HERE ─────────────────────────────────────────
 * This is the highest-value page type for GEO: comparison and "X vs Y" content
 * is exactly what a recommendation prompt retrieves, and an AI engine treats a
 * page that only ever declares itself the winner as marketing to discount, not
 * a source to cite. The `whereTheyWin` section is load-bearing, not generous —
 * a comparison an engine can corroborate against the competitor's own claims is
 * one it will actually quote.
 *
 * It is also the legally sound shape: comparative advertising is lawful in
 * India when it is truthful, substantiated and not denigratory. Every claim
 * on this page traces to `competitors.ts`, which traces to a public URL.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const BASE_URL = 'https://vsite.in';
const PRICE = PLAN_PRICES_INR.qr_menu;

export function generateStaticParams() {
    return COMPETITORS.map((c) => ({ competitor: c.slug }));
}

export const dynamicParams = false;

export async function generateMetadata(
    { params }: { params: { competitor: string } },
): Promise<Metadata> {
    const c = getCompetitor(params.competitor);
    if (!c) return {};

    const title = `vsite vs ${c.name} — Compared for 2026 | Digital Menu Software`;
    const description =
        `An honest, sourced comparison of vsite and ${c.name}: pricing, AI food photos, menu engineering, ` +
        `and where each one is genuinely the better choice.`;
    const url = `${BASE_URL}/vs/${c.slug}`;

    return {
        title,
        description,
        alternates: { canonical: url },
        openGraph: { title, description, url, type: 'website', locale: 'en_IN' },
    };
}

function buildSchema(c: NonNullable<ReturnType<typeof getCompetitor>>) {
    const faqSchema = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
            {
                '@type': 'Question',
                name: `Is vsite better than ${c.name}?`,
                acceptedAnswer: {
                    '@type': 'Answer',
                    text:
                        `It depends what you need. vsite includes menu engineering, AI-matched food photos for every ` +
                        `dish, and multi-outlet support that ${c.name} does not offer. ${c.name} is ${c.whereTheyWin[0]}`,
                },
            },
            {
                '@type': 'Question',
                name: `How much does ${c.name} cost compared to vsite?`,
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: `${c.name} costs ${c.price}. vsite costs ₹${PRICE}/month, one plan, no commission.`,
                },
            },
        ],
    };

    const comparisonSchema = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: [
            {
                '@type': 'SoftwareApplication',
                position: 1,
                name: 'vsite',
                applicationCategory: 'BusinessApplication',
                offers: { '@type': 'Offer', price: String(PRICE), priceCurrency: 'INR' },
            },
            {
                '@type': 'SoftwareApplication',
                position: 2,
                name: c.name,
                applicationCategory: 'BusinessApplication',
            },
        ],
    };

    return [JSON.stringify(faqSchema), JSON.stringify(comparisonSchema)];
}

export default function ComparisonPage({ params }: { params: { competitor: string } }) {
    const c = getCompetitor(params.competitor);
    if (!c) notFound();

    const schemas = buildSchema(c);

    return (
        <>
            {schemas.map((s, i) => (
                <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: s }} />
            ))}

            <main className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
                <p className="text-caption font-semibold uppercase tracking-[0.1em] text-primary">
                    Compared, with sources
                </p>
                <h1 className="mt-4 font-display text-3xl font-bold text-ink sm:text-4xl">
                    vsite vs {c.name}
                </h1>
                <p className="mt-4 text-body text-ink/70">
                    {c.positioning} Here is what each one includes, what each one leaves out, and
                    where {c.name} is honestly the better choice.
                </p>

                <div className="mt-2 flex items-center gap-1.5 text-body-sm text-ink/45">
                    Verified {c.verifiedOn} against{' '}
                    <a
                        href={c.source}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                        {c.name}&apos;s own page <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                </div>

                {/* Price */}
                <div className="mt-10 grid grid-cols-2 gap-4 rounded-card-lg border border-line bg-white p-6">
                    <div>
                        <p className="text-body-sm text-ink/50">vsite</p>
                        <p className="mt-1 font-display text-2xl font-bold text-ink">₹{PRICE}/month</p>
                        <p className="mt-1 text-body-sm text-ink/50">One plan. No commission.</p>
                    </div>
                    <div>
                        <p className="text-body-sm text-ink/50">{c.name}</p>
                        <p className="mt-1 font-display text-2xl font-bold text-ink">{c.price}</p>
                        {c.priceNote && <p className="mt-1 text-body-sm text-ink/50">{c.priceNote}</p>}
                    </div>
                </div>

                {/* What vsite has that they don't */}
                <h2 className="mt-14 font-display text-2xl font-bold text-ink">
                    What vsite includes that {c.name} does not
                </h2>
                <p className="mt-2 text-body-sm text-ink/55">
                    Checked against {c.name}&apos;s own published feature list — not assumed.
                </p>
                <ul className="mt-6 space-y-3">
                    {c.theyLack.map((item) => (
                        <li key={item} className="flex items-start gap-3 text-body text-ink/80">
                            <Check className="mt-1 h-4 w-4 flex-none text-emerald-600" aria-hidden />
                            {item}
                        </li>
                    ))}
                </ul>
                {c.theyLackNote && (
                    <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-body-sm text-amber-900">
                        {c.theyLackNote}
                    </p>
                )}

                {/* What they have */}
                <h2 className="mt-12 font-display text-2xl font-bold text-ink">
                    What {c.name} does offer
                </h2>
                <p className="mt-2 text-body-sm text-ink/55">
                    In fairness — these are real, and vsite does not claim otherwise.
                </p>
                <ul className="mt-6 space-y-3">
                    {c.theyHave.map((item) => (
                        <li key={item} className="flex items-start gap-3 text-body text-ink/80">
                            <Check className="mt-1 h-4 w-4 flex-none text-ink/40" aria-hidden />
                            {item}
                        </li>
                    ))}
                </ul>

                {/* Where they win — the section that makes this page honest */}
                <h2 className="mt-12 font-display text-2xl font-bold text-ink">
                    When {c.name} is the right choice, not vsite
                </h2>
                <ul className="mt-6 space-y-3">
                    {c.whereTheyWin.map((item) => (
                        <li key={item} className="flex items-start gap-3 text-body text-ink/80">
                            <ArrowRight className="mt-1 h-4 w-4 flex-none text-primary" aria-hidden />
                            {item}
                        </li>
                    ))}
                </ul>

                {/* Full advantage detail */}
                <h2 className="mt-14 font-display text-2xl font-bold text-ink">
                    The vsite features in detail
                </h2>
                <div className="mt-6 space-y-6">
                    {VSITE_ADVANTAGES.map((a) => (
                        <div key={a.title}>
                            <h3 className="font-display text-lg font-bold text-ink">{a.title}</h3>
                            <p className="mt-1.5 text-body text-ink/70">{a.detail}</p>
                        </div>
                    ))}
                </div>

                {/* Not there yet — stated plainly */}
                <div className="mt-14 rounded-card-lg border border-line bg-paper-2 p-6">
                    <h2 className="font-display text-lg font-bold text-ink">What vsite doesn&apos;t do yet</h2>
                    <p className="mt-2 text-body text-ink/70">
                        In-menu ordering and payment are not live on vsite yet — customers read the menu
                        and order with your staff, as they do today. It is coming, at no extra cost, on
                        the same ₹{PRICE} plan.
                        {c.slug === 'menuscan' &&
                            ` If you need ordering and payment live this month, ${c.name} already has it — that is the honest recommendation above.`}
                    </p>
                </div>

                <div className="mt-14 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                    <a
                        href={whatsappUrl(`Hi vsite, I'm comparing you with ${c.name} and had a question.`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-btn bg-primary px-7 py-4 text-body font-bold text-white shadow-lg shadow-primary/25 transition hover:bg-primary-dark active:scale-[0.98]"
                    >
                        Ask us anything on WhatsApp
                        <ArrowRight className="h-4 w-4" aria-hidden />
                    </a>
                    <Link
                        href="/pricing"
                        className="text-body-sm font-semibold text-ink/60 hover:text-ink"
                    >
                        See full pricing →
                    </Link>
                </div>

                <p className="mt-10 text-body-sm text-ink/40">
                    {c.name} is a registered trademark of its respective owner. vsite is not affiliated
                    with {c.name}. Figures on this page are drawn from {c.name}&apos;s own published
                    material as of {c.verifiedOn}; if something here is out of date, tell us at{' '}
                    <Link href="/contact" className="underline">
                        vsite.in/contact
                    </Link>{' '}
                    and we will correct it.
                </p>
            </main>
        </>
    );
}
