/**
 * The demo menu both diner-phone mockups show.
 *
 * Shared so the two phones on this page cannot drift apart. A visitor scrolls
 * past the QR section and then the offers card; if the same "Saravana Mess"
 * menu listed different dishes or different prices in each, the mockups stop
 * reading as one product and start reading as clip art.
 *
 * Photos are matched to their dish on purpose — the bento tile two cards away
 * promises photos "matched to the dish, not a stock plate", and a momo under
 * "Lunch Thali" would disprove that claim on the same screen.
 */

export interface DinerMenuItem {
    name: string;
    price: string;
    photo: string;
    veg: boolean;
}

export const DINER_MENU: DinerMenuItem[] = [
    { name: 'Ghee Podi Dosa', price: '₹90', photo: '/menu-photos/gobi-manchurian.jpg', veg: true },
    { name: 'Chicken Chettinad', price: '₹260', photo: '/menu-photos/chicken-chettinad.jpg', veg: false },
    { name: 'Fish 65', price: '₹240', photo: '/menu-photos/fish-65.jpg', veg: false },
    { name: 'Rose Milk', price: '₹40', photo: '/menu-photos/rose-milk.jpg', veg: true },
];

/**
 * The offer the homepage demo puts live.
 *
 * `dish` must match a name in DINER_MENU — that is the row the badge and the
 * discounted price attach to.
 */
export const DEMO_OFFER = {
    dish: 'Chicken Chettinad',
    was: '₹260',
    now: '₹220',
    banner: 'Chettinad chicken ₹220 · till 3pm',
} as const;
