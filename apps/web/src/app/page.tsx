import type { Metadata } from 'next';
import Navbar from '@/components/home/Navbar';
import HeroSection from '@/components/home/HeroSection';
import TrustBar from '@/components/home/TrustBar';
import CostOfPaper from '@/components/home/CostOfPaper';
import SetupSteps from '@/components/home/SetupSteps';
import DishWall from '@/components/home/DishWall';
import MenuBento from '@/components/home/MenuBento';
import DinerFlow from '@/components/home/DinerFlow';
import Pricing from '@/components/home/Pricing';
import Proof from '@/components/home/Proof';
import FAQ from '@/components/home/FAQ';
import FooterCTA from '@/components/home/FooterCTA';

const BASE_URL = 'https://vsite.in';

// Title format mirrors how high-authority SaaS like Petpooja / Zomato render
// in Google: "Brand: Descriptor" — the colon makes Google treat the brand as
// the entity name and use the descriptor as the SERP title proper.
const TITLE = "Vsite: India's Fastest-Growing Digital Menu Software for Restaurants";
const DESCRIPTION =
  "India's fastest-growing digital menu software. AI-powered QR menus that update in real time — live in 3 minutes. Built for India's F&B SMBs — restaurants, cafés, bakeries, cloud kitchens, sweet shops, bars. ₹299/mo, no commission. Free 7-day trial.";

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
    "India's fastest-growing digital menu software — AI-powered QR menus for India's food and beverage SMBs: restaurants, cafés, bakeries, cloud kitchens, sweet shops, bars. Live in 3 minutes.",
  offers: {
    '@type': 'Offer',
    price: '299',
    priceCurrency: 'INR',
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price: '299',
      priceCurrency: 'INR',
      unitText: 'MONTH',
    },
  },
  featureList: [
    'AI menu creation from a photo of your existing menu',
    'Handwritten menu recognition',
    'AI-generated food photography for every dish',
    'QR code menu',
    'Real-time menu and price updates',
    'Sold-out control',
    'Offers and banners',
    'Tamil and English menu names',
    'NFC card and QR stickers included',
  ],
};

const localBusinessSchema = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: 'Vsite',
  url: BASE_URL,
  email: 'official@vsite.in',
  description:
    'AI-powered digital menu platform for F&B SMBs in India. Live in 3 minutes.',
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
      <main className="min-h-screen bg-paper font-display text-ink antialiased selection:bg-primary/20 selection:text-accent-text">
        <Navbar overDark />
        <HeroSection />
        <TrustBar />
        <CostOfPaper />
        <SetupSteps />
        <DishWall />
        <MenuBento />
        <DinerFlow />
        <Pricing />
        <Proof />
        <FAQ />
        <FooterCTA />
      </main>
    </>
  );
}
