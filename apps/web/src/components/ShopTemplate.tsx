import Image from "next/image";
import { CheckCircle2, MapPin, Phone, Mail, ShoppingBag, Instagram, Facebook, Twitter } from "lucide-react";
import { Shop } from '@/lib/supabase';

export default function ShopTemplate({ shop }: { shop: Shop }) {
    return (
        <main className="min-h-screen bg-white text-gray-900 font-sans selection:bg-blue-100">
            {/* 1. Hero Section */}
            <div className="relative w-full bg-gray-50 pb-8">
                <div className="relative w-full aspect-[4/3] md:aspect-[2.5/1] lg:aspect-[3/1] rounded-b-[3rem] overflow-hidden shadow-sm">
                    {shop.image_url ? (
                        <Image
                            src={shop.image_url}
                            alt={shop.name}
                            fill
                            className="object-cover"
                            priority
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 100vw"
                        />
                    ) : (
                        <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-gray-400">
                            <span className="text-4xl opacity-20 font-bold tracking-widest">STORE</span>
                        </div>
                    )}

                    {/* Overlay Content */}
                    <div className="absolute inset-0 bg-black/10" />

                    <div className="absolute bottom-8 left-6 md:bottom-12 md:left-12 text-white">

                    </div>
                </div>
            </div>

            {/* 2. Shop Info */}
            <section className="px-6 py-8 text-center max-w-3xl mx-auto">
                <h1 className="text-3xl md:text-5xl font-black text-gray-900 mb-2 tracking-tight break-words">
                    {shop.name}
                </h1>
                <p className="text-blue-600 text-lg md:text-xl font-medium mb-8">
                    {shop.tagline || "Curated essentials for everyday living."}
                </p>

                <div className="bg-gray-50 rounded-[2.5rem] p-6 md:p-10 mb-8 relative">
                    <p className="text-gray-600 leading-relaxed text-base md:text-lg mb-6">
                        {shop.description || "We source sustainable goods directly from artisans worldwide. Quality over quantity, always."}
                    </p>

                    <div className="inline-flex items-center gap-2 bg-white px-5 py-2 rounded-full shadow-sm">
                        <CheckCircle2 className="w-5 h-5 text-blue-600 fill-blue-600 text-white" />
                        <span className="font-bold text-sm text-gray-900">
                            Since {new Date(shop.created_at).getFullYear()}
                        </span>
                    </div>
                </div>

                {(shop.location || shop.timings) && (
                    <div className="flex flex-wrap justify-center gap-4 text-sm text-gray-500 mb-4">
                        {shop.location && (
                            <div className="flex items-center gap-1.5 bg-gray-100 px-3 py-1.5 rounded-full">
                                <MapPin className="w-4 h-4" />
                                <span>{shop.location}</span>
                            </div>
                        )}
                        {shop.timings && (
                            <div className="bg-gray-100 px-3 py-1.5 rounded-full">
                                <span>{shop.timings}</span>
                            </div>
                        )}
                    </div>
                )}
            </section>

            {/* 3. Featured Items (Product Grid) */}
            {shop.products && shop.products.length > 0 && (
                <section className="px-4 md:px-8 pb-20 max-w-7xl mx-auto">
                    <div className="flex items-center justify-between mb-8 px-2">
                        <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Featured Items</h2>
                        <button className="text-blue-600 font-semibold text-sm hover:underline">View All</button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
                        {shop.products.filter(p => p.is_live !== false).map((product, index) => (
                            <div key={index} className="group relative">
                                {/* Image Container */}
                                <div className="relative aspect-[4/3] rounded-[2rem] overflow-hidden bg-gray-100 mb-4 shadow-sm group-hover:shadow-md transition-shadow duration-300">
                                    {product.image_url ? (
                                        <Image
                                            src={product.image_url}
                                            alt={product.name}
                                            fill
                                            className="object-cover group-hover:scale-105 transition-transform duration-500"
                                            priority={index < 2}
                                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gray-200">
                                            <ShoppingBag className="w-12 h-12 text-gray-400" />
                                        </div>
                                    )}
                                    {/* Price Pill */}
                                    {product.price !== undefined && (
                                        <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm px-4 py-1.5 rounded-full shadow-sm font-bold text-gray-900 text-sm">
                                            ₹{product.price.toLocaleString("en-IN")}
                                        </div>
                                    )}
                                </div>

                                {/* Content */}
                                <div className="px-2">
                                    <h3 className="font-bold text-xl text-gray-900 mb-1 leading-tight">
                                        {product.name}
                                    </h3>
                                    {product.description && (
                                        <p className="text-gray-500 text-sm mb-4 line-clamp-1">
                                            {product.description}
                                        </p>
                                    )}

                                    <button
                                        onClick={() => {
                                            const phone = shop?.contact?.whatsapp || shop?.contact?.phone;
                                            if (phone) {
                                                const cleanPhone = phone.replace(/[^0-9]/g, '');
                                                const message = `Hi, I would like to order: ${product.name}`;
                                                window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
                                            } else {
                                                alert("Contact number not available for this shop.");
                                            }
                                        }}
                                        className="w-full bg-[#2563EB] hover:bg-blue-700 text-white font-semibold py-3.5 rounded-2xl transition-colors active:scale-[0.98] duration-200 shadow-blue-200 shadow-lg"
                                    >
                                        Order Now
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* 4. Contact Footer */}
            {shop.contact && (
                <section className="bg-gray-50 py-16 px-4 rounded-t-[3rem]">
                    <div className="max-w-md mx-auto text-center">
                        <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mb-6">
                            <ShoppingBag className="w-6 h-6 text-[#2563EB]" />
                        </div>
                        <h2 className="text-2xl md:text-3xl font-bold mb-2 text-gray-900">
                            Questions? Reach out.
                        </h2>
                        <p className="text-gray-500 mb-10">
                            We&apos;re here to help you find the perfect item.
                        </p>

                        <div className="space-y-4">
                            {shop.contact.email && (
                                <a
                                    href={`mailto:${shop.contact.email}`}
                                    className="flex items-center gap-4 bg-white p-4 rounded-2xl shadow-sm hover:shadow-md transition-shadow"
                                >
                                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                                        <Mail className="w-5 h-5 text-[#2563EB]" />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-xs text-gray-500 font-medium">Email us</p>
                                        <p className="font-semibold text-gray-900 break-all">{shop.contact.email}</p>
                                    </div>
                                </a>
                            )}

                            {shop.contact.phone && (
                                <a
                                    href={`tel:${shop.contact.phone}`}
                                    className="flex items-center gap-4 bg-white p-4 rounded-2xl shadow-sm hover:shadow-md transition-shadow"
                                >
                                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                                        <Phone className="w-5 h-5 text-[#2563EB]" />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-xs text-gray-500 font-medium">Call us</p>
                                        <p className="font-semibold text-gray-900">{shop.contact.phone}</p>
                                    </div>
                                </a>
                            )}
                            {shop.contact.whatsapp && (
                                <a
                                    href={`https://wa.me/${shop.contact.whatsapp}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-4 bg-white p-4 rounded-2xl shadow-sm hover:shadow-md transition-shadow"
                                >
                                    <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center shrink-0">
                                        <Phone className="w-5 h-5 text-green-600" />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-xs text-gray-500 font-medium">WhatsApp</p>
                                        <p className="font-semibold text-gray-900">{shop.contact.whatsapp}</p>
                                    </div>
                                </a>
                            )}
                            {shop.location && (
                                <div className="flex items-center gap-4 bg-white p-4 rounded-2xl shadow-sm">
                                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                                        <MapPin className="w-5 h-5 text-[#2563EB]" />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-xs text-gray-500 font-medium">Visit us</p>
                                        <p className="font-semibold text-gray-900">{shop.location}</p>
                                    </div>
                                </div>
                            )}

                            {/* Social Links */}
                            {shop.social_links && (Object.values(shop.social_links).some(link => link)) && (
                                <div className="flex justify-center gap-4 mt-8 pt-8 border-t border-gray-200">
                                    {shop.social_links.instagram && (
                                        <a href={`https://instagram.com/${shop.social_links.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="p-3 bg-white rounded-full shadow-sm hover:bg-gray-50 transition-colors text-pink-600">
                                            <Instagram className="w-6 h-6" />
                                        </a>
                                    )}
                                    {shop.social_links.facebook && (
                                        <a href={shop.social_links.facebook} target="_blank" rel="noopener noreferrer" className="p-3 bg-white rounded-full shadow-sm hover:bg-gray-50 transition-colors text-blue-600">
                                            <Facebook className="w-6 h-6" />
                                        </a>
                                    )}
                                    {shop.social_links.twitter && (
                                        <a href={`https://twitter.com/${shop.social_links.twitter.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="p-3 bg-white rounded-full shadow-sm hover:bg-gray-50 transition-colors text-blue-400">
                                            <Twitter className="w-6 h-6" />
                                        </a>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            )}
            {/* 5. Branding Footer */}
            <footer className="py-8 text-center text-sm text-gray-400 bg-gray-50">
                Created by VoiceSite.in
            </footer>
        </main>
    );
}
