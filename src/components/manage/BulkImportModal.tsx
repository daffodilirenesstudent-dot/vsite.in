'use client';

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { firebaseAuth } from '@/lib/firebase';
import { compressImage } from '@/lib/imageCompress';

interface BulkImportModalProps {
  siteId: string;
  siteName: string;
  onClose: () => void;
  onSuccess: (count: number) => void;
}

type Phase = 'upload' | 'processing' | 'results' | 'error';

const MONTHLY_LIMIT = 10;
const SESSION_MAX = 3;
const STEP_MESSAGES = [
  'Reading your menu photos…',
  'Matching product images…',
  'Adding to your inventory…',
];

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function nextMonthLabel(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return next.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function BulkImportModal({ siteId, siteName, onClose, onSuccess }: BulkImportModalProps) {
  const [phase, setPhase] = useState<Phase>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [quotaUsed, setQuotaUsed] = useState<number | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [addedCount, setAddedCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch this month's usage on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const userId = firebaseAuth.currentUser?.uid;
      if (!userId) { setQuotaUsed(0); return; }
      const { data } = await supabase
        .from('bulk_import_usage')
        .select('photos_used')
        .eq('user_id', userId)
        .eq('month', currentMonth())
        .maybeSingle();
      if (!cancelled) setQuotaUsed((data as { photos_used: number } | null)?.photos_used ?? 0);
    })();
    return () => { cancelled = true; };
  }, []);

  const quotaExhausted = quotaUsed !== null && quotaUsed >= MONTHLY_LIMIT;
  const sessionMax = Math.min(SESSION_MAX, quotaUsed !== null ? MONTHLY_LIMIT - quotaUsed : SESSION_MAX);
  const canClose = phase !== 'processing';

  const addFiles = (raw: FileList | null) => {
    if (!raw) return;
    setFiles(prev => {
      const accepted: File[] = [];
      for (let i = 0; i < raw.length && prev.length + accepted.length < sessionMax; i++) {
        if (raw[i].type.startsWith('image/')) accepted.push(raw[i]);
      }
      return [...prev, ...accepted].slice(0, sessionMax);
    });
  };

  const removeFile = (i: number) => setFiles(prev => prev.filter((_, j) => j !== i));

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  };

  const startProcessing = async () => {
    if (files.length === 0) return;
    setPhase('processing');
    setStepIdx(0);

    let idx = 0;
    stepTimerRef.current = setInterval(() => {
      idx = Math.min(idx + 1, STEP_MESSAGES.length - 1);
      setStepIdx(idx);
    }, 4000);

    try {
      const user = firebaseAuth.currentUser;
      if (!user) throw new Error('Not authenticated. Please refresh and try again.');
      const token = await user.getIdToken();

      // Compress before upload (Vercel 4.5 MB body cap)
      const compressed = await Promise.all(files.map(f => compressImage(f)));

      // Step 1 — extract items from photos via existing endpoint
      const formData = new FormData();
      formData.append('shopName', siteName);
      compressed.forEach(f => formData.append('photos', f));

      const extractRes = await fetch('/api/onboarding/extract', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const extractData = await extractRes.json();
      if (!extractRes.ok) throw new Error(extractData.error ?? 'Could not read menu from photos.');

      setStepIdx(1);

      // Step 2 — insert into existing site
      const insertRes = await fetch('/api/bulk-import/insert', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          siteId,
          items: extractData.items,
          photosCount: files.length,
        }),
      });
      const insertData = await insertRes.json();
      if (!insertRes.ok) throw new Error(insertData.error ?? 'Failed to save products.');

      setStepIdx(2);
      await new Promise(r => setTimeout(r, 700));

      clearInterval(stepTimerRef.current!);
      setAddedCount(insertData.inserted);
      setPhase('results');
      onSuccess(insertData.inserted);
    } catch (err: unknown) {
      clearInterval(stepTimerRef.current!);
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.');
      setPhase('error');
    }
  };

  const purple = '#5137EF';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.40)' }}
      onClick={canClose ? onClose : undefined}
    >
      <div
        className="bg-white flex flex-col"
        style={{ width: 'min(480px, 95vw)', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #E4E4E7', flexShrink: 0 }}>
          <div className="flex items-start justify-between">
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0A0A0A', lineHeight: '28px' }}>Add Bulk Products</h2>
              <p style={{ fontSize: 13, color: '#71717A', marginTop: 2 }}>Upload menu photos — AI extracts and adds items automatically</p>
            </div>
            {canClose && (
              <button
                onClick={onClose}
                className="flex items-center justify-center hover:bg-neutral-100 transition-colors"
                style={{ width: 32, height: 32, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#71717A' }}>close</span>
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>

          {/* ── UPLOAD ── */}
          {phase === 'upload' && (
            <>
              {/* Quota row */}
              <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
                {quotaUsed === null ? (
                  <div style={{ height: 26, width: 180, background: '#F4F4F5', borderRadius: 6 }} />
                ) : (
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 13, color: '#52525C' }}>Monthly quota:</span>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center',
                      background: quotaExhausted ? '#FEE2E2' : '#F0EDFF',
                      color: quotaExhausted ? '#E7000B' : purple,
                      borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600,
                    }}>
                      {quotaUsed} / {MONTHLY_LIMIT} photos used
                    </span>
                  </div>
                )}
                {quotaUsed !== null && !quotaExhausted && (
                  <span style={{ fontSize: 11, color: '#99A1AF' }}>Resets {nextMonthLabel()}</span>
                )}
              </div>

              {quotaExhausted ? (
                <div style={{ border: '1px solid #FED7AA', borderRadius: 10, padding: '24px 16px', background: '#FFF7ED', textAlign: 'center', marginBottom: 20 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#EA580C', display: 'block', marginBottom: 8 }}>event_busy</span>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#9A3412', marginBottom: 4 }}>Monthly limit reached</p>
                  <p style={{ fontSize: 12, color: '#C2410C' }}>
                    You&apos;ve used all {MONTHLY_LIMIT} photos this month. Resets on {nextMonthLabel()}.
                  </p>
                </div>
              ) : (
                <>
                  {/* Hidden file input — lives OUTSIDE the drop zone so its bubbled
                      click events don't re-trigger the drop zone onClick handler */}
                  <input
                    ref={fileInputRef}
                    id="bulk-photo-input"
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
                  />

                  {/* Drop zone */}
                  <div
                    onDrop={handleDrop}
                    onDragOver={e => e.preventDefault()}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center"
                    style={{ border: '1.5px dashed #C4C4C4', borderRadius: 12, padding: '28px 16px', background: '#FAFAFA', cursor: 'pointer', marginBottom: 14 }}
                  >
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#F0EDFF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 24, color: purple }}>photo_camera</span>
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#0A0A0A', marginBottom: 4 }}>Drop menu photos here</p>
                    <p style={{ fontSize: 12, color: '#99A1AF', marginBottom: 12, textAlign: 'center' }}>
                      Up to {sessionMax} photo{sessionMax !== 1 ? 's' : ''} per scan · JPG, PNG or WebP
                    </p>
                    {/* Use a native label so the browser opens the file dialog without JS intermediary */}
                    <label
                      htmlFor="bulk-photo-input"
                      onClick={e => e.stopPropagation()}
                      style={{ border: '1px solid #E4E4E7', borderRadius: 8, padding: '7px 20px', fontSize: 13, fontWeight: 600, color: '#0A0A0A', background: '#FFFFFF', cursor: 'pointer', display: 'inline-block' }}
                    >
                      Choose Files
                    </label>
                  </div>

                  {/* Selected file chips */}
                  {files.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                      {files.map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F4F4F5', borderRadius: 8, padding: '6px 10px' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#52525C' }}>image</span>
                          <span style={{ fontSize: 12, color: '#0A0A0A', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                          <button
                            type="button"
                            onClick={() => removeFile(i)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#71717A' }}>close</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3" style={{ marginTop: 4 }}>
                <button
                  onClick={onClose}
                  style={{ border: '1px solid #E4E4E7', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 500, color: '#0A0A0A', background: '#FFFFFF', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                {!quotaExhausted && (
                  <button
                    onClick={startProcessing}
                    disabled={files.length === 0}
                    style={{
                      background: files.length === 0 ? '#B8AEEF' : purple,
                      borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600,
                      color: '#FFFFFF', border: 'none',
                      cursor: files.length === 0 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Scan &amp; Add
                  </button>
                )}
              </div>
            </>
          )}

          {/* ── PROCESSING ── */}
          {phase === 'processing' && (
            <div className="flex flex-col items-center" style={{ padding: '28px 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#F0EDFF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <span className="material-symbols-outlined animate-spin" style={{ fontSize: 28, color: purple }}>progress_activity</span>
              </div>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#0A0A0A', marginBottom: 8, textAlign: 'center' }}>
                {STEP_MESSAGES[stepIdx]}
              </p>
              <p style={{ fontSize: 12, color: '#99A1AF', textAlign: 'center', lineHeight: '18px' }}>
                This takes up to 30 seconds.<br />Please don&apos;t close this window.
              </p>
              <div style={{ display: 'flex', gap: 6, marginTop: 20 }}>
                {STEP_MESSAGES.map((_, i) => (
                  <div
                    key={i}
                    style={{ width: 8, height: 8, borderRadius: '50%', background: i <= stepIdx ? purple : '#E4E4E7', transition: 'background 0.3s' }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── RESULTS ── */}
          {phase === 'results' && (
            <div className="flex flex-col items-center" style={{ padding: '28px 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#13801C', fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              </div>
              <p style={{ fontSize: 18, fontWeight: 700, color: '#0A0A0A', marginBottom: 8, textAlign: 'center' }}>
                {addedCount} product{addedCount !== 1 ? 's' : ''} added!
              </p>
              <p style={{ fontSize: 13, color: '#52525C', textAlign: 'center', marginBottom: 24, lineHeight: '20px' }}>
                Your inventory is updated. Items are now live on your menu.
              </p>
              <button
                onClick={onClose}
                style={{ background: purple, borderRadius: 8, padding: '10px 32px', fontSize: 14, fontWeight: 600, color: '#FFFFFF', border: 'none', cursor: 'pointer' }}
              >
                Done
              </button>
            </div>
          )}

          {/* ── ERROR ── */}
          {phase === 'error' && (
            <div className="flex flex-col items-center" style={{ padding: '28px 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#E7000B' }}>error</span>
              </div>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#0A0A0A', marginBottom: 8, textAlign: 'center' }}>Something went wrong</p>
              <p style={{ fontSize: 13, color: '#52525C', textAlign: 'center', marginBottom: 24, lineHeight: '20px' }}>
                {errorMsg}
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={onClose}
                  style={{ border: '1px solid #E4E4E7', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 500, color: '#0A0A0A', background: '#FFFFFF', cursor: 'pointer' }}
                >
                  Close
                </button>
                <button
                  onClick={() => { setPhase('upload'); setErrorMsg(''); setFiles([]); }}
                  style={{ background: purple, borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 500, color: '#FFFFFF', border: 'none', cursor: 'pointer' }}
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
