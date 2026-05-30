import type { Metadata } from 'next';
import Navbar from '@/components/home/Navbar';
import FooterCTA from '@/components/home/FooterCTA';

export const metadata: Metadata = {
    title: 'Terms of Service — vsite',
    description: "Read vsite's terms of service. Understand your rights and responsibilities as a vsite user.",
    alternates: {
        canonical: 'https://vsite.in/terms',
    },
};

export default function TermsPage() {
    return (
        <>
            <Navbar />

            {/* Hero */}
            <section className="bg-background-light pt-16">
                <div className="max-w-3xl mx-auto px-4 py-12">
                    <h1 className="font-extrabold font-display text-3xl sm:text-4xl text-slate-900">
                        Terms of Service
                    </h1>
                    <p className="text-sm text-slate-400 mt-2">Last updated: April 2026</p>
                </div>
            </section>

            {/* Content */}
            <main className="max-w-3xl mx-auto px-4 py-12">
                <div className="text-slate-700 leading-relaxed text-base space-y-8">

                    <section>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">Acceptance of Terms</h2>
                        <p>
                            By creating a vsite account and using our services, you agree to these Terms of Service. If
                            you do not agree, please do not use vsite. These terms apply to all users of vsite.in and
                            the vsite platform.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">Description of Service</h2>
                        <p>
                            vsite provides an AI-powered digital menu and ordering platform for restaurants and food
                            businesses. Features include digital menu creation, QR code generation, online ordering, and
                            payment processing. Features vary by subscription plan.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">Account Responsibilities</h2>
                        <p>
                            You are responsible for maintaining the security of your login credentials. You agree to
                            provide accurate business information and to keep your menu content up to date. You must not
                            use vsite to list illegal products or engage in deceptive practices.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">Subscription &amp; Payments</h2>
                        <p>
                            vsite is offered on a monthly subscription basis. The current prices are ₹299/month (Smart
                            QR Menu) and ₹699/month (QR Ordering + Payment), plus a one-time ₹1,999 setup fee. A 14-day
                            free trial is available for new accounts. Subscriptions renew automatically unless cancelled.
                            We reserve the right to change pricing with 30 days&apos; notice.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">Cancellation</h2>
                        <p>
                            You may cancel your subscription at any time from the Settings page. Cancellation takes
                            effect at the end of the current billing period. We do not offer refunds for partial months.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">Intellectual Property</h2>
                        <p>
                            vsite and its AI-generated content (food images, descriptions) are owned by vsite. Your
                            original menu content (item names, prices, photos you upload) remains yours. You grant vsite
                            a licence to display and process your content to deliver the service.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">Limitation of Liability</h2>
                        <p>
                            vsite is provided &apos;as is&apos;. We are not liable for any indirect, incidental, or
                            consequential damages arising from your use of the service. Our maximum liability is limited
                            to the subscription fees paid in the 3 months prior to the claim.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">Contact</h2>
                        <p>
                            Questions about these terms? Email{' '}
                            <a
                                href="mailto:official@vsite.in"
                                className="text-primary hover:underline"
                            >
                                official@vsite.in
                            </a>
                        </p>
                    </section>

                </div>
            </main>

            <FooterCTA />
        </>
    );
}
