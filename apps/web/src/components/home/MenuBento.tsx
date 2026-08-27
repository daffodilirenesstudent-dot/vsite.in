'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Info, Nfc, QrCode } from 'lucide-react';
import Reveal from './Reveal';

/**
 * Replaces ProductCards + PainSection — two sections with near-identical
 * structure that used the same three screenshots in the same order and ran to
 * roughly 4,000px between them.
 *
 * A bento grid is the right form here because vsite is one product with six
 * capabilities, not six products. Working memory holds a grid; it does not
 * hold nine scroll-lengths of alternating image/text.
 *
 * Every capability listed is one the Smart QR Menu actually ships today.
 */

export default function MenuBento() {
    return (
        <section id="features" className="scroll-mt-20 bg-paper-2 px-5 py-section lg:py-section-lg">
            <div className="mx-auto max-w-6xl">
                <Reveal className="max-w-3xl">
                    <p className="text-caption font-semibold uppercase tracking-[0.1em] text-ink-45">
                        One product · Smart QR Menu · ₹299
                    </p>
                    <h2 className="mt-5 font-display text-h2 font-bold text-ink">
                        Everything that is actually in the box.
                    </h2>
                </Reveal>

                <Reveal className="mt-10 grid sm:mt-12 gap-5 sm:grid-cols-2 lg:grid-cols-3" stagger={90}>
                    {/* Hero tile — the sold-out control, shown working. */}
                    <div
                        data-reveal="up"
                        className="lift flex flex-col justify-between rounded-card-lg border border-line bg-white p-7 sm:col-span-2 sm:p-9"
                    >
                        <div className="max-w-lg">
                            <h3 className="text-2xl font-bold tracking-[-0.03em] text-ink sm:text-[1.9rem]">
                                Ran out at 8pm? Grey it out at 8:01.
                            </h3>
                            <p className="mt-3.5 text-body leading-relaxed text-ink-70">
                                One tap on your phone and the dish dims on every menu in the room — before your
                                server reaches the next table. No more “sorry sir, finished” after the order is
                                already written down.
                            </p>
                        </div>

                        <SoldOutDemo />
                    </div>

                    <Tile
                        title="A photo for every dish"
                        body="Generated the moment you add an item — matched to the dish, not a stock plate. Swap in your own whenever you like."
                    >
                        <div className="flex gap-2">
                            {['/menu-photos/paneer-butter-masala.jpg', '/menu-photos/chicken-lollipop.jpg', '/menu-photos/veg-momos.jpg'].map((s) => (
                                <div key={s} className="relative h-12 w-12 overflow-hidden rounded-lg">
                                    <Image src={s} alt="" fill sizes="48px" className="object-cover" loading="lazy" />
                                </div>
                            ))}
                        </div>
                    </Tile>

                    <Tile
                        title="Tamil and English, together"
                        body="Both names on the same row. Your regulars read one, the visitor reads the other."
                    >
                        <div className="flex flex-col gap-0.5">
                            <span className="text-lg font-semibold text-ink">Filter Coffee</span>
                            <span className="text-lg font-medium text-ink-70">டிகிரி காபி</span>
                        </div>
                    </Tile>

                    <Tile
                        title="Offers, live in a minute"
                        body="Type the offer, hit save. Every diner who scans after that sees it. No designer, no print shop."
                    >
                        <div className="flex h-12 items-center rounded-lg bg-gradient-to-r from-primary to-violet-600 px-3.5">
                            <span className="text-[13px] font-bold text-white">Lunch thali ₹120 · till 3pm</span>
                        </div>
                    </Tile>

                    <Tile
                        title="NFC card + stickers, posted"
                        body="Tap or scan — older phones scan, newer ones just tap. Included, not an add-on."
                    >
                        <div className="flex gap-2.5">
                            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-ink">
                                <QrCode className="h-6 w-6 text-paper" strokeWidth={1.7} aria-hidden />
                            </div>
                            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-ink-45">
                                <Nfc className="h-6 w-6 text-ink-70" strokeWidth={1.7} aria-hidden />
                            </div>
                        </div>
                    </Tile>

                </Reveal>

                {/* The disclosure. Volunteering the limitation buys credibility on
                    everything else on the page, and it removes the single largest
                    cause of week-one churn: an owner who expected ordering. */}
                <Reveal
                    variant="up"
                    delay={120}
                    className="mt-5 flex items-start gap-4 rounded-card-lg border border-dashed border-[#B8B0A3] p-6 sm:items-center sm:p-7"
                >
                    <Info className="mt-0.5 h-6 w-6 shrink-0 text-ink-70 sm:mt-0" strokeWidth={1.7} aria-hidden />
                    <p className="text-base leading-relaxed text-ink-70">
                        <strong className="font-semibold text-ink">What it does not do yet:</strong> take orders
                        or payments. Diners read the menu and call your server, exactly as they do today.
                        In-menu ordering is being built — we would rather say that here than after you have paid.
                    </p>
                </Reveal>
            </div>
        </section>
    );
}

