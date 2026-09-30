import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import Navbar from '@/components/home/Navbar';
import FooterCTA from '@/components/home/FooterCTA';
import {
    GUIDE,
    GUIDE_ORDER,
    GUIDE_UPDATED,
    guidePath,
    guideSchema,
    type GuideLang,
    type GuideSlug,
} from '@/content/guide';

const UI = {
    en: {
        updated: 'Updated:',
        needs: 'What you need',
        steps: 'Steps',
        faq: 'Frequently asked questions',
        prev: 'Previous',
        next: 'Next',
        more: 'More from vsite',
        start: 'Build my menu free',
        home: 'Guide',
        otherLang: 'தமிழில் படிக்க',
    },
    ta: {
        updated: 'புதுப்பித்தது:',
        needs: 'உங்களுக்கு தேவையானவை',
        steps: 'படிகள்',
        faq: 'அடிக்கடி கேட்கப்படும் கேள்விகள்',
        prev: 'முந்தையது',
        next: 'அடுத்தது',
        more: 'மேலும்',
        start: 'Build my menu free',
        home: 'Guide',
        otherLang: 'Read in English',
    },
} as const;

/**
 * One guide page, in one language.
 *
 * The direct answer comes first, in plain text, because that paragraph is what
 * answer engines quote. Steps are an ordered list; every FAQ answer is in the
 * DOM (<details open> only folds it visually), so a crawler that does not
 * click still reads it.
 */
