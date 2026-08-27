import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import Navbar from '@/components/home/Navbar';
import FooterCTA from '@/components/home/FooterCTA';
import { blogPosts, getPostBySlug, getAllSlugs } from '@/content/blog/posts';
import type { ContentBlock, BlogPost } from '@/content/blog/types';

const BASE_URL = 'https://vsite.in';

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};

  const url = `${BASE_URL}/blog/${post.slug}`;
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      title: post.title,
      description: post.description,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: [post.author],
      tags: post.tags,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
    },
  };
}

function renderBlock(block: ContentBlock, idx: number) {
  switch (block.type) {
    case 'p':
      return (
        <p key={idx} className="text-slate-700 leading-relaxed">
          {block.text}
        </p>
      );
    case 'h2':
      return (
        <h2 key={idx} className="text-2xl font-bold text-slate-900 mt-10 mb-3">
          {block.text}
        </h2>
      );
    case 'h3':
      return (
        <h3 key={idx} className="text-lg font-semibold text-slate-900 mt-6 mb-2">
          {block.text}
        </h3>
      );
    case 'ul':
      return (
        <ul key={idx} className="list-disc list-inside space-y-1.5 text-slate-700">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol key={idx} className="list-decimal list-inside space-y-1.5 text-slate-700">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      );
    case 'table':
      return (
        <div key={idx} className="overflow-x-auto my-2">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100">
                {block.headers.map((h, i) => (
                  <th key={i} className="text-left px-3 py-2 font-semibold text-slate-800 border border-slate-200">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2 text-slate-700 border border-slate-200">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'callout':
      return (
        <div key={idx} className="bg-primary/8 border-l-4 border-primary rounded-r-xl px-5 py-4 my-2">
          <p className="text-primary font-semibold text-sm leading-relaxed">{block.text}</p>
        </div>
      );
    case 'faq':
      return (
        <div key={idx} className="border border-slate-200 rounded-xl p-5 my-2">
          <p className="font-semibold text-slate-900">{block.q}</p>
          <p className="text-slate-600 mt-2 text-sm leading-relaxed">{block.a}</p>
        </div>
      );
    case 'image':
      return (
        <figure key={idx} className="my-6">
          <div className="relative w-full rounded-xl overflow-hidden border border-slate-200 shadow-sm aspect-[16/9]">
            <Image src={block.src} alt={block.alt} fill className="object-contain object-center bg-slate-50" />
          </div>
          {block.caption && (
            <figcaption className="text-center text-xs text-slate-400 mt-2">{block.caption}</figcaption>
          )}
        </figure>
      );
    default:
      return null;
  }
}

function buildArticleSchema(post: BlogPost) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: {
      '@type': 'Organization',
      name: post.author,
      url: BASE_URL,
    },
    publisher: {
      '@type': 'Organization',
      name: 'vsite',
      url: BASE_URL,
      logo: { '@type': 'ImageObject', url: `${BASE_URL}/logo.png` },
    },
    url: `${BASE_URL}/blog/${post.slug}`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${BASE_URL}/blog/${post.slug}` },
    keywords: post.tags.join(', '),
  };
}

function buildFaqSchema(post: BlogPost) {
  if (!post.faqSchema?.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: post.faqSchema.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

function buildBreadcrumbSchema(post: BlogPost) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${BASE_URL}/blog` },
      { '@type': 'ListItem', position: 3, name: post.title, item: `${BASE_URL}/blog/${post.slug}` },
    ],
  };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const faqSchema = buildFaqSchema(post);
  const relatedPosts = blogPosts.filter((p) => p.slug !== post.slug).slice(0, 3);

  return (
    <>
      <Navbar />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildArticleSchema(post)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildBreadcrumbSchema(post)) }}
      />
      {faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}

      {/* Hero */}
      <section className="bg-background-light pt-16">
        <div className="max-w-3xl mx-auto px-4 pt-12 pb-8">
          {/* Breadcrumb */}
          <nav className="text-xs text-slate-500 mb-6 flex items-center gap-1.5">
            <Link href="/" className="hover:text-primary">Home</Link>
            <span>/</span>
            <Link href="/blog" className="hover:text-primary">Blog</Link>
            <span>/</span>
            <span className="text-slate-400 truncate">{post.title}</span>
          </nav>

          {/* Category badge */}
          <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${post.categoryClass}`}>
            {post.category}
          </span>

          <h1 className="text-3xl sm:text-4xl font-extrabold font-display text-slate-900 mt-4 leading-tight">
            {post.title}
          </h1>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-3 mt-5 text-sm text-slate-500">
            <span className="font-medium text-slate-700">{post.author}</span>
            <span>·</span>
            <time dateTime={post.publishedAt}>
              {formatDate(post.publishedAt)}
            </time>
            {post.updatedAt !== post.publishedAt && (
              <>
                <span>·</span>
                <span>Updated {formatDate(post.updatedAt)}</span>
              </>
            )}
            <span>·</span>
            <span>{post.readTime} min read</span>
          </div>

          <p className="text-slate-500 text-xs mt-1 italic">{post.authorTitle}</p>
        </div>
      </section>

      {/* Article body */}
      <article className="bg-white py-12">
        <div className="max-w-3xl mx-auto px-4 space-y-5">
          {post.content.map((block, idx) => renderBlock(block, idx))}
        </div>
      </article>

      {/* Tags */}
      {post.tags.length > 0 && (
        <section className="bg-white pb-8">
          <div className="max-w-3xl mx-auto px-4">
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs bg-slate-100 text-slate-600 px-3 py-1 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Related posts */}
      {relatedPosts.length > 0 && (
        <section className="bg-background-light py-14">
          <div className="max-w-3xl mx-auto px-4">
            <h2 className="text-xl font-bold text-slate-900 mb-6">More from the vsite Blog</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {relatedPosts.map((related) => (
                <Link
                  key={related.slug}
                  href={`/blog/${related.slug}`}
                  className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition-shadow group"
                >
                  <span
                    className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${related.categoryClass}`}
                  >
                    {related.category}
                  </span>
                  <h3 className="font-bold text-slate-900 text-sm mt-2 leading-snug group-hover:text-primary transition-colors">
                    {related.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">{related.readTime} min read</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <FooterCTA />
    </>
  );
}
