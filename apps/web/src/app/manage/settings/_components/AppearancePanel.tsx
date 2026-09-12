'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import MenuDesignPicker from '@/components/menu/MenuDesignPicker';
import {
    MENU_THEMES, FONT_PAIRS, resolveAccent,
    type MenuThemeId, type FontPairId,
} from '@/lib/menu/menuThemes';

/**
 * The Appearance tab — menu design, brand colour, lettering, logo visibility.
 *
 * ─── WHY THIS SCREEN EXISTS AT ALL ───────────────────────────────────────────
 * The product decision says "onboarding picker only, no settings screen", and
 * ALSO makes "the share of owners who change design within 30 days" the number
 * that decides in October whether to build more designs. Both cannot hold: with
 * no way to change it, that number is 0% by construction, and 0% would be read
 * as proof nobody wants designs — the most expensive wrong conclusion available.
 *
 * So this is deliberately ONE tab reusing the onboarding picker, not a design
 * studio. Every control is one an owner can get wrong and undo in a tap.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Saves are per-control and immediate. A Save button at the foot of a visual
 * screen makes an owner pick a design and then hunt for a button — and one who
 * navigates away first concludes the product lost his choice.
 */

const labelStyle: React.CSSProperties = {
    fontSize: 14, fontWeight: 500, color: '#0A0A0A', lineHeight: '20px',
    marginBottom: 6, display: 'block',
};
const cardStyle: React.CSSProperties = {
    border: '1px solid #E4E4E7', borderRadius: 14, padding: 24,
    marginBottom: 24, background: '#FFFFFF',
};
const hintStyle: React.CSSProperties = { fontSize: 12, color: '#71717A', lineHeight: '17px' };

export interface AppearanceState {
    menu_theme: MenuThemeId;
    menu_font: FontPairId;
    primary_color: string;
    show_logo: boolean;
}

export default function AppearancePanel({
    siteId,
    siteSlug,
    hasLogo,
    dishNames,
    value,
    onChange,
}: {
    siteId: string;
    siteSlug: string | null;
    hasLogo: boolean;
    /** Real dish names, so the swatches preview the owner's own menu. */
    dishNames: string[];
    value: AppearanceState;
    onChange: (next: AppearanceState) => void;
}) {
    const [saving, setSaving] = useState(false);

    const save = async (patch: Partial<AppearanceState>) => {
        const previous = value;
        // Optimistic: the swatches must answer the tap, not the network. On a
        // restaurant's 3G, repainting only after a round trip reads as a broken
        // control, and the owner taps it again.
        onChange({ ...value, ...patch });
        setSaving(true);
        try {
            const token = await import('@/lib/auth/firebase')
                .then(m => m.firebaseAuth.currentUser?.getIdToken());
            if (!token) { onChange(previous); return; }

            const res = await fetch(`/api/manage/sites/${siteId}/menu-theme`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(patch),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                onChange(previous);
                toast.error(typeof data.error === 'string' ? data.error : 'Could not save');
                return;
            }
            toast.success('Menu design updated');
        } catch {
            onChange(previous);
            toast.error('Could not save');
        } finally {
            setSaving(false);
        }
    };

    const theme = MENU_THEMES[value.menu_theme];
    const applied = resolveAccent(value.primary_color, value.menu_theme);
    // True when the contrast clamp had to step in. Worth saying out loud: the
    // owner is otherwise looking at a colour he did not choose, with no
    // explanation, and will assume the picker is broken.
    const wasDarkened = applied.toUpperCase() !== value.primary_color.toUpperCase();

    return (
        <>
            <div style={cardStyle}>
                <span style={labelStyle}>Menu design</span>
                <p style={{ ...hintStyle, marginBottom: 16 }}>
                    How customers see your menu when they scan the QR code. Your dishes,
                    prices and photos stay exactly as they are — only the look changes,
                    and your printed QR codes keep working.
                </p>

                <MenuDesignPicker
                    theme={value.menu_theme}
                    brandColor={value.primary_color}
                    dishNames={dishNames}
                    disabled={saving}
                    onThemeChange={(id) =>
                        save({ menu_theme: id, menu_font: MENU_THEMES[id].fontPair })
                    }
                    onColourChange={(hex) => save({ primary_color: hex })}
                />

                {wasDarkened && (
                    <p style={{ ...hintStyle, marginTop: 12, color: '#8A5B06' }}>
                        That colour is too light to read as a price, so the menu darkens it
                        a little. Everything else uses your colour exactly as it is.
                    </p>
                )}

                {siteSlug && (
                    <a
                        href={`/shop/${siteSlug}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 16,
                            fontSize: 13, fontWeight: 600, color: '#5137EF', textDecoration: 'none',
                        }}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                            open_in_new
                        </span>
                        See my live menu
                    </a>
                )}
            </div>

            <div style={cardStyle}>
                <span style={labelStyle}>Lettering</span>
                <p style={{ ...hintStyle, marginBottom: 14 }}>
                    Every option includes Tamil, so Tamil dish names always render properly.
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {Object.values(FONT_PAIRS).map((f) => {
                        const on = f.id === value.menu_font;
                        return (
                            <button
                                key={f.id}
                                onClick={() => save({ menu_font: f.id })}
                                disabled={saving}
                                aria-pressed={on}
                                style={{
                                    padding: '10px 16px', borderRadius: 10,
                                    border: on ? '2px solid #5137EF' : '1px solid #E4E4E7',
                                    background: on ? '#EEEEFF' : '#FFFFFF',
                                    cursor: saving ? 'wait' : 'pointer',
                                    // Set in the face it selects — the only honest
                                    // way to choose type is to see it.
                                    fontFamily: f.display,
                                    fontSize: 15, fontWeight: 600, color: '#0A0A0A',
                                }}
                            >
                                {f.label}
                            </button>
                        );
                    })}
                </div>
                <p style={{ ...hintStyle, marginTop: 10 }}>
                    {theme.label} normally uses {FONT_PAIRS[theme.fontPair].label}.
                </p>
            </div>

            <div style={cardStyle}>
                <span style={labelStyle}>Show my logo</span>
                <p style={{ ...hintStyle, marginBottom: 14 }}>
                    {hasLogo
                        ? 'Your logo appears next to your shop name at the top of the menu.'
                        : 'Add a logo under Store details first. Until then your shop name shows on its own — which is how most menus look.'}
                </p>
                <button
                    role="switch"
                    aria-checked={value.show_logo}
                    aria-label="Show my logo on the menu"
                    disabled={saving || !hasLogo}
                    onClick={() => save({ show_logo: !value.show_logo })}
                    style={{
                        width: 48, height: 28, borderRadius: 999, border: 'none', padding: 3,
                        display: 'flex', justifyContent: value.show_logo ? 'flex-end' : 'flex-start',
                        background: value.show_logo && hasLogo ? '#5137EF' : '#D4D4D8',
                        cursor: !hasLogo ? 'not-allowed' : saving ? 'wait' : 'pointer',
                        opacity: hasLogo ? 1 : 0.6,
                        transition: 'background 160ms ease',
                    }}
                >
                    <span style={{
                        width: 22, height: 22, borderRadius: '50%', background: '#FFFFFF',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                    }} />
                </button>
            </div>
        </>
    );
}
