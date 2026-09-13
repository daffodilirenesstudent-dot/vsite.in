/**
 * The QR menu's design tokens.
 *
 * Lifted out of QRMenuTemplate so MenuItemCard can use them without a circular
 * import. Values are unchanged — this is the existing system, not a new one.
 *
 * `saveGreen` is intentionally the same green as `vegGreen` ONLY where it reads
 * unambiguously as money ("₹40 OFF") — the solid green discount chip that used
 * to sit beside the veg mark is gone, because one hue cannot mean both
 * "vegetarian" and "discount" on one card.
 *
 * `pinkWash`/`pinkTint`/`pinkLine` are retained for other surfaces but are no
 * longer the offer treatment: an offer is `offerTint` and nothing else. The
 * old treatment stacked a gradient ribbon, a wash, a border and a shadow, and
 * on a list where several dishes are discounted they competed with each other
 * and with the food.
 */
export const T = {
  pink: '#EF59A1',
  pinkDeep: '#C42A73',
  pinkLine: '#F6C6DD',
  pinkWash: '#FFF6FA',
  pinkTint: 'rgba(239,89,161,0.06)',
  vegGreen: '#13801C',
  saveGreen: '#13801C',
  saveWash: '#E9F5EA',

  /**
   * An offer's entire visual signal: a tinted card ground. Nothing else.
   *
   * Warm sand, NOT a pale red. The previous #FFECEC was a tint of red, which
   * collided with the two things that have to stay legible on a discounted row:
   *   · nonvegRed (#FB2C36) — a regulated mark in India, sitting on a ground of
   *     its own hue.
   *   · the Popular badge (#FFEDE9) — near-identical, so the pill all but
   *     vanished exactly on the rows an owner most wants read.
   * Sand collides with nothing in the palette, stays warm enough to flatter
   * food photography, and is neutral under every brand colour — which matters
   * because this value is fixed for all stores and never owner-settable.
   */
  offerTint: '#FAF5EC',

  /** Sold-out ramp. Muted, never red — nothing has gone wrong. */
  outName: '#9A949A',
  outInk: '#A8A2A8',
  outMark: '#B4AFB4',
  outTagInk: '#6B646B',
  outTagBg: '#EFEDEF',
  outLine: '#EDEDED',

  /** Chevron that tells the diner the row opens. */
  chevron: '#B4AFB4',
  nonvegRed: '#FB2C36',
  dark: '#191919',
  nameColor: '#333333',
  descColor: '#808080',
  /** Darker description ink. 10px/300/#808080 was under the mobile floor. */
  descInk: '#5C545C',
  chipText: '#0A0A0A',
  lightGray: '#C5C5C5',
  border: '#E6E6E6',
  chipBorder: '#D1D5DC',
  cardBg: '#FAFAFA',
  white: '#FFFFFF',
  amber: '#FFBC11',
  footerSub: '#484848',
} as const;

export type MenuTokens = typeof T;

/**
 * The themed subset of `T`, as CSS custom properties.
 *
 * `T` above is FROZEN and stays exactly as it is: it is the Classic design, it
 * is what 56 live menus render, and `menu-card-system.test.ts` reads its
 * literals straight out of this file. `TV` layers on top rather than replacing
 * it — every entry carries the Classic value as its `var()` fallback, so the
 * shipped colour still paints if a variable never lands, and still appears in
 * source where the frozen suite expects it.
 *
 * Only the seven knobs a design may move are here. Everything else in `T`
 * — the veg and non-veg marks, the offer tint, the saving green, the sold-out
 * ramp — is identical in every theme, on purpose. Those are signals, not style:
 * the food marks are regulated in India, the tint is an offer's entire visual
 * signal, and the sold-out ramp has to say "finished today" rather than
 * "something went wrong".
 *
 * Values are set once on the menu shell by `themeCssVars()` in
 * `@/lib/menu/menuThemes`. Nothing the owner typed is ever concatenated into a
 * style string; it arrives as a validated custom property.
 */
export const TV = {
    accent: 'var(--qr-accent, #EF59A1)',
    surface: 'var(--qr-surface, #FAFAFA)',
    cardBg: 'var(--qr-card-bg, #FFFFFF)',
    cardRadius: 'var(--qr-card-radius, 8px)',
    chipRadius: 'var(--qr-chip-radius, 40px)',
    thumbRadius: 'var(--qr-thumb-radius, 10px)',
    sectionSize: 'var(--qr-section-size, 16px)',
    sectionWeight: 'var(--qr-section-weight, 500)',
    sectionTracking: 'var(--qr-section-tracking, normal)',
    sectionTransform: 'var(--qr-section-transform, none)',
    cardBorder: 'var(--qr-card-border, 1px solid #E6E6E6)',
    cardShadow:
        'var(--qr-card-shadow, 0 1px 3px rgba(25,25,25,0.06), 0 1px 1px rgba(25,25,25,0.04))',
    fontDisplay: "var(--qr-font-display, 'Poppins', sans-serif)",
    fontBody: "var(--qr-font-body, 'Manrope', sans-serif)",
    fontTamil: "var(--qr-font-tamil, 'Noto Sans Tamil', 'Poppins', sans-serif)",
    cardPadding: 'var(--qr-card-padding, 10px)',
    cardGap: 'var(--qr-card-gap, 10px)',
    listGap: 'var(--qr-list-gap, 10px)',
} as const;
