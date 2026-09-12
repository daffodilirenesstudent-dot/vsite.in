'use client';

import { Building2, LayoutDashboard, Palette, ScanLine, ArrowRight } from 'lucide-react';
import Reveal from './Reveal';
import { whatsappUrl } from '@/lib/platform/brand';

/**
 * The multi-franchise offer.
 *
 * Placed immediately after Pricing, and that placement is the whole idea: the
 * reader has just looked at ₹299 and either thought "that's me" or "that's not
 * me, I run six outlets". This section catches the second thought at the exact
 * moment it happens, instead of letting that reader bounce off a price built
 * for somebody else.
 *
 * ─── WHY THERE IS NO PRICE HERE ──────────────────────────────────────────────
 * Deliberate. A chain expects a conversation, not a checkout — and a number on
 * this card would anchor the ₹299 self-serve buyer against a figure that is not
 * for them. "Talk to us" is the honest CTA for work that is genuinely quoted per
 * brand: outlet count, how custom the design is, how many stands get posted.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The CTA goes to WhatsApp rather than a form. Owners of multi-outlet brands in
 * Tamil Nadu run their businesses on WhatsApp; a contact form is a slower, more
 * formal ask that gets answered tomorrow, if at all. The prefilled message also
 * tells us which surface the enquiry came from without any tracking.
 */

const OFFERS = [
    {
        Icon: Palette,
        title: 'Menus designed for your brand',
        body:
            'Not a template with your logo dropped in. Your typeface, your colours, your photography — the menu looks like it came from your brand team, at every outlet.',
    },
    {
        Icon: LayoutDashboard,
        title: 'One dashboard for every outlet',
        body:
            'See scans, most-viewed dishes and menu performance across the whole group, or drill into a single branch. Change a price once and push it everywhere.',
    },
    {
        Icon: ScanLine,
        title: 'Custom QR and NFC stands',
        body:
            'Table stands, counter stands and NFC cards, made to your design and posted to each outlet. Manufactured at cost — we make nothing on the hardware.',
    },
];

const WHATSAPP_MESSAGE =
    'Hi vsite, I run a multi-outlet brand and want to know about custom digital menus for all our branches.';

export default function EnterpriseBand() {
    return (
        <section
            id="enterprise"
            className="relative scroll-mt-20 overflow-hidden bg-paper px-5 py-section lg:py-section-lg"
        >
            <div className="relative mx-auto max-w-6xl">
                <Reveal className="max-w-2xl">
                    <p className="inline-flex items-center gap-2 text-caption font-semibold uppercase tracking-[0.1em] text-primary">
                        <Building2 className="h-4 w-4" aria-hidden />
                        For chains and franchises
                    </p>
                    <h2 className="mt-5 font-display text-h2 font-bold text-ink">
                        Running more than one outlet?
                    </h2>
                    <p className="mt-5 text-body text-ink/70">
                        The ₹299 plan is built for a single restaurant to set up on its own, in
                        three minutes, without talking to anyone. A brand with several branches
                        needs something different — a menu designed to your brand, one dashboard
                        across every outlet, and stands made to match. We build that with you.
                    </p>
                </Reveal>

                <Reveal
                    stagger={90}
                    className="mt-11 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
                >
                    {OFFERS.map(({ Icon, title, body }) => (
                        <div
                            key={title}
                            className="rounded-card border border-ink/10 bg-white p-6 shadow-sm"
                        >
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                <Icon className="h-5 w-5" aria-hidden />
                            </span>
                            <h3 className="mt-4 font-display text-lg font-bold text-ink">{title}</h3>
                            <p className="mt-2 text-body-sm text-ink/65">{body}</p>
                        </div>
                    ))}
                </Reveal>

                <Reveal delay={120} className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                    <a
                        href={whatsappUrl(WHATSAPP_MESSAGE)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group inline-flex items-center gap-2 rounded-btn bg-primary px-7 py-4 text-body font-bold text-white shadow-lg shadow-primary/25 transition hover:bg-primary-dark active:scale-[0.98]"
                    >
                        Talk to us on WhatsApp
                        <ArrowRight
                            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                            aria-hidden
                        />
                    </a>
                    <p className="text-body-sm text-ink/55">
                        Tell us how many outlets you have. We will send a design and a price —
                        usually the same day.
                    </p>
                </Reveal>
            </div>
        </section>
    );
}
