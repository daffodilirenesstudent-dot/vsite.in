import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Private or throwaway surface: keep it out of search results. Not disallowed
// in robots.txt, because a crawler that cannot fetch the page never sees this.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function NoIndexLayout({ children }: { children: ReactNode }) {
  return children;
}
