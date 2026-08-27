import Image from 'next/image';

/**
 * The diner-facing menu, drawn as real markup rather than a flat screenshot.
 *
 * Two reasons it is not an image: the dish photos are the actual output of the
 * product (proving the "a photo for every dish" claim by showing it), and real
 * markup stays sharp on every DPR without shipping a 3x PNG.
 */

const ITEMS = [
    {
        name: 'Ghee Podi Dosa',
        tamil: null,
        desc: 'Crisp dosa, gunpowder, nallennai',
        price: '₹90',
        veg: true,
        photo: '/menu-photos/gobi-manchurian.jpg',
    },
    {
        name: 'Chicken Chettinad',
        tamil: null,
        desc: 'Pepper, curry leaf, slow-cooked',
        price: '₹260',
        veg: false,
        badge: 'Popular',
        photo: '/menu-photos/chicken-chettinad.jpg',
    },
    {
        name: 'Mutton Biryani',
        tamil: null,
        desc: null,
        price: '₹320',
        veg: false,
        soldOut: true,
        photo: '/menu-photos/mutton-biryani.jpg',
    },
    {
        name: 'Rose Milk',
        tamil: 'ரோஸ் மில்க்',
        desc: null,
        price: '₹40',
        veg: true,
        photo: '/menu-photos/rose-milk.jpg',
    },
];

function VegMark({ veg }: { veg: boolean }) {
    const colour = veg ? '#16A34A' : '#B91C1C';
    return (
        <span
            aria-label={veg ? 'Vegetarian' : 'Non-vegetarian'}
            className="flex h-[11px] w-[11px] shrink-0 items-center justify-center rounded-[2px] border-[1.5px]"
            style={{ borderColor: colour }}
        >
            <span className="h-[5px] w-[5px] rounded-full" style={{ background: colour }} />
        </span>
    );
}

export default function PhoneMenu() {
    return (
        <div data-mock="true" className="relative rounded-[2.5rem] border border-white/10 bg-[#1C1B3E] p-2.5 shadow-2xl shadow-black/50">
            <div className="flex aspect-[9/17] flex-col overflow-hidden rounded-[2rem] bg-paper">
                {/* Header — a real dish photo behind the shop name. */}
                <div className="relative h-[22%] shrink-0">
                    <Image
                        src="/menu-photos/chicken-biryani.jpg"
                        alt=""
                        fill
                        sizes="336px"
                        className="object-cover"
                        priority
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/75">
                            Dine-in menu
                        </p>
                        <p className="text-lg font-bold tracking-tight text-white">Saravana Mess</p>
                    </div>
                </div>

                <div className="flex gap-2 px-4 pb-2 pt-3">
                    <span className="rounded-full bg-ink px-3 py-1.5 text-[11px] font-semibold text-paper">All</span>
                    <span className="rounded-full bg-paper-2 px-3 py-1.5 text-[11px] font-medium text-ink-70">Tiffin</span>
                    <span className="rounded-full bg-paper-2 px-3 py-1.5 text-[11px] font-medium text-ink-70">Biryani</span>
                </div>

                <div className="flex flex-col gap-2 px-4 pb-4">
                    {ITEMS.map((item) => (
                        <div
                            key={item.name}
                            className={`flex items-center gap-3 rounded-2xl border border-line p-2.5 ${item.soldOut ? 'opacity-55' : ''}`}
                        >
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                    {!item.soldOut && <VegMark veg={item.veg} />}
                                    <span className="truncate text-[13px] font-semibold text-ink">{item.name}</span>
                                    {item.badge && (
                                        <span className="shrink-0 rounded bg-amber-100 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-amber-700">
                                            {item.badge}
                                        </span>
                                    )}
                                    {item.soldOut && (
                                        <span className="shrink-0 rounded bg-paper-2 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-ink-70">
                                            Sold out
                                        </span>
                                    )}
                                </div>
                                {item.tamil && <span className="truncate text-[11px] text-ink-45">{item.tamil}</span>}
                                {item.desc && <span className="truncate text-[11px] text-ink-45">{item.desc}</span>}
                                <span className="text-[13px] font-bold text-ink">{item.price}</span>
                            </div>
                            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl">
                                <Image
                                    src={item.photo}
                                    alt={item.name}
                                    fill
                                    sizes="56px"
                                    className={`object-cover ${item.soldOut ? 'grayscale' : ''}`}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
