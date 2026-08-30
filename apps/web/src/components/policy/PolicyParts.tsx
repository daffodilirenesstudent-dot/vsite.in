import Link from 'next/link';

/**
 * Shared furniture for /terms and /privacy.
 *
 * Deliberately small. The two pages own their own heroes and section order —
 * legal text is edited section by section and a clever abstraction over it
 * makes the next edit harder, not easier. What IS shared is the stuff that
 * would silently drift: heading rhythm, anchor ids, and the contents rail.
 */

export interface PolicySectionMeta {
    id: string;
    heading: string;
}

/**
 * Desktop contents rail.
 *
 * Hidden below lg on purpose: a phone gets a sticky column that eats a third of
 * a 360px screen, and the page is short enough to thumb through. The rail is an
 * aid on a wide screen, not a requirement for reading.
 */
export function PolicyTOC({ sections, label }: { sections: readonly PolicySectionMeta[]; label: string }) {
    return (
        <nav aria-label={label} className="hidden lg:block">
            <div className="sticky top-28">
                <p className="text-caption font-bold uppercase tracking-[0.1em] text-ink-45">
                    On this page
                </p>
                <ul className="mt-4 space-y-1 border-l border-line">
                    {sections.map((s) => (
                        <li key={s.id}>
                            <a
                                href={`#${s.id}`}
                                className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 text-caption leading-snug text-ink-45 transition-colors hover:border-accent-text hover:text-ink focus-visible:border-accent-text focus-visible:text-ink focus-visible:outline-none"
                            >
                                {s.heading}
                            </a>
                        </li>
                    ))}
                </ul>
            </div>
        </nav>
    );
}

/**
 * One numbered section.
 *
 * The number is not decoration — these documents are referred to by section
 * ("clause 4"), and a reader comparing our terms against another vendor's needs
 * a handle to point at. `scroll-mt` keeps the heading clear of the fixed navbar
 * when the contents rail jumps to it.
 */
export function PolicySection({
    id,
    index,
    heading,
    children,
}: {
    id: string;
    index: number;
    heading: string;
    children: React.ReactNode;
}) {
    return (
        <section id={id} className="scroll-mt-28 border-t border-line pt-8 first:border-t-0 first:pt-0">
            <div className="flex items-baseline gap-3">
                <span aria-hidden className="font-display text-caption font-bold tabular-nums text-accent-text">
                    {String(index).padStart(2, '0')}
                </span>
                <h2 className="font-display text-h3 font-bold text-ink">{heading}</h2>
            </div>
            <div className="mt-3.5 space-y-3.5 text-body leading-relaxed text-ink-70">{children}</div>
        </section>
    );
}

/**
 * A callout for the one or two sentences in each document that people actually
 * lose money by not reading. Used sparingly — twice on /terms, once on
 * /privacy. If it appears on every section it stops meaning anything.
 */
export function PolicyNote({ children }: { children: React.ReactNode }) {
    return (
        <p className="rounded-xl border border-line bg-paper-2 px-4 py-3.5 text-body leading-relaxed text-ink">
            {children}
        </p>
    );
}

/** Inline link, matched to the body ramp rather than the default blue. */
export function PolicyLink({ href, children }: { href: string; children: React.ReactNode }) {
    const className =
        'font-medium text-accent-text underline decoration-accent-text/30 underline-offset-2 transition-colors hover:decoration-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-text focus-visible:ring-offset-2 rounded-sm';

    if (href.startsWith('/')) {
        return (
            <Link href={href} className={className}>
                {children}
            </Link>
        );
    }
    return (
        <a href={href} className={className}>
            {children}
        </a>
    );
}
