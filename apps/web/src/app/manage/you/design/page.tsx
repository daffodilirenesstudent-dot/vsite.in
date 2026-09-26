'use client';

import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useSite } from '@/components/SiteContext';
import { supabase } from '@/lib/platform/db/supabase';
import { Skeleton } from '@/components/loading';
import ThemeSwatch from '@/components/menu/ThemeSwatch';
import { BRAND_COLOURS } from '@/components/menu/MenuDesignPicker';
import {
    MENU_THEMES, FONT_PAIRS, DEFAULT_MENU_THEME, DEFAULT_FONT_PAIR,
    isMenuThemeId, isFontPairId, isHexColor, resolveAccent,
    type MenuThemeId, type FontPairId,
} from '@/lib/menu/menuThemes';
import { saveMenuDesign, themePatch } from '@/lib/you/menuDesign';
import SubPage from '@/components/you/SubPage';
import { Y, rise } from '@/components/you/YouStyles';
import { Icon } from '@/components/you/YouKit';

/**
 * Menu design on a phone: a live preview of the owner's own menu on top, then
 * style, colour and lettering. Every tap saves at once through the endpoint
 * the settings Appearance tab uses — no Save button to hunt for — and a failed
 * save puts the previous choice back.
 */

interface Design { menu_theme: MenuThemeId; menu_font: FontPairId; primary_color: string }

const sectionTitle: React.CSSProperties = { margin: '0 4px 10px', fontSize: 15, fontWeight: 700 };
const PREVIEW_H = 104;
const PREVIEW_SCALE = 1.5;

