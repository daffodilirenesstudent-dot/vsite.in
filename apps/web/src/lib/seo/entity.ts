/**
 * The one Organization entity every schema block points at.
 *
 * Defined ONCE (root layout emits `organizationSchema()`); everything else
 * references it with `orgRef()`. Two full Organization blocks with different
 * sameAs lists is how a knowledge graph splits one brand into two entities.
 *
 * No imports on purpose: the footer (a client component) imports the social
 * URLs from here, so this file must stay client-safe.
 */

export const SITE_ORIGIN = 'https://vsite.in';
export const ORG_ID = `${SITE_ORIGIN}/#org`;

/** The footer links to this account; schema must say the same. */
export const INSTAGRAM_URL = 'https://www.instagram.com/vsite.in';
export const LINKEDIN_URL = 'https://www.linkedin.com/company/vsitein';
export const SAME_AS: string[] = [LINKEDIN_URL, INSTAGRAM_URL];

export function orgRef(): { '@id': string } {
    return { '@id': ORG_ID };
}

export function organizationSchema() {
    return {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        '@id': ORG_ID,
        name: 'vsite',
        alternateName: ['Vsite', 'vsite.in'],
        legalName: 'vsite',
        url: SITE_ORIGIN,
        logo: `${SITE_ORIGIN}/logo.png`,
        description:
            "AI-powered digital menu platform for India's food and beverage SMBs: restaurants, cafés, bakeries, cloud kitchens and more.",
        areaServed: [
            { '@type': 'State', name: 'Tamil Nadu' },
            { '@type': 'City', name: 'Chennai' },
            { '@type': 'City', name: 'Coimbatore' },
            { '@type': 'City', name: 'Madurai' },
            { '@type': 'City', name: 'Salem' },
            { '@type': 'City', name: 'Trichy' },
        ],
        foundingLocation: { '@type': 'Place', name: 'Tamil Nadu, India' },
        knowsLanguage: ['en', 'ta'],
        contactPoint: {
            '@type': 'ContactPoint',
            contactType: 'customer support',
            email: 'official@vsite.in',
            availableLanguage: ['English', 'Tamil'],
        },
        sameAs: SAME_AS,
    };
}
