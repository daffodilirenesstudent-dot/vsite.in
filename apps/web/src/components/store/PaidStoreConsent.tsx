'use client';

import React, { useId, useState } from 'react';
import { PLAN_PRICES_INR } from '@/lib/platform/productFlags';
import { formatPrice } from '@/lib/platform/currency';
import { readablePhone } from '@/lib/platform/phone';

/**
 * The agreement an owner makes before building a store that has no free trial.
 *
 * Owner requirement (2026-09-25): the account's trial is used once; a later
 * store is created only "with full intention" — so this screen says, in plain
 * words, whose trial was used (the phone number, and on which store), that the
 * new store stays offline until it is paid for, and what it costs; and the way
 * forward stays disabled until the owner ticks that they understand. The same
 * screen is shown by onboarding and the You tab, so the wording never drifts.
 */

const C = {
    brand: '#5137EF', ink: '#0A0A0A', text: '#52525C', muted: '#71717A', line: '#E4E4E7',
    warnBg: '#FEF3E2', warnFg: '#93370D', warnLine: '#F5D9A8',
};

export default function PaidStoreConsent({ phone, trialStoreName, onContinue, onCancel, busy = false }: {
    /** The signed-in phone number (E.164). */
    phone: string | null;
    /** The store that used the free trial, when it still exists. */
    trialStoreName: string | null;
    onContinue: () => void;
    onCancel: () => void;
    busy?: boolean;
}) {
    const [agreed, setAgreed] = useState(false);
    const checkboxId = useId();
    const price = formatPrice(PLAN_PRICES_INR.qr_menu, 'INR');
    const number = readablePhone(phone);

    return (
        <section aria-labelledby={`${checkboxId}-title`} style={{ display: 'flex', flexDirection: 'column', gap: 16, color: C.ink }}>
            <div style={{ border: `1px solid ${C.warnLine}`, background: C.warnBg, borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 24, color: C.warnFg, flexShrink: 0 }}>lock_clock</span>
                    <h2 id={`${checkboxId}-title`} style={{ margin: 0, fontSize: 19, fontWeight: 700, lineHeight: '25px' }}>This store needs a paid plan</h2>
                </span>
                <p style={{ margin: 0, fontSize: 15, lineHeight: '22px', color: C.ink }}>
                    The free trial for {number ? <strong style={{ whiteSpace: 'nowrap' }}>{number}</strong> : 'this phone number'} was already used
                    {trialStoreName ? <> on <strong>“{trialStoreName}”</strong></> : null}. Each phone number gets one free trial.
                </p>
                <p style={{ margin: 0, fontSize: 15, lineHeight: '22px', color: C.text }}>
                    You can set up the new store now. It stays offline — customers cannot open its menu — until you pay{' '}
                    <strong style={{ color: C.ink }}>{price}/month</strong> for it.
                </p>
            </div>

            <label htmlFor={checkboxId} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 14, border: `1px solid ${agreed ? C.brand : C.line}`, background: '#FFFFFF', cursor: 'pointer' }}>
                <input
                    id={checkboxId}
                    type="checkbox"
                    checked={agreed}
                    onChange={e => setAgreed(e.target.checked)}
                    disabled={busy}
                    style={{ width: 22, height: 22, marginTop: 1, flexShrink: 0, accentColor: C.brand, cursor: 'pointer' }}
                />
                <span style={{ fontSize: 15, lineHeight: '22px' }}>
                    I understand this store has <strong>no free trial</strong> and goes live only after I pay {price} for it.
                </span>
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                    type="button"
                    data-consent-continue
                    onClick={onContinue}
                    disabled={!agreed || busy}
                    style={{
                        minHeight: 52, borderRadius: 14, border: 'none', fontFamily: 'inherit', fontSize: 16, fontWeight: 600,
                        background: agreed ? C.brand : '#D4D4D8', color: '#FFFFFF', cursor: agreed && !busy ? 'pointer' : 'not-allowed',
                        transition: 'background-color 160ms ease',
                    }}
                >
                    Continue to set up
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={busy}
                    style={{ minHeight: 48, borderRadius: 14, border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 15, fontWeight: 600, color: C.text, cursor: 'pointer' }}
                >
                    Not now
                </button>
            </div>
        </section>
    );
}
