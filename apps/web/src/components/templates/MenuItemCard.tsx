'use client';

import React from 'react';
import { T } from './menuTokens';
import { resolveBadge } from '@/lib/menu/badges';
import { resolveOffer } from '@/lib/menu/offer';

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
 *    people misread flat elements, and our diner has no food-delivery-app
 *    habit to fall back on. A chevron names the direction, a 1px lift
 *    separates the row from the page, and `.qr-card-press` gives the pressed
 *    state that is the ONLY tap feedback a phone can offer.
 *
 * 3. SOLD OUT IS SHOWN, NOT HIDDEN. See `soldOut` below.
 *
 * 4. Descriptions are 13px/400 in a darker ink. They were 10px/300 in
 *    mid-grey — under the mobile legibility floor, for a reader who is often
 *    45+ in a dim dining room, and it is the one asset on the card proven to
 *    move order value.
 */

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

/** Photo with a skeleton underneath, so it fades in instead of popping. */
function Thumb({ src, alt, soldOut }: { src?: string | null; alt: string; soldOut: boolean }) {
    const [loaded, setLoaded] = React.useState(false);

    // Desaturating rather than hiding is what keeps a sold-out dish
    // recognisable — the diner still sees what they are missing.
    const mediaStyle: React.CSSProperties = soldOut
        ? { filter: 'grayscale(1)', opacity: 0.5 }
        : {};

    return (
        <div
            style={{
                position: 'relative', width: 108, height: 108, flex: 'none',
                borderRadius: 10, overflow: 'hidden',
                background: T.white,
                border: `1px solid ${soldOut ? T.outLine : '#EFEFEF'}`,
            }}
        >
            {src ? (
                <>
                    {!loaded && <span className="qr-skel" style={{ position: 'absolute', inset: 0 }} />}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={src}
                        alt={alt}
                        loading="lazy"
                        decoding="async"
                        onLoad={() => setLoaded(true)}
                        onError={() => setLoaded(true)}
                        className="qr-thumb-img"
                        data-loaded={loaded ? 'true' : 'false'}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', ...mediaStyle }}
                    />
                </>
            ) : (
                <div
                    aria-hidden
                    style={{
                        width: '100%', height: '100%', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        background: '#F1EFF0', color: T.lightGray,
                        ...mediaStyle,
                    }}
                >
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <rect x="3" y="4" width="18" height="16" rx="2" />
                        <circle cx="8.5" cy="9.5" r="1.5" />
                        <path d="M21 15l-5-5L5 20" />
                    </svg>
                </div>
            )}
        </div>
    );
}

export default function MenuItemCard({
    product: p,
    description,
    currencyCode = 'INR',
    onSelect,
    soldOut = false,
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

    return (
        <div
            className={interactive ? 'qr-card qr-card-press' : 'qr-card'}
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
                position: 'relative', width: '100%',
                display: 'grid', gridTemplateColumns: '1fr 108px', gap: 10,
                alignItems: 'start',
                padding: 10,
                borderRadius: 8,
                // The offer's whole signal. A sold-out card stays neutral.
                background: soldOut ? T.cardBg : showOffer ? T.offerTint : T.white,
                border: `1px solid ${soldOut ? T.outLine : T.border}`,
                // The lift that separates a tappable row from the page. A
                // sold-out row deliberately stays flat — it is not pressable.
                boxShadow: soldOut
                    ? 'none'
                    : '0 1px 3px rgba(25,25,25,0.06), 0 1px 1px rgba(25,25,25,0.04)',
                cursor: interactive ? 'pointer' : 'default',
            }}
        >
            {/* Left column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <VegMark foodType={p.food_type} muted={soldOut} />
                    <p style={{
                        margin: 0, minWidth: 0,
                        fontFamily: "'Poppins',sans-serif", fontWeight: 600,
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
                        fontFamily: "'Poppins',sans-serif", fontWeight: 400,
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
                        fontFamily: "'Poppins',sans-serif", fontWeight: 600,
                        fontSize: 16, lineHeight: '24px', color: soldOut ? T.outInk : T.pink,
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

            {/* Right column — photo, then the action beneath it */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <Thumb src={p.image_url} alt={p.name} soldOut={soldOut} />
                {action}
            </div>

            {/* The signifier. Only on rows that actually open. */}
            {interactive && (
                <svg
                    aria-hidden
                    width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke={T.chevron} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ position: 'absolute', right: 10, bottom: 10 }}
                >
                    <path d="M9 18l6-6-6-6" />
                </svg>
            )}
        </div>
    );
}
