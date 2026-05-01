'use client';

import Link from 'next/link';
import Image from 'next/image';

const productLinks = [
    { label: 'Features', href: '/features' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Book a Demo', href: '/demo' },
    { label: '14-Day Free Trial', href: '/signup' },
    { label: 'Login', href: '/login' },
];

const solutionLinks = [
    { label: 'Restaurant Menu Software', href: '/restaurant-menu-software' },
    { label: 'Café Menu Software', href: '/cafe-menu-software' },
    { label: 'Bakery Menu Software', href: '/bakery-menu-software' },
    { label: 'Cloud Kitchen Software', href: '/cloud-kitchen-software' },
    { label: 'Ice Cream Shop Menu', href: '/ice-cream-shop-menu' },
    { label: 'Sweet Shop Menu', href: '/sweet-shop-menu' },
    { label: 'Bar & Pub Menu', href: '/bar-pub-menu' },
];

const productPagesLinks = [
    { label: 'QR Code Menu', href: '/qr-menu' },
    { label: 'Digital Menu India', href: '/digital-menu-india' },
    { label: 'AI Menu Builder', href: '/ai-menu-builder' },
    { label: 'AI Food Photo Generator', href: '/ai-food-photo-generator' },
    { label: 'Online Menu Maker', href: '/online-menu-maker' },
    { label: 'Contactless Menu', href: '/contactless-menu' },
];

const resourceLinks = [
    { label: 'Blog', href: '/blog' },
    { label: 'Support Centre', href: '/support' },
    { label: 'Contact Us', href: '/contact' },
    { label: 'About vsite', href: '/about' },
];

const legalLinks = [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
];

export default function FooterCTA() {
    return (
        <footer className="bg-[#0e0e2c] pt-20 pb-10 px-4 border-t border-white/5">
            <div className="mx-auto max-w-7xl">
                {/* 6-column grid */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-10 mb-16">
                    {/* Column 1: Brand */}
                    <div className="col-span-2 md:col-span-1">
                        <Link href="/" className="flex items-center gap-2">
                            <Image src="/android-chrome-192x192.png" alt="Vsite icon" width={28} height={28} className="h-7 w-7 rounded-lg" />
                            <span className="text-xl font-extrabold text-white tracking-tight">vsite</span>
                        </Link>
                        <p className="mt-4 text-slate-400 text-sm leading-relaxed">
                            India&apos;s fastest digital menu software. Built for restaurants in Tamil Nadu.
                        </p>
                        <div className="mt-6 flex gap-4">
                            <a href="https://www.instagram.com/vsitein" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-white transition-colors text-sm">Instagram</a>
                            <a href="https://www.linkedin.com/company/vsitein" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-white transition-colors text-sm">LinkedIn</a>
                            <a href="https://wa.me/919360706659" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-white transition-colors text-sm">WhatsApp</a>
                        </div>
                    </div>

                    {/* Column 2: Product */}
                    <div>
                        <h5 className="text-white font-bold mb-5 text-sm uppercase tracking-wider">Product</h5>
                        <ul className="space-y-3">
                            {productLinks.map((item) => (
                                <li key={item.label}>
                                    <Link href={item.href} className="text-slate-400 hover:text-primary transition-colors text-sm">
                                        {item.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Column 3: Solutions (vertical-specific landing pages) */}
                    <div>
                        <h5 className="text-white font-bold mb-5 text-sm uppercase tracking-wider">Solutions</h5>
                        <ul className="space-y-3">
                            {solutionLinks.map((item) => (
                                <li key={item.label}>
                                    <Link href={item.href} className="text-slate-400 hover:text-primary transition-colors text-sm">
                                        {item.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Column 4: Capabilities (cross-vertical product pages) */}
                    <div>
                        <h5 className="text-white font-bold mb-5 text-sm uppercase tracking-wider">Capabilities</h5>
                        <ul className="space-y-3">
                            {productPagesLinks.map((item) => (
                                <li key={item.label}>
                                    <Link href={item.href} className="text-slate-400 hover:text-primary transition-colors text-sm">
                                        {item.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Column 5: Resources */}
                    <div>
                        <h5 className="text-white font-bold mb-5 text-sm uppercase tracking-wider">Resources</h5>
                        <ul className="space-y-3">
                            {resourceLinks.map((item) => (
                                <li key={item.label}>
                                    <Link href={item.href} className="text-slate-400 hover:text-primary transition-colors text-sm">
                                        {item.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Column 6: Language & Contact */}
                    <div>
                        <h5 className="text-white font-bold mb-5 text-sm uppercase tracking-wider">Language &amp; Support</h5>
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-sm">
                                <span className="material-symbols-outlined text-slate-500 text-base">language</span>
                                <div className="flex gap-2 text-slate-400">
                                    <button className="hover:text-white transition-colors">English</button>
                                    <span>·</span>
                                    <button className="hover:text-white transition-colors">Tamil</button>
                                </div>
                            </div>
                            <div className="flex items-start gap-2 text-sm text-slate-400">
                                <span className="material-symbols-outlined text-slate-500 text-base shrink-0">chat</span>
                                <a href="https://wa.me/919360706659" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                                    WhatsApp Us
                                </a>
                            </div>
                            <div className="flex items-start gap-2 text-sm text-slate-400">
                                <span className="material-symbols-outlined text-slate-500 text-base shrink-0">mail</span>
                                <a href="mailto:official@vsite.in" className="hover:text-white transition-colors">
                                    official@vsite.in
                                </a>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom bar */}
                <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-slate-500 text-sm">
                    <p>© 2026 vsite. All rights reserved. Made in Tamil Nadu.</p>
                    <div className="flex gap-6">
                        {legalLinks.map((l) => (
                            <Link key={l.href} href={l.href} className="hover:text-white transition-colors">
                                {l.label}
                            </Link>
                        ))}
                        <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
