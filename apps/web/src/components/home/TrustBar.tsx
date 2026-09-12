'use client';

import { MapPin } from 'lucide-react';
import Reveal from './Reveal';
import { PROOF_STATS } from './Proof';

const TYPES = ['Messes', 'Cafés', 'Restaurants', 'Bakeries', 'Tiffin centres', 'Cloud kitchens', 'Bars'];

/**
 * Replaces CategoryStrip. Same job — "this is for a shop like mine" — in one
 * bar instead of a 240px section of icon tiles nobody reads.
 *
 * Counts come from PROOF_STATS so the strip can never contradict the proof
 * section further down the page.
 */
export default function TrustBar() {
    return (
        <section className="border-b border-line bg-paper px-5">
            <Reveal
                className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 py-6 text-center sm:flex-row sm:gap-8 sm:py-5 sm:text-left"
                threshold={0.3}
            >
                <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[15px] font-medium text-ink-70">
                    {TYPES.map((t, i) => (
                        <span key={t} className="flex items-center gap-3">
                            {t}
                            {i < TYPES.length - 1 && (
                                <span aria-hidden className="text-line">
                                    ·
                                </span>
                            )}
                        </span>
                    ))}
                </p>
                <p className="flex shrink-0 items-center gap-2 rounded-full bg-paper-2 px-4 py-2 text-[15px] text-ink-70">
                    <MapPin className="h-4 w-4 shrink-0 text-accent-text" strokeWidth={1.9} aria-hidden />
                    <span>
                        <strong className="font-semibold text-ink">Tamil Nadu</strong>, since{' '}
                        {PROOF_STATS.liveSince}
                    </span>
                </p>
            </Reveal>
        </section>
    );
}