export default function MenuDesignPage() {
    const { activeSite } = useSite();
    const [design, setDesign] = useState<Design | null>(null);
    const [dishes, setDishes] = useState<string[]>([]);
    const [dishPrices, setDishPrices] = useState<number[]>([]);
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
    const savedTimer = useRef<number | null>(null);

    useEffect(() => {
        const siteId = activeSite?.id;
        if (!siteId) return;
        let cancelled = false;
        setDesign(null);
        Promise.all([
            supabase.from('sites').select('menu_theme, menu_font, primary_color').eq('id', siteId).single(),
            // Two names is all the preview shows: its own menu, not a stock one.
            supabase.from('products').select('name, selling_price').eq('site_id', siteId).order('display_order').limit(2),
        ]).then(([site, products]) => {
            if (cancelled) return;
            const d = (site.data ?? {}) as Record<string, unknown>;
            const theme = isMenuThemeId(d.menu_theme) ? d.menu_theme : DEFAULT_MENU_THEME;
            setDesign({
                menu_theme: theme,
                menu_font: isFontPairId(d.menu_font) ? d.menu_font : DEFAULT_FONT_PAIR,
                primary_color: isHexColor(d.primary_color) ? d.primary_color : MENU_THEMES[theme].accent,
            });
            setDishes((products.data ?? []).map(r => String((r as { name: unknown }).name)));
            setDishPrices((products.data ?? []).map(r => Number((r as { selling_price: unknown }).selling_price) || 0));
        });
        return () => { cancelled = true; };
    }, [activeSite?.id]);

    useEffect(() => () => { if (savedTimer.current) window.clearTimeout(savedTimer.current); }, []);

    const save = async (patch: Partial<Design>) => {
        if (!design || !activeSite) return;
        const previous = design;
        // Optimistic: the preview answers the tap, not the network.
        setDesign({ ...design, ...patch });
        setSaveState('saving');
        if (savedTimer.current) window.clearTimeout(savedTimer.current);
        const result = await saveMenuDesign(activeSite.id, patch as Record<string, string>);
        if (!result.ok) {
            setDesign(previous);
            setSaveState('idle');
            toast.error(result.error);
            return;
        }
        setSaveState('saved');
        savedTimer.current = window.setTimeout(() => setSaveState('idle'), 2200);
    };

    const status = saveState === 'saving' ? (
        <span role="status" style={{ fontSize: 13, color: Y.muted }}>Saving…</span>
    ) : saveState === 'saved' ? (
        <span role="status" className="you-pop" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 999, background: Y.good.bg, color: Y.good.fg, fontSize: 13, fontWeight: 600 }}>
            <Icon icon="check" size={16} />Saved
        </span>
    ) : null;

    if (!design) {
        return (
            <SubPage title="Menu design">
                <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <Skeleton height={300} radius={20} />
                    <Skeleton height={150} radius={16} />
                    <Skeleton height={60} radius={16} />
                </div>
            </SubPage>
        );
    }

    const accent = resolveAccent(design.primary_color, design.menu_theme);
    const darkened = accent.toUpperCase() !== design.primary_color.toUpperCase();
    const customColour = !BRAND_COLOURS.some(c => c.hex.toUpperCase() === design.primary_color.toUpperCase());
    const colours = customColour ? [...BRAND_COLOURS, { hex: design.primary_color, name: 'Your colour' }] : BRAND_COLOURS;
    const colourName = colours.find(c => c.hex.toUpperCase() === design.primary_color.toUpperCase())?.name ?? '';

    return (
        <SubPage title="Menu design" right={status}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                {/* ── Live preview ── */}
                <section aria-label="Preview of your menu" className="you-rise" style={{ ...rise(0), background: '#EDEBF5', borderRadius: 20, padding: '18px 16px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, userSelect: 'none', WebkitUserSelect: 'none' }}>
                    {/* The swatch is drawn at thumbnail scale; enlarging it keeps the
                        design's own proportions instead of stretching its rows. */}
                    <div style={{ width: '100%', maxWidth: 300, height: PREVIEW_H * PREVIEW_SCALE, borderRadius: 16, overflow: 'hidden', background: MENU_THEMES[design.menu_theme].surface, boxShadow: '0 10px 28px rgba(20, 16, 60, 0.14)' }}>
                        <div style={{ width: `${100 / PREVIEW_SCALE}%`, transform: `scale(${PREVIEW_SCALE})`, transformOrigin: 'top left' }}>
                            <ThemeSwatch themeId={design.menu_theme} dishNames={dishes} dishPrices={dishPrices} brandColor={design.primary_color} height={PREVIEW_H} />
                        </div>
                    </div>
                    {activeSite?.slug && (
                        <a href={`/shop/${activeSite.slug}`} target="_blank" rel="noopener noreferrer" className="you-press you-focus" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 40, padding: '0 8px', fontSize: 14, fontWeight: 600, color: Y.brand, textDecoration: 'none' }}>
                            See it live on your menu
                            <Icon icon="open_in_new" size={16} />
                        </a>
                    )}
                </section>

                {/* ── Style ── */}
                <section aria-labelledby="md-style" className="you-rise" style={rise(1)}>
                    <h2 id="md-style" style={sectionTitle}>Style</h2>
                    <div role="radiogroup" aria-labelledby="md-style" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                        {(Object.keys(MENU_THEMES) as MenuThemeId[]).map(id => {
                            const on = design.menu_theme === id;
                            return (
                                <button key={id} type="button" role="radio" aria-checked={on} aria-label={`${MENU_THEMES[id].label}: ${MENU_THEMES[id].blurb}`}
                                    onClick={() => { if (!on) save(themePatch(id)); }} className="you-press you-focus"
                                    style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: on ? 7 : 8, borderRadius: 14, border: on ? `2px solid ${Y.brand}` : `1px solid ${Y.line}`, background: on ? Y.brandTint : Y.white, cursor: 'pointer', fontFamily: 'inherit' }}>
                                    <ThemeSwatch themeId={id} dishNames={dishes} dishPrices={dishPrices} brandColor={design.primary_color} height={84} />
                                    <span style={{ fontSize: 13, fontWeight: 600, color: Y.ink }}>{MENU_THEMES[id].label}</span>
                                </button>
                            );
                        })}
                    </div>
                    <p style={{ margin: '8px 4px 0', fontSize: 13, color: Y.muted, lineHeight: '18px' }}>{MENU_THEMES[design.menu_theme].blurb}</p>
                </section>

                {/* ── Colour ── */}
                <section aria-labelledby="md-colour" className="you-rise" style={rise(2)}>
                    <h2 id="md-colour" style={sectionTitle}>Colour <span style={{ fontWeight: 500, color: Y.muted }}>· {colourName}</span></h2>
                    <div role="radiogroup" aria-labelledby="md-colour" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '4px' }}>
                        {colours.map(c => {
                            const on = c.hex.toUpperCase() === design.primary_color.toUpperCase();
                            return (
                                <button key={c.hex} type="button" role="radio" aria-checked={on} aria-label={c.name}
                                    onClick={() => { if (!on) save({ primary_color: c.hex }); }} className="you-press you-focus"
                                    style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer', background: c.hex, boxShadow: on ? `0 0 0 3px ${Y.white}, 0 0 0 5px ${c.hex}` : 'inset 0 0 0 1px rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {on && <Icon icon="check" size={20} color={Y.white} />}
                                </button>
                            );
                        })}
                    </div>
                    {darkened && (
                        <p style={{ margin: '8px 4px 0', fontSize: 13, color: '#8A5B06', lineHeight: '18px' }}>
                            This colour is too light to read as a price, so prices use a slightly darker shade.
                        </p>
                    )}
                </section>

                {/* ── Lettering ── */}
                <section aria-labelledby="md-font" className="you-rise" style={rise(3)}>
                    <h2 id="md-font" style={sectionTitle}>Lettering</h2>
                    <div role="radiogroup" aria-labelledby="md-font" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                        {(Object.keys(FONT_PAIRS) as FontPairId[]).map(id => {
                            const f = FONT_PAIRS[id];
                            const on = design.menu_font === id;
                            return (
                                <button key={id} type="button" role="radio" aria-checked={on} onClick={() => { if (!on) save({ menu_font: id }); }} className="you-press you-focus"
                                    style={{ minHeight: 76, borderRadius: 14, border: on ? `2px solid ${Y.brand}` : `1px solid ${Y.line}`, background: on ? Y.brandTint : Y.white, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, cursor: 'pointer', fontFamily: 'inherit' }}>
                                    <span style={{ fontFamily: f.display, fontSize: 24, fontWeight: 700, color: Y.ink, lineHeight: '30px' }}>Aa</span>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: Y.text }}>{f.label}</span>
                                </button>
                            );
                        })}
                    </div>
                    <p style={{ margin: '8px 4px 0', fontSize: 13, color: Y.muted, lineHeight: '18px' }}>
                        Every option includes Tamil, so Tamil dish names always show properly.
                    </p>
                </section>

                <p style={{ margin: 0, textAlign: 'center', fontSize: 13, color: Y.muted }}>
                    Changes save as you tap. Your dishes, prices and QR code stay the same.
                </p>
            </div>
        </SubPage>
    );
}
