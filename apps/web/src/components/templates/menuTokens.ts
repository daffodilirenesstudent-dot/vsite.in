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

  /** An offer's entire visual signal: a tinted card ground. Nothing else. */
  offerTint: '#FFECEC',

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
