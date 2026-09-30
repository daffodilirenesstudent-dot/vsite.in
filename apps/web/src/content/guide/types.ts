/** One numbered step. `time` is an estimate, worded "about" / "typically" by the author. */
export interface GuideStep {
    name: string;
    text: string;
    time: string;
}

export interface GuideFaq {
    q: string;
    a: string;
}

export interface GuideLink {
    label: string;
    href: string;
}

/** A titled block after the steps: bullets, or a two-column table (cost, fields). */
export interface GuideSection {
    heading: string;
    /** Short paragraph above the list or table. */
    intro?: string;
    bullets?: string[];
    /** Label / value rows, rendered as a definition table. */
    rows?: [string, string][];
}

/** Everything a reader (or an AI agent) gets for one language of one page. */
export interface GuideCopy {
    /** The question people ask. Always ends in a question mark. */
    h1: string;
    /** 40-60 words in English. The first thing on the page, the thing engines quote. */
    answer: string;
    needs: string[];
    steps: GuideStep[];
    sections: GuideSection[];
    faqs: GuideFaq[];
    links: GuideLink[];
}

export type GuideSlug =
    | 'digital-menu-setup'
    | 'sign-up'
    | 'add-menu'
    | 'menu-design'
    | 'banners'
    | 'configuration'
    | 'qr-code'
    | 'cost-and-time';

export type GuideLang = 'en' | 'ta';

export interface GuidePage {
    slug: GuideSlug;
    /** <title> (the root layout adds the brand suffix). */
    title: string;
    description: string;
    /** Short label for prev/next and the hub list. */
    short: string;
    /** Upper bound of the page's own HowTo, in minutes, for ISO-8601 totalTime. */
    totalMinutes: number;
    en: GuideCopy;
    /** Tamil copy. Needs a native-speaker review before it is promoted. */
    ta?: GuideCopy;
}
