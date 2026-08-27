'use client';

// GST compliance onboarding wizard.
//
// Three steps:
//   1. Are you GST-registered?  Yes / No
//   2. (Yes path) Enter GSTIN + owner + address + pincode + state → verify
//   3. (Yes path) Choose collection rate: 5% or 18%
//
// The wizard never trusts itself — every transition that mutates server state
// goes through /api/manage/sites/[siteId]/gst/* which re-checks ownership and
// re-verifies the GSTIN against gstincheck.co.in.

import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { firebaseAuth } from '@/lib/firebase';

export interface GstProfile {
    gst_status:              'pending' | 'not_registered' | 'registered';
    gstin:                   string | null;
    gst_legal_name:          string | null;
    gst_trade_name:          string | null;
    gst_owner_name:          string | null;
    gst_address:             string | null;
    gst_pincode:             string | null;
    gst_state:               string | null;
    gst_rate_pct:            number | null;
    gst_verified_at:         string | null;
    gst_verification_status: 'verified' | 'inactive' | 'unavailable' | null;
}

interface Props {
    siteId:  string;
    onClose: (updated: GstProfile | null) => void;
}

// 36 states + UTs. Order matters for the dropdown UX (alphabetical).
const STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
    'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
    'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
    'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
    'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh',
    'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
    'Ladakh', 'Lakshadweep', 'Puducherry',
];

const inputStyle: React.CSSProperties = {
    width: '100%', border: '1px solid #E4E4E7', borderRadius: 8, padding: '10px 14px',
    fontSize: 14, fontWeight: 400, color: '#0A0A0A', lineHeight: '20px', outline: 'none', background: '#FFFFFF', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
    fontSize: 14, fontWeight: 500, color: '#0A0A0A', lineHeight: '20px', marginBottom: 6, display: 'block',
};

