export type ContentBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'callout'; text: string }
  | { type: 'faq'; q: string; a: string }
  | { type: 'image'; src: string; alt: string; caption?: string };

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  category: string;
  categoryClass: string;
  tags: string[];
  publishedAt: string;   // ISO date string e.g. "2026-04-28"
  updatedAt: string;
  author: string;
  authorTitle: string;
  readTime: number;      // minutes
  content: ContentBlock[];
  faqSchema?: { q: string; a: string }[];
};
