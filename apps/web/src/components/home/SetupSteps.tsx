'use client';

import { QRCodeSVG } from 'qrcode.react';
import Reveal from './Reveal';
import QRToMenu from './QRToMenu';

/**
 * Setup, in three steps with a visible cost each.
 *
 * The per-step time chips are the whole point: a task with three small,
 * named costs reads as finishable, where "easy setup in minutes" reads as a
 * claim. Step 2 carries the product, so it is the one that breaks the visual
 * rhythm — in a row of equals, the odd one out is read first.
 */

/**
 * Step artwork.
 *
 * These replace the three lucide-glyph-in-a-tinted-square blocks that were
 * here. That pattern is the default of every SaaS template, and it was the
 * only decorative element left on a page whose entire argument is that
 * everything on it is real — so each step now shows a miniature of the actual
 * thing the owner will be looking at when they do it.
 *
 * Drawn in markup rather than shipped as images: they stay crisp at any DPR,
 * recolour with the tokens, and cost nothing to download.
 */

function ArtShopName() {
    return (
        <div data-mock="true" className="w-full max-w-[15rem]">
            <div className="rounded-lg border border-line bg-paper px-3 py-2">
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-45">Shop name</p>
                <p className="mt-0.5 flex items-center text-sm font-semibold text-ink">
                    Saravana Mess
                    <span aria-hidden className="ml-0.5 inline-block h-4 w-px animate-pulse bg-primary" />
                </p>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold text-white">Mess</span>
                <span className="rounded-full bg-paper-2 px-2.5 py-1 text-[10px] font-medium text-ink-70">Café</span>
                <span className="rounded-full bg-paper-2 px-2.5 py-1 text-[10px] font-medium text-ink-70">Bakery</span>
            </div>
        </div>
    );
}

function ArtSnapMenu() {
    const corner = 'absolute h-4 w-4 border-primary';
    return (
        <div data-mock="true" className="relative w-full max-w-[15rem] rounded-lg border border-[#E8DCC0] bg-[#FEF9EC] px-4 py-3">
            <ul className="space-y-1">
                {[['Podi dosa', '90'], ['Chettinad ck', '260/140'], ['Mutton biry', '320']].map(([d, pr]) => (
                    <li key={d} className="flex justify-between font-serif text-[12px] leading-snug text-[#57534E]">
                        <span>{d}</span>
                        <span>{pr}</span>
                    </li>
                ))}
            </ul>
            {/* Viewfinder brackets — the frame you see through the camera. */}
            <span aria-hidden className={`${corner} left-1 top-1 border-l-2 border-t-2 rounded-tl`} />
            <span aria-hidden className={`${corner} right-1 top-1 border-r-2 border-t-2 rounded-tr`} />
            <span aria-hidden className={`${corner} bottom-1 left-1 border-b-2 border-l-2 rounded-bl`} />
            <span aria-hidden className={`${corner} bottom-1 right-1 border-b-2 border-r-2 rounded-br`} />
        </div>
    );
}

function ArtQrSticker() {
    return (
        <div data-mock="true" className="flex w-full max-w-[15rem] items-center gap-3">
            <div className="rounded-lg border border-line bg-white p-2 shadow-sm">
                <QRCodeSVG value="https://vsite.in/demo" size={52} level="L" bgColor="#FFFFFF" fgColor="#12100E" marginSize={0} />
            </div>
            <div className="flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-45">On the table</p>
                <p className="mt-0.5 text-[13px] font-semibold text-ink">Sticker, stand or card</p>
            </div>
        </div>
    );
}

const STEPS = [
    {
        n: '01',
        cost: '20 seconds',
        Art: ArtShopName,
        title: 'Enter your shop name, pick your type',
        body: 'Mess, café, bakery, tiffin centre, cloud kitchen, bar. That is the whole form.',
    },
    {
        n: '02',
        cost: '40 seconds',
        Art: ArtSnapMenu,
        title: 'Take a pic of your existing printed menu',
        body: 'Printed, laminated, or handwritten in a notebook — any of them. The AI reads every item, every price, every half-plate rate, then writes the descriptions and makes a photo for each dish.',
        feature: true,
    },
    {
        n: '03',
        cost: 'Done',
        Art: ArtQrSticker,
        title: 'Put the QR code on the table',
        body: 'Print it yourself today. Your NFC card and weatherproof QR stickers arrive by post, free.',
    },
];

export default function SetupSteps() {
    return (
        <section id="setup-steps" className="scroll-mt-20 bg-paper px-5 py-section lg:py-section-lg">
            <div className="mx-auto max-w-6xl">
                <Reveal className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
                    <div className="max-w-2xl">
                        <p className="text-caption font-semibold uppercase tracking-[0.1em] text-ink-45">Setup</p>
                        <h2 className="mt-5 font-display text-h2 font-bold text-ink">
                            Three minutes, start to QR on the table.
                        </h2>
                    </div>
                    <p className="max-w-sm text-body text-ink-70">
                        No training call. No installation. Nobody visits your shop. You do it yourself, on the
                        phone in your pocket.
                    </p>
                </Reveal>

                <Reveal className="mt-10 grid sm:mt-12 gap-6 md:grid-cols-3" stagger={120}>
                    {STEPS.map(({ n, cost, Art, title, body, feature }) => (
                        <div
                            key={n}
                            data-reveal="up"
                            className={`lift flex flex-col rounded-card-lg border bg-white p-7 sm:p-8 ${
                                feature ? 'border-primary shadow-lg shadow-primary/[0.13]' : 'border-line'
                            }`}
                        >
                            <div className="mb-7 flex items-center justify-between">
                                <span className="text-[15px] font-bold text-accent-text">{n}</span>
                                <span
                                    className={`rounded-full px-3 py-1.5 text-caption font-semibold ${
                                        feature ? 'bg-primary-light text-accent-text' : 'bg-paper-2 text-ink-70'
                                    }`}
                                >
                                    {cost}
                                </span>
                            </div>
                            <div className="mb-5">
                                <Art />
                            </div>
                            <h3 className="text-h3 font-semibold text-ink">{title}</h3>
                            <p className="mt-2.5 text-[15px] leading-relaxed text-ink-70">{body}</p>
                        </div>
                    ))}
                </Reveal>

                {/* The payoff: the code you print, and the menu it opens. */}
                <QRToMenu />
            </div>
        </section>
    );
}
