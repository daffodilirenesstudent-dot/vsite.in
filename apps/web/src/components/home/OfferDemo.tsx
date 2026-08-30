'use client';

import { useId, useState } from 'react';
import Image from 'next/image';
import { DINER_MENU, DEMO_OFFER } from './dinerMenu';

/**
 * "Offers, live in a minute" — shown working, not described.
 *
 * The tile used to hold a static gradient strip: a picture of an offer banner.
 * A picture of a feature asks the reader to take your word for it. This is the
 * feature — flip the switch and the diner's phone beside it changes, which is
 * the whole claim the card makes, demonstrated in about a second and without
 * anyone signing up.
 *
 * The phone deliberately reuses the treatment from `QRToMenu` further up the
 * page — same 15rem body, same 6px ink bezel, same photo header, same veg /
 * non-veg square, same rows — and the same menu data via `./dinerMenu`. A
 * second, different-looking phone on one page reads as two products.
 *
 * It mirrors `SoldOutDemo` in this same section for the control side: same
 * switch markup, same 300ms transitions. Off by default, because the point is
 * that the visitor causes the change; starting it on leaves nothing to find.
 */

const OFFER_ROW = DEMO_OFFER.dish;

export default function OfferDemo() {
    const [live, setLive] = useState(false);
    const switchId = useId();

    return (
        <div
            data-testid="offer-demo"
            className="flex flex-col gap-7 lg:flex-row lg:items-center lg:gap-8"
        >
            {/* ── The control the owner touches ─────────────────────────── */}
            <div data-testid="offer-control" className="min-w-0 flex-1">
                <div className="rounded-card border border-line bg-paper p-4">
                    <p className="text-caption font-semibold uppercase tracking-[0.1em] text-ink-45">
                        Your offer
                    </p>

                    {/* Field-like box so it reads as something you typed —
                        matching the card's "type the offer, hit save". */}
                    <p className="mt-2.5 rounded-lg border border-line bg-paper-2 px-3 py-2.5 text-[15px] font-semibold text-ink">
                        {DEMO_OFFER.banner}
                    </p>

                    <div className="mt-4 flex items-center justify-between gap-4">
                        <label htmlFor={switchId} className="text-[15px] font-medium text-ink-70">
                            Show it on the menu
                        </label>
                        <button
                            id={switchId}
                            data-testid="offer-switch"
                            type="button"
                            role="switch"
                            aria-checked={live}
                            aria-label={
                                live
                                    ? 'Offer is live on the menu. Tap to take it down.'
                                    : 'Offer is off. Tap to put it live on the menu.'
                            }
                            onClick={() => setLive((v) => !v)}
                            className={`relative flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                                live ? 'bg-green-600' : 'bg-[#C9C2B6]'
                            }`}
                        >
                            <span
                                className={`h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-300 ease-spring-soft ${
                                    live ? 'translate-x-5' : 'translate-x-0'
                                }`}
                            />
                        </button>
                    </div>
                </div>

                <p className="mt-3 text-[13px] text-ink-45">
                    Flip it on — watch the diner’s phone. That is the whole thing.
                </p>

                {/* The phone is decorative markup, so without this a screen
                    reader user flips the switch and hears nothing change. */}
                <p role="status" aria-live="polite" className="sr-only">
                    {live
                        ? `Offer live. Every diner scanning now sees ${DEMO_OFFER.banner}.`
                        : 'Offer is not showing on the menu.'}
                </p>
            </div>

            {/* ── The diner's phone ─────────────────────────────────────── */}
            <div className="flex justify-center lg:justify-start">
                <div
                    data-testid="offer-phone"
                    data-mock="true"
                    aria-hidden
                    className="w-[15rem] shrink-0 overflow-hidden rounded-[1.75rem] border-[6px] border-ink bg-paper shadow-[0_18px_50px_-18px_rgba(18,16,14,0.4)]"
                >
                    {/* Photo header — same as QRToMenu's phone. */}
                    <div className="relative h-24">
                        <Image
                            src="/menu-photos/chicken-biryani.jpg"
                            alt=""
                            fill
                            sizes="240px"
                            className="object-cover"
                            loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                        <div className="absolute inset-x-0 bottom-0 p-3">
                            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/75">
                                Dine-in menu
                            </p>
                            <p className="text-[15px] font-bold text-white">Saravana Mess</p>
                        </div>
                    </div>

                    <div className="p-3">
                        {/* Banner. The grid-rows 0fr→1fr trick animates height
                            without measuring, so it opens rather than snapping. */}
                        <div
                            data-testid="offer-banner-slot"
                            className={`grid transition-all duration-300 ease-out-expo ${
                                live ? 'mb-1.5 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                            }`}
                        >
                            {/* min-h-0 is load-bearing: grid items default to
                                min-height:auto, which refuses to shrink below
                                content height and defeats the 0fr collapse
                                entirely — the banner stays 28px tall and just
                                turns invisible. */}
                            <div className="min-h-0 overflow-hidden">
                                <div
                                    data-testid="offer-banner"
                                    className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-primary to-violet-600 px-2.5 py-2"
                                >
                                    <span className="offer-pulse h-1.5 w-1.5 shrink-0 rounded-full bg-white" />
                                    <span className="text-[10px] font-bold leading-tight text-white">
                                        {DEMO_OFFER.banner}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <ul className="flex flex-col gap-1.5">
                            {DINER_MENU.map((item) => {
                                const isOffer = live && item.name === OFFER_ROW;
                                return (
                                    <li
                                        key={item.name}
                                        className={`relative flex items-center gap-2.5 rounded-xl border p-2 transition-all duration-300 ease-out-expo ${
                                            isOffer
                                                ? 'offer-row-glow border-primary/40 bg-primary/[0.06]'
                                                : 'border-line bg-transparent'
                                        }`}
                                    >
                                        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg">
                                            <Image
                                                src={item.photo}
                                                alt=""
                                                fill
                                                sizes="36px"
                                                className="object-cover"
                                                loading="lazy"
                                            />
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <p className="flex items-center gap-1.5 truncate text-[12px] font-semibold text-ink">
                                                <span
                                                    className="h-2 w-2 shrink-0 rounded-[2px] border-[1.5px]"
                                                    style={{ borderColor: item.veg ? '#16A34A' : '#B91C1C' }}
                                                    aria-hidden
                                                />
                                                {item.name}
                                            </p>

                                            {isOffer && (
                                                <span
                                                    data-testid="offer-badge"
                                                    className="offer-pop mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-primary px-1.5 py-[1px] text-[8px] font-bold uppercase tracking-wide text-white"
                                                >
                                                    <span className="offer-pulse h-1 w-1 rounded-full bg-white" />
                                                    Offer
                                                </span>
                                            )}
                                        </div>

                                        {isOffer ? (
                                            /* Stacked, not side by side: laying the
                                               old and new price in a row steals
                                               ~28px from the name column and
                                               truncates "Chicken Chettinad" to
                                               "Chicken Ch". */
                                            <span className="offer-pop flex shrink-0 flex-col items-end leading-none">
                                                <span className="text-[9px] text-ink-45 line-through">
                                                    {DEMO_OFFER.was}
                                                </span>
                                                <span className="mt-0.5 text-[12px] font-bold text-accent-text">
                                                    {DEMO_OFFER.now}
                                                </span>
                                            </span>
                                        ) : (
                                            <span className="shrink-0 text-[12px] font-bold text-ink">
                                                {item.price}
                                            </span>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
