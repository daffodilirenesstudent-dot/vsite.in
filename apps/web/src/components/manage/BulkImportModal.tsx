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

interface ExtractedItem {
  name: string;
  price: number;
  description: string;
  category: string;
  item_type: string;
  food_type: 'veg' | 'non_veg' | 'egg' | 'unknown';
  variants?: { size: string; price: number }[];
  star_rating: number;
  profit_tier: number;
  prep_complexity_tier: number;
}

type Phase = 'upload' | 'processing' | 'review' | 'inserting' | 'results' | 'error';

const DAILY_LIMIT = 15;
const SESSION_MAX = 5;
const MAX_STAR_SELECT = 3;
const MAX_PROFIT_SELECT = 3;
const SELECTED_TIER = 4;
const DEFAULT_TIER = 2;

const STEP_MESSAGES = [
  'Reading your menu photos…',
  'Writing descriptions…',
  'Matching product images…',
];

function currentDay(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function tomorrowLabel(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function FoodDot({ type }: { type: ExtractedItem['food_type'] }) {
  if (type === 'unknown') return <span style={{ display: 'block', width: 12, height: 12, borderRadius: 2, border: '1px solid #E4E4E7', background: '#FAFAFA' }} />;
  const bg = type === 'veg' ? '#16A34A' : type === 'non_veg' ? '#DC2626' : '#D97706';
  return (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 12, height: 12, borderRadius: 2, border: `1px solid ${bg}`, background: '#fff' }}>
      <span style={{ display: 'block', width: 6, height: 6, borderRadius: '50%', background: bg }} />
    </span>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function BulkImportModal({ siteId, siteName, onClose, onSuccess }: BulkImportModalProps) {
  const [phase, setPhase] = useState<Phase>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [quotaUsed, setQuotaUsed] = useState<number | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [reviewStep, setReviewStep] = useState<0 | 1>(0); // 0=bestsellers 1=profitable
  const [addedCount, setAddedCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const purple = '#5137EF';

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
        .eq('month', currentDay())
        .maybeSingle();
      if (!cancelled) setQuotaUsed((data as { photos_used: number } | null)?.photos_used ?? 0);
    })();
    return () => { cancelled = true; };
  }, []);

  const quotaExhausted = quotaUsed !== null && quotaUsed >= DAILY_LIMIT;
  const sessionMax = Math.min(SESSION_MAX, quotaUsed !== null ? DAILY_LIMIT - quotaUsed : SESSION_MAX);
  const canClose = phase !== 'processing' && phase !== 'inserting';

  // ── File handling ─────────────────────────────────────────────────────────
  const addFiles = (raw: FileList | null) => {
    if (!raw || raw.length === 0) return;
    const snapshot = Array.from(raw);
    setFiles(prev => {
      const slots = sessionMax - prev.length;
      if (slots <= 0) return prev;
      return [...prev, ...snapshot.slice(0, slots)];
    });
  };

  const removeFile = (i: number) => setFiles(prev => prev.filter((_, j) => j !== i));
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); addFiles(e.dataTransfer.files); };

  // ── Extract step ──────────────────────────────────────────────────────────
  const runExtract = async () => {
    if (files.length === 0) return;
    setPhase('processing');
    setStepIdx(0);

    let idx = 0;
    stepTimerRef.current = setInterval(() => {
      idx = Math.min(idx + 1, STEP_MESSAGES.length - 1);
      setStepIdx(idx);
    }, 5000);

    try {
      const user = firebaseAuth.currentUser;
      if (!user) throw new Error('Not authenticated. Please refresh and try again.');
      const token = await user.getIdToken();

      const compressed = await Promise.all(files.map(f => compressImage(f)));

      const formData = new FormData();
      compressed.forEach(f => formData.append('photos', f));

      const extractRes = await fetch('/api/bulk-import/extract', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const extractData = await extractRes.json();
      if (!extractRes.ok) throw new Error(extractData.error ?? 'Could not read items from photos.');

      clearInterval(stepTimerRef.current!);

      // Initialise tiers at default — user will set them in review
      const items: ExtractedItem[] = (extractData.items as Record<string, unknown>[]).map(i => ({
        name:                 String(i.name ?? ''),
        price:                Number(i.price) || 0,
        description:          String(i.description ?? ''),
        category:             String(i.category ?? ''),
        item_type:            String(i.item_type ?? 'single'),
        food_type:            (i.food_type as ExtractedItem['food_type']) ?? 'unknown',
        variants:             Array.isArray(i.variants) ? i.variants as { size: string; price: number }[] : [],
        star_rating:          DEFAULT_TIER,
        profit_tier:          DEFAULT_TIER,
        prep_complexity_tier: DEFAULT_TIER,
      }));

      setExtractedItems(items);
      setReviewStep(0);
      setPhase('review');
    } catch (err: unknown) {
      clearInterval(stepTimerRef.current!);
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.');
      setPhase('error');
    }
  };

  // ── Insert step (called after review) ────────────────────────────────────
  const runInsert = async () => {
    setPhase('inserting');
    try {
      const user = firebaseAuth.currentUser;
      if (!user) throw new Error('Not authenticated. Please refresh and try again.');
      const token = await user.getIdToken();

      const insertRes = await fetch('/api/bulk-import/insert', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, items: extractedItems, photosCount: files.length }),
      });
      const insertData = await insertRes.json();
      if (!insertRes.ok) throw new Error(insertData.error ?? 'Failed to save products.');

      setAddedCount(insertData.inserted);
      setPhase('results');
      onSuccess(insertData.inserted);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.');
      setPhase('error');
    }
  };

  // ── Review helpers ────────────────────────────────────────────────────────
  const starSelected   = extractedItems.filter(i => i.star_rating   === SELECTED_TIER).length;
  const profitSelected = extractedItems.filter(i => i.profit_tier   === SELECTED_TIER).length;

  const toggleStar = (idx: number) => {
    setExtractedItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const isSelected = item.star_rating === SELECTED_TIER;
      if (isSelected) return { ...item, star_rating: DEFAULT_TIER };
      if (starSelected >= MAX_STAR_SELECT) return item;
      return { ...item, star_rating: SELECTED_TIER };
    }));
  };

  const toggleProfit = (idx: number) => {
    setExtractedItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const isSelected = item.profit_tier === SELECTED_TIER;
      if (isSelected) return { ...item, profit_tier: DEFAULT_TIER };
      if (profitSelected >= MAX_PROFIT_SELECT) return item;
      return { ...item, profit_tier: SELECTED_TIER };
    }));
  };

  const skipReviewStep = () => {
    if (reviewStep === 0) {
      setExtractedItems(prev => prev.map(i => ({ ...i, star_rating: DEFAULT_TIER })));
      setReviewStep(1);
    } else {
      setExtractedItems(prev => prev.map(i => ({ ...i, profit_tier: DEFAULT_TIER })));
      runInsert();
    }
  };

  const continueReview = () => {
    if (reviewStep === 0) {
      setReviewStep(1);
    } else {
      runInsert();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.40)' }}
      onClick={canClose ? onClose : undefined}
    >
      <div
        className="bg-white flex flex-col"
        style={{ width: 'min(520px, 96vw)', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', maxHeight: '92vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #E4E4E7', flexShrink: 0 }}>
          <div className="flex items-start justify-between">
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0A0A0A', lineHeight: '28px' }}>Add Bulk Products</h2>
              <p style={{ fontSize: 13, color: '#71717A', marginTop: 2 }}>
                {phase === 'review' && reviewStep === 0 && 'Step 2 of 3 — Mark your bestsellers'}
                {phase === 'review' && reviewStep === 1 && 'Step 3 of 3 — Mark your high-margin items'}
                {(phase === 'upload' || phase === 'processing' || phase === 'inserting') && 'Upload menu photos — AI extracts and adds items automatically'}
                {phase === 'results' && 'Products added to your inventory'}
                {phase === 'error' && 'Something went wrong'}
              </p>
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

          {/* Step progress bar */}
          {(phase === 'upload' || phase === 'processing' || phase === 'review' || phase === 'inserting') && (
            <div style={{ display: 'flex', gap: 4, marginTop: 14 }}>
              {[0, 1, 2].map(s => {
                const p = phase as string;
                const done =
                  s === 0 ? (p !== 'upload') :
                  s === 1 ? (p === 'review' && reviewStep === 1) || p === 'inserting' || p === 'results' :
                  p === 'inserting' || p === 'results';
                const active =
                  s === 0 ? p === 'upload' || p === 'processing' :
                  s === 1 ? p === 'review' && reviewStep === 0 :
                  p === 'review' && reviewStep === 1;
                return (
                  <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: done ? purple : active ? purple : '#E4E4E7', opacity: active ? 0.5 : 1, transition: 'background 0.3s' }} />
                );
              })}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>

          {/* ── UPLOAD ── */}
          {phase === 'upload' && (
            <>
              <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
                {quotaUsed === null ? (
                  <div style={{ height: 26, width: 180, background: '#F4F4F5', borderRadius: 6 }} />
                ) : (
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 13, color: '#52525C' }}>Today&apos;s quota:</span>
                    <span style={{
                      background: quotaExhausted ? '#FEE2E2' : '#F0EDFF',
                      color: quotaExhausted ? '#E7000B' : purple,
                      borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600,
                    }}>
                      {quotaUsed} / {DAILY_LIMIT} photos used
                    </span>
                  </div>
                )}
                {quotaUsed !== null && !quotaExhausted && (
                  <span style={{ fontSize: 11, color: '#99A1AF' }}>Resets {tomorrowLabel()}</span>
                )}
              </div>

              {quotaExhausted ? (
                <div style={{ border: '1px solid #FED7AA', borderRadius: 10, padding: '24px 16px', background: '#FFF7ED', textAlign: 'center', marginBottom: 20 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#EA580C', display: 'block', marginBottom: 8 }}>event_busy</span>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#9A3412', marginBottom: 4 }}>Daily limit reached</p>
                  <p style={{ fontSize: 12, color: '#C2410C' }}>You&apos;ve used all {DAILY_LIMIT} photos today. Resets tomorrow ({tomorrowLabel()}).</p>
                </div>
              ) : (
                <>
                  <input
                    ref={fileInputRef}
                    id="bulk-photo-input"
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
                  />
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
                    <label
                      htmlFor="bulk-photo-input"
                      onClick={e => e.stopPropagation()}
                      style={{ border: '1px solid #E4E4E7', borderRadius: 8, padding: '7px 20px', fontSize: 13, fontWeight: 600, color: '#0A0A0A', background: '#FFFFFF', cursor: 'pointer', display: 'inline-block' }}
                    >
                      Choose Files
                    </label>
                  </div>

                  {files.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                      {files.map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F4F4F5', borderRadius: 8, padding: '6px 10px' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#52525C' }}>image</span>
                          <span style={{ fontSize: 12, color: '#0A0A0A', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                          <button type="button" onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#71717A' }}>close</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              <div className="flex items-center justify-end gap-3" style={{ marginTop: 4 }}>
                <button onClick={onClose} style={{ border: '1px solid #E4E4E7', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 500, color: '#0A0A0A', background: '#FFFFFF', cursor: 'pointer' }}>
                  Cancel
                </button>
                {!quotaExhausted && (
                  <button
                    onClick={runExtract}
                    disabled={files.length === 0}
                    style={{ background: files.length === 0 ? '#B8AEEF' : purple, borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600, color: '#FFFFFF', border: 'none', cursor: files.length === 0 ? 'not-allowed' : 'pointer' }}
                  >
                    Scan &amp; Review
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
              <p style={{ fontSize: 16, fontWeight: 600, color: '#0A0A0A', marginBottom: 8, textAlign: 'center' }}>{STEP_MESSAGES[stepIdx]}</p>
              <p style={{ fontSize: 12, color: '#99A1AF', textAlign: 'center', lineHeight: '18px' }}>This takes up to 30 seconds.<br />Please don&apos;t close this window.</p>
              <div style={{ display: 'flex', gap: 6, marginTop: 20 }}>
                {STEP_MESSAGES.map((_, i) => (
                  <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i <= stepIdx ? purple : '#E4E4E7', transition: 'background 0.3s' }} />
                ))}
              </div>
            </div>
          )}

          {/* ── REVIEW ── */}
          {phase === 'review' && (
            <>
              {/* Header */}
              <div style={{ marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0A0A0A', marginBottom: 4 }}>
                  {reviewStep === 0 ? 'Which items sell the most?' : 'Which items earn the most?'}
                </h3>
                <p style={{ fontSize: 12, color: '#71717A', lineHeight: '18px' }}>
                  {reviewStep === 0
                    ? `Pick up to ${MAX_STAR_SELECT} of your bestsellers — they'll appear at the top of your menu.`
                    : `Pick up to ${MAX_PROFIT_SELECT} items with the best profit margin — we'll prioritise them in your layout.`}
                </p>
              </div>

              {/* Counter */}
              <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                <div className="flex items-center gap-2">
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minWidth: 24, height: 24, borderRadius: 12, padding: '0 8px',
                    background: (reviewStep === 0 ? starSelected : profitSelected) > 0 ? purple : '#F4F4F5',
                    color: (reviewStep === 0 ? starSelected : profitSelected) > 0 ? '#fff' : '#71717A',
                    fontSize: 11, fontWeight: 600,
                  }}>
                    {reviewStep === 0 ? starSelected : profitSelected}
                  </span>
                  <span style={{ fontSize: 12, color: '#71717A' }}>
                    of {reviewStep === 0 ? MAX_STAR_SELECT : MAX_PROFIT_SELECT} selected
                  </span>
                </div>
                {(reviewStep === 0 ? starSelected : profitSelected) > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (reviewStep === 0) setExtractedItems(p => p.map(i => ({ ...i, star_rating: DEFAULT_TIER })));
                      else setExtractedItems(p => p.map(i => ({ ...i, profit_tier: DEFAULT_TIER })));
                    }}
                    style={{ fontSize: 12, color: '#99A1AF', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Item grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxHeight: 340, overflowY: 'auto', marginBottom: 16 }}>
                {extractedItems.map((item, idx) => {
                  const isSelected = reviewStep === 0 ? item.star_rating === SELECTED_TIER : item.profit_tier === SELECTED_TIER;
                  const limitHit   = reviewStep === 0 ? starSelected >= MAX_STAR_SELECT : profitSelected >= MAX_PROFIT_SELECT;
                  const isDisabled = !isSelected && limitHit;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => reviewStep === 0 ? toggleStar(idx) : toggleProfit(idx)}
                      disabled={isDisabled}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
                        borderRadius: 12, padding: '10px 12px', textAlign: 'left',
                        border: isSelected ? `2px solid ${purple}` : '1.5px solid #E4E4E7',
                        background: isSelected ? '#F0EDFF' : isDisabled ? '#FAFAFA' : '#FFFFFF',
                        opacity: isDisabled ? 0.5 : 1,
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
                        <FoodDot type={item.food_type} />
                        <span style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 18, height: 18, borderRadius: '50%',
                          border: isSelected ? `2px solid ${purple}` : '1.5px solid #E4E4E7',
                          background: isSelected ? purple : '#fff',
                        }}>
                          {isSelected && <span className="material-symbols-outlined" style={{ fontSize: 12, color: '#fff', fontVariationSettings: "'FILL' 1" }}>check</span>}
                        </span>
                      </div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A', lineHeight: '18px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 36 }}>
                        {item.name}
                      </p>
                      {item.price > 0 && (
                        <p style={{ fontSize: 11, fontWeight: 500, color: '#71717A' }}>₹{item.price}</p>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between" style={{ borderTop: '1px solid #F4F4F5', paddingTop: 14 }}>
                <button type="button" onClick={skipReviewStep} style={{ fontSize: 13, color: '#71717A', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
                  Skip for now
                </button>
                <button
                  onClick={continueReview}
                  style={{ background: purple, borderRadius: 8, padding: '10px 28px', fontSize: 14, fontWeight: 600, color: '#FFFFFF', border: 'none', cursor: 'pointer' }}
                >
                  {reviewStep === 0 ? 'Continue' : `Add ${extractedItems.length} items`}
                </button>
              </div>
            </>
          )}

          {/* ── INSERTING ── */}
          {phase === 'inserting' && (
            <div className="flex flex-col items-center" style={{ padding: '28px 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#F0EDFF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <span className="material-symbols-outlined animate-spin" style={{ fontSize: 28, color: purple }}>progress_activity</span>
              </div>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#0A0A0A', marginBottom: 8, textAlign: 'center' }}>Adding to your inventory…</p>
              <p style={{ fontSize: 12, color: '#99A1AF', textAlign: 'center' }}>Please don&apos;t close this window.</p>
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
              <button onClick={onClose} style={{ background: purple, borderRadius: 8, padding: '10px 32px', fontSize: 14, fontWeight: 600, color: '#FFFFFF', border: 'none', cursor: 'pointer' }}>
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
              <p style={{ fontSize: 13, color: '#52525C', textAlign: 'center', marginBottom: 24, lineHeight: '20px' }}>{errorMsg}</p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={onClose} style={{ border: '1px solid #E4E4E7', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 500, color: '#0A0A0A', background: '#FFFFFF', cursor: 'pointer' }}>
                  Close
                </button>
                <button onClick={() => { setPhase('upload'); setErrorMsg(''); setFiles([]); setExtractedItems([]); }} style={{ background: purple, borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 500, color: '#FFFFFF', border: 'none', cursor: 'pointer' }}>
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
