'use client';

import React from 'react';
import Link from 'next/link';
import { Y, type Tone } from './YouStyles';

/**
 * Small building blocks shared by the You screens. Each one is the single
 * definition of how that thing looks, so the seven screens stay consistent.
 */

/** A Material Symbols icon. The prop is `icon` so the icon-font test sees every name. */
export function Icon({ icon, size = 22, color, style }: { icon: string; size?: number; color?: string; style?: React.CSSProperties }) {
    return <span className="material-symbols-outlined" aria-hidden style={{ fontSize: size, color, lineHeight: 1, ...style }}>{icon}</span>;
}

export function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
    const t = Y[tone];
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: t.bg, color: t.fg, fontSize: 13, fontWeight: 600, lineHeight: '18px', whiteSpace: 'nowrap' }}>
            <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: t.dot, flexShrink: 0 }} />
            {children}
        </span>
    );
}

export function Toggle({ checked, onChange, label, labelledBy, disabled }: {
    checked: boolean;
    onChange: (next: boolean) => void;
    label?: string;
    labelledBy?: string;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            aria-labelledby={labelledBy}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className="you-switch you-focus"
            style={{
                width: 52, height: 32, borderRadius: 16, border: 'none', padding: 0, position: 'relative', flexShrink: 0,
                background: checked ? Y.brand : Y.field, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1,
            }}
        >
            <span className="you-knob" style={{ position: 'absolute', top: 4, left: checked ? 24 : 4, width: 24, height: 24, borderRadius: '50%', background: Y.white, boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
        </button>
    );
}

export function Card({ children, style, className, ...rest }: React.HTMLAttributes<HTMLElement> & { style?: React.CSSProperties }) {
    return (
        <section className={className} style={{ background: Y.white, border: `1px solid ${Y.line}`, borderRadius: 16, ...style }} {...rest}>
            {children}
        </section>
    );
}

export function SectionTitle({ id, children }: { id?: string; children: React.ReactNode }) {
    return <h2 id={id} style={{ margin: '24px 4px 8px', fontSize: 14, fontWeight: 600, color: Y.text }}>{children}</h2>;
}

/** A tappable row: icon tile, title, one live line underneath, chevron. */
export function Row({ href, icon, title, subtitle, subtitleTone, loading, onNavigate, index = 0 }: {
    href: string;
    icon: string;
    title: string;
    subtitle?: string | null;
    subtitleTone?: 'warn';
    loading?: boolean;
    onNavigate?: () => void;
    index?: number;
}) {
    return (
        <Link
            href={href}
            onClick={onNavigate}
            className="you-press you-row you-rise"
            style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 68, padding: '12px 16px', boxSizing: 'border-box', color: Y.ink, textDecoration: 'none', animationDelay: `${Math.min(index, 8) * 30}ms` }}
        >
            <span style={{ width: 40, height: 40, borderRadius: 12, background: Y.brandBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon icon={icon} color={Y.brand} />
            </span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span>
                {loading ? (
                    <span aria-hidden style={{ display: 'block', width: 140, height: 12, marginTop: 3, borderRadius: 6, background: Y.lineSoft }} />
                ) : subtitle ? (
                    <span className="truncate" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: subtitleTone ? 500 : 400, color: subtitleTone ? Y.warn.fg : Y.muted }}>
                        {subtitleTone && <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: Y.warn.dot, flexShrink: 0 }} />}
                        {subtitle}
                    </span>
                ) : null}
            </span>
            <Icon icon="chevron_right" color={Y.faint} />
        </Link>
    );
}

/** A white group of rows with hairlines between them. */
export function Group({ children, labelledBy }: { children: React.ReactNode; labelledBy?: string }) {
    const items = React.Children.toArray(children).filter(Boolean);
    return (
        <div role="list" aria-labelledby={labelledBy} style={{ background: Y.white, border: `1px solid ${Y.line}`, borderRadius: 16, overflow: 'hidden' }}>
            {items.map((child, i) => (
                <div role="listitem" key={i} style={{ borderTop: i ? `1px solid ${Y.lineSoft}` : 'none' }}>{child}</div>
            ))}
        </div>
    );
}

export const primaryButton: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 52,
    borderRadius: 14, border: 'none', background: Y.brand, color: Y.white, fontFamily: 'inherit',
    fontSize: 16, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', boxSizing: 'border-box',
};

export const secondaryButton: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 48,
    borderRadius: 14, border: `1px solid ${Y.line}`, background: Y.white, color: Y.ink, fontFamily: 'inherit',
    fontSize: 15, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', boxSizing: 'border-box',
};

export const quietButton: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, padding: '0 16px',
    borderRadius: 12, border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 15,
    fontWeight: 600, cursor: 'pointer', textDecoration: 'none',
};

export const fieldStyle: React.CSSProperties = {
    width: '100%', height: 48, boxSizing: 'border-box', border: `1px solid ${Y.field}`, borderRadius: 12,
    padding: '0 14px', fontSize: 16, color: Y.ink, background: Y.white, fontFamily: 'inherit',
};

export const labelStyle: React.CSSProperties = { display: 'block', fontSize: 14, fontWeight: 600, color: Y.ink, marginBottom: 6 };
export const hintStyle: React.CSSProperties = { display: 'block', fontSize: 12, color: Y.muted, marginTop: 6, lineHeight: '17px' };

/** The store's initial on a brand tile — stands in for a logo most stores do not have. */
export function StoreTile({ name, size = 56 }: { name: string; size?: number }) {
    return (
        <span aria-hidden style={{ width: size, height: size, borderRadius: size * 0.28, background: Y.brand, color: Y.white, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.42, fontWeight: 700, flexShrink: 0 }}>
            {(name.trim().charAt(0) || 'S').toUpperCase()}
        </span>
    );
}

/** A thin progress bar for a trial or plan period. */
export function PeriodBar({ progress, tone }: { progress: number; tone: Tone }) {
    return (
        <div aria-hidden style={{ height: 6, borderRadius: 3, background: Y.lineSoft, overflow: 'hidden' }}>
            <div className="you-bar" style={{ height: 6, width: `${Math.round(progress * 100)}%`, borderRadius: 3, background: Y[tone].dot }} />
        </div>
    );
}
