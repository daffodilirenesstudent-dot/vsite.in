import type { Metadata } from 'next';
import Navbar from '@/components/home/Navbar';
import FooterCTA from '@/components/home/FooterCTA';
import BillingCycle from '@/components/policy/BillingCycle';
import {
    PolicySection,
    PolicyTOC,
    PolicyNote,
    PolicyLink,
    type PolicySectionMeta,
} from '@/components/policy/PolicyParts';
import { SUPPORT_EMAIL } from '@/lib/platform/brand';
import { ORDERING_COMING_SOON_SHORT } from '@/content/roadmap';
import {
    POLICY_LAST_UPDATED,
    BILLING_CYCLE_DAYS,
    TRIAL_DAYS,
    TRIAL_RULE,
    PLAN_PRICE_INR,
    NO_REFUND_POLICY,
    HOW_TO_STOP,
} from '@/content/policy';

export const metadata: Metadata = {
    title: 'Terms of Service — vsite',
    description:
        `What you agree to when you use vsite: one plan at ₹${PLAN_PRICE_INR} a month, paid ` +
        `${BILLING_CYCLE_DAYS} days at a time, no auto-renewal, no refunds.`,
    alternates: {
        canonical: 'https://vsite.in/terms',
    },
};

const SECTIONS: readonly PolicySectionMeta[] = [
    { id: 'agreement', heading: 'Agreeing to these terms' },
    { id: 'service', heading: 'What vsite provides' },
    { id: 'account', heading: 'Your account and your menu' },
    { id: 'billing', heading: 'Paying for vsite' },
    { id: 'stopping', heading: 'Stopping, expiry and refunds' },
    { id: 'content', heading: 'Your content and ours' },
    { id: 'liability', heading: 'Limits of our liability' },
    { id: 'changes', heading: 'Changes to these terms' },
    { id: 'contact', heading: 'Contact' },
];

