'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useAuth } from '@/components/AuthContext';
import { useSite } from '@/components/SiteContext';
import { useNotifications } from '@/components/NotificationContext';
import { supabase } from '@/lib/platform/db/supabase';
import { Skeleton, Spinner } from '@/components/loading';
import { BUSINESS_TYPES } from '@/lib/store/businessTypes';
import { TIME_SLOTS, isPickerTiming } from '@/lib/store/storeTiming';
import { deleteStore } from '@/lib/store/deleteStore';
import {
    STORE_DETAILS_COLUMNS, canConfirmDelete, detailsUpdate, formFromRow, isDirty, validateStoreDetails,
    type StoreDetailsForm, type StoreDetailsRow,
} from '@/lib/you/storeDetails';
import SubPage from '@/components/you/SubPage';
import Sheet from '@/components/you/Sheet';
import { Y, rise } from '@/components/you/YouStyles';
import { Card, Icon, Pill, Toggle, fieldStyle, hintStyle, labelStyle, primaryButton, quietButton, secondaryButton } from '@/components/you/YouKit';

/**
 * Store details on a phone: four short cards, one question each, and a Save
 * bar that appears only once something has changed. Writes the same `sites`
 * columns as the settings tab (detailsUpdate).
 */

const cardPad: React.CSSProperties = { padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 18 };
const cardTitle: React.CSSProperties = { margin: 0, fontSize: 16, fontWeight: 700 };

function TimeField({ label, value, onChange, disabled }: { label: string; value: string | null; onChange: (v: string | null) => void; disabled?: boolean }) {
    const id = `you-time-${label.toLowerCase()}`;
    return (
        <label htmlFor={id} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 2, minHeight: 64, padding: '10px 12px', borderRadius: 12, border: `1px solid ${Y.field}`, background: Y.white, boxSizing: 'border-box' }}>
            <span style={{ fontSize: 12, color: Y.muted }}>{label}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 16, fontWeight: 600, color: value ? Y.ink : Y.brand }}>
                <Icon icon="schedule" size={18} color={value ? Y.muted : Y.brand} />
                {value ?? 'Set time'}
            </span>
            {/* The phone's own picker: a wheel on iOS, a list on Android. */}
            <select
                id={id}
                value={value ?? ''}
                disabled={disabled}
                onChange={e => onChange(e.target.value || null)}
                aria-label={`${label} at`}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', fontSize: 16 }}
            >
                <option value="">{label} at…</option>
                {TIME_SLOTS.map(slot => <option key={slot} value={slot}>{slot}</option>)}
            </select>
        </label>
    );
}