async function authHeaders(): Promise<HeadersInit> {
    const token = await firebaseAuth.currentUser?.getIdToken();
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

type Step = 1 | 2 | 3;

export default function GstWizard({ siteId, onClose }: Props) {
    const [step, setStep] = useState<Step>(1);
    const [busy, setBusy] = useState<'none' | 'verify' | 'save'>('none');

    // Step 2 form state
    const [gstin, setGstin]         = useState('');
    const [ownerName, setOwnerName] = useState('');
    const [address, setAddress]     = useState('');
    const [pincode, setPincode]     = useState('');
    const [state, setState]         = useState('');

    // Step 2 verification result
    interface VerifyResult { gstin: string; legalName: string | null; tradeName: string | null; address: string | null; state: string | null }
    const [verified, setVerified] = useState<VerifyResult | null>(null);
    const [verifyError, setVerifyError] = useState<{ kind: 'inactive' | 'unavailable' | 'state_mismatch' | 'other'; message: string } | null>(null);

    // Step 3 rate
    const [rate, setRate] = useState<5 | 18 | null>(null);

    const handleNotRegistered = async () => {
        if (!confirm('Mark this store as not GST-registered? No tax will be added to customer bills. You can change this later.')) return;
        setBusy('save');
        try {
            const res = await fetch(`/api/manage/sites/${siteId}/gst/complete`, {
                method: 'POST',
                headers: await authHeaders(),
                body:    JSON.stringify({ kind: 'not_registered' }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                toast.error(err.error ?? 'Failed to save');
                return;
            }
            toast.success('Saved — your store is set up as not GST-registered.');
            // Refetch full profile so the parent card renders the right state.
            const profileRes = await fetch(`/api/manage/sites/${siteId}/gst`, { headers: await authHeaders() });
            onClose(profileRes.ok ? await profileRes.json() : null);
        } finally {
            setBusy('none');
        }
    };

    const handleVerify = async () => {
        setVerifyError(null);
        setVerified(null);
        const cleanGstin = gstin.toUpperCase().trim();
        if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/.test(cleanGstin)) {
            setVerifyError({ kind: 'other', message: 'GSTIN must be 15 characters in the official format.' });
            return;
        }
        if (!ownerName.trim())  { setVerifyError({ kind: 'other', message: 'Owner name is required.' });   return; }
        if (!address.trim())    { setVerifyError({ kind: 'other', message: 'Address is required.' });      return; }
        if (!/^[0-9]{6}$/.test(pincode)) { setVerifyError({ kind: 'other', message: 'Pincode must be 6 digits.' }); return; }
        if (!state)             { setVerifyError({ kind: 'other', message: 'State is required.' });        return; }

        setBusy('verify');
        try {
            const res = await fetch(`/api/manage/sites/${siteId}/gst/verify`, {
                method: 'POST',
                headers: await authHeaders(),
                body:    JSON.stringify({ gstin: cleanGstin, ownerName, address, pincode, state }),
            });
            const data = await res.json().catch(() => ({}));

            if (res.status === 503 || data.status === 'unavailable') {
                setVerifyError({ kind: 'unavailable', message: 'GST verification service is temporarily unavailable. Please try again in a moment.' });
                return;
            }
            if (data.status === 'inactive') {
                setVerifyError({
                    kind:    'inactive',
                    message: `This GSTIN is not active right now${data.legalName ? ` (registered to ${data.legalName})` : ''}. We cannot enable GST collection on an inactive GSTIN.`,
                });
                return;
            }
            if (data.status === 'state_mismatch' || data.code === 'state_mismatch') {
                setVerifyError({
                    kind:    'state_mismatch',
                    message: `This GSTIN is registered in ${data.apiState}, not ${state}. Please correct the State field above.`,
                });
                return;
            }
            if (!res.ok || data.status !== 'verified') {
                setVerifyError({ kind: 'other', message: data.error ?? 'Verification failed.' });
                return;
            }
            setVerified({
                gstin:     data.gstin,
                legalName: data.legalName,
                tradeName: data.tradeName,
                address:   data.address,
                state:     data.state,
            });
        } catch {
            setVerifyError({ kind: 'unavailable', message: 'Could not reach the verification service.' });
        } finally {
            setBusy('none');
        }
    };

    const handleSaveRegistered = async () => {
        if (!verified || !rate) return;
        setBusy('save');
        try {
            const res = await fetch(`/api/manage/sites/${siteId}/gst/complete`, {
                method: 'POST',
                headers: await authHeaders(),
                body:    JSON.stringify({
                    kind: 'registered', gstin: verified.gstin, ownerName, address, pincode, state, ratePct: rate,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.status !== 'ok') {
                toast.error(data.error ?? 'Failed to save GST profile.');
                return;
            }
            toast.success('GST profile saved — your store is now GST-compliant.');
            const profileRes = await fetch(`/api/manage/sites/${siteId}/gst`, { headers: await authHeaders() });
            onClose(profileRes.ok ? await profileRes.json() : null);
        } finally {
            setBusy('none');
        }
    };

    const closeButton = (
        <button
            onClick={() => onClose(null)}
            disabled={busy !== 'none'}
            aria-label="Close"
            style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer' }}
        >
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#71717A' }}>close</span>
        </button>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
            <div className="bg-white w-full flex flex-col" style={{ maxWidth: 520, borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.22)', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>

                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #E4E4E7' }}>
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#5137EF' }}>verified_user</span>
                        <h2 className="font-semibold" style={{ fontSize: 16, color: '#0A0A0A' }}>GST Compliance Setup</h2>
                    </div>
                    <p style={{ fontSize: 12, color: '#71717A', marginTop: 4 }}>Step {step} of {step === 1 ? 1 : 3}</p>
                </div>
                {closeButton}

                {/* Step 1 ─────────────────────────────────────────────────── */}
                {step === 1 && (
                    <div style={{ padding: 24 }}>
                        <h3 className="font-semibold" style={{ fontSize: 18, color: '#0A0A0A', marginBottom: 8 }}>
                            Is your business GST-registered?
                        </h3>
                        <p style={{ fontSize: 13, color: '#52525C', marginBottom: 20, lineHeight: '20px' }}>
                            If you have a GSTIN, we&rsquo;ll verify it and start adding GST to your customer bills automatically.
                            If not, no problem — you can mark this step complete and move on.
                        </p>

                        <button
                            onClick={() => setStep(2)}
                            disabled={busy !== 'none'}
                            className="w-full hover:bg-[#FAFAFA] transition-colors"
                            style={{ textAlign: 'left', padding: '16px 18px', borderRadius: 12, border: '1px solid #E4E4E7', background: '#fff', cursor: 'pointer', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}
                        >
                            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#EEEEFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#5137EF' }}>check</span>
                            </div>
                            <div style={{ flex: 1 }}>
                                <p className="font-semibold" style={{ fontSize: 14, color: '#0A0A0A' }}>Yes, I have a GSTIN</p>
                                <p style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>I&rsquo;ll provide it and we&rsquo;ll start collecting GST.</p>
                            </div>
                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#99A1AF' }}>arrow_forward</span>
                        </button>

                        <button
                            onClick={handleNotRegistered}
                            disabled={busy !== 'none'}
                            className="w-full hover:bg-[#FAFAFA] transition-colors"
                            style={{ textAlign: 'left', padding: '16px 18px', borderRadius: 12, border: '1px solid #E4E4E7', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
                        >
                            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#71717A' }}>close</span>
                            </div>
                            <div style={{ flex: 1 }}>
                                <p className="font-semibold" style={{ fontSize: 14, color: '#0A0A0A' }}>No, I&rsquo;m not GST-registered</p>
                                <p style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>Skip this — bills won&rsquo;t include GST.</p>
                            </div>
                            {busy === 'save'
                                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-[#5137EF]" />
                                : <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#99A1AF' }}>arrow_forward</span>}
                        </button>
                    </div>
                )}

                {/* Step 2 ─────────────────────────────────────────────────── */}
                {step === 2 && (
                    <div style={{ padding: 24 }}>
                        <h3 className="font-semibold" style={{ fontSize: 18, color: '#0A0A0A', marginBottom: 8 }}>GSTIN details</h3>
                        <p style={{ fontSize: 13, color: '#52525C', marginBottom: 20, lineHeight: '20px' }}>
                            We&rsquo;ll verify your GSTIN against the official GST registry. Make sure the state matches the one your GSTIN is registered in.
                        </p>

                        <div className="flex flex-col gap-4">
                            <div>
                                <label style={labelStyle}>GSTIN <span style={{ color: '#E7000B' }}>*</span></label>
                                <input
                                    value={gstin}
                                    onChange={e => { setGstin(e.target.value.toUpperCase()); setVerified(null); setVerifyError(null); }}
                                    placeholder="22AAAAA0000A1Z5"
                                    maxLength={15}
                                    disabled={busy !== 'none' || verified !== null}
                                    style={{ ...inputStyle, fontFamily: 'monospace', letterSpacing: 1 }}
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>Owner name <span style={{ color: '#E7000B' }}>*</span></label>
                                <input value={ownerName} onChange={e => setOwnerName(e.target.value)} disabled={busy !== 'none' || verified !== null} style={inputStyle} placeholder="Proprietor / signatory" />
                            </div>
                            <div>
                                <label style={labelStyle}>Registered address <span style={{ color: '#E7000B' }}>*</span></label>
                                <textarea value={address} onChange={e => setAddress(e.target.value)} rows={3} disabled={busy !== 'none' || verified !== null} style={{ ...inputStyle, resize: 'none' }} placeholder="Building, street, area, city" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label style={labelStyle}>Pincode <span style={{ color: '#E7000B' }}>*</span></label>
                                    <input value={pincode} onChange={e => setPincode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} disabled={busy !== 'none' || verified !== null} style={inputStyle} placeholder="560001" inputMode="numeric" />
                                </div>
                                <div>
                                    <label style={labelStyle}>State <span style={{ color: '#E7000B' }}>*</span></label>
                                    <select value={state} onChange={e => setState(e.target.value)} disabled={busy !== 'none' || verified !== null} style={inputStyle}>
                                        <option value="">Select state…</option>
                                        {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {verifyError && (
                            <div style={{
                                marginTop: 16, padding: '12px 14px', borderRadius: 8, fontSize: 13,
                                background: verifyError.kind === 'inactive' ? '#FEF2F2' : verifyError.kind === 'unavailable' ? '#FFFBEB' : '#FEF2F2',
                                color:      verifyError.kind === 'inactive' ? '#991B1B' : verifyError.kind === 'unavailable' ? '#92400E' : '#991B1B',
                                border:     `1px solid ${verifyError.kind === 'inactive' ? '#FECACA' : verifyError.kind === 'unavailable' ? '#FDE68A' : '#FECACA'}`,
                            }}>
                                {verifyError.message}
                                {verifyError.kind === 'inactive' && (
                                    <div style={{ marginTop: 8 }}>
                                        <button onClick={() => setStep(1)} style={{ fontSize: 12, fontWeight: 600, color: '#991B1B', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
                                            Go back and mark this store as not GST-registered
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {verified && (
                            <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 8, background: '#ECFDF5', border: '1px solid #A7F3D0' }}>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#047857' }}>verified</span>
                                    <p className="font-semibold" style={{ fontSize: 13, color: '#065F46' }}>GSTIN verified · Active</p>
                                </div>
                                <div style={{ fontSize: 12, color: '#065F46', lineHeight: '18px' }}>
                                    {verified.legalName && <p><strong>Legal name:</strong> {verified.legalName}</p>}
                                    {verified.tradeName && <p><strong>Trade name:</strong> {verified.tradeName}</p>}
                                    {verified.address   && <p style={{ marginTop: 2 }}><strong>Registered address:</strong> {verified.address}</p>}
                                </div>
                            </div>
                        )}

                        <div className="flex justify-between items-center mt-5 gap-3">
                            <button onClick={() => setStep(1)} disabled={busy !== 'none'} style={{ fontSize: 13, color: '#52525C', background: 'none', border: 'none', cursor: 'pointer' }}>← Back</button>
                            {verified ? (
                                <button
                                    onClick={() => setStep(3)}
                                    className="hover:opacity-90"
                                    style={{ background: '#5137EF', color: '#fff', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 500, border: 'none', cursor: 'pointer' }}
                                >
                                    Continue →
                                </button>
                            ) : (
                                <button
                                    onClick={handleVerify}
                                    disabled={busy !== 'none'}
                                    className="flex items-center gap-2 hover:opacity-90"
                                    style={{ background: '#5137EF', color: '#fff', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 500, border: 'none', cursor: busy === 'verify' ? 'wait' : 'pointer' }}
                                >
                                    {busy === 'verify' && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                                    {busy === 'verify' ? 'Verifying…' : 'Verify GSTIN'}
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Step 3 ─────────────────────────────────────────────────── */}
                {step === 3 && (
                    <div style={{ padding: 24 }}>
                        <h3 className="font-semibold" style={{ fontSize: 18, color: '#0A0A0A', marginBottom: 8 }}>How much GST do you collect?</h3>
                        <p style={{ fontSize: 13, color: '#52525C', marginBottom: 20, lineHeight: '20px' }}>
                            Pick the rate the GST Council has prescribed for your restaurant. If you&rsquo;re not sure, check with your CA — this affects every future bill.
                        </p>

                        {([5, 18] as const).map(r => (
                            <button
                                key={r}
                                onClick={() => setRate(r)}
                                disabled={busy !== 'none'}
                                className="w-full transition-colors"
                                style={{
                                    textAlign: 'left', padding: '14px 18px', borderRadius: 12, marginBottom: 12, cursor: 'pointer',
                                    border: rate === r ? '2px solid #5137EF' : '1px solid #E4E4E7',
                                    background: rate === r ? '#EEEEFF' : '#fff',
                                    display: 'flex', alignItems: 'flex-start', gap: 12,
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 20, color: rate === r ? '#5137EF' : '#99A1AF', marginTop: 1 }}>
                                    {rate === r ? 'radio_button_checked' : 'radio_button_unchecked'}
                                </span>
                                <div style={{ flex: 1 }}>
                                    <p className="font-semibold" style={{ fontSize: 14, color: '#0A0A0A' }}>{r}% GST</p>
                                    <p style={{ fontSize: 12, color: '#71717A', marginTop: 2, lineHeight: '18px' }}>
                                        {r === 5
                                            ? 'Standard rate for most restaurants — without Input Tax Credit.'
                                            : 'AC restaurants located in specified premises (e.g. 5-star hotels) — with Input Tax Credit.'}
                                    </p>
                                </div>
                            </button>
                        ))}

                        <p style={{ fontSize: 11, color: '#99A1AF', marginTop: 4 }}>
                            Reference:{' '}
                            <a href="https://www.gst.gov.in/" target="_blank" rel="noopener noreferrer" style={{ color: '#5137EF', textDecoration: 'underline' }}>
                                GST Council notifications
                            </a>
                        </p>

                        <div className="flex justify-between items-center mt-6 gap-3">
                            <button onClick={() => setStep(2)} disabled={busy !== 'none'} style={{ fontSize: 13, color: '#52525C', background: 'none', border: 'none', cursor: 'pointer' }}>← Back</button>
                            <button
                                onClick={handleSaveRegistered}
                                disabled={!rate || busy !== 'none'}
                                className="flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
                                style={{ background: '#5137EF', color: '#fff', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 500, border: 'none', cursor: busy === 'save' ? 'wait' : 'pointer' }}
                            >
                                {busy === 'save' && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                                {busy === 'save' ? 'Saving…' : 'Save & finish'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
