'use client';

import React from 'react';
import { T, TV } from './menuTokens';
import { staggerDelayMs } from '@/lib/menu/menuMotion';
import { resolveBadge } from '@/lib/menu/badges';
import { resolveOffer } from '@/lib/menu/offer';
import { menuThumbSrc, fallBackToOriginal, fallBackIfBroken } from '@/lib/menu/menuImages';

/**
 * One dish, in a list.
 *
 * This replaces two near-duplicate card implementations — `BrowseResultCard`
 * (search) and an inline copy (main list) — which had already drifted: the
 * inline one rendered discounts, the search one did not, so a customer who
 * searched for the dish you had discounted saw full price and no offer.
 *
 * ── The four decisions this card encodes ───────────────────────────────────
 *
 * 1. AN OFFER IS A TINTED GROUND. The previous treatment stacked a full-width
 *    gradient ribbon, a pink wash, a pink border and a pink shadow — four
 *    signals for one fact. On a menu where several dishes are discounted they
 *    fight each other and drown the food photography. `T.offerTint` alone now
 *    carries it, and the saving is stated in the price row where a reader is
 *    already looking at money.
 *
 * 2. THE CARD LOOKS TAPPABLE. It opens a detail sheet, and a flat panel on a
 *    flat page never said so — the tappability literature is consistent that
 *    people misread flat elements. A chevron was tried and removed on the
 *    owner's call, so the affordance now rests on two things: a 1px lift that
 *    separates the row from the page, and `.qr-card-press`, which gives the
 *    pressed state that is the ONLY tap feedback a phone can offer. The larger
 *    photo does some of this work too — a big image reads as a thing to open.
 *
 * 3. SOLD OUT IS SHOWN, NOT HIDDEN. See `soldOut` below.
 *
 * 4. Descriptions are 13px/400 in a darker ink. They were 10px/300 in
 *    mid-grey — under the mobile legibility floor, for a reader who is often
 *    45+ in a dim dining room, and it is the one asset on the card proven to
 *    move order value.
 */

/**
 * Thumb edge. Raised from 108 — on a 360px phone the photo is the only thing
 * that identifies a dish to a reader who does not read the description, and
 * 108 left it smaller than the text block beside it.
 */
const THUMB = 120;

export interface MenuItemCardProduct {
    id: string;
    name: string;
    selling_price: number;
    image_url?: string | null;
    food_type?: string | null;
    ks_quadrant?: string | null;
    metadata?: Record<string, unknown> | null;
}

export interface MenuItemCardProps {
    product: MenuItemCardProduct;
    /** Already resolved by the caller — variant dishes show a derived blurb. */
    description?: string | null;
    currencyCode?: 'INR' | 'AED';
    onSelect: () => void;
    /**
     * The owner has switched this dish off for today. The card stays on the
     * menu, greyed and inert, because removing it entirely left a diner unable
     * to tell "finished today" from "not on the menu" — so they asked staff,
     * which is the question the menu exists to answer.
     */
    soldOut?: boolean;
    /**
     * This card is in the first screenful, so its photo loads eagerly at high
     * priority instead of being lazily deferred. Set by the list, which is the
     * only thing that knows the running index across categories.
     */
    priority?: boolean;
    /** Position in the opening list; drives the reveal stagger. Omit to skip it. */
    revealIndex?: number;
    /** ADD button or quantity stepper. Supplied by the caller so this stays presentational. */
    action?: React.ReactNode;
}

/** Variant/combo shape as stored in `products.metadata`. */
interface ItemMeta {
    variants?: Array<{ size?: string; price?: number | string }>;
    comboItems?: Array<{ name?: string; qty?: number | string }>;
}

/**
 * The one grey line under the name that says what KIND of item this is.
 *
 * Without it a dish with three sizes and a dish with one look identical until
 * you open them, and the price shown for the first is a promise the largest
 * size breaks.
 */