export default function StoreDetailsPage() {
    const router = useRouter();
    const { user } = useAuth();
    const { activeSite, refreshSites } = useSite();
    const { refresh } = useNotifications();

    const [saved, setSaved] = useState<StoreDetailsForm | null>(null);
    const [form, setForm] = useState<StoreDetailsForm | null>(null);
    const [rawTiming, setRawTiming] = useState<string | null>(null);
    const [seededPhone, setSeededPhone] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [leaveAction, setLeaveAction] = useState<(() => void) | null>(null);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [typedName, setTypedName] = useState('');
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        const siteId = activeSite?.id;
        if (!siteId) return;
        let cancelled = false;
        setForm(null);
        setLoadFailed(false);
        supabase.from('sites').select(STORE_DETAILS_COLUMNS).eq('id', siteId).single().then(({ data, error: e }) => {
            if (cancelled) return;
            if (e || !data) { setLoadFailed(true); return; }
            const row = data as unknown as StoreDetailsRow;
            const asSaved = formFromRow(row);
            // The OTP-verified number fills an empty phone — shown as a change
            // to save, never silently written.
            const withSeed = formFromRow(row, user?.phoneNumber ?? null);
            setSaved(asSaved);
            setForm(withSeed);
            setSeededPhone(withSeed.phone !== asSaved.phone);
            setRawTiming(row.timing);
        });
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on store switch (or a retry) only
    }, [activeSite?.id, attempt]);

    const dirty = !!(saved && form && isDirty(saved, form));
    const set = (patch: Partial<StoreDetailsForm>) => { setError(null); setForm(f => (f ? { ...f, ...patch } : f)); };
    const hoursSet = !!form && (form.timing.open247 || (!!form.timing.opensAt && !!form.timing.closesAt));
    const legacyHours = !!rawTiming && !isPickerTiming(rawTiming);

    const handleSave = async (): Promise<boolean> => {
        if (!form || !activeSite || saving) return false;
        const problem = validateStoreDetails(form);
        if (problem) { setError(problem); toast.error(problem); return false; }
        setSaving(true);
        const update = detailsUpdate(form, rawTiming);
        const { error: e } = await supabase.from('sites').update(update).eq('id', activeSite.id);
        setSaving(false);
        if (e) { toast.error('Could not save. Please try again.'); return false; }
        setSaved(form);
        setSeededPhone(false);
        setRawTiming(update.timing);
        toast.success('Store details saved');
        refreshSites();
        refresh();
        return true;
    };

    const handleDelete = async () => {
        if (!activeSite || !user || deleting || !canConfirmDelete(typedName, activeSite.name)) return;
        setDeleting(true);
        try {
            const { remaining } = await deleteStore(activeSite.id, user.id);
            toast.success('Store deleted');
            await refreshSites();
            router.replace(remaining > 0 ? '/manage/dashboard' : '/onboarding?intent=first-store');
        } catch {
            toast.error('Could not delete the store. Please try again.');
            setDeleting(false);
        }
    };

    const footer = dirty ? (
        <div className="you-rise" style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={() => { setForm(saved); setError(null); }} disabled={saving} className="you-press" style={{ ...secondaryButton, width: 'auto', minHeight: 52, padding: '0 18px' }}>
                Undo
            </button>
            <button type="button" onClick={handleSave} disabled={saving} className="you-press" style={{ ...primaryButton, flex: 1 }}>
                {saving ? <><Spinner size="sm" tone="onBrand" />Saving…</> : 'Save changes'}
            </button>
        </div>
    ) : undefined;

    return (
        <SubPage
            title="Store details"
            footer={footer}
            onBack={leave => (dirty ? setLeaveAction(() => leave) : leave())}
        >
            {!form ? (
                loadFailed ? (
                    <Card style={{ padding: 24, textAlign: 'center' }}>
                        <p style={{ margin: '0 0 12px', fontSize: 15, color: Y.text }}>Could not load your store details.</p>
                        <button type="button" onClick={() => setAttempt(n => n + 1)} className="you-press" style={{ ...secondaryButton, width: 'auto', margin: '0 auto', padding: '0 20px' }}>Try again</button>
                    </Card>
                ) : (
                    <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <Skeleton height={300} radius={16} />
                        <Skeleton height={190} radius={16} />
                        <Skeleton height={190} radius={16} />
                    </div>
                )
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <Card aria-labelledby="sd-about" className="you-rise" style={{ ...rise(0), ...cardPad }}>
                        <h2 id="sd-about" style={cardTitle}>About your store</h2>
                        <div>
                            <label htmlFor="sd-name" style={labelStyle}>Store name</label>
                            <input id="sd-name" value={form.name} onChange={e => set({ name: e.target.value })} autoComplete="organization"
                                className="you-field" aria-invalid={error === 'Add your store name'} style={{ ...fieldStyle, borderColor: error === 'Add your store name' ? Y.bad.dot : Y.field }} />
                        </div>
                        <div>
                            <span id="sd-type" style={labelStyle}>Type of place</span>
                            <div role="radiogroup" aria-labelledby="sd-type" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {BUSINESS_TYPES.map(t => {
                                    const on = form.businessType === t.id;
                                    return (
                                        <button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => set({ businessType: t.id })} className="you-press you-focus"
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 6, minHeight: 40, padding: on ? '0 13px' : '0 14px', borderRadius: 999,
                                                border: on ? `2px solid ${Y.brand}` : `1px solid ${Y.line}`, background: on ? Y.brandBg : Y.white,
                                                color: on ? Y.brandDeep : Y.ink, fontFamily: 'inherit', fontSize: 14, fontWeight: on ? 600 : 500, cursor: 'pointer',
                                            }}>
                                            <Icon icon={t.icon} size={18} />
                                            {t.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div>
                            <label htmlFor="sd-phone" style={labelStyle}>Phone for customers</label>
                            <input id="sd-phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={e => { setSeededPhone(false); set({ phone: e.target.value }); }}
                                placeholder="+91 98765 43210" className="you-field" style={fieldStyle} />
                            <span style={hintStyle}>{seededPhone ? 'This is your sign-in number. Change it if customers should call another — then save.' : 'Can be your counter number.'}</span>
                        </div>
                    </Card>

                    <Card aria-labelledby="sd-where" className="you-rise" style={{ ...rise(1), ...cardPad }}>
                        <h2 id="sd-where" style={cardTitle}>Where you are</h2>
                        <div>
                            <label htmlFor="sd-area" style={labelStyle}>Area and city</label>
                            <input id="sd-area" value={form.location} onChange={e => set({ location: e.target.value })} placeholder="e.g. Anna Nagar, Madurai" className="you-field" style={fieldStyle} />
                        </div>
                        <div style={{ width: 170 }}>
                            <label htmlFor="sd-pin" style={labelStyle}>PIN code</label>
                            <input id="sd-pin" inputMode="numeric" autoComplete="postal-code" maxLength={6} value={form.pincode}
                                onChange={e => set({ pincode: e.target.value.replace(/\D/g, '') })} placeholder="625001"
                                className="you-field" aria-invalid={error?.includes('PIN')} style={{ ...fieldStyle, letterSpacing: '0.08em', borderColor: error?.includes('PIN') ? Y.bad.dot : Y.field }} />
                        </div>
                    </Card>

                    <Card aria-labelledby="sd-hours" className="you-rise" style={{ ...rise(2), ...cardPad, gap: 14, border: hoursSet || legacyHours ? `1px solid ${Y.line}` : `2px solid #F5B45B`, padding: hoursSet || legacyHours ? '18px 16px' : '17px 15px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <h2 id="sd-hours" style={{ ...cardTitle, flex: 1 }}>Opening hours</h2>
                            {!hoursSet && !legacyHours && <Pill tone="warn">Not set</Pill>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44 }}>
                            <span id="sd-247" style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>Open 24 hours</span>
                            <Toggle checked={form.timing.open247} labelledBy="sd-247" onChange={on => set({ timing: { ...form.timing, open247: on } })} />
                        </div>
                        {!form.timing.open247 && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                                <TimeField label="Opens" value={form.timing.opensAt} onChange={v => set({ timing: { ...form.timing, opensAt: v } })} />
                                <TimeField label="Closes" value={form.timing.closesAt} onChange={v => set({ timing: { ...form.timing, closesAt: v } })} />
                            </div>
                        )}
                        {legacyHours && !hoursSet && (
                            <span style={{ ...hintStyle, marginTop: 0 }}>Your menu shows “{rawTiming}”. Pick times to replace it.</span>
                        )}
                    </Card>

                    <div className="you-rise" style={{ ...rise(3), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, paddingTop: 16 }}>
                        <button type="button" onClick={() => { setTypedName(''); setDeleteOpen(true); }} className="you-press you-focus" style={{ ...quietButton, color: Y.danger, fontSize: 14, fontWeight: 500 }}>
                            <Icon icon="delete" size={18} />
                            Delete this store
                        </button>
                        <span style={{ fontSize: 12, color: Y.muted }}>Removes its menu, dishes and banners for good.</span>
                    </div>
                </div>
            )}

            {/* Unsaved changes on the way out. */}
            <Sheet open={!!leaveAction} onClose={() => setLeaveAction(null)} labelledBy="sd-discard-title">
                <h2 id="sd-discard-title" style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Discard changes?</h2>
                <p style={{ margin: '6px 0 20px', fontSize: 15, lineHeight: '22px', color: Y.text }}>You changed your store details but did not save them.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button type="button" data-autofocus onClick={async () => { const go = leaveAction; setLeaveAction(null); if (await handleSave()) go?.(); }} className="you-press" style={primaryButton}>Save changes</button>
                    <button type="button" onClick={() => { const go = leaveAction; setLeaveAction(null); go?.(); }} className="you-press you-focus" style={{ ...quietButton, width: '100%', minHeight: 48, color: Y.danger }}>Discard</button>
                </div>
            </Sheet>

            {/* Delete: the store name typed back, as on desktop. */}
            <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} labelledBy="sd-delete-title" busy={deleting}>
                <span style={{ width: 48, height: 48, borderRadius: 14, background: Y.bad.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                    <Icon icon="delete_forever" size={26} color={Y.danger} />
                </span>
                <h2 id="sd-delete-title" style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Delete {activeSite?.name}?</h2>
                <p style={{ margin: '6px 0 16px', fontSize: 15, lineHeight: '22px', color: Y.text }}>
                    Its menu, dishes, photos and banners are deleted for good, and its QR code stops working. This cannot be undone.
                </p>
                <label htmlFor="sd-delete-name" style={labelStyle}>Type <strong>{activeSite?.name}</strong> to confirm</label>
                <input id="sd-delete-name" value={typedName} onChange={e => setTypedName(e.target.value)} autoComplete="off" disabled={deleting} className="you-field" style={{ ...fieldStyle, marginBottom: 16 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button type="button" onClick={handleDelete} disabled={!activeSite || !canConfirmDelete(typedName, activeSite.name) || deleting} className="you-press"
                        style={{ ...primaryButton, background: Y.danger, opacity: activeSite && canConfirmDelete(typedName, activeSite.name) ? 1 : 0.45 }}>
                        {deleting ? <><Spinner size="sm" tone="onBrand" />Deleting…</> : 'Delete store'}
                    </button>
                    <button type="button" onClick={() => setDeleteOpen(false)} disabled={deleting} className="you-press you-focus" style={{ ...quietButton, width: '100%', minHeight: 48, color: Y.ink }}>Keep my store</button>
                </div>
            </Sheet>
        </SubPage>
    );
}