export default function GuideArticle({ slug, lang = 'en' }: { slug: GuideSlug; lang?: GuideLang }) {
    const page = GUIDE[slug];
    const copy = lang === 'ta' && page.ta ? page.ta : page.en;
    const t = UI[lang];
    const hasTa = Boolean(page.ta);
    const idx = GUIDE_ORDER.indexOf(slug);
    const prev = idx > 0 ? GUIDE_ORDER[idx - 1] : null;
    const next = idx < GUIDE_ORDER.length - 1 ? GUIDE_ORDER[idx + 1] : null;
    // Tamil copy exists for two pages only; prev/next fall back to English elsewhere.
    const navLang = (s: GuideSlug): GuideLang => (lang === 'ta' && GUIDE[s].ta ? 'ta' : 'en');

    return (
        <>
            {guideSchema(slug, lang).map((node) => (
                <script
                    key={String(node['@type'])}
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }}
                />
            ))}
            <Navbar />

            <main>
                <section className="border-b border-line bg-paper-2 px-5 pt-32 pb-section lg:pb-section-lg">
                    <div className="mx-auto max-w-3xl">
                        <nav aria-label="Breadcrumb" className="text-caption text-ink-45">
                            <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <li>
                                    <Link href="/" className="hover:text-ink">vsite</Link>
                                </li>
                                <li aria-hidden>/</li>
                                {slug === 'digital-menu-setup' ? (
                                    <li aria-current="page">{t.home}</li>
                                ) : (
                                    <>
                                        <li>
                                            <Link
                                                href={guidePath('digital-menu-setup', navLang('digital-menu-setup'))}
                                                className="hover:text-ink"
                                            >
                                                {t.home}
                                            </Link>
                                        </li>
                                        <li aria-hidden>/</li>
                                        <li aria-current="page">{page.short}</li>
                                    </>
                                )}
                            </ol>
                        </nav>

                        <h1 className="mt-5 font-display text-h2 font-bold text-ink">{copy.h1}</h1>
                        <p className="mt-4 text-caption text-ink-45">
                            {t.updated} <time dateTime={GUIDE_UPDATED}>{GUIDE_UPDATED}</time>
                        </p>

                        <p data-answer="true" className="mt-6 text-body leading-relaxed text-ink">
                            {copy.answer}
                        </p>

                        {hasTa && (
                            <p className="mt-4 text-caption">
                                <Link
                                    href={guidePath(slug, lang === 'ta' ? 'en' : 'ta')}
                                    hrefLang={lang === 'ta' ? 'en' : 'ta'}
                                    lang={lang === 'ta' ? 'en' : 'ta'}
                                    className="font-semibold text-primary hover:underline"
                                >
                                    {t.otherLang}
                                </Link>
                            </p>
                        )}
                    </div>
                </section>

                <section className="bg-paper px-5 py-section lg:py-section-lg">
                    <div className="mx-auto max-w-3xl">
                        <div className="rounded-2xl border border-line bg-paper-2 p-6">
                            <h2 className="font-display text-h3 font-bold text-ink">{t.needs}</h2>
                            <ul className="mt-4 space-y-2.5">
                                {copy.needs.map((n) => (
                                    <li key={n} className="flex items-start gap-2.5 text-body text-ink-70">
                                        <Check className="mt-1 h-4 w-4 shrink-0 text-success" strokeWidth={2.5} aria-hidden />
                                        <span>{n}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <h2 className="mt-12 font-display text-h3 font-bold text-ink">{t.steps}</h2>
                        <ol className="mt-6 space-y-6">
                            {copy.steps.map((s, i) => (
                                <li key={s.name} className="flex gap-4">
                                    <span
                                        aria-hidden
                                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white"
                                    >
                                        {i + 1}
                                    </span>
                                    <div className="min-w-0">
                                        <h3 className="text-lg font-semibold text-ink">{s.name}</h3>
                                        <p className="mt-1.5 text-body text-ink-70">{s.text}</p>
                                        <p className="mt-2 text-caption font-medium text-ink-45">{s.time}</p>
                                    </div>
                                </li>
                            ))}
                        </ol>

                        {copy.sections.map((sec) => (
                            <div key={sec.heading} className="mt-14">
                                <h2 className="font-display text-h3 font-bold text-ink">{sec.heading}</h2>
                                {sec.intro && <p className="mt-3 text-body text-ink-70">{sec.intro}</p>}
                                {sec.bullets && (
                                    <ul className="mt-4 list-disc space-y-2.5 pl-5 text-body text-ink-70">
                                        {sec.bullets.map((b) => (
                                            <li key={b}>{b}</li>
                                        ))}
                                    </ul>
                                )}
                                {sec.rows && (
                                    <table className="mt-4 w-full border-y border-line text-left text-body">
                                        <tbody className="divide-y divide-line">
                                            {sec.rows.map(([label, value]) => (
                                                <tr key={label} className="align-top">
                                                    <th scope="row" className="w-2/5 py-3 pr-4 font-semibold text-ink">
                                                        {label}
                                                    </th>
                                                    <td className="py-3 text-ink-70">{value}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        ))}

                        <h2 className="mt-14 font-display text-h3 font-bold text-ink">{t.faq}</h2>
                        <div className="mt-4 divide-y divide-line border-y border-line">
                            {copy.faqs.map((f) => (
                                <details key={f.q} className="group py-4" open>
                                    <summary className="cursor-pointer list-none text-lg font-semibold text-ink">{f.q}</summary>
                                    <p className="mt-2 text-body text-ink-70">{f.a}</p>
                                </details>
                            ))}
                        </div>

                        <div className="mt-12 flex flex-wrap gap-3">
                            <Link
                                href="/signup"
                                className="press inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-7 text-base font-semibold text-white hover:bg-primary-dark"
                            >
                                {t.start}
                                <ArrowRight className="h-4 w-4" aria-hidden />
                            </Link>
                        </div>

                        <nav aria-label="Guide pages" className="mt-12 grid gap-3 sm:grid-cols-2">
                            {prev ? (
                                <Link
                                    href={guidePath(prev, navLang(prev))}
                                    className="rounded-2xl border border-line p-4 hover:border-ink-45"
                                >
                                    <span className="flex items-center gap-1.5 text-caption text-ink-45">
                                        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                                        {t.prev}
                                    </span>
                                    <span className="mt-1 block font-semibold text-ink">{GUIDE[prev].short}</span>
                                </Link>
                            ) : (
                                <span />
                            )}
                            {next && (
                                <Link
                                    href={guidePath(next, navLang(next))}
                                    className="rounded-2xl border border-line p-4 text-right hover:border-ink-45"
                                >
                                    <span className="flex items-center justify-end gap-1.5 text-caption text-ink-45">
                                        {t.next}
                                        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                                    </span>
                                    <span className="mt-1 block font-semibold text-ink">{GUIDE[next].short}</span>
                                </Link>
                            )}
                        </nav>

                        <div className="mt-12 border-t border-line pt-6">
                            <h2 className="text-caption font-semibold uppercase tracking-[0.1em] text-ink-45">{t.more}</h2>
                            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-body">
                                {copy.links.map((l) => (
                                    <li key={l.href}>
                                        <Link href={l.href} className="font-medium text-primary hover:underline">
                                            {l.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </section>
            </main>

            <FooterCTA />
        </>
    );
}