function resolveKind(metadata: Record<string, unknown> | null | undefined): {
    label: string;
    icon: 'sizes' | 'combo';
    priceIsFrom: boolean;
} | null {
    const meta = (metadata ?? {}) as ItemMeta;

    const variants = Array.isArray(meta.variants) ? meta.variants.filter(Boolean) : [];
    if (variants.length > 1) {
        return { label: `${variants.length} sizes`, icon: 'sizes', priceIsFrom: true };
    }

    const combo = Array.isArray(meta.comboItems) ? meta.comboItems.filter(Boolean) : [];
    if (combo.length > 0) {
        return { label: `Combo · ${combo.length} items`, icon: 'combo', priceIsFrom: false };
    }

    return null;
}

function VegMark({ foodType, muted }: { foodType?: string | null; muted?: boolean }) {
    const isNonveg = foodType === 'nonveg' || foodType === 'non_veg';
    const isEgg = foodType === 'egg';
    const color = muted ? T.outMark : isNonveg ? T.nonvegRed : isEgg ? T.amber : T.vegGreen;
    const label = isNonveg ? 'Non-vegetarian' : isEgg ? 'Contains egg' : 'Vegetarian';
    return (
        <span
            role="img"
            aria-label={label}
            style={{
                width: 14, height: 14, flex: 'none', borderRadius: 3,
                border: `1.6px solid ${color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
        >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'block' }} />
        </span>
    );
}

function BadgeIcon({ kind }: { kind: string }) {
    const common = { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true } as const;
    if (kind === 'best') {
        return <svg {...common}><path d="M12 2l2.9 6.9L22 10l-5.5 4.8L18 22l-6-3.6L6 22l1.5-7.2L2 10l7.1-1.1z" /></svg>;
    }
    if (kind === 'popular') {
        return <svg {...common}><path d="M12 2c1 4-3 5-3 9a3 3 0 006 0c0-1.5-.7-2.4-.7-2.4S17 11 17 15a5 5 0 01-10 0c0-6 5-7 5-13z" /></svg>;
    }
    return <svg {...common}><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>;
}

function KindIcon({ kind }: { kind: 'sizes' | 'combo' }) {
    const common = {
        width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, 'aria-hidden': true,
    };
    if (kind === 'combo') {
        return (
            <svg {...common} strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
        );
    }
    return <svg {...common}><path d="M4 7h16M7 12h10M10 17h4" /></svg>;
}

/**
 * Photo with a skeleton underneath, so it fades in instead of popping.
 *
 * Two loading bugs fixed here, both of which showed as a grey square that
 * never resolved on a real phone:
 *
 *   1. `loading="lazy"` was on every thumb, including the four or five cards
 *      filling the first screen. Lazy-loading above-the-fold images defers
 *      exactly the ones the reader is staring at. `priority` now marks the
 *      first screenful eager and high-priority; everything below stays lazy.
 *
 *   2. If the image completes from cache BEFORE React attaches onLoad, the
 *      handler never fires and the img sits at opacity 0 for ever — the CSS
 *      only reveals it on data-loaded="true". The mount check below reads
 *      `.complete` and settles it.
 */
function Thumb({ src, alt, soldOut, priority }: {
    src: string; alt: string; soldOut: boolean; priority?: boolean;
}) {
    const [loaded, setLoaded] = React.useState(false);
    const imgRef = React.useRef<HTMLImageElement | null>(null);

    React.useEffect(() => {
        const img = imgRef.current;
        if (!img) return;
        // A thumbnail that failed before hydration never reached onError.
        if (fallBackIfBroken(img, src)) return;
        // A cached image can already be complete by first paint.
        if (img.complete) setLoaded(true);
    }, [src]);

    // Desaturating rather than hiding is what keeps a sold-out dish
    // recognisable — the diner still sees what they are missing.
    const mediaStyle: React.CSSProperties = soldOut
        ? { filter: 'grayscale(1)', opacity: 0.5 }
        : {};

    return (
        <div
            style={{
                position: 'relative', width: THUMB, height: THUMB, flex: 'none',
                borderRadius: TV.thumbRadius, overflow: 'hidden',
                background: T.white,
                border: `1px solid ${soldOut ? T.outLine : '#EFEFEF'}`,
            }}
        >
            {!loaded && <span className="qr-skel" style={{ position: 'absolute', inset: 0 }} />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                key={src}
                ref={imgRef}
                src={menuThumbSrc(src)}
                alt={alt}
                width={THUMB}
                height={THUMB}
                loading={priority ? 'eager' : 'lazy'}
                fetchPriority={priority ? 'high' : 'auto'}
                decoding="async"
                onLoad={() => setLoaded(true)}
                onError={e => { if (!fallBackToOriginal(e.currentTarget, src)) setLoaded(true); }}
                className="qr-thumb-img"
                data-loaded={loaded ? 'true' : 'false'}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', ...mediaStyle }}
            />
        </div>
    );
}

export default function MenuItemCard({
    product: p,
    description,
    currencyCode = 'INR',
    onSelect,
    soldOut = false,
    priority = false,
    revealIndex,
    action,
}: MenuItemCardProps) {
    const CURR = currencyCode === 'AED' ? 'AED ' : '₹';
    const offer = resolveOffer(p.metadata, p.selling_price);
    const badge = resolveBadge(p.ks_quadrant);
    const kind = resolveKind(p.metadata);

    // A sold-out dish is not on offer, whatever the flag says: advertising a
    // discount on something nobody can buy is the worst of both.
    const showOffer = offer.active && !soldOut;

    // The badge and the kind line compete for the same row. The badge is the
    // rarer signal, so it wins.
    const showKind = kind !== null && !badge && !soldOut;

    const interactive = !soldOut;

    /**
     * No photo means no photo column.
     *
     * An empty 120px frame with a picture glyph in it is worse than nothing:
     * it reads as "this image failed to load" rather than "this dish has no
     * photo", and it steals a third of the row from the words that ARE there.
     * The text simply spans the card instead.
     */
    const hasImage = typeof p.image_url === 'string' && p.image_url.trim().length > 0;
    const hasRightColumn = hasImage || !!action;

    return (
        <div
            className={[
                'qr-card',
                interactive ? 'qr-card-press' : '',
                // The reveal runs once, on the rows that are on screen when the
                // menu opens. Rows further down simply appear as you reach them
                // — animating on every scroll is what makes a list feel nauseous
                // rather than alive.
                revealIndex === undefined ? '' : 'qr-rise',
            ].filter(Boolean).join(' ')}
            data-offer={showOffer ? 'true' : 'false'}
            data-soldout={soldOut ? 'true' : 'false'}
            data-testid="menu-item-card"
            onClick={interactive ? onSelect : undefined}
            role={interactive ? 'button' : 'group'}
            tabIndex={interactive ? 0 : -1}
            aria-disabled={soldOut || undefined}
            onKeyDown={interactive ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); }
            } : undefined}
            aria-label={
                // Everything the card says, in reading order, for someone who
                // cannot see it. The badge used to be aria-hidden entirely.
                [
                    p.name,
                    soldOut ? 'Sold out' : null,
                    badge?.label,
                    showKind ? kind?.label : null,
                    showOffer
                        ? `On offer, ${CURR}${offer.now}, was ${CURR}${offer.was}, save ${CURR}${offer.save}`
                        : `${CURR}${p.selling_price}`,
                ].filter(Boolean).join('. ')
            }
            style={{
                ...(revealIndex === undefined
                    ? null
                    : { animationDelay: `${staggerDelayMs(revealIndex)}ms` }),
                position: 'relative', width: '100%',
                display: 'grid', gridTemplateColumns: hasRightColumn ? `1fr ${THUMB}px` : '1fr',
                gap: TV.cardGap,
                alignItems: 'start',
                padding: TV.cardPadding,
                borderRadius: TV.cardRadius,
                // The offer's whole signal, and it is identical in every design:
                // the tint IS the offer, so a theme may not restyle it. Same for
                // the sold-out ground. Only the plain card follows the theme.
                background: soldOut ? T.cardBg : showOffer ? T.offerTint : TV.cardBg,
                border: soldOut ? `1px solid ${T.outLine}` : TV.cardBorder,
                // The lift that separates a tappable row from the page. A
                // sold-out row deliberately stays flat — it is not pressable.
                boxShadow: soldOut ? 'none' : TV.cardShadow,
                cursor: interactive ? 'pointer' : 'default',
            }}
        >
            {/* Left column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <VegMark foodType={p.food_type} muted={soldOut} />
                    <p style={{
                        margin: 0, minWidth: 0,
                        fontFamily: TV.fontDisplay, fontWeight: 600,
                        fontSize: 15, lineHeight: '21px', color: soldOut ? T.outName : '#231F23',
                        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                    }}>{p.name}</p>
                </div>

                {soldOut && (
                    <span
                        data-testid="soldout-tag"
                        style={{
                            display: 'inline-flex', alignItems: 'center', width: 'fit-content',
                            padding: '3px 8px', borderRadius: 4,
                            background: T.outTagBg, color: T.outTagInk,
                            fontFamily: "'Manrope',sans-serif", fontWeight: 800,
                            fontSize: 10.5, lineHeight: '15px', letterSpacing: '0.06em',
                        }}
                    >
                        SOLD OUT
                    </span>
                )}

                {badge && !soldOut && (
                    <span
                        data-testid="menu-badge"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5, width: 'fit-content',
                            padding: '3px 9px 3px 7px', borderRadius: 100,
                            background: badge.bg, color: badge.fg, border: `1px solid ${badge.border}`,
                            fontFamily: "'Manrope',sans-serif", fontWeight: 700,
                            fontSize: 11, lineHeight: '15px', letterSpacing: '0.01em',
                        }}
                    >
                        <BadgeIcon kind={badge.kind} />
                        {badge.label}
                    </span>
                )}

                {showKind && kind && (
                    <span
                        data-testid="menu-kind"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5, width: 'fit-content',
                            fontFamily: "'Manrope',sans-serif", fontWeight: 700,
                            fontSize: 11.5, lineHeight: '16px', color: T.outTagInk,
                        }}
                    >
                        <KindIcon kind={kind.icon} />
                        {kind.label}
                    </span>
                )}

                {description && (
                    <p style={{
                        margin: 0,
                        fontFamily: TV.fontBody, fontWeight: 400,
                        fontSize: 13, lineHeight: '18px', color: soldOut ? T.outInk : T.descInk,
                        display: '-webkit-box', WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    } as React.CSSProperties}>{description}</p>
                )}

                {/* Price. The saving is stated in currency as well as percent —
                    "60% off" asks the reader to do arithmetic about a number
                    they do not know yet. */}
                {showOffer ? (
                    <div style={{
                        display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 2,
                        fontFamily: "'Manrope',sans-serif", flexWrap: 'wrap',
                    }}>
                        <span style={{ fontWeight: 800, fontSize: 19, color: '#191919' }}>
                            {CURR}{offer.now}
                        </span>
                        <span style={{
                            fontWeight: 500, fontSize: 12,
                            textDecoration: 'line-through', color: '#918992',
                        }}>{CURR}{offer.was}</span>
                        <span style={{ fontWeight: 800, fontSize: 11.5, color: T.saveGreen }}>
                            {CURR}{offer.save} OFF
                        </span>
                    </div>
                ) : (
                    <p style={{
                        margin: '2px 0 0',
                        fontFamily: TV.fontDisplay, fontWeight: 600,
                        fontSize: 16, lineHeight: '24px', color: soldOut ? T.outInk : TV.accent,
                    }}>
                        {CURR}{p.selling_price}
                        {kind?.priceIsFrom && !soldOut && (
                            <span style={{
                                fontFamily: "'Manrope',sans-serif", fontWeight: 700,
                                fontSize: 12.5, color: T.outTagInk, marginLeft: 5,
                            }}>onwards</span>
                        )}
                    </p>
                )}
            </div>

            {/* Right column — photo, then the action beneath it. Omitted
                entirely when there is neither. */}
            {hasRightColumn && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    {hasImage && (
                        <Thumb src={p.image_url as string} alt={p.name} soldOut={soldOut} priority={priority} />
                    )}
                    {action}
                </div>
            )}

        </div>
    );
}
