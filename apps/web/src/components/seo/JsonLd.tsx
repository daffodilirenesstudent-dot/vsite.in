import { serializeJsonLd } from '@/lib/seo/jsonld';

/** One JSON-LD block. Works in server and client components. */
export default function JsonLd({ data }: { data: unknown }) {
    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
        />
    );
}
