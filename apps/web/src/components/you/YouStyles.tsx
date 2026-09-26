import type React from 'react';

/**
 * The You tab's look, in one place: colour tokens and motion.
 *
 * Motion is deliberately small — a row rises 6 px, a screen slides 24 px, a
 * sheet comes up from the bottom — all under a third of a second, ease-out, so
 * the app feels quick rather than decorated. Under "reduce motion" everything
 * simply appears.
 */

export const Y = {
    brand: '#5137EF',
    brandDeep: '#3F28C9',
    brandBg: '#EEEBFD',
    brandTint: '#F7F6FE',
    ink: '#0A0A0A',
    text: '#52525C',
    muted: '#71717A',
    faint: '#A1A1AA',
    line: '#E4E4E7',
    lineSoft: '#F0F0F2',
    field: '#D4D4D8',
    page: '#F7F7F8',
    white: '#FFFFFF',
    danger: '#B42318',
    good: { bg: '#E7F6EE', fg: '#0E5C39', dot: '#16A34A' },
    warn: { bg: '#FEF3E2', fg: '#93370D', dot: '#DC6803' },
    bad: { bg: '#FEF1F0', fg: '#912018', dot: '#D92D20' },
} as const;

export type Tone = 'good' | 'warn' | 'bad';

/** Stagger for list entrances: small enough that the last row is never late. */
export const rise = (i: number): React.CSSProperties => ({ animationDelay: `${Math.min(i, 8) * 30}ms` });

const CSS = `
@keyframes you-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes you-slide { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: none; } }
@keyframes you-sheet { from { transform: translateY(100%); } to { transform: none; } }
@keyframes you-pop { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: none; } }
@keyframes you-fade { from { opacity: 0; } to { opacity: 1; } }

.you-rise { animation: you-rise 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.you-slide { animation: you-slide 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.you-sheet { animation: you-sheet 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.you-pop { animation: you-pop 180ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.you-fade { animation: you-fade 200ms ease-out both; }
@media (min-width: 768px) { .you-sheet { animation-name: you-pop; } }

.you-press { transition: background-color 120ms ease, transform 120ms ease, opacity 120ms ease; -webkit-tap-highlight-color: transparent; }
.you-press:active { transform: scale(0.985); }
.you-row:active { background-color: #F4F4F5; }
.you-focus:focus-visible, .you-press:focus-visible { outline: 2px solid ${Y.brand}; outline-offset: 2px; }
.you-field { transition: border-color 120ms ease, box-shadow 120ms ease; }
.you-switch { transition: background-color 160ms ease; }
.you-knob { transition: left 160ms cubic-bezier(0.2, 0.8, 0.2, 1); }
.you-bar { transition: width 300ms cubic-bezier(0.2, 0.8, 0.2, 1); }
.you-field:focus { border-color: ${Y.brand} !important; box-shadow: 0 0 0 3px ${Y.brandBg}; outline: none; }
.you-root .material-symbols-outlined { flex-shrink: 0; }

@media (prefers-reduced-motion: reduce) {
  .you-rise, .you-slide, .you-sheet, .you-pop, .you-fade { animation: none; }
  .you-press, .you-field, .you-switch, .you-knob, .you-bar { transition: none; }
  .you-press:active { transform: none; }
}
`;

export default function YouStyles() {
    return <style>{CSS}</style>;
}
