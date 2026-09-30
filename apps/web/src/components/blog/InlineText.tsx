import Link from 'next/link';
import { parseInline } from '@/lib/seo/blog';

const LINK_CLASS = 'font-medium text-accent-text underline underline-offset-2 hover:text-primary';

/**
 * Renders blog text with `[label](/path)` links. Everything is a React node,
 * so author text can never inject markup.
 */
export function InlineText({ text }: { text: string }) {
    return (
        <>
            {parseInline(text).map((part, i) => {
                if (part.type === 'text') return part.text;
                if (part.external) {
                    return (
                        <a key={i} href={part.href} rel="noopener" target="_blank" className={LINK_CLASS}>
                            {part.text}
                        </a>
                    );
                }
                return (
                    <Link key={i} href={part.href} className={LINK_CLASS}>
                        {part.text}
                    </Link>
                );
            })}
        </>
    );
}

export default InlineText;
