'use client';

import Image from 'next/image';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowRight, ArrowDown } from 'lucide-react';
import { useInView } from '@/hooks/useInView';
import { LogoMark } from '@/components/Logo';
import { DINER_MENU } from './dinerMenu';

/**
 * "This code → this menu." The payoff shot for the three setup steps.
 *
 * The QR is a REAL, scannable code pointing at /demo — rendered with
 * qrcode.react, already a dependency. A restaurant owner reading this on a
 * laptop can lift their phone and be looking at a live vsite menu two seconds
 * later, which is a far better demo than any button labelled "see a demo".
 *
 * Replaces the earlier notebook-OCR panel here: the OCR story already lives in
 * step 2's card, and what the three steps actually build toward is the code on
 * the table and the menu it opens.
 */

// Shared with OfferDemo's phone so the two mockups cannot drift apart.
const MENU_ITEMS = DINER_MENU;

export default function QRToMenu() {
    const { ref, visible } = useInView({ threshold: 0.2 });

    return (
        <div
            ref={ref}
            data-visible={visible ? 'true' : 'false'}
            className="mt-6 overflow-hidden rounded-card-lg border border-line bg-white"
        >
            <div className="grid items-center gap-8 p-7 sm:p-10 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-6">
                {/* ── The printed table stand ─────────────────────────── */}
                <div className="flex flex-col items-center lg:items-end">
                    <div
                        data-reveal="scale"
                        data-visible={visible ? 'true' : 'false'}
                        data-mock="true"
                        className="relative w-[15rem] rounded-2xl border border-line bg-paper p-5 text-center shadow-[0_18px_50px_-18px_rgba(18,16,14,0.35)]"
                    >
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-45">
                            Saravana Mess
                        </p>
                        <p className="mt-1 text-[15px] font-bold text-ink">Scan for the menu</p>

                        <div className="relative mx-auto mt-4 w-fit rounded-xl bg-white p-3 ring-1 ring-line">
                            <QRCodeSVG
                                value="https://vsite.in/demo"
                                size={132}
                                level="M"
                                bgColor="#FFFFFF"
                                fgColor="#12100E"
                                marginSize={0}
                            />
                            {/* Scan line — reads as "this is being read right now". */}
                            {visible && (
                                <span
                                    aria-hidden
                                    className="scan-sweep pointer-events-none absolute inset-x-3 top-3 h-10 rounded bg-gradient-to-b from-transparent via-primary/30 to-transparent"
                                />
                            )}
                        </div>

                        <p className="mt-4 text-[11px] text-ink-45">
                            No app needed · தமிழ் / English
                        </p>
                        <div className="mt-3 flex items-center justify-center gap-1.5 border-t border-line pt-3">
                            <LogoMark size={13} tone="brand" />
                            <span className="text-[11px] font-extrabold tracking-[-0.04em] text-ink">vsite</span>
                        </div>
                    </div>
                    <p className="mt-4 text-center text-[13px] text-ink-45 lg:text-right">
                        Really scan it — it opens our live demo menu
                    </p>
                </div>

                {/* ── The arrow ───────────────────────────────────────── */}
                <div className="flex items-center justify-center" aria-hidden>
                    <div className="relative flex items-center justify-center rounded-full bg-primary-light p-4">
                        <ArrowDown className="h-6 w-6 text-accent-text lg:hidden" strokeWidth={2} />
                        <ArrowRight className="hidden h-6 w-6 text-accent-text lg:block" strokeWidth={2} />
                    </div>
                </div>

                {/* ── The menu it opens ───────────────────────────────── */}
                <div className="flex justify-center lg:justify-start">
                    <div
                        data-reveal="right"
                        data-visible={visible ? 'true' : 'false'}
                        style={{ '--reveal-delay': '260ms' } as React.CSSProperties}
                        data-mock="true"
                        className="w-[15rem] overflow-hidden rounded-[1.75rem] border-[6px] border-ink bg-paper shadow-[0_18px_50px_-18px_rgba(18,16,14,0.4)]"
                    >
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

                        <ul className="flex flex-col gap-1.5 p-3">
                            {MENU_ITEMS.map((item, i) => (
                                <li
                                    key={item.name}
                                    data-reveal="up"
                                    data-visible={visible ? 'true' : 'false'}
                                    style={{ '--reveal-delay': `${520 + i * 110}ms` } as React.CSSProperties}
                                    className="flex items-center gap-2.5 rounded-xl border border-line p-2"
                                >
                                    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg">
                                        <Image src={item.photo} alt="" fill sizes="36px" className="object-cover" loading="lazy" />
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
                                    </div>
                                    <span className="text-[12px] font-bold text-ink">{item.price}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            <p className="border-t border-line bg-paper-2 px-7 py-4 text-center text-[15px] text-ink-70 sm:px-10">
                One code on the table. Change the menu behind it as often as you like — the code never changes.
            </p>
        </div>
    );
}
