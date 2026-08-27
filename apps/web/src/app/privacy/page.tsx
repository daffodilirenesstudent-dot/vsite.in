import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/home/Navbar';
import FooterCTA from '@/components/home/FooterCTA';

export const metadata: Metadata = {
    title: 'Privacy Policy — vsite',
    description: "Read vsite's privacy policy. Learn how we collect, use, and protect your data.",
    alternates: {
        canonical: 'https://vsite.in/privacy',
    },
};

export default function PrivacyPage() {
    return (
        <>
            <Navbar />

            {/* Hero */}
            <section className="bg-background-light pt-16">
                <div className="max-w-3xl mx-auto px-4 py-12">
                    <h1 className="font-extrabold font-display text-3xl sm:text-4xl text-slate-900">
                        Privacy Policy
                    </h1>
                    <p className="text-sm text-slate-400 mt-2">Last updated: April 2026</p>
                </div>
            </section>

            {/* Content */}
            <main className="max-w-3xl mx-auto px-4 py-12">
                <div className="text-slate-700 leading-relaxed text-base space-y-8">

                    <section>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">Information We Collect</h2>
                        <p>
                            We collect information you provide directly: your name, phone number, and business name when
                            you create an account. We also collect usage data including pages visited, features used, and
                            menu content you upload. We use cookies to maintain your login session.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">How We Use Your Information</h2>
                        <p>
                            Your information is used to: create and maintain your vsite account and digital menu, process
                            your subscription payments, send you service notifications and product updates, and improve the
                            vsite platform. We do not sell your personal data to any third party.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">Data Storage &amp; Security</h2>
                        <p>
                            Your data is stored on secure servers provided by Supabase and Firebase, both of which comply
                            with international security standards. Menu photos and food images are stored using encrypted
                            cloud storage. We use HTTPS across all vsite services.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">Your Rights</h2>
                        <p>
                            You have the right to access, correct, or delete your personal data at any time. To exercise
                            these rights, contact us at official@vsite.in. You may also delete your account directly from the
                            Settings page in your dashboard, which removes all associated data within 30 days.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">Cookies</h2>
                        <p>
                            vsite uses essential cookies to keep you logged in and remember your active store. We do not
                            use tracking cookies or advertising cookies. You can disable cookies in your browser settings,
                            but this will prevent you from logging in.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">Third-Party Services</h2>
                        <p>
                            vsite uses the following third-party services: Firebase (authentication), Supabase (database),
                            and Razorpay or Stripe (payments). These services have their own privacy policies and we
                            encourage you to review them.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">Contact Us</h2>
                        <p>
                            If you have questions about this privacy policy, email us at official@vsite.in or message us on
                            WhatsApp.
                        </p>
                        <div className="mt-4">
                            <Link
                                href="/contact"
                                className="text-primary font-semibold hover:underline"
                            >
                                Contact Us →
                            </Link>
                        </div>
                    </section>

                </div>
            </main>

            <FooterCTA />
        </>
    );
}
