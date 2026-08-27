import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/home/Navbar';
import FooterCTA from '@/components/home/FooterCTA';
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

      {/* Hero */}
      <section className="bg-background-light pt-16">
        <div className="max-w-3xl mx-auto px-4 py-14 text-center">
          <p className="text-primary text-xs font-bold uppercase tracking-widest">
            From the vsite Team
          </p>
          <h1 className="text-4xl sm:text-5xl font-extrabold font-display text-slate-900 mt-4">
            Restaurant Tips &amp; Digital Menu Guides
          </h1>
          <p className="text-slate-600 mt-5 text-lg leading-relaxed max-w-2xl mx-auto">
            Practical advice for restaurant owners in South India. Digital menus, customer
            experience, and growing your business.
          </p>
        </div>
      </section>

      {/* Featured post */}
      <section className="bg-white py-12">
        <div className="max-w-3xl mx-auto px-4">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">
            Latest Post
          </p>
          <Link
            href={`/blog/${featured.slug}`}
            className="group block bg-background-light rounded-2xl border border-slate-200 p-7 hover:shadow-md transition-shadow"
          >
            <span
              className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${featured.categoryClass}`}
            >
              {featured.category}
            </span>
            <h2 className="text-2xl font-bold text-slate-900 mt-3 leading-snug group-hover:text-primary transition-colors">
              {featured.title}
            </h2>
            <p className="text-slate-600 mt-2 leading-relaxed">{featured.description}</p>
            <div className="flex items-center gap-3 mt-4 text-sm text-slate-500">
              <span>{formatDate(featured.publishedAt)}</span>
              <span>·</span>
              <span>{featured.readTime} min read</span>
            </div>
          </Link>
        </div>
      </section>

      {/* All posts grid */}
      <section className="bg-background-light py-14">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-xl font-bold text-slate-900 mb-8">All Articles</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {rest.map((post) => (
              <article key={post.slug}>
                <Link
                  href={`/blog/${post.slug}`}
                  className="group block bg-white rounded-2xl border border-slate-200 p-6 h-full hover:shadow-md transition-shadow"
                >
                  <span
                    className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${post.categoryClass}`}
                  >
                    {post.category}
                  </span>
                  <h3 className="font-bold text-slate-900 mt-3 leading-snug group-hover:text-primary transition-colors">
                    {post.title}
                  </h3>
                  <p className="text-sm text-slate-500 mt-2 leading-relaxed line-clamp-2">
                    {post.description}
                  </p>
                  <div className="flex items-center gap-2 mt-4 text-xs text-slate-400">
                    <span>{formatDate(post.publishedAt)}</span>
                    <span>·</span>
                    <span>{post.readTime} min read</span>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <FooterCTA />
    </>
  );
}
