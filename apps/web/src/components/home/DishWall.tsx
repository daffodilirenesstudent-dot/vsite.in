'use client';

import Image from 'next/image';
import Reveal from './Reveal';

/**
 * Proof by demonstration for the hardest claim on the page: that the AI makes
 * a usable photo for every dish.
 *
 * Two rows moving in opposite directions. The counter-motion is doing real
 * work — a single row reads as one decorative strip you scroll past, where
 * two opposed rows read as volume, i.e. "it can do this for anything I sell".
 * Different speeds stop the eye locking onto a single tile. Two is the right
 * number at both widths: a third adds height without adding evidence.
 *
 * Copy here is deliberately the plainest on the page. The reader is a shop
 * owner, not a marketer: short sentences, no jargon, no percentages.
 */

type Dish = { src: string; name: string };

const ROW_A: Dish[] = [
    { src: '/menu-photos/chicken-biryani.jpg', name: 'Chicken Biryani' },
    { src: '/menu-photos/paneer-butter-masala.jpg', name: 'Paneer Butter Masala' },
    { src: '/menu-photos/fish-65.jpg', name: 'Fish 65' },
    { src: '/menu-photos/chicken-chettinad.jpg', name: 'Chicken Chettinad' },
    { src: '/menu-photos/veg-fried-rice.jpg', name: 'Veg Fried Rice' },
    { src: '/menu-photos/chicken-lollipop.jpg', name: 'Chicken Lollipop' },
    { src: '/menu-photos/french-fries.jpg', name: 'French Fries' },
    { src: '/menu-photos/mango-mocktail.jpg', name: 'Mango Mocktail' },
];

const ROW_B: Dish[] = [
    { src: '/menu-photos/gobi-manchurian.jpg', name: 'Gobi Manchurian' },
    { src: '/menu-photos/mutton-biryani.jpg', name: 'Mutton Biryani' },
    { src: '/menu-photos/grilled-chicken.jpg', name: 'Grilled Chicken' },
    { src: '/menu-photos/veg-momos.jpg', name: 'Veg Momos' },
    { src: '/menu-photos/malai-chicken-tikka.jpg', name: 'Malai Chicken Tikka' },
    { src: '/menu-photos/veg-kofta-curry.jpg', name: 'Veg Kofta Curry' },
    { src: '/menu-photos/chicken-sandwich.jpg', name: 'Chicken Sandwich' },
    { src: '/menu-photos/rose-milk.jpg', name: 'Rose Milk' },
];

function Row({
    dishes,
    reverse,
    duration,
    labelled,
}: {
    dishes: Dish[];
    reverse?: boolean;
    duration: string;
    labelled?: boolean;
}) {
    // The track is duplicated in markup and translated -50%, so the loop is
    // seamless with no JS. Only the first copy is exposed to screen readers.
    const tiles = (hidden: boolean) =>
        dishes.map((d) => (
            <figure
                key={`${d.name}-${hidden ? 'b' : 'a'}`}
                className="relative mr-3 h-28 w-44 shrink-0 overflow-hidden rounded-card sm:h-36 sm:w-56"
                aria-hidden={hidden || undefined}
            >
                <Image
                    src={d.src}
                    alt={hidden ? '' : `${d.name} — photo made by vsite`}
                    fill
                    sizes="(max-width: 640px) 176px, 224px"
                    className="object-cover"
                    loading="lazy"
                />
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2.5 pb-1.5 pt-6 text-[11px] font-medium text-white">
                    {d.name}
                </figcaption>
            </figure>
        ));

    return (
        <div className="marquee relative" role={labelled ? 'group' : undefined} aria-label={labelled ? 'Dish photos made by vsite' : undefined}>
            <div
                className="marquee-track"
                data-direction={reverse ? 'reverse' : undefined}
                style={{ '--marquee-duration': duration } as React.CSSProperties}
            >
                {tiles(false)}
                {tiles(true)}
            </div>
        </div>
    );
}

export default function DishWall() {
    return (
        <section className="overflow-hidden bg-paper py-section lg:py-section-lg">
            <Reveal className="mx-auto max-w-3xl px-5 text-center">
                <p className="text-caption font-semibold uppercase tracking-[0.1em] text-ink-45">
                    The photos
                </p>
                <h2 className="mt-5 font-display text-h2 font-bold text-ink">
                    You don’t need a food photographer.
                </h2>
                <p className="mx-auto mt-5 max-w-lg text-body text-ink-70">
                    Type the name of the dish. The photo appears. Every picture below was made that way —
                    nobody cooked anything twice for a camera. Don’t like one? Put your own photo instead.
                </p>
            </Reveal>

            {/* Three rows, opposed. */}
            <div data-mock="true" className="relative mt-9 flex flex-col gap-3 sm:mt-11">
                <Row dishes={ROW_A} duration="62s" labelled />
                <Row dishes={ROW_B} duration="78s" reverse />

                {/* Edge fades so the wall reads as continuous rather than cut off. */}
                <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-14 bg-gradient-to-r from-paper to-transparent sm:w-32" />
                <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-14 bg-gradient-to-l from-paper to-transparent sm:w-32" />
            </div>
        </section>
    );
}
