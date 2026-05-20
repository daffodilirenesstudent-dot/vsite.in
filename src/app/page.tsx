import type { Metadata } from 'next';
import Navbar from '@/components/home/Navbar';
import HeroSection from '@/components/home/HeroSection';
import CategoryStrip from '@/components/home/CategoryStrip';
import PainSection from '@/components/home/PainSection';
import ProductCards from '@/components/home/ProductCards';
import SetupSteps from '@/components/home/SetupSteps';
import CustomerExperience from '@/components/home/CustomerExperience';
import LossAversion from '@/components/home/LossAversion';
import Pricing from '@/components/home/Pricing';
import SocialProof from '@/components/home/SocialProof';
import FAQ from '@/components/home/FAQ';
import FooterCTA from '@/components/home/FooterCTA';

const BASE_URL = 'https://vsite.in';

// Title format mirrors how high-authority SaaS like Petpooja / Zomato render
// in Google: "Brand: Descriptor" — the colon makes Google treat the brand as
// the entity name and use the descriptor as the SERP title proper.
const TITLE = 'Vsite: Digital Menu Software for Restaurants & F&B in India';
const DESCRIPTION =
  'Vsite simplifies restaurant menu management with AI-powered QR menus, real-time updates, and UPI ordering. Built for India\'s F&B SMBs — restaurants, cafés, bakeries, cloud kitchens, sweet shops, bars. ₹399/mo, no commission. Free 14-day trial.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: BASE_URL,
  },
  openGraph: {
    url: BASE_URL,
    title: TITLE,
    description: DESCRIPTION,
  },
};

const softwareSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Vsite',
  alternateName: 'vsite',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: BASE_URL,
  description:
    'AI-powered digital menu and QR ordering platform for India\'s food and beverage SMBs — restaurants, cafés, bakeries, cloud kitchens, ice cream parlours, sweet shops, bars. Live in 3 minutes.',
  offers: {
    '@type': 'Offer',
    price: '399',
    priceCurrency: 'INR',
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price: '399',
      priceCurrency: 'INR',
      unitText: 'MONTH',
    },
  },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.8',
    reviewCount: '124',
  },
  featureList: [
    'AI menu creation from photo',
    'QR code menu',
    'Real-time menu updates',
    'UPI payment integration',
    'Tamil language support',
    'NFC card included',
    'Built for cafés, bakeries, cloud kitchens, sweet shops, bars and more',
  ],
};

const localBusinessSchema = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: 'Vsite',
  url: BASE_URL,
  email: 'official@vsite.in',
  description:
    'AI-powered digital menu and QR ordering platform for F&B SMBs in India. Live in 3 minutes.',
  areaServed: [
    { '@type': 'City', name: 'Chennai' },
    { '@type': 'City', name: 'Coimbatore' },
    { '@type': 'City', name: 'Madurai' },
    { '@type': 'City', name: 'Salem' },
    { '@type': 'City', name: 'Trichy' },
    { '@type': 'State', name: 'Tamil Nadu' },
  ],
  serviceType: 'Digital Menu Software',
  priceRange: '₹₹',
};

// Surfacing solutions and key informational pages in a SiteNavigationElement
// schema — gives Google an explicit map of the sitelink-eligible pages.
const siteNavigationSchema = {
  '@context': 'https://schema.org',
  '@type': 'SiteNavigationElement',
  name: [
    'Features', 'Pricing', 'Demo',
    'Restaurant Menu Software', 'Café Menu Software', 'Bakery Menu Software',
    'Cloud Kitchen Software', 'Ice Cream Shop Menu', 'Sweet Shop Menu',
    'Bar & Pub Menu', 'QR Code Menu', 'AI Menu Builder',
    'AI Food Photo Generator', 'Contactless Menu', 'Online Menu Maker',
    'Digital Menu India', 'Blog', 'Support',
  ],
  url: [
    `${BASE_URL}/features`, `${BASE_URL}/pricing`, `${BASE_URL}/demo`,
    `${BASE_URL}/restaurant-menu-software`, `${BASE_URL}/cafe-menu-software`, `${BASE_URL}/bakery-menu-software`,
    `${BASE_URL}/cloud-kitchen-software`, `${BASE_URL}/ice-cream-shop-menu`, `${BASE_URL}/sweet-shop-menu`,
    `${BASE_URL}/bar-pub-menu`, `${BASE_URL}/qr-menu`, `${BASE_URL}/ai-menu-builder`,
    `${BASE_URL}/ai-food-photo-generator`, `${BASE_URL}/contactless-menu`, `${BASE_URL}/online-menu-maker`,
    `${BASE_URL}/digital-menu-india`, `${BASE_URL}/blog`, `${BASE_URL}/support`,
  ],
};

// Note: WebSite + Organization schemas live in src/app/layout.tsx so every
// page emits them once. Duplicating them here splits Google's site-name
// signal and was causing 'vsite.in' to be picked over 'Vsite' in SERPs.

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteNavigationSchema) }}
      />
      <main className="min-h-screen font-display bg-white text-slate-900 antialiased selection:bg-primary/20 selection:text-primary">
        <Navbar />
        <HeroSection />
        <CategoryStrip />
        <ProductCards />
        <PainSection />
        <SetupSteps />
        <CustomerExperience />
        <LossAversion />
        <Pricing />
        <SocialProof />
        <FAQ />
        <FooterCTA />
      </main>
    </>
  );
}
