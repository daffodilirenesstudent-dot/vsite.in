'use client';
import { Spinner, PageLoader } from '@/components/loading';
import { LogoMark } from '@/components/Logo';

import { useCallback, useEffect, useRef, useState, Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthContext';
import { useOnboarding } from '@/components/OnboardingContext';
import { firebaseAuth } from '@/lib/auth/firebase';
import StepIndicator from './components/StepIndicator';
import BestsellersPhase from './components/BestsellersPhase';
import ProfitablePhase from './components/ProfitablePhase';
import SummaryPhase from './components/SummaryPhase';
import LaunchLoadingScreen from './components/LaunchLoadingScreen';
import ScanningOverlay from './components/ScanningOverlay';
import type { WizardStep } from '@/components/OnboardingContext';
import { compressImage } from '@/lib/menu/imageCompress';
import {
  scanMessage, partialScanNotice, pdfMessage, pageLimitMessage, SKIPPABLE_CODES, SCAN_MESSAGES,
  type ScanMessage,
} from './scanMessages';
import { pdfToPageImages, PdfPagesError } from '@/lib/menu/pdfPages';
import { AI_PAGE_LIMITS } from '@/lib/platform/productFlags';
import { needsRescan, photoKey } from './rescan';
import PaidStoreConsent from '@/components/store/PaidStoreConsent';
import { PAID_STORE_CONSENT_HEADER, PAID_STORE_CONSENT_VALUE } from '@/lib/store/trialRules';
import { MOBILE_NAV_V2 } from '@/lib/ui/mobileNav';

const MAX_PHOTOS = 15;

/** Client gives up on one attempt after this. Server: ≤10s admission wait + 50s extraction. */
const SCAN_ATTEMPT_TIMEOUT_MS = 80_000;
/**
 * How long to keep an owner in the BUSY queue before offering the skip path.
 * Measured: at OpenAI Tier 2 a burst of 100 simultaneous signups is fully served
 * in ~10.5 min. An owner watching "you're in the queue" waits that long; one
 * told "try again later" often does not come back.
 */
const QUEUE_MAX_MS = 12 * 60_000;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

function isHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

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
      // Each question is the owner's whole menu in a scrollable grid, so
      // reaching Continue means being scrolled to the bottom. Without this the
      // browser keeps that offset and the next question opens partway down its
      // own list, heading and instructions off-screen — a wall of dishes and
      // no question. Reset happens HERE, inside the fade, so the jump is never
      // visible; 'auto' rather than 'smooth' for the same reason.
      window.scrollTo({ top: 0, behavior: 'auto' });
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
  // `intent` says WHY we are here: 'first-store' (nothing to go back to) or
  // 'add-store' (an existing owner adding another). The old `?new=true` meant
  // neither reliably — it was set for a brand-new account, for "you deleted
  // every store", AND by the dashboard's add-a-store button, so it really only
  // ever meant "fresh wizard, no back button". Still accepted so links already
  // in flight (a tab left open, a bookmarked redirect) do not break.
  const intent = searchParams.get('intent');
  const isNewAccount = intent === 'first-store' || searchParams.get('new') === 'true';
  const { user, loading } = useAuth();

  const {
    businessName, setBusinessName,
    step, setStep,
    setExtractedItems,
    items,
    menuTheme, brandColor,
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
  const [launchSlug, setLaunchSlug] = useState('');
  // null while scanning; set to the real item count once extraction resolves,
  // which drives the "Found N items" count-up in ScanningOverlay.
  const [scanItemCount, setScanItemCount] = useState<number | null>(null);
  const [loadingMsg, setLoadingMsg] = useState('Scanning your menu…');
  const [photos, setPhotos] = useState<PreviewPhoto[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [error, setError] = useState('');
  // One free trial per account (2026-09-25). Where this account stands, and
  // the owner's agreement to pay for a store that has no trial — given on the
  // You tab's add-store screen (?consent=paid) or on the screen below. The
  // server checks the same rule at scan and at launch, whatever this says.
  const [standingChecked, setStandingChecked] = useState(false);
  const [trialStoreName, setTrialStoreName] = useState<string | null>(null);
  const [consentGiven, setConsentGiven] = useState(() => searchParams.get('consent') === 'paid');
  const [consentNeeded, setConsentNeeded] = useState(false);
  const [storeLimitReached, setStoreLimitReached] = useState(false);
  const [launchLive, setLaunchLive] = useState(true);
  // Setup-step problems carry a code so they can be worded for the owner and so
  // we know whether to offer the way forward without a scan.
  const [scanError, setScanError] = useState<{ code: string; message: ScanMessage } | null>(null);
  // "You're in the queue" while waiting, then "photo 4 couldn't be read".
  const [scanNotice, setScanNotice] = useState<ScanMessage | null>(null);
  const [partialNotice, setPartialNotice] = useState<ScanMessage | null>(null);
  const [dragActive, setDragActive] = useState(false);
  // "Reading PDF… page 3 of 12" while a PDF is turned into pages.
  const [pdfProgress, setPdfProgress] = useState<string | null>(null);
  // Photos already added, read synchronously while PDF pages are still arriving.
  const photosRef = useRef<PreviewPhoto[]>([]);
  // The photos behind the dishes we already have, so Back → Continue does not pay to read them again.
  const lastScannedKeyRef = useRef<string | null>(null);
  useEffect(() => { photosRef.current = photos; }, [photos]);

  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const { slideClass, transition } = useSlideTransition();

  useEffect(() => {
    setIsMobile(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  // A file dropped anywhere outside the drop zone makes the browser open it in
  // this tab — leaving onboarding and losing every photo already added.
  useEffect(() => {
    const block = (e: DragEvent) => { e.preventDefault(); };
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    return () => {
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
    };
  }, []);

  const showScanError = (code: string) => setScanError({ code, message: scanMessage(code) });

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    setChecking(false);
  }, [user, loading, router]);

  // Ask the server where the account stands before anything is built.
  useEffect(() => {
    if (loading || checking || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await firebaseAuth.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch('/api/onboarding/eligibility', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const body = await res.json().catch(() => ({}));
        if (cancelled || !res.ok) return;
        setTrialStoreName(typeof body.trialStoreName === 'string' ? body.trialStoreName : null);
        if (!body.canCreate) setStoreLimitReached(true);
        else if (!body.trialAvailable) setConsentNeeded(true);
      } catch {
        // No answer: the scan and the launch ask the server again.
      } finally {
        if (!cancelled) setStandingChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [loading, checking, user]);

  /** Sent with the scan and the launch once the owner agreed to pay for a no-trial store. */
  const consentHeaders = (): Record<string, string> =>
    (consentGiven ? { [PAID_STORE_CONSENT_HEADER]: PAID_STORE_CONSENT_VALUE } : {});

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

  const appendPhotos = useCallback((files: File[]) => {
    setPhotos(prev => {
      const slots = MAX_PHOTOS - prev.length;
      if (slots <= 0) return prev;
      return [
        ...prev,
        ...files.slice(0, slots).map(f => ({
          id: `${f.name}-${f.size}-${Math.random()}`,
          url: URL.createObjectURL(f),
          file: f,
          name: f.name,
        })),
      ];
    });
  }, []);

  // Photos go straight in. Each PDF is turned into one JPEG per page, in the
  // browser, and those pages join the photos — so a PDF menu travels exactly
  // the same pipeline, and counts against the same 15-page limit.
  const addFiles = useCallback(async (files: FileList | File[]) => {
    const all = Array.from(files);
    const images = all.filter(f => !isPdf(f) && (f.type.startsWith('image/') || isHeic(f)));
    const pdfs = all.filter(isPdf);
    setScanError(null);

    let used = Math.min(MAX_PHOTOS, photosRef.current.length + images.length);
    appendPhotos(images);

    for (const pdf of pdfs) {
      setPdfProgress('Reading PDF…');
      try {
        const pages = await pdfToPageImages(pdf, MAX_PHOTOS - used, (done, total) => {
          setPdfProgress(`Reading PDF… page ${done} of ${total}`);
        });
        appendPhotos(pages);
        used += pages.length;
      } catch (err) {
        const e = err instanceof PdfPagesError ? err : new PdfPagesError('PDF_UNREADABLE');
        setScanError({ code: e.code, message: pdfMessage(e.code, { pages: e.pages, room: e.room }) });
      } finally {
        setPdfProgress(null);
      }
    }
  }, [appendPhotos]);

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
    if (!businessName.trim()) { showScanError('NO_SHOP_NAME'); return; }
    if (photos.length === 0) { showScanError('NO_PHOTOS'); return; }

    // Same photos as the scan we already have: go on with those dishes, no new scan.
    if (AI_PAGE_LIMITS && !needsRescan({ photoKey: photoKey(photos), lastScannedKey: lastScannedKeyRef.current, itemCount: items.length })) {
      setScanError(null);
      transition('right', () => setStep('bestsellers'));
      return;
    }

    setError('');
    setScanError(null);
    setScanNotice(null);
    setPartialNotice(null);
    setExtracting(true);
    setLoadingMsg(photos.length > 5 ? 'Compressing & scanning your menu…' : 'Scanning your menu…');

    const stop = (code: string) => { showScanError(code); setScanNotice(null); setExtracting(false); };

    try {
      if (!firebaseAuth.currentUser) { stop('SESSION_EXPIRED'); return; }

      // Compress every image before upload. A photo the browser cannot decode
      // (HEIC outside Safari) cannot be compressed and the server cannot read
      // it either — leave it out and say so, rather than failing the scan.
      const compressed = await Promise.all(
        photos.map(async p => {
          try { return await compressImage(p.file); }
          catch { return isHeic(p.file) ? null : p.file; }
        })
      );
      // Photo numbers as the owner sees them, for each file actually sent.
      const sentPhotoNumbers: number[] = [];
      const formData = new FormData();
      formData.append('shopName', businessName.trim());
      compressed.forEach((file, i) => {
        if (!file) return;
        formData.append('photos', file);
        sentPhotoNumbers.push(i + 1);
      });
      const heicSkipped = compressed.map((f, i) => (f ? 0 : i + 1)).filter(Boolean);
      if (sentPhotoNumbers.length === 0) { stop('HEIC_UNSUPPORTED'); return; }

      const queueStarted = Date.now();
      for (;;) {
        const firebaseUser = firebaseAuth.currentUser;
        if (!firebaseUser) { stop('SESSION_EXPIRED'); return; }
        // Refreshed per attempt: a long queue can outlive a one-hour token.
        const token = await firebaseUser.getIdToken();

        const ctrl = new AbortController();
        const timeoutId = setTimeout(() => ctrl.abort(), SCAN_ATTEMPT_TIMEOUT_MS);
        let res: Response;
        try {
          res = await fetch('/api/onboarding/extract', {
            method: 'POST',
            // Lets the server estimate this scan's token cost before reading the body.
            headers: { Authorization: `Bearer ${token}`, 'X-Photo-Count': String(sentPhotoNumbers.length), ...consentHeaders() },
            body: formData,
            signal: ctrl.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }
        const data = await res.json().catch(() => ({}));

        // Server is full (BUSY) or still finishing this user's previous attempt
        // (SCAN_IN_PROGRESS): wait as told by Retry-After and go again. The
        // body was never read, so nothing was spent.
        const queued = (res.status === 503 && data.code === 'BUSY') || (res.status === 409 && data.code === 'SCAN_IN_PROGRESS');
        if (queued) {
          if (Date.now() - queueStarted > QUEUE_MAX_MS) { stop('QUEUE_GAVE_UP'); return; }
          setScanNotice(SCAN_MESSAGES.BUSY);
          const retryAfterSec = Number(res.headers.get('Retry-After')) || 5;
          // Jitter so a crowd told "5s" does not return in lockstep.
          await sleep(retryAfterSec * 1000 + Math.random() * 2000);
          continue;
        }

        // The account's trial is used and the owner has not agreed yet (or the
        // store limit is reached): nothing was scanned — show that screen.
        if (res.status === 403 && (data.code === 'CONSENT_REQUIRED' || data.code === 'PLAN_LIMIT')) {
          setScanNotice(null);
          setExtracting(false);
          if (data.code === 'PLAN_LIMIT') setStoreLimitReached(true);
          else { setConsentGiven(false); setConsentNeeded(true); }
          return;
        }

        // Out of AI pages for this store: say how many are left, and offer the way on without a scan.
        if (res.status === 403 && data.code === 'PAGE_LIMIT') {
          const pagesLeft = Math.max(0, Number(data.pagesLeft) || 0);
          setScanError({ code: 'PAGE_LIMIT', message: pageLimitMessage(pagesLeft) });
          setScanNotice(null);
          setExtracting(false);
          return;
        }
        if (!res.ok) { stop(typeof data.code === 'string' ? data.code : 'INTERNAL'); return; }

        const found = data.items ?? [];
        setExtractedItems(found);
        lastScannedKeyRef.current = found.length > 0 ? photoKey(photos) : null;

        // Tell the owner which photos did not make it, in their numbering.
        const serverFailed: number[] = Array.isArray(data.failedPhotos)
          ? (data.failedPhotos as number[]).map(n => sentPhotoNumbers[n - 1]).filter((n): n is number => typeof n === 'number')
          : [];
        const failedPhotos = [...heicSkipped, ...serverFailed].sort((a, b) => a - b);
        const notice = failedPhotos.length > 0 ? partialScanNotice(failedPhotos) : null;
        setScanNotice(notice);
        setPartialNotice(notice);
        // Keep the overlay up and reveal the real count — the count-up's
        // onCountUpDone callback slides us to the Bestsellers step.
        setScanItemCount(found.length);
        return;
      }
    } catch (err) {
      stop(err instanceof DOMException && err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK');
    }
  };

  // The way forward without a scan: an empty menu, straight to launch. The
  // summary step already tells the owner to add dishes from the dashboard.
  const handleSkipScan = () => {
    if (!businessName.trim()) { showScanError('NO_SHOP_NAME'); return; }
    setScanError(null);
    setScanNotice(null);
    setPartialNotice(null);
    setExtractedItems([]);
    transition('right', () => setStep('summary'));
  };

  // Called by ScanningOverlay once the "Found N items" count-up completes.
  const handleScanRevealDone = () => {
    setExtracting(false);
    setScanItemCount(null);
    setScanNotice(null);
    transition('right', () => setStep('bestsellers'));
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

      // Stable idempotency key — survives accidental double-clicks AND a
      // network retry of the same launch (server returns the cached response
      // instead of creating a duplicate site).
      const idemKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${firebaseUser.uid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKey,
          ...consentHeaders(),
        },
        body: JSON.stringify({
          shopName: businessName.trim(),
          menuTheme,
          brandColor,
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
        // One free trial per account: the server refused before creating
        // anything. The dishes stay; the owner sees why and decides.
        if (res.status === 403 && data.code === 'CONSENT_REQUIRED') {
          setLaunching(false);
          setConsentGiven(false);
          setConsentNeeded(true);
          return;
        }
        if (res.status === 403 && data.code === 'PLAN_LIMIT') {
          setLaunching(false);
          setStoreLimitReached(true);
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
      // A store created after the account's trial was used is not live until paid.
      setLaunchLive(data.live !== false);
      setLaunchSlug(data.siteSlug ?? '');
      setLaunchDone(true);
    } catch {
      setError('Network error. Please try again.');
      setLaunching(false);
    }
  };

  const handleLaunchRedirect = () => {
    router.replace(`/manage/dashboard?onboarded=true&items=${launchItemCount}`);
  };

  // A no-trial store's first payment — the same checkout as any other store.
  const handleLaunchPay = () => {
    router.replace(MOBILE_NAV_V2 ? '/manage/you/plan?pay=1' : '/manage/subscription');
  };

  // ── Animated step navigation ────────────────────────────────────────────────
  const goNext = (to: typeof step) =>
    transition('right', () => setStep(to));

  const goBack = (to: typeof step) =>
    transition('left', () => setStep(to));

  if (loading || checking) {
    return (
      <div className="bg-white">
        <PageLoader />
      </div>
    );
  }

  // An existing owner adding a store: wait for the account's answer so the
  // paid-store agreement comes before the setup screen, not after the owner
  // has started. A brand-new account never waits — its first store has the trial.
  if (!isNewAccount && !standingChecked) {
    return (
      <div className="bg-white">
        <PageLoader />
      </div>
    );
  }

  const gate = (children: ReactNode) => (
    <div className="min-h-screen w-full bg-gradient-to-br from-violet-50 via-purple-50 to-slate-50 flex flex-col">
      <header className="flex items-center px-6 sm:px-8 py-4">
        <LogoMark size={30} tone="brand" />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-10 pt-2 sm:pt-10">
        <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-7">{children}</div>
      </main>
    </div>
  );

  if (storeLimitReached) {
    return gate(
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="material-symbols-outlined text-amber-700" style={{ fontSize: 34 }} aria-hidden>storefront</span>
        <h1 className="text-xl font-bold text-slate-900">No more stores on this account</h1>
        <p className="text-[15px] leading-relaxed text-slate-600">
          An account can have 2 stores. Need another outlet under this login? Message us and we will set it up with you.
        </p>
        <button
          onClick={() => router.replace('/manage/dashboard')}
          className="mt-2 w-full rounded-xl bg-primary py-3 text-[15px] font-semibold text-white"
        >
          Go to dashboard
        </button>
      </div>,
    );
  }

  if (consentNeeded && !consentGiven) {
    return gate(
      <PaidStoreConsent
        phone={firebaseAuth.currentUser?.phoneNumber ?? null}
        trialStoreName={trialStoreName}
        onContinue={() => { setConsentGiven(true); setConsentNeeded(false); }}
        onCancel={() => router.replace(isNewAccount ? '/' : '/manage/dashboard')}
      />,
    );
  }

  const atLimit = photos.length >= MAX_PHOTOS;
  // Out of AI pages but dishes are already read: carry on with them rather than empty the menu.
  const canKeepItems = AI_PAGE_LIMITS && scanError?.code === 'PAGE_LIMIT' && items.length > 0;
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
          <LogoMark size={30} tone="brand" />
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

      {/* Photos that could not be read stay visible while the owner reviews dishes. */}
      {step === 'bestsellers' && partialNotice && (
        <div role="status" className="mx-auto mt-3 w-full max-w-md px-4">
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-center">
            <p className="text-xs font-medium text-amber-800">{partialNotice.en}</p>
          </div>
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
                      onChange={e => { setBusinessName(e.target.value); setError(''); setScanError(null); }}
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

                  <input ref={uploadRef} type="file" accept="image/*,application/pdf" multiple className="hidden"
                    onChange={e => e.target.files && addFiles(e.target.files)} />
                  {isMobile && (
                    <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={e => e.target.files && addFiles(e.target.files)} />
                  )}

                  <div
                    onDragOver={e => { e.preventDefault(); if (!extracting && !atLimit && !pdfProgress) setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={e => {
                      e.preventDefault();
                      setDragActive(false);
                      if (!extracting && !pdfProgress && e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
                    }}
                    className={`flex flex-col items-center rounded-xl border-2 border-dashed py-7 px-4 transition-colors hover:border-primary/30 hover:bg-primary/[0.02] ${dragActive ? 'border-primary bg-primary/[0.05]' : 'border-slate-200 bg-slate-50/40'}`}>
                    <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white border border-slate-200 shadow-sm">
                      <span className="material-symbols-outlined text-primary" style={{ fontSize: 26 }}>cloud_upload</span>
                    </div>
                    <p className="mb-1 text-sm font-semibold text-slate-800">Upload menu photos or a PDF</p>
                    <p className="mb-4 text-center text-xs text-slate-500 leading-relaxed">
                      {isMobile ? 'Snap or upload' : 'Drag photos or a PDF here, or upload'} up to {MAX_PHOTOS} pages.<br />
                      We&apos;ll read the items automatically.
                    </p>
                    <div className="flex items-center gap-2">
                      <button type="button" disabled={atLimit || extracting || pdfProgress !== null}
                        onClick={() => uploadRef.current?.click()}
                        className="rounded-[10px] border border-slate-300 bg-white px-5 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
                        Choose File
                      </button>
                      {isMobile && (
                        <button type="button" disabled={atLimit || extracting || pdfProgress !== null}
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
                            aria-label={`Remove photo ${photos.indexOf(photo) + 1}`}
                            className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/65 text-white transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 disabled:cursor-not-allowed">
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>close</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {pdfProgress && (
                    <p role="status" className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-500">
                      <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-primary" aria-hidden />
                      {pdfProgress}
                    </p>
                  )}

                  {atLimit && (
                    <p className="mt-2 text-center text-xs text-amber-500">
                      Maximum {MAX_PHOTOS} photos reached.
                    </p>
                  )}
                </div>

                {scanError && (
                  <div role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-center">
                    <p className="text-xs text-red-700">{scanError.message.en}</p>
                  </div>
                )}
                {error && !scanError && (
                  <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-600">{error}</p>
                )}

                <div className="mt-5">
                  <button onClick={handleExtract} disabled={extracting || photos.length === 0 || pdfProgress !== null}
                    className="w-full rounded-[10px] bg-primary py-3 text-sm font-bold text-white shadow-lg shadow-primary/30 transition hover:bg-primary-dark active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed">
                    {extracting ? (
                      <span className="flex items-center justify-center gap-2 whitespace-nowrap">
                        <Spinner size="sm" tone="onBrand" />
                        {loadingMsg}
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        Continue
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
                      </span>
                    )}
                  </button>
                  {scanError && SKIPPABLE_CODES.has(scanError.code) && !extracting && (
                    canKeepItems ? (
                      <button type="button" onClick={() => { setScanError(null); transition('right', () => setStep('bestsellers')); }}
                        className="mt-3 w-full rounded-[10px] border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]">
                        Continue with my {items.length} dishes
                      </button>
                    ) : (
                    <button type="button" onClick={handleSkipScan}
                      className="mt-3 w-full rounded-[10px] border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]">
                      Skip — add dishes by hand
                    </button>
                    )
                  )}
                </div>
              </>
            )}

            {/* ── Wizard phases ── */}
            {step === 'bestsellers' && (
              <BestsellersPhase
                onNext={() => goNext('profitable')}
                onBack={() => goBack('setup')}
              />
            )}
            {step === 'profitable' && (
              <ProfitablePhase
                onNext={() => goNext('summary')}
                onBack={() => goBack('bestsellers')}
              />
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

      <ScanningOverlay
        show={extracting}
        itemCount={scanItemCount}
        onCountUpDone={handleScanRevealDone}
        notice={scanNotice}
      />

      <LaunchLoadingScreen
        show={launching}
        done={launchDone}
        itemCount={launchItemCount}
        shopName={businessName}
        slug={launchSlug}
        onRedirect={handleLaunchRedirect}
        paidRequired={!launchLive}
        onPay={handleLaunchPay}
      />
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="bg-white">
        <PageLoader />
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  );
}