export default function TermsPage() {
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
                    <h1 className="mt-3 font-display text-h2 font-bold text-ink">Terms of Service</h1>
                    <p className="mt-4 max-w-2xl text-body leading-relaxed text-ink-70">
                        The agreement between your shop and vsite. Written to be read once, in plain
                        language — the money parts are in section 04 and 05, and nothing in them is
                        hidden anywhere else.
                    </p>
                    <p className="mt-6 text-caption text-ink-45">
                        Last reviewed: {POLICY_LAST_UPDATED}
                    </p>
                </div>
            </section>

            {/* ── Billing at a glance ─────────────────────────────────────
                The diagram sits above the clauses rather than inside section
                04, because it is the answer to the question people arrive on
                this page with. The clause below states the same thing in the
                language a contract needs. */}
            <section className="border-b border-line bg-paper px-5 py-section lg:py-section-lg">
                <div className="mx-auto max-w-5xl">
                    <h2 className="font-display text-h3 font-bold text-ink">
                        How the {BILLING_CYCLE_DAYS} days work
                    </h2>
                    <p className="mt-2.5 max-w-2xl text-body leading-relaxed text-ink-70">
                        vsite does not store your card and never charges you automatically. You pay for
                        one period at a time.
                    </p>
                    <div className="mt-9">
                        <BillingCycle />
                    </div>
                </div>
            </section>

            {/* ── Clauses ─────────────────────────────────────────────────── */}
            <main className="bg-paper px-5 py-section lg:py-section-lg">
                <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] lg:gap-16">
                    <PolicyTOC sections={SECTIONS} label="Terms of Service contents" />

                    <div className="max-w-2xl space-y-8">
                        <PolicySection id="agreement" index={1} heading="Agreeing to these terms">
                            <p>
                                Creating a vsite account means you accept these terms and our{' '}
                                <PolicyLink href="/privacy">Privacy Policy</PolicyLink>. If you do not
                                accept them, do not create an account. These terms apply to everyone
                                using vsite.in and the vsite dashboard.
                            </p>
                            <p>
                                You must be old enough to enter a contract in India and authorised to
                                act for the business you are registering.
                            </p>
                        </PolicySection>

                        <PolicySection id="service" index={2} heading="What vsite provides">
                            <p>
                                vsite is a digital menu platform. You photograph your paper menu, we
                                extract the items with AI, and your customers read the menu on their
                                phones by scanning a QR code. The plan includes AI food photos, Tamil
                                and English menus, live price and sold-out updates, and menu analytics.
                            </p>
                            <PolicyNote>
                                vsite does not take orders and does not process payments between you
                                and your customers. {ORDERING_COMING_SOON_SHORT} Your staff take orders
                                exactly as they do now.
                            </PolicyNote>
                        </PolicySection>

                        <PolicySection id="account" index={3} heading="Your account and your menu">
                            <p>
                                You are responsible for your login and for anything done through it.
                                Your account is tied to your mobile number, so keep access to that
                                number.
                            </p>
                            <p>
                                You agree that the menu you publish is accurate — real prices, real
                                items, real availability — and that you have the right to publish it.
                                You may not use vsite to list anything illegal, to impersonate another
                                business, or to mislead customers about what they are buying.
                            </p>
                            <p>
                                We may suspend an account that breaks these rules. Where we can, we
                                will tell you why and give you a chance to fix it first.
                            </p>
                        </PolicySection>

                        <PolicySection id="billing" index={4} heading="Paying for vsite">
                            <p>
                                vsite has one plan: the Smart QR Menu at ₹{PLAN_PRICE_INR} per month,
                                with no setup fee and no commission on anything you sell. New accounts
                                get {TRIAL_DAYS} days free, with no card required.
                            </p>
                            <p>{TRIAL_RULE}</p>
                            <p>
                                Each payment covers one {BILLING_CYCLE_DAYS}-day period, paid in
                                advance through Razorpay. We do not store your card and we do not hold
                                a mandate to charge you, so <strong className="font-semibold text-ink">
                                there is no automatic charge</strong>. To continue past a
                                period, you pay again from your dashboard.
                            </p>
                            <p>
                                If you pay before your current period ends, the days you have left are
                                added to the new period — renewing early never costs you time.
                            </p>
                            <p>
                                We may change the price with 30 days&apos; notice. A change never
                                affects a period you have already paid for.
                            </p>
                        </PolicySection>

                        <PolicySection id="stopping" index={5} heading="Stopping, expiry and refunds">
                            <PolicyNote>{HOW_TO_STOP}</PolicyNote>
                            <p>
                                There is no cancellation form and no notice period, because there is
                                no automatic charge to call off. If you want to stop using vsite,
                                simply do not renew.
                            </p>
                            <p>
                                When a period ends without a new payment, your menu stops being visible
                                to customers — anyone scanning your QR code sees an
                                &quot;unavailable&quot; page. This happens on the day the period ends;
                                there is no grace period.
                            </p>
                            <p>
                                Your account is not deleted. Your menu, photos, categories and settings
                                are kept, and paying again brings the menu back online immediately with
                                the same QR code. You do not need to reprint anything.
                            </p>
                            <p>{NO_REFUND_POLICY}</p>
                            <p>
                                If you want your data removed entirely rather than just paused, you can
                                delete your store from Settings → Danger zone, or email us. See the{' '}
                                <PolicyLink href="/privacy">Privacy Policy</PolicyLink> for what
                                deletion covers.
                            </p>
                        </PolicySection>

                        <PolicySection id="content" index={6} heading="Your content and ours">
                            <p>
                                Your menu content stays yours — item names, prices, descriptions and
                                any photographs you upload. You give us permission to store, process
                                and display that content for the purpose of running your menu, and to
                                pass it to the AI services that generate photos and translations.
                            </p>
                            <p>
                                Food images that vsite generates for you may be used on your menu for
                                as long as you are a customer. The vsite platform, brand and software
                                remain ours.
                            </p>
                        </PolicySection>

                        <PolicySection id="liability" index={7} heading="Limits of our liability">
                            <p>
                                vsite is provided as is. We work hard to keep menus online but we do
                                not guarantee uninterrupted service, and we are not liable for indirect
                                or consequential losses — including lost sales — arising from downtime,
                                errors in AI-extracted menu data, or your use of the service.
                            </p>
                            <p>
                                Check your menu after importing it. AI extraction is good but not
                                perfect, and the prices customers see are the prices you published.
                            </p>
                            <p>
                                Our total liability to you is limited to the subscription fees you paid
                                us in the three months before the claim.
                            </p>
                        </PolicySection>

                        <PolicySection id="changes" index={8} heading="Changes to these terms">
                            <p>
                                We may update these terms as the product changes. When we do, we update
                                the review date at the top of this page, and we email you if the change
                                affects what you pay or what you get. Continuing to use vsite after a
                                change means you accept the updated terms.
                            </p>
                        </PolicySection>

                        <PolicySection id="contact" index={9} heading="Contact">
                            <p>
                                Questions about these terms — or about a payment — reach a person, not
                                a ticket queue. Email{' '}
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
