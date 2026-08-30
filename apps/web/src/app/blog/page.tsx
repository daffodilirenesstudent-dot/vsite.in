import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import Navbar from '@/components/home/Navbar';
import FooterCTA from '@/components/home/FooterCTA';
import Reveal from '@/components/home/Reveal';
import { blogPosts } from '@/content/blog/posts';

export const metadata: Metadata = {
  title: 'vsite Blog — Restaurant Tips & Digital Menu Guides',
  description:
    'Practical guides, tips, and insights for restaurant owners in Tamil Nadu. Learn how to grow your restaurant with digital tools.',
  alternates: {
    canonical: 'https://vsite.in/blog',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Blog',
  name: 'vsite Blog',
  url: 'https://vsite.in/blog',
  description: 'Practical guides and tips for restaurant owners in Tamil Nadu on digital menus and restaurant technology.',
  publisher: {
    '@type': 'Organization',
    name: 'vsite',
    url: 'https://vsite.in',
  },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function BlogPage() {
  const [featured, ...rest] = blogPosts;

  return (
    <>
      <Navbar />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero.
          pt-32 clears the 4.5rem fixed bar — this hero opened at pt-16 and
          tucked its eyebrow underneath it. */}
      <section className="border-b border-line bg-paper-2 px-5 pt-32 pb-section lg:pb-section-lg">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-caption font-semibold uppercase tracking-[0.1em] text-ink-45">
            From the vsite team
          </p>
          <h1 className="mt-5 font-display text-h2 font-bold text-ink">
            Notes for people who run the place.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-body text-ink-70">
            Written for owners in South India — digital menus, what customers actually do at
            the table, and the small things that grow a shop.
          </p>
        </div>
      </section>

      {/* Latest post.
          The newest piece gets the full width and the only arrow on the page,
          so "what should I read" is answered before the grid starts. */}
      <section className="bg-paper px-5 py-section lg:py-section-lg">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <p className="text-caption font-semibold uppercase tracking-[0.1em] text-ink-45">
              Latest
            </p>
          </Reveal>

          <Reveal delay={90}>
            <Link
              href={`/blog/${featured.slug}`}
              className="lift group mt-6 block rounded-3xl border border-line bg-paper-2 p-7 transition-colors hover:border-primary/30 sm:p-8"
            >
              <span
                className={`inline-block rounded-full px-2.5 py-1 text-caption font-semibold ring-1 ring-inset ring-ink/[0.07] ${featured.categoryClass}`}
              >
                {featured.category}
              </span>
              <h2 className="mt-4 font-display text-h3 font-bold leading-snug text-ink transition-colors group-hover:text-accent-text">
                {featured.title}
              </h2>
              <p className="mt-3 text-body leading-relaxed text-ink-70">{featured.description}</p>
              <div className="mt-5 flex items-center gap-2.5 text-caption text-ink-45">
                <span>{formatDate(featured.publishedAt)}</span>
                <span aria-hidden>·</span>
                <span>{featured.readTime} min read</span>
                <ArrowRight
                  className="cta-arrow ml-auto h-5 w-5 text-primary"
                  strokeWidth={2.2}
                  aria-hidden
                />
              </div>
            </Link>
          </Reveal>
        </div>
      </section>

      {/* All posts grid */}
      <section className="bg-paper-2 px-5 py-section lg:py-section-lg">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="font-display text-h3 font-bold text-ink">Everything else</h2>
          </Reveal>

          <Reveal stagger={70} className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {rest.map((post) => (
              <article key={post.slug} data-reveal="up" className="h-full">
                <Link
                  href={`/blog/${post.slug}`}
                  className="lift group flex h-full flex-col rounded-2xl border border-line bg-paper p-6 transition-colors hover:border-primary/30"
                >
                  <span
                    className={`inline-block w-fit rounded-full px-2.5 py-1 text-caption font-semibold ring-1 ring-inset ring-ink/[0.07] ${post.categoryClass}`}
                  >
                    {post.category}
                  </span>
                  <h3 className="mt-3.5 font-semibold leading-snug text-ink transition-colors group-hover:text-accent-text">
                    {post.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 flex-1 text-caption leading-relaxed text-ink-70">
                    {post.description}
                  </p>
                  <div className="mt-5 flex items-center gap-2 text-caption text-ink-45">
                    <span>{formatDate(post.publishedAt)}</span>
                    <span aria-hidden>·</span>
                    <span>{post.readTime} min read</span>
                  </div>
                </Link>
              </article>
            ))}
          </Reveal>
        </div>
      </section>

      <FooterCTA />
    </>
  );
}
