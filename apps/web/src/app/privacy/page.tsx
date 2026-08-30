import type { Metadata } from 'next';
import Navbar from '@/components/home/Navbar';
import FooterCTA from '@/components/home/FooterCTA';
import {
    PolicySection,
    PolicyTOC,
    PolicyNote,
    PolicyLink,
    type PolicySectionMeta,
} from '@/components/policy/PolicyParts';
import { SUPPORT_EMAIL } from '@/lib/platform/brand';
import { POLICY_LAST_UPDATED } from '@/content/policy';

export const metadata: Metadata = {
    title: 'Privacy Policy — vsite',
    description:
        'What vsite collects, why, where it is stored, and who else can see it. We do not sell your data and we do not track your customers.',
    alternates: {
        canonical: 'https://vsite.in/privacy',
    },
};

const SECTIONS: readonly PolicySectionMeta[] = [
    { id: 'collect', heading: 'What we collect' },
    { id: 'use', heading: 'Why we collect it' },
    { id: 'diners', heading: 'Your customers' },
    { id: 'storage', heading: 'Where it is stored' },
    { id: 'sharing', heading: 'Who else can see it' },
    { id: 'cookies', heading: 'Cookies' },
    { id: 'rights', heading: 'Your rights' },
    { id: 'contact', heading: 'Contact' },
];

export default function PrivacyPage() {
    return (
        <>
            <Navbar />

            {/* ── Hero ────────────────────────────────────────────────────
                pt-28 clears the 4.5rem fixed navbar. */}
            <section className="border-b border-line bg-paper-2 px-5 pb-section pt-28 lg:pb-section-lg lg:pt-36">
                <div className="mx-auto max-w-5xl">
                    <p className="text-caption font-bold uppercase tracking-[0.1em] text-ink-45">
                        Legal
                    </p>
                    <h1 className="mt-3 font-display text-h2 font-bold text-ink">Privacy Policy</h1>
                    <p className="mt-4 max-w-2xl text-body leading-relaxed text-ink-70">
                        What we collect, why we need it, and who else can see it. The short version:
                        we hold your shop details and your menu, we do not sell anything to anyone, and
                        we do not track the customers who scan your QR code.
                    </p>
                    <p className="mt-6 text-caption text-ink-45">
                        Last reviewed: {POLICY_LAST_UPDATED}
                    </p>
                </div>
            </section>

            <main className="bg-paper px-5 py-section lg:py-section-lg">
                <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] lg:gap-16">
                    <PolicyTOC sections={SECTIONS} label="Privacy Policy contents" />

                    <div className="max-w-2xl space-y-8">
                        <PolicySection id="collect" index={1} heading="What we collect">
                            <p>
                                <strong className="font-semibold text-ink">What you give us.</strong>{' '}
                                Your name, mobile number, and your shop&apos;s details — name, address,
                                timings, contact number, and GST details if you enter them. Plus your
                                menu: item names, prices, descriptions, and any photographs you upload.
                            </p>
                            <p>
                                <strong className="font-semibold text-ink">What we record as you
                                work.</strong> Which features you use and when, so we can tell what is
                                working and fix what is not. Errors are logged so we can debug them.
                            </p>
                            <p>
                                <strong className="font-semibold text-ink">What we never
                                collect.</strong> Card numbers. Payments go directly to Razorpay and
                                your card details never reach a vsite server.
                            </p>
                        </PolicySection>

                        <PolicySection id="use" index={2} heading="Why we collect it">
                            <p>
                                To run your account and publish your menu; to take payment for your
                                subscription; to send you service messages such as your invoice and the
                                reminder before your period ends; and to support you when you ask.
                            </p>
                            <p>
                                We use your menu text and photographs to generate AI food images and
                                Tamil translations for your own menu. We do not use your data to train
                                models for anyone else.
                            </p>
                            <PolicyNote>
                                We do not sell your personal data, your menu, or your sales figures to
                                anyone, and we do not share them with other restaurants.
                            </PolicyNote>
                        </PolicySection>

                        <PolicySection id="diners" index={3} heading="Your customers">
                            <p>
                                People who scan your QR code read your menu without signing in. We do
                                not ask them for a name, a number, or an account, and we do not place
                                advertising or tracking cookies on their phones.
                            </p>
                            <p>
                                We count scans and item views so you can see which dishes get attention
                                in your menu analytics. Those counts are anonymous — they are not tied
                                to a person and cannot be traced back to an individual customer.
                            </p>
                        </PolicySection>

                        <PolicySection id="storage" index={4} heading="Where it is stored">
                            <p>
                                Your account and menu data is stored in Supabase (PostgreSQL), and
                                images are held in encrypted cloud storage. Authentication runs on
                                Google Firebase. All traffic to and from vsite uses HTTPS.
                            </p>
                            <p>
                                We keep your data for as long as your account exists. If your plan
                                expires, your data is kept so your menu can come straight back when you
                                pay again — see{' '}
                                <PolicyLink href="/terms">the Terms</PolicyLink> for what expiry does.
                            </p>
                        </PolicySection>

                        <PolicySection id="sharing" index={5} heading="Who else can see it">
                            <p>We use a small number of providers, each for one job:</p>
                            <ul className="space-y-2.5 pl-1">
                                {[
                                    ['Razorpay', 'takes your subscription payment and holds the payment record.'],
                                    ['Google Firebase', 'verifies your mobile number when you log in.'],
                                    ['Supabase', 'stores your account, menu and images.'],
                                    ['AI providers', 'receive your menu text and menu photographs in order to extract items, translate them, and generate food images.'],
                                    ['Email and WhatsApp providers', 'deliver your invoices, reminders and support replies.'],
                                ].map(([name, role]) => (
                                    <li key={name} className="flex gap-3">
                                        <span aria-hidden className="mt-[0.6rem] h-1 w-1 shrink-0 rounded-full bg-ink-45" />
                                        <span>
                                            <strong className="font-semibold text-ink">{name}</strong> {role}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            <p>
                                Each provider gets only what it needs to do its job. We may also
                                disclose data where the law requires it.
                            </p>
                        </PolicySection>

                        <PolicySection id="cookies" index={6} heading="Cookies">
                            <p>
                                vsite uses essential cookies only: one to keep you logged in, and one
                                to remember which store you are working on. There are no advertising or
                                tracking cookies anywhere on vsite, including on your public menu.
                            </p>
                            <p>
                                You can block cookies in your browser, but you will not be able to log
                                in to the dashboard.
                            </p>
                        </PolicySection>

                        <PolicySection id="rights" index={7} heading="Your rights">
                            <p>
                                You can see and correct most of your data yourself from the dashboard.
                                Beyond that, you can ask us for a copy of what we hold about you, ask
                                us to correct it, or ask us to delete it.
                            </p>
                            <p>
                                You can delete a store yourself from Settings → Danger zone. That
                                removes the store, its menu, its images and its analytics. To delete
                                your whole account, email us and we will action it within 30 days.
                            </p>
                        </PolicySection>

                        <PolicySection id="contact" index={8} heading="Contact">
                            <p>
                                Questions about your data, or want a copy of it? Email{' '}
                                <PolicyLink href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</PolicyLink>{' '}
                                or message us on WhatsApp from the{' '}
                                <PolicyLink href="/contact">contact page</PolicyLink>. We reply in
                                Tamil or English.
                            </p>
                        </PolicySection>
                    </div>
                </div>
            </main>

            <FooterCTA />
        </>
    );
}
