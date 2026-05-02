'use client';

import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthContext';
import { useOnboarding } from '@/components/OnboardingContext';
import { firebaseAuth } from '@/lib/firebase';
import StepIndicator from './components/StepIndicator';
import BestsellersPhase from './components/BestsellersPhase';
import ProfitablePhase from './components/ProfitablePhase';
import SummaryPhase from './components/SummaryPhase';
import LaunchLoadingScreen from './components/LaunchLoadingScreen';
import type { WizardStep } from '@/components/OnboardingContext';

const MAX_PHOTOS = 10;

const STEP_LABELS = ['Setup', 'Bestsellers', 'Top Earners', 'Launch'];

interface PreviewPhoto {
  id: string;
  url: string;
  file: File;
  name: string;
}

// ── Slide animation helpers ───────────────────────────────────────────────────

function useSlideTransition() {
  const [visible, setVisible] = useState(true);
  const [direction, setDirection] = useState<'left' | 'right'>('right');

  const transition = (dir: 'left' | 'right', onDone: () => void) => {
    setDirection(dir);
    setVisible(false);
    setTimeout(() => {
      onDone();
      setVisible(true);
    }, 280);
  };

  const slideClass = visible
    ? 'translate-x-0 opacity-100'
    : direction === 'right'
      ? 'translate-x-6 opacity-0'
      : '-translate-x-6 opacity-0';

  return { slideClass, transition };
}

