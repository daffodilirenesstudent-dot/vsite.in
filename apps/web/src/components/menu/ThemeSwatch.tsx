'use client';

import { MENU_THEMES, FONT_PAIRS, resolveAccent, type MenuThemeId } from '@/lib/menu/menuThemes';

/**
 * A miniature of the owner's OWN menu in one design.
 *
 * This is the whole point of the picker, and the reason it is not three stock
 * screenshots: the sales moment is the owner seeing HIS dishes, in his shop's
 * name, in ten minutes. A generic thumbnail of somebody else's cake shop asks
 * him to imagine it — and at a counter, during a 3pm lull, nobody imagines.
 *
 * It is a miniature, not a live render of QRMenuTemplate. Mounting three copies
 * of a 2,100-line component to draw three 96px thumbnails would cost more than
 * the rest of onboarding put together, on the slow phone this is chosen on.
 * What it does share is the real thing: the theme's own tokens, resolved
 * exactly as the menu resolves them, and the owner's real dish names.
 */
export default function ThemeSwatch({
    themeId,
    dishNames,
    dishPrices = [],
    brandColor,
    selected,
    height = 108,
}: {
    themeId: MenuThemeId;
    /** Real dish names, in menu order. Falls back only if the menu is empty. */
    dishNames: string[];
    /** Their prices, in the same order. A dish with none shows no price, never a bare ₹. */
    dishPrices?: ReadonlyArray<number | null | undefined>;
    brandColor?: string | null;
    selected?: boolean;
    height?: number;
}) {
    const theme = MENU_THEMES[themeId];
    const font = FONT_PAIRS[theme.fontPair];
    const accent = resolveAccent(brandColor, themeId);

    // Two rows is enough to show ground, card, corner and type together; three
    // makes each one too short to read the face.
    const rows = (dishNames.length ? dishNames : ['Your first dish', 'Your second dish']).slice(0, 2);

    return (
        <div
            aria-hidden="true"
            style={{
                height,
                background: theme.surface,
                borderRadius: 10,
                overflow: 'hidden',
                padding: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                // The selection ring is the picker's, not the design's — it must
                // never be mistaken for part of the menu being previewed.
                boxShadow: selected ? `0 0 0 2px ${accent}` : 'inset 0 0 0 1px #E4E4E7',
                transition: 'box-shadow 160ms ease',
            }}
        >
            {/* Shop name, in the design's display face and the owner's colour. */}
            <div
                style={{
                    fontFamily: font.display,
                    fontWeight: 700,
                    fontSize: 8,
                    letterSpacing: theme.section.transform === 'uppercase' ? '0.1em' : '0.04em',
                    textTransform: 'uppercase',
                    color: accent,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                }}
            >
                {rows.length ? 'Your menu' : ''}
            </div>

            {rows.map((name, i) => {
                const price = Number(dishPrices[i]) || 0;
                return (
                <div
                    key={i}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        background: theme.cardBg,
                        borderRadius: Math.max(2, theme.cardRadius / 2),
                        border: theme.cardEdge.border,
                        boxShadow: theme.cardEdge.shadow,
                        padding: 6,
                        flex: 1,
                        minHeight: 0,
                    }}
                >
                    {/* The veg mark is identical in every design — it is a
                        regulated signal, not styling — so it belongs here too. */}
                    <span
                        style={{
                            width: 7,
                            height: 7,
                            flex: 'none',
                            borderRadius: 2,
                            border: '1.2px solid #13801C',
                        }}
                    />
                    <span
                        style={{
                            fontFamily: font.display,
                            fontWeight: 600,
                            fontSize: 8.5,
                            lineHeight: '11px',
                            color: '#231F23',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            minWidth: 0,
                            flex: 1,
                        }}
                    >
                        {name}
                    </span>
                    {price > 0 && (
                        <span
                            style={{
                                fontFamily: font.display,
                                fontWeight: 600,
                                fontSize: 8.5,
                                color: accent,
                                flex: 'none',
                            }}
                        >
                            {`₹${price}`}
                        </span>
                    )}
                    <span
                        style={{
                            width: 18,
                            height: 18,
                            flex: 'none',
                            borderRadius: Math.max(2, theme.thumbRadius / 2),
                            background: 'linear-gradient(150deg, #F0E6DA, #DFCFBA)',
                        }}
                    />
                </div>
                );
            })}
        </div>
    );
}