/**
 * The sold-out control, working.
 *
 * These were static SOLD OUT / ON badges. A badge describes the feature; a
 * switch you can actually flip *is* the feature — the reader performs the one
 * action the whole tile is about and watches the dish grey out, which is a
 * far shorter path to belief than another sentence.
 *
 * It is also the only interactive element on the page, so it draws the eye to
 * the tile that matters most. Nothing persists and nothing is sent anywhere;
 * this is a toy of the real control in the dashboard.
 */
const DEMO_DISHES = [
    { id: 'mutton', src: '/menu-photos/mutton-biryani.jpg', name: 'Mutton Biryani', price: '₹320' },
    { id: 'fish', src: '/menu-photos/fish-65.jpg', name: 'Fish 65', price: '₹240' },
];

function SoldOutDemo() {
    // Starts one-on/one-off so both states are visible before anyone touches it.
    const [available, setAvailable] = useState<Record<string, boolean>>({ mutton: false, fish: true });

    return (
        <div className="mt-8">
            <div data-mock="true" className="flex flex-col gap-2.5 sm:flex-row">
                {DEMO_DISHES.map((d) => {
                    const on = available[d.id];
                    return (
                        <div
                            key={d.id}
                            className="flex flex-1 items-center gap-3 rounded-card border border-line bg-paper p-2.5 transition-colors duration-300"
                        >
                            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                                <Image
                                    src={d.src}
                                    alt=""
                                    fill
                                    sizes="48px"
                                    className={`object-cover transition-all duration-300 ${on ? '' : 'grayscale'}`}
                                    loading="lazy"
                                />
                            </div>

                            <div className={`min-w-0 flex-1 transition-opacity duration-300 ${on ? 'opacity-100' : 'opacity-55'}`}>
                                <p className="truncate text-sm font-semibold text-ink">{d.name}</p>
                                <p className="text-[13px] text-ink-70">
                                    {on ? d.price : <span className="font-medium text-ink-45">Sold out</span>}
                                </p>
                            </div>

                            <button
                                type="button"
                                role="switch"
                                aria-checked={on}
                                aria-label={`${d.name} — ${on ? 'available, tap to mark sold out' : 'sold out, tap to mark available'}`}
                                onClick={() => setAvailable((prev) => ({ ...prev, [d.id]: !prev[d.id] }))}
                                className={`relative flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                                    on ? 'bg-green-600' : 'bg-[#C9C2B6]'
                                }`}
                            >
                                <span
                                    className={`h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-300 ease-spring-soft ${
                                        on ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                                />
                            </button>
                        </div>
                    );
                })}
            </div>

            <p className="mt-3 text-[13px] text-ink-45">
                Go on — flip a switch. That is the whole control.
            </p>
        </div>
    );
}

/**
 * Every tile leads with a fragment of the real thing — a row of actual dish
 * photos, the actual bilingual line, the actual offer banner, the actual card
 * and sticker. There is deliberately no `icon` prop: a lucide glyph in a
 * tinted rounded square is the house style of every SaaS template on earth,
 * and it would be the one decorative element on a page whose whole argument
 * is that everything on it is real.
 */
function Tile({
    title,
    body,
    children,
}: {
    title: string;
    body: string;
    children: React.ReactNode;
}) {
    return (
        <div data-reveal="up" className="lift flex flex-col rounded-card-lg border border-line bg-white p-7">
            <div className="mb-5">{children}</div>
            <h3 className="text-h3 font-semibold text-ink">{title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-70">{body}</p>
        </div>
    );
}
