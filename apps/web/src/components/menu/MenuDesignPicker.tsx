'use client';

import { MENU_THEMES, isHexColor, type MenuThemeId } from '@/lib/menu/menuThemes';
import ThemeSwatch from './ThemeSwatch';

/**
 * The design picker. One component, two homes: the last step of onboarding and
 * the Appearance tab in settings.
 *
 * Shared deliberately. The two surfaces have different chrome — onboarding is
 * Tailwind, settings is inline styles — but if the picker itself forked, the
 * design an owner chose at the counter and the design he sees in settings
 * would drift apart, and the thing that drifts is the thing he bought.
 *
 * ─── DESIGN NOTES ────────────────────────────────────────────────────────────
 * · Classic is always pre-selected. Doing nothing is a valid path; onboarding
 *   must never block on a taste decision. Onboarding speed is the load-bearing
 *   constraint of the whole go-to-market, and a picker that adds two minutes
 *   gets deleted no matter how nice it looks.
 * · The swatches show the owner's REAL dish names. He is choosing how HIS menu
 *   looks, not evaluating three stock photos.
 * · Colours are a short curated row, not a colour wheel. A restaurant owner at
 *   a counter is not going to pick a hex, and every unvetted colour is one the
 *   contrast clamp has to rescue.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Curated brand colours.
 *
 * Every one of these clears 4.5:1 on a light ground as it stands, so the clamp
 * never has to touch a colour the owner picked from this row — he gets exactly
 * what he tapped. The custom field is where the clamp earns its place.
 */
export const BRAND_COLOURS: { hex: string; name: string }[] = [
    { hex: '#EF59A1', name: 'Pink' },
    { hex: '#C2603F', name: 'Terracotta' },
    { hex: '#1F6F4A', name: 'Green' },
    { hex: '#1F3A5F', name: 'Navy' },
    { hex: '#8A5B06', name: 'Mustard' },
    { hex: '#101010', name: 'Black' },
];

export default function MenuDesignPicker({
    theme,
    brandColor,
    dishNames,
    dishPrices,
    onThemeChange,
    onColourChange,
    disabled = false,
    compact = false,
}: {
    theme: MenuThemeId;
    brandColor: string | null;
    dishNames: string[];
    /** Prices for dishNames, same order. */
    dishPrices?: ReadonlyArray<number | null | undefined>;
    onThemeChange: (id: MenuThemeId) => void;
    onColourChange: (hex: string) => void;
    disabled?: boolean;
    /** Onboarding trims the blurbs; settings has room for them. */
    compact?: boolean;
}) {
    const activeColour = isHexColor(brandColor) ? brandColor : MENU_THEMES[theme].accent;

    return (
        <div>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gap: 8,
                }}
            >
                {Object.values(MENU_THEMES).map((t) => {
                    const on = t.id === theme;
                    return (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => onThemeChange(t.id)}
                            disabled={disabled}
                            aria-pressed={on}
                            aria-label={`${t.label} design — ${t.blurb}`}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 6,
                                padding: 0,
                                border: 'none',
                                background: 'transparent',
                                cursor: disabled ? 'wait' : 'pointer',
                                textAlign: 'left',
                                minWidth: 0,
                            }}
                        >
                            <ThemeSwatch
                                themeId={t.id}
                                dishNames={dishNames}
                                dishPrices={dishPrices}
                                brandColor={activeColour}
                                selected={on}
                                height={compact ? 96 : 116}
                            />
                            <span
                                style={{
                                    fontSize: 12,
                                    fontWeight: on ? 700 : 500,
                                    color: on ? '#0A0A0A' : '#52525B',
                                    lineHeight: '16px',
                                }}
                            >
                                {t.label}
                            </span>
                            {!compact && (
                                <span style={{ fontSize: 11, color: '#71717A', lineHeight: '15px' }}>
                                    {t.blurb}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            <div style={{ marginTop: compact ? 12 : 20 }}>
                <span
                    style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#52525B',
                        display: 'block',
                        marginBottom: 8,
                    }}
                >
                    Brand colour
                </span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {BRAND_COLOURS.map((c) => {
                        const on = activeColour.toUpperCase() === c.hex.toUpperCase();
                        return (
                            <button
                                key={c.hex}
                                type="button"
                                onClick={() => onColourChange(c.hex)}
                                disabled={disabled}
                                aria-pressed={on}
                                aria-label={c.name}
                                title={c.name}
                                style={{
                                    // 44px: the 30px dot was a small target for a thumb.
                                    width: 44,
                                    height: 44,
                                    borderRadius: '50%',
                                    background: c.hex,
                                    // The ring sits outside the swatch so the
                                    // colour itself is never partly covered by
                                    // the thing indicating it is chosen.
                                    border: '2px solid #FFFFFF',
                                    boxShadow: on
                                        ? `0 0 0 2px ${c.hex}`
                                        : 'inset 0 0 0 1px rgba(0,0,0,0.08)',
                                    cursor: disabled ? 'wait' : 'pointer',
                                    padding: 0,
                                    transition: 'box-shadow 160ms ease',
                                }}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
