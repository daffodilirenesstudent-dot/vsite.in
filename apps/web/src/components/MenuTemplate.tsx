'use client';

import React from 'react';
import Image from "next/image";
import { Shop, Product } from '@/lib/supabase';

// ─── Colour palette (Biryani Palace design system) ───────────────────────────
const bg         = '#fef6e7';
const primary    = '#aa2c27';
const primaryCon = '#ff766b';
const onPrimary  = '#ffefed';
const onSurface  = '#322e25';
const onSurfaceV = '#605b50';
const surfaceLow = '#ffffff';
const secFixed   = '#ffc787';
const onSecFixed = '#4c2d00';
const tertCon    = '#abf8a3';
const onTertCon  = '#16601e';
const outlineV   = '#b3ac9f';

// ─── Font helpers ─────────────────────────────────────────────────────────────
const headline: React.CSSProperties = { fontFamily: "'Epilogue', sans-serif" };
const body:     React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

// ─── Sub-components ───────────────────────────────────────────────────────────

function FeaturedCard({ product }: { product: Product }) {
    return (
        <article
            style={{
                flexShrink: 0,
                width: 'min(85vw, 440px)',
                backgroundColor: surfaceLow,
                borderRadius: '0.75rem',
                overflow: 'hidden',
                boxShadow: '0px 24px 48px rgba(50,46,37,0.04)',
                display: 'flex',
                flexDirection: 'column',
            }}
            className="md:flex-row group"
        >
            {/* Image */}
            <div style={{ height: '11rem', position: 'relative', flexShrink: 0, overflow: 'hidden' }} className="md:h-auto md:w-1/2">
                {product.image_url ? (
                    <Image
                        src={product.image_url}
                        alt={product.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-700"
                        sizes="(max-width: 768px) 85vw, 220px"
                    />
                ) : (
                    <div style={{ width: '100%', height: '100%', background: '#e5dcc9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span className="material-symbols-outlined" style={{ color: onSurfaceV, fontSize: '2.5rem' }}>restaurant_menu</span>
                    </div>
                )}
            </div>

            {/* Content */}
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="md:w-1/2 md:p-8">
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <span style={{ padding: '0.25rem 0.75rem', backgroundColor: secFixed, color: onSecFixed, fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', borderRadius: '9999px', ...body }}>
                        Chef&apos;s Choice
                    </span>
                    <span style={{ padding: '0.25rem 0.75rem', backgroundColor: tertCon, color: onTertCon, fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', borderRadius: '9999px', ...body }}>
                        Signature
                    </span>
                </div>

                <h4 style={{ fontSize: '1.375rem', fontWeight: 700, marginBottom: '0.5rem', color: onSurface, ...headline }}>
                    {product.name}
                </h4>

                {product.description && (
                    <p style={{ color: onSurfaceV, fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: 1.6, ...body }}>
                        {product.description}
                    </p>
                )}

                <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '1.5rem', fontWeight: 700, color: primary, ...headline }}>
                        ₹{product.price.toLocaleString('en-IN')}
                    </span>
                </div>
            </div>
        </article>
    );
}

function ListCard({ product }: { product: Product }) {
    return (
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }} className="group">
            {/* Thumbnail */}
            <div style={{ width: '6rem', height: '6rem', borderRadius: '0.5rem', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
                {product.image_url ? (
                    <Image
                        src={product.image_url}
                        alt={product.name}
                        fill
                        className="object-cover group-hover:scale-110 transition-transform duration-500"
                        sizes="96px"
                    />
                ) : (
                    <div style={{ width: '100%', height: '100%', backgroundColor: '#e5dcc9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span className="material-symbols-outlined" style={{ color: onSurfaceV }}>restaurant_menu</span>
                    </div>
                )}
            </div>

            {/* Text */}
            <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                    <h5 style={{ fontWeight: 700, color: onSurface, ...body }}>{product.name}</h5>
                    <span style={{ fontWeight: 700, color: primary, flexShrink: 0, marginLeft: '0.5rem', ...headline }}>
                        ₹{product.price.toLocaleString('en-IN')}
                    </span>
                </div>
                {product.description && (
                    <p style={{ fontSize: '0.75rem', color: onSurfaceV, lineHeight: 1.5, ...body }}>{product.description}</p>
                )}
            </div>
        </div>
    );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function MenuTemplate({ shop }: { shop: Shop }) {
    const liveProducts = shop.products?.filter(p => p.is_live !== false) ?? [];

    // First 5 → large featured cards; rest → compact list
    const featured   = liveProducts.slice(0, 5);
    const remaining  = liveProducts.slice(5);

    return (
        <div style={{ backgroundColor: bg, color: onSurface, minHeight: '100vh', overflowX: 'hidden', ...body }}>

            {/* ── Fixed Header ────────────────────────────────────────────── */}
            <header style={{
                position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
                background: `linear-gradient(to bottom, ${bg}, transparent)`,
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', maxWidth: '80rem', margin: '0 auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span className="material-symbols-outlined" style={{ color: '#8E1616', fontSize: '1.5rem', cursor: 'pointer' }}>restaurant_menu</span>
                        <h1 style={{ ...headline, letterSpacing: '-0.05em', fontSize: '1.5rem', fontWeight: 800, color: '#8E1616' }}>
                            {shop.name}
                        </h1>
                    </div>
                </div>
            </header>

            {/* ── Main ────────────────────────────────────────────────────── */}
            <main style={{ paddingTop: '6rem', paddingBottom: '3rem', maxWidth: '80rem', margin: '0 auto', paddingLeft: '1rem', paddingRight: '1rem' }}>

                {/* Hero */}
                <section style={{
                    position: 'relative', overflow: 'hidden', borderRadius: '0.5rem',
                    height: '400px', display: 'flex', flexDirection: 'column',
                    justifyContent: 'flex-end', padding: '2rem', color: onPrimary, marginBottom: '3rem',
                }}>
                    {shop.image_url ? (
                        <Image src={shop.image_url} alt={shop.name} fill className="object-cover" priority sizes="100vw" />
                    ) : (
                        <div style={{ position: 'absolute', inset: 0, backgroundColor: primary }} />
                    )}
                    {/* Gradient overlay */}
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(50,46,37,0.85), rgba(50,46,37,0.2), transparent)', zIndex: 1 }} />

                    <div style={{ position: 'relative', zIndex: 2 }}>
                        {shop.tagline && (
                            <p style={{ ...body, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: '0.75rem', marginBottom: '0.5rem', color: primaryCon }}>
                                {shop.tagline}
                            </p>
                        )}
                        <h2 style={{ ...headline, fontSize: 'clamp(2.5rem, 6vw, 3.75rem)', fontWeight: 800, letterSpacing: '-0.05em', marginBottom: '1rem', lineHeight: 1 }}>
                            {shop.name}
                        </h2>
                        {shop.description && (
                            <p style={{ maxWidth: '28rem', color: 'rgba(254,246,231,0.9)', fontWeight: 500, lineHeight: 1.6, ...body }}>
                                {shop.description}
                            </p>
                        )}
                    </div>
                </section>

                {/* Category bar */}
                <nav style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem 1.5rem', paddingBottom: '1rem', marginBottom: '2rem' }}>
                    <button style={{ padding: '0.5rem 1.5rem', borderRadius: '9999px', backgroundColor: primary, color: onPrimary, fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(170,44,39,0.3)', ...body }}>
                        Menu
                    </button>
                    <span style={{ ...body, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.2em', color: `${onSurface}99`, cursor: 'pointer' }}>All Items</span>
                </nav>

                {/* ── Featured / Signature section ──────────────────────── */}
                {featured.length > 0 && (
                    <div style={{ marginBottom: '4rem' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '2rem' }}>
                            <h3 style={{ ...headline, fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.05em', color: onSurface }}>
                                Signature Items
                            </h3>
                            <span style={{ ...body, fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.3em', color: `${onSurface}66` }}>
                                The Gold Standard
                            </span>
                        </div>

                        <div style={{ position: 'relative', overflow: 'hidden' }}>
                            {/* Right fade */}
                            <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '4rem', background: `linear-gradient(to left, ${bg}, transparent)`, pointerEvents: 'none', zIndex: 10 }} />

                            <div className="no-scrollbar" style={{ display: 'flex', overflowX: 'auto', paddingBottom: '1rem', gap: '1.5rem', scrollBehavior: 'smooth' }}>
                                {featured.map((product, idx) => (
                                    <FeaturedCard key={product.id ?? idx} product={product} />
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Remaining items ────────────────────────────────────── */}
                {remaining.length > 0 && (
                    <div style={{ marginBottom: '4rem' }}>
                        {/* Section header with side lines */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                            <div style={{ height: '1px', backgroundColor: `${outlineV}4d`, flex: 1 }} />
                            <h3 style={{ ...headline, fontSize: '1.5rem', fontWeight: 700, color: onSurface, whiteSpace: 'nowrap' }}>
                                More Items
                            </h3>
                            <div style={{ height: '1px', backgroundColor: `${outlineV}4d`, flex: 1 }} />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '2rem' }}>
                            {remaining.map((product, idx) => (
                                <ListCard key={product.id ?? idx} product={product} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Empty state */}
                {liveProducts.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '5rem 0', border: '2px dashed #e5dcc9', borderRadius: '1rem', backgroundColor: surfaceLow }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: outlineV, display: 'block', marginBottom: '1rem' }}>restaurant_menu</span>
                        <p style={{ color: onSurfaceV, ...body }}>No menu items yet.</p>
                    </div>
                )}
            </main>

            {/* ── Footer ──────────────────────────────────────────────────── */}
            <footer style={{ backgroundColor: '#8E1616', padding: '2.5rem 1.5rem' }}>
                <div style={{ maxWidth: '80rem', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                    <span className="material-symbols-outlined" style={{ color: primaryCon, marginBottom: '1rem', fontSize: '2.5rem' }}>qr_code_scanner</span>
                    <h4 style={{ ...headline, fontSize: '1.5rem', fontWeight: 700, color: onPrimary, letterSpacing: '-0.05em', marginBottom: '0.5rem' }}>
                        Scan, Order &amp; Skip the Queue
                    </h4>
                    <div style={{ height: '1px', width: '4rem', backgroundColor: `${primaryCon}4d`, marginBottom: '1rem' }} />
                    <p style={{ ...body, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.3em', color: `${onPrimary}99` }}>
                        created by Voicesite
                    </p>
                </div>
            </footer>
        </div>
    );
}
