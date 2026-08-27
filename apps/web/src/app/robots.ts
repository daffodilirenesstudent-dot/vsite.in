import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: ['/manage/', '/api/', '/onboarding/'],
            },
        ],
        sitemap: 'https://vsite.in/sitemap.xml',
    };
}
