import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/home/Navbar';
import FooterCTA from '@/components/home/FooterCTA';

const BASE_URL = 'https://vsite.in';
const TITLE = "Features — India's Fastest-Growing Digital Menu Software | vsite";
const DESCRIPTION =
    "Explore every feature of vsite — India's fastest-growing digital menu software. AI menu builder, QR code menu, UPI payment, real-time updates, Tamil support, and more.";

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${BASE_URL}/features` },
    openGraph: {
        title: TITLE,
        description: DESCRIPTION,
        url: `${BASE_URL}/features`,
        type: 'website',
    },
};

type FeatureGroup = {
    title: string;
    icon: string;
    items: { title: string; description: string }[];
};

const featureGroups: FeatureGroup[] = [
    {
        title: 'Menu Setup',
        icon: 'restaurant_menu',
        items: [
            { title: 'AI Menu Extraction', description: 'Upload a photo of your paper menu — the AI reads every item, price, and category, including Tamil text.' },
            { title: 'AI Food Photos', description: 'Every dish is matched with a professional food photo automatically. No photographer, no shoot.' },
            { title: '3-Minute Setup', description: 'From signup to a live QR code — under 3 minutes end to end.' },
            { title: 'Tamil + English Menus', description: 'One-tap toggle between Tamil and English. Unique to vsite in India.' },
        ],
    },
    {
        title: 'Customer Experience',
        icon: 'smartphone',
        items: [
            { title: 'QR Code Menu', description: 'Unique QR code per table. Customers scan, menu opens in 2 seconds — no app needed.' },
            { title: 'NFC Tap-to-Open', description: 'Physical NFC card shipped to you. Customers tap phone to the card to open the menu.' },
            { title: 'Mobile-First Design', description: 'Menus are designed for phones first. Works on every Android and iPhone, even basic 4G.' },
            { title: 'Multi-Language Toggle', description: 'Customers switch between English and Tamil with one tap during their order.' },
        ],
    },
    {
        title: 'Menu Management',
        icon: 'edit_note',
        items: [
            { title: 'Real-Time Updates', description: 'Change prices, edit dish names, add daily specials. All updates live instantly.' },
            { title: 'Out-of-Stock Toggle', description: 'Mark items unavailable with one click. Customers cannot order them.' },
            { title: 'Category Management', description: 'Organise your menu into categories — Breakfast, Lunch, Beverages, etc. Drag to reorder.' },
            { title: 'Photo Swap', description: 'Prefer a different image? Swap any AI-generated photo in the dashboard.' },
        ],
    },
    {
        title: 'Orders & Payments',
        icon: 'receipt_long',
        items: [
            { title: 'Table Ordering', description: 'Customers order directly from their phone. Orders tagged with table number.' },
            { title: 'UPI Payment at Table', description: 'Customers pay via PhonePe, GPay, or Paytm. Money to your account, zero commission.' },
            { title: 'Live Kitchen Dashboard', description: 'See orders in real time on any phone or tablet behind the counter.' },
            { title: 'Order Status Flow', description: 'Move orders from Preparing → Ready → Completed with a tap.' },
        ],
    },
    {
        title: 'Growth & Analytics',
        icon: 'insights',
        items: [
            { title: 'Item View Analytics', description: 'See which dishes customers look at most. Optimise your bestsellers.' },
            { title: 'Order Reports', description: 'Track total orders, revenue, and peak hours. Export or review in the dashboard.' },
            { title: 'Multiple Stores', description: 'Run multiple outlets from one login. Switch between stores in seconds.' },
            { title: 'Branded Shop Page', description: 'Your restaurant gets a public page at vsite.in/shop/your-name — indexable by Google.' },
        ],
    },
    {
        title: 'Business & Support',
        icon: 'support_agent',
        items: [
            { title: 'WhatsApp Support', description: 'Real humans respond within 2 hours on business days. No chatbots, no ticket queues.' },
            { title: 'Zero Commission', description: 'Unlike Zomato or Swiggy, you keep 100% of every order. No per-order fees ever.' },
            { title: 'No POS Hardware', description: 'No card machines, no billing terminals. Works from any phone or tablet.' },
            { title: '14-Day Free Trial', description: 'Try every feature for 14 days — no credit card required.' },
        ],
    },
];

const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'vsite',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: DESCRIPTION,
    offers: {
        '@type': 'Offer',
        price: '399',
        priceCurrency: 'INR',
    },
    url: `${BASE_URL}/features`,
};

export default function FeaturesPage() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <Navbar />

            {/* Hero */}
            <section className="bg-gradient-to-br from-violet-50 via-purple-50 to-slate-50 pt-24 pb-14">
                <div className="max-w-3xl mx-auto px-4 text-center">
                    <p className="text-primary text-xs font-bold uppercase tracking-widest">Features</p>
                    <h1 className="text-4xl sm:text-5xl font-extrabold font-display text-slate-900 mt-4 leading-tight">
                        Everything vsite Does
                    </h1>
                    <p className="text-slate-600 mt-5 text-lg leading-relaxed">
                        Built for Indian restaurants. Priced for Indian restaurants. A complete digital menu,
                        ordering, and payment platform at ₹299/month.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center mt-7">
                        <Link
                            href="/signup"
                            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-7 py-3 text-sm font-bold text-white shadow-md shadow-primary/25 hover:bg-primary-dark transition-colors"
                        >
                            Start Free Trial
                            <span className="material-symbols-outlined text-base">arrow_forward</span>
                        </Link>
                        <Link
                            href="/demo"
                            className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-7 py-3 text-sm font-bold text-slate-800 hover:border-slate-400 transition-colors"
                        >
                            Book a Demo
                        </Link>
                    </div>
                </div>
            </section>

            {/* Feature groups */}
            <section className="bg-white py-16">
                <div className="max-w-5xl mx-auto px-4 space-y-12">
                    {featureGroups.map((group) => (
                        <div key={group.title}>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-primary">{group.icon}</span>
                                </div>
                                <h2 className="text-xl font-bold text-slate-900">{group.title}</h2>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {group.items.map((item) => (
                                    <div
                                        key={item.title}
                                        className="rounded-2xl border border-slate-200 p-5 bg-white hover:shadow-md transition-shadow"
                                    >
                                        <h3 className="font-semibold text-slate-900 text-sm">{item.title}</h3>
                                        <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{item.description}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Internal link cluster */}
            <section className="bg-background-light py-14">
                <div className="max-w-3xl mx-auto px-4 text-center">
                    <h2 className="text-xl font-bold text-slate-900 mb-5">Explore More</h2>
                    <div className="flex flex-wrap gap-2 justify-center">
                        {[
                            { label: 'QR Code Menu', href: '/qr-menu' },
                            { label: 'Digital Menu India', href: '/digital-menu-india' },
                            { label: 'AI Menu Builder', href: '/ai-menu-builder' },
                            { label: 'Restaurant Menu Software', href: '/restaurant-menu-software' },
                            { label: 'Pricing', href: '/pricing' },
                            { label: 'Blog', href: '/blog' },
                            { label: 'Support', href: '/support' },
                            { label: 'Book a Demo', href: '/demo' },
                        ].map((l) => (
                            <Link
                                key={l.href}
                                href={l.href}
                                className="text-sm bg-white border border-slate-200 hover:bg-primary/5 hover:border-primary/30 text-slate-700 px-4 py-2 rounded-full transition-colors"
                            >
                                {l.label}
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            <FooterCTA />
        </>
    );
}
