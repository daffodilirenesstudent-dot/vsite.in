'use client';

import React from 'react';
import { useSite } from '@/components/SiteContext';
import { FAQ_GROUPS } from '@/app/support/faqData';
import { SUPPORT_EMAIL, ownerFaqs, supportWhatsAppUrl } from '@/lib/you/support';
import SubPage from '@/components/you/SubPage';
import { Y, rise } from '@/components/you/YouStyles';
import { Card, Icon } from '@/components/you/YouKit';

/**
 * Help & support — a placeholder until the request system is built. It is
 * honest about that: two ways to reach the team today (with the store already
 * named), the owner FAQ, and a "coming soon" card where requests will live.
 */

const tile: React.CSSProperties = {
    minHeight: 108, borderRadius: 16, background: Y.white, border: `1px solid ${Y.line}`, padding: 14,
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: Y.ink, textDecoration: 'none', boxSizing: 'border-box',
};

export default function HelpPage() {
    const { activeSite } = useSite();
    const store = activeSite ? { name: activeSite.name, slug: activeSite.slug } : null;
    const faqs = ownerFaqs(FAQ_GROUPS);

    return (
        <SubPage title="Help & support">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div className="you-rise" style={{ ...rise(0), padding: '4px 4px 0' }}>
                    <h2 style={{ margin: 0, fontSize: 23, fontWeight: 700 }}>How can we help?</h2>
                    <p style={{ margin: '6px 0 0', fontSize: 15, lineHeight: '22px', color: Y.text }}>
                        Message the vsite team. Your store name goes with the message, so we know which menu you mean.
                    </p>
                </div>

                <div className="you-rise" style={{ ...rise(1), display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                    <a href={supportWhatsAppUrl(store)} target="_blank" rel="noopener noreferrer" className="you-press you-focus" style={tile}>
                        <span style={{ width: 40, height: 40, borderRadius: 12, background: Y.good.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon icon="chat" color="#16794C" />
                        </span>
                        <span style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: 15, fontWeight: 600 }}>WhatsApp us</span>
                            <span style={{ fontSize: 12, color: Y.muted }}>Usually the fastest</span>
                        </span>
                    </a>
                    <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(store ? `Help with ${store.name}` : 'Help with my store')}`} className="you-press you-focus" style={tile}>
                        <span style={{ width: 40, height: 40, borderRadius: 12, background: Y.brandBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon icon="mail" color={Y.brand} />
                        </span>
                        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            <span style={{ fontSize: 15, fontWeight: 600 }}>Email</span>
                            <span className="truncate" style={{ fontSize: 12, color: Y.muted }}>{SUPPORT_EMAIL}</span>
                        </span>
                    </a>
                </div>

                <Card aria-labelledby="hp-faq" className="you-rise" style={{ ...rise(2), overflow: 'hidden' }}>
                    <h2 id="hp-faq" style={{ margin: 0, padding: '16px 16px 8px', fontSize: 15, fontWeight: 700 }}>Common questions</h2>
                    {faqs.map(f => (
                        <details key={f.id} className="you-faq" style={{ borderTop: `1px solid ${Y.lineSoft}` }}>
                            <summary className="you-row you-focus" style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, padding: '8px 16px', fontSize: 15, fontWeight: 500, cursor: 'pointer', listStyle: 'none' }}>
                                <span style={{ flex: 1 }}>{f.q}</span>
                                <Icon icon="expand_more" color={Y.muted} style={{ transition: 'transform 160ms ease' }} />
                            </summary>
                            <p style={{ margin: 0, padding: '0 16px 16px', fontSize: 14, lineHeight: '21px', color: Y.text }}>{f.a}</p>
                        </details>
                    ))}
                </Card>

                <section className="you-rise" style={{ ...rise(3), border: '1.5px dashed #C9C4F5', borderRadius: 16, padding: 16, display: 'flex', gap: 12, alignItems: 'flex-start', background: Y.brandTint }}>
                    <Icon icon="confirmation_number" size={24} color={Y.brand} />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 15, fontWeight: 600 }}>
                            Raise a request and track it
                            <span style={{ padding: '2px 8px', borderRadius: 999, background: Y.brandBg, color: Y.brandDeep, fontSize: 11, fontWeight: 700 }}>Coming soon</span>
                        </span>
                        <span style={{ fontSize: 13, lineHeight: '19px', color: Y.text }}>
                            Soon you can report a problem here and follow its progress without leaving the app.
                        </span>
                    </span>
                </section>
            </div>
            {/* Hide the default disclosure marker and turn the chevron when open. */}
            <style>{'.you-faq summary::-webkit-details-marker{display:none}.you-faq[open] summary .material-symbols-outlined{transform:rotate(180deg)}@media (prefers-reduced-motion: reduce){.you-faq summary .material-symbols-outlined{transition:none!important}}'}</style>
        </SubPage>
    );
}