// ── Main component ─────────────────────────────────────────────────────────────

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNewAccount = searchParams.get('new') === 'true';
  const { user, loading } = useAuth();

  const {
    businessName, setBusinessName,
    step, setStep,
    setExtractedItems,
    items,
    resetOnboarding,
  } = useOnboarding();

  // Step index (0-based) matching STEP_LABELS
  const stepIndexMap: Record<typeof step, number> = {
    setup: 0, bestsellers: 1, profitable: 2, summary: 3,
  };
  const stepIndex = stepIndexMap[step];

  const [checking, setChecking] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchDone, setLaunchDone] = useState(false);
  const [launchItemCount, setLaunchItemCount] = useState(0);
  const [loadingMsg, setLoadingMsg] = useState('Scanning your menu…');
  const [photos, setPhotos] = useState<PreviewPhoto[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [error, setError] = useState('');

  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const { slideClass, transition } = useSlideTransition();

  useEffect(() => {
    setIsMobile(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    setChecking(false);
  }, [user, loading, router]);

  // Reset wizard state when the page mounts fresh (new account flow)
  useEffect(() => {
    if (!loading && !checking && isNewAccount) {
      resetOnboarding();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, checking]);

  // Revoke all object URLs on unmount to prevent memory leaks.
  useEffect(() => {
    return () => {
      setPhotos(prev => {
        prev.forEach(p => URL.revokeObjectURL(p.url));
        return prev;
      });
    };
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const incoming = Array.from(files).filter(f => f.type.startsWith('image/'));
    setPhotos(prev => {
      const slots = MAX_PHOTOS - prev.length;
      if (slots <= 0) return prev;
      return [
        ...prev,
        ...incoming.slice(0, slots).map(f => ({
          id: `${f.name}-${f.size}-${Math.random()}`,
          url: URL.createObjectURL(f),
          file: f,
          name: f.name,
        })),
      ];
    });
  }, []);

  const removePhoto = (id: string) => {
    setPhotos(prev => {
      const photo = prev.find(p => p.id === id);
      if (photo) URL.revokeObjectURL(photo.url);
      return prev.filter(p => p.id !== id);
    });
  };

  // ── Step 0 "Next": extract only — no DB writes yet ──────────────────────────
  const handleExtract = async () => {
    if (!user || extracting) return;
    if (!businessName.trim()) { setError('Please enter your business name.'); return; }
    if (photos.length === 0) { setError('Please upload at least one menu photo to continue.'); return; }

    setError('');
    setExtracting(true);
    setLoadingMsg(photos.length > 3 ? 'Scanning your menu… this may take up to 90 sec' : 'Scanning your menu…');

    // Hard client-side timeout — 130s gives the 120s serverless function a full
    // run plus a small network buffer before we surface the timeout error.
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 130_000);

    try {
      const firebaseUser = firebaseAuth.currentUser;
      if (!firebaseUser) { setError('Session expired. Please log in again.'); setExtracting(false); return; }
      const token = await firebaseUser.getIdToken();

      const formData = new FormData();
      formData.append('shopName', businessName.trim());
      photos.forEach(p => formData.append('photos', p.file));

      const res = await fetch('/api/onboarding/extract', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
        signal: ctrl.signal,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        setExtracting(false);
        return;
      }

      // Store extracted items in context (defaults star/profit/complexity = 2)
      setExtractedItems(data.items ?? []);

      // Animate to next step
      transition('right', () => setStep('bestsellers'));
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Scanning timed out. Please try again — if it keeps failing, try uploading 3–5 photos at a time.');
      } else {
        setError('Network error. Please try again.');
      }
    } finally {
      clearTimeout(timeoutId);
      setExtracting(false);
    }
  };

  // ── "Launch My Menu": final POST with all tiers ─────────────────────────────
  const handleLaunch = async () => {
    if (!user || launching) return;
    setLaunching(true);
    setLaunchDone(false);

    try {
      const firebaseUser = firebaseAuth.currentUser;
      if (!firebaseUser) { setError('Session expired.'); setLaunching(false); return; }
      const token = await firebaseUser.getIdToken();

      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shopName: businessName.trim(),
          items: items.map(item => ({
            name: item.name,
            price: item.price,
            description: item.description,
            category: item.category,
            item_type: item.item_type,
            food_type: item.food_type,
            variants: item.variants,
            star_rating: item.star_rating,
            profit_tier: item.profit_tier,
            prep_complexity_tier: item.prep_complexity_tier,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 && (data.code === 'TRIAL_LIMIT' || data.code === 'TRIAL_EXPIRED' || data.code === 'PLAN_LIMIT')) {
          setError(data.error ?? 'You need an active plan to create this store.');
          setLaunching(false);
          setTimeout(() => router.replace('/manage/subscription'), 2500);
          return;
        }
        setError(data.error ?? 'Something went wrong. Please try again.');
        setLaunching(false);
        return;
      }

      if (data.siteId && firebaseAuth.currentUser) {
        localStorage.setItem(`activeSiteId_${firebaseAuth.currentUser.uid}`, data.siteId);
      }

      photos.forEach(p => URL.revokeObjectURL(p.url));

      // Signal the loading screen that backend is done
      setLaunchItemCount(data.itemCount ?? 0);
      setLaunchDone(true);
    } catch {
      setError('Network error. Please try again.');
      setLaunching(false);
    }
  };

  const handleLaunchRedirect = () => {
    router.replace(`/manage/dashboard?onboarded=true&items=${launchItemCount}`);
  };

  // ── Animated step navigation ────────────────────────────────────────────────
  const goNext = (to: typeof step) =>
    transition('right', () => setStep(to));

  const goBack = (to: typeof step) =>
    transition('left', () => setStep(to));

  if (loading || checking) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-100 border-t-primary" />
      </div>
    );
  }

  const atLimit = photos.length >= MAX_PHOTOS;
  const isSetup = step === 'setup';

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-violet-50 via-purple-50 to-slate-50 flex flex-col">

      {/* Top bar */}
      <header className="flex items-center justify-between px-6 sm:px-8 py-4">
        {isSetup ? (
          isNewAccount ? (
            <div className="w-20" />
          ) : (
            <button
              onClick={() => router.push('/manage/dashboard')}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_back</span>
              Dashboard
            </button>
          )
        ) : (
          <button
            onClick={() => {
              const prev: Record<WizardStep, WizardStep> = {
                setup: 'setup', bestsellers: 'setup', profitable: 'bestsellers',
                summary: 'profitable',
              };
              goBack(prev[step]);
            }}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_back</span>
            Back
          </button>
        )}

        <div className="flex items-center gap-2">
          <Image src="/android-chrome-192x192.png" alt="vsite icon" width={36} height={36} className="h-9 w-9 rounded-xl" />
          <span className="text-lg font-bold tracking-tight text-slate-800">vsite</span>
        </div>

        <Link
          href="/support"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary transition-colors"
          aria-label="Open support — opens in a new tab"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>help_outline</span>
          <span className="hidden sm:inline">Support</span>
        </Link>
      </header>

      {/* Step indicator (hidden on setup) */}
      {!isSetup && (
        <div className="mt-2 px-4 flex justify-center">
          <StepIndicator
            current={stepIndex}
            total={3}
            labels={STEP_LABELS.slice(1)}
          />
        </div>
      )}

      {/* Page heading */}
      {isSetup && (
        <div className="mt-6 text-center px-4">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Let&apos;s get your menu online</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Two quick steps. Takes less than a minute.
          </p>
        </div>
      )}

      {/* Card container */}
      <main className="flex flex-1 justify-center px-4 py-6 pb-safe">
        <div className="w-full max-w-md">
          {/* Animated card */}
          <div
            className={`rounded-2xl bg-white shadow-sm border border-slate-100 px-6 py-6 transition-all duration-280 ease-out ${slideClass}`}
            style={{ minHeight: isSetup ? undefined : '520px', display: 'flex', flexDirection: 'column' }}
          >
            {/* ── Setup step ── */}
            {step === 'setup' && (
              <>
                <div className="space-y-5 mb-6">
                  <div>
                    <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-700">
                      <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 14 }}>storefront</span>
                      Store name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Cream Story"
                      value={businessName}
                      onChange={e => { setBusinessName(e.target.value); setError(''); }}
                      className="w-full rounded-[10px] border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                      autoFocus
                      disabled={extracting}
                    />
                  </div>
                </div>

                <div className="mb-5 border-t border-slate-100" />

                {/* Photo upload */}
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                      <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 14 }}>photo_library</span>
                      Menu photos
                    </label>
                    {photos.length > 0 && (
                      <span className={`text-xs font-medium tabular-nums ${atLimit ? 'text-amber-500' : 'text-slate-400'}`}>
                        {photos.length} / {MAX_PHOTOS}
                      </span>
                    )}
                  </div>

                  <input ref={uploadRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={e => e.target.files && addFiles(e.target.files)} />
                  {isMobile && (
                    <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={e => e.target.files && addFiles(e.target.files)} />
                  )}

                  <div className="flex flex-col items-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/40 py-7 px-4 transition-colors hover:border-primary/30 hover:bg-primary/[0.02]">
                    <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white border border-slate-200 shadow-sm">
                      <span className="material-symbols-outlined text-primary" style={{ fontSize: 26 }}>cloud_upload</span>
                    </div>
                    <p className="mb-1 text-sm font-semibold text-slate-800">Upload menu photos</p>
                    <p className="mb-4 text-center text-xs text-slate-500 leading-relaxed">
                      Snap or upload up to {MAX_PHOTOS} photos.<br />
                      We&apos;ll read the items automatically.
                    </p>
                    <div className="flex items-center gap-2">
                      <button type="button" disabled={atLimit || extracting}
                        onClick={() => uploadRef.current?.click()}
                        className="rounded-[10px] border border-slate-300 bg-white px-5 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
                        Choose File
                      </button>
                      {isMobile && (
                        <button type="button" disabled={atLimit || extracting}
                          onClick={() => cameraRef.current?.click()}
                          className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-5 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>photo_camera</span>
                          Take Photo
                        </button>
                      )}
                    </div>
                  </div>

                  {photos.length > 0 && (
                    <div className="mt-3 grid grid-cols-5 gap-2">
                      {photos.map(photo => (
                        <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photo.url} alt={photo.name} className="h-full w-full object-cover" />
                          <button type="button" disabled={extracting} onClick={() => removePhoto(photo.id)}
                            className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/65 text-white opacity-0 transition-opacity group-hover:opacity-100 active:opacity-100 disabled:cursor-not-allowed">
                            <span className="material-symbols-outlined" style={{ fontSize: 11 }}>close</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {atLimit && (
                    <p className="mt-2 text-center text-xs text-amber-500">
                      Maximum {MAX_PHOTOS} photos reached.
                    </p>
                  )}
                </div>

                {error && (
                  <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-600">{error}</p>
                )}

                <div className="mt-5">
                  <button onClick={handleExtract} disabled={extracting || photos.length === 0}
                    className="w-full rounded-[10px] bg-primary py-3 text-sm font-bold text-white shadow-lg shadow-primary/30 transition hover:bg-primary-dark active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed">
                    {extracting ? (
                      <span className="flex items-center justify-center gap-2 whitespace-nowrap">
                        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        {loadingMsg}
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        Continue
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
                      </span>
                    )}
                  </button>
                </div>
              </>
            )}

            {/* ── Wizard phases ── */}
            {step === 'bestsellers' && (
              <BestsellersPhase onNext={() => goNext('profitable')} />
            )}
            {step === 'profitable' && (
              <ProfitablePhase onNext={() => goNext('summary')} />
            )}
            {step === 'summary' && (
              <>
                <SummaryPhase onLaunch={handleLaunch} launching={launching} />
                {error && (
                  <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-600">{error}</p>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      <LaunchLoadingScreen
        show={launching}
        done={launchDone}
        itemCount={launchItemCount}
        onRedirect={handleLaunchRedirect}
      />
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen w-full items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-100 border-t-primary" />
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  );
}
