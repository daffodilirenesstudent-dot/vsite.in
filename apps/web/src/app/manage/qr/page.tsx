'use client';
import { Spinner as VsSpinner } from '@/components/loading';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type QRCodeStylingClass from 'qr-code-styling';
import toast from 'react-hot-toast';
import { loadQRLib, qrOptions, getStyledQRBlob, downloadBlob } from '@/lib/qr/styledQr';
import { blobToImage, loadImage, detectWhiteBox } from '@/lib/qr/posterRender';
import { QR_PRINT_KIT } from '@/lib/qr/printKit';
import MenuQrPanel from '@/components/manage/MenuQrPanel';
import { useSite } from '@/components/SiteContext';
import { usePlan } from '@/components/PlanContext';
import { firebaseAuth } from '@/lib/auth/firebase';
import { QR_STICKER_PRICE_INR, MAX_STICKER_QTY, normaliseStickerQty, stickerOrderTotal } from '@/lib/platform/hardware';
import { formatPrice } from '@/lib/platform/currency';

const A = {
  primary:   '#5137EF',
  primaryBg: '#EEEBFD',
  white:     '#FFFFFF',
  bg:        '#F4F4F4',
  border:    '#E4E4E7',
  dark:      '#0A0A0A',
  text:      '#52525C',
  muted:     '#71717A',
  faint:     '#99A1AF',
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function StyledQR({ data, size, imageDataUrl }: { data: string; size: number; imageDataUrl?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef  = useRef<QRCodeStylingClass | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadQRLib().then(QRCodeStyling => {
      if (cancelled || !containerRef.current) return;
      if (!instanceRef.current) {
        instanceRef.current = new QRCodeStyling(qrOptions(data, size, imageDataUrl));
        instanceRef.current.append(containerRef.current);
      } else {
        instanceRef.current.update(qrOptions(data, size, imageDataUrl));
      }
    });
    return () => { cancelled = true; };
  }, [data, size, imageDataUrl]);
  return <div ref={containerRef} style={{ lineHeight: 0 }} />;
}

// Returns a blob: URL (not data:) so qr-code-styling can fetch() it without
// violating the CSP connect-src policy (blob: is same-origin, data: is not).
function makeTableBadgeBlobUrl(n: number, size: number): Promise<string> {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  const r = size / 2;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(r, r, r, 0, Math.PI * 2); ctx.fill();
  const bw = Math.max(2, size * 0.07);
  ctx.strokeStyle = '#000000'; ctx.lineWidth = bw;
  ctx.beginPath(); ctx.arc(r, r, r - bw / 2, 0, Math.PI * 2); ctx.stroke();
  const label = `T${n}`;
  const fs = label.length > 2 ? size * 0.27 : size * 0.34;
  ctx.fillStyle = '#000000';
  ctx.font = `800 ${fs}px Inter,Arial,sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, r, r);
  return new Promise(resolve => {
    c.toBlob(blob => {
      resolve(blob ? URL.createObjectURL(blob) : '');
    }, 'image/png');
  });
}

async function brandPosterBlob(qrData: string, imageDataUrl?: string, templatePath = '/brand poster template.png'): Promise<Blob | null> {
  const [template, qrBlob] = await Promise.all([
    loadImage(templatePath),
    getStyledQRBlob(qrData, imageDataUrl, 900),
  ]);
  if (!qrBlob) return null;
  const qrImg = await blobToImage(qrBlob);
  const W = template.naturalWidth, H = template.naturalHeight;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(template, 0, 0, W, H);
  const box = detectWhiteBox(template);
  const pad = Math.min(box.w, box.h) * 0.07;
  const qrSize = Math.min(box.w, box.h) - pad * 2;
  const qrX = box.x + (box.w - qrSize) / 2;
  const qrY = box.y + (box.h - qrSize) / 2;
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
  return new Promise(r => c.toBlob(r, 'image/png'));
}

// ── Spinner helper ────────────────────────────────────────────────────────────
// Adapter over the shared loading system. Kept so this page's call sites can go
// on passing a pixel size and a colour, while the thing rendered is the same
// four-bar indicator as everywhere else. New code should use <VsSpinner> and a
// named size directly.
function Spinner({ size = 14, color = A.text }: { size?: number; color?: string }) {
  const named = size <= 12 ? 'xs' : size <= 17 ? 'sm' : size <= 28 ? 'md' : 'lg';
  return <VsSpinner size={named} tone="current" style={{ color }} />;
}

// ── Icon button used for download actions ─────────────────────────────────────
function ActionBtn({
  label, icon, loading, disabled, onClick, variant = 'outline',
}: {
  label: string; icon: string; loading?: boolean; disabled?: boolean;
  onClick: (e: React.MouseEvent) => void; variant?: 'outline' | 'primary';
}) {
  const isPrimary = variant === 'primary';
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        background: isPrimary ? A.primary : 'transparent',
        color: isPrimary ? '#fff' : A.text,
        border: `1px solid ${isPrimary ? A.primary : A.border}`,
        borderRadius: 7, padding: '8px 12px',
        // Hit target: min 36 px (≈44 px including row vertical padding) so it
        // meets the WCAG 2.5.5 minimum without enlarging the visual chip.
        minHeight: 36, minWidth: 36,
        fontSize: 12, fontWeight: 500,
        cursor: disabled ? 'wait' : 'pointer',
        opacity: loading ? 0.6 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {loading
        ? <Spinner size={11} color={isPrimary ? '#fff' : A.text} />
        : <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{icon}</span>
      }
      {label}
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function QRPage() {
  const { activeSite } = useSite();
  const { isQrOrder, isPayEat, isQrMenu } = usePlan();
  const qrMenuOnly = isQrMenu; // isQrMenu now means menu-only (see PlanContext)

  const [baseUrl, setBaseUrl]         = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [savingMode, setSavingMode]   = useState(false);

  // NFC card request modal
  const [showCardModal, setShowCardModal] = useState(false);
  const [cardForm, setCardForm] = useState({
    shopName: '', qrType: 'common' as 'common' | 'table', tableCount: 1,
    contactName: '', phone: '',
    line1: '', city: '', state: '', pincode: '', country: 'India',
  });
  // One derived quantity for the whole modal, so the price line, the payload
  // and the confirmation email can never disagree. Menu-only stores answer a
  // plain "how many"; ordering stores answer it through the table count.
  const stickerQty = qrMenuOnly
    ? normaliseStickerQty(cardForm.tableCount)
    : (cardForm.qrType === 'table' ? normaliseStickerQty(cardForm.tableCount) : 1);

  const [cardSubmitting, setCardSubmitting] = useState(false);
  const [cardSuccess, setCardSuccess]       = useState(false);
  const [cardError, setCardError]           = useState('');

  // Seed what the platform already knows. The form used to open completely
  // blank and ask for the shop name and phone number it had on file, which is
  // pure retyping for an owner on a phone keyboard.
  const openCardModal = () => {
    setCardError('');
    setCardSuccess(false);
    setCardForm(f => ({
      ...f,
      shopName: f.shopName || storeName || '',
      // The number they signed in with, minus the +91 the field adds back.
      phone: f.phone || (firebaseAuth.currentUser?.phoneNumber ?? '').replace(/^\+91/, ''),
    }));
    setShowCardModal(true);
  };

  // Reset the NFC card modal completely on close so reopening doesn't show
  // stale form data, an old error, or the success screen.
  const closeCardModal = () => {
    if (cardSubmitting) return; // don't close mid-submit
    setShowCardModal(false);
    setCardError('');
    setCardSuccess(false);
    setCardForm({
      shopName: '', qrType: 'common', tableCount: 1,
      contactName: '', phone: '',
      line1: '', city: '', state: '', pincode: '', country: 'India',
    });
  };

  const [qrMode, setQrMode]                   = useState<'common' | 'table'>('common');
  const [, setSavedQrMode]                    = useState<'common' | 'table'>('common');
  const [tableCount, setTableCount]           = useState(4);
  const [savedTableCount, setSavedTableCount] = useState(4);
  const [pendingMode, setPendingMode]         = useState<string | null>(null);
  const [switchAt, setSwitchAt]               = useState<string | null>(null);
  const [loaded, setLoaded]                   = useState(false);
  const [timeLeft, setTimeLeft]               = useState('');

  // UI state
  const [showSwitchPanel, setShowSwitchPanel] = useState(false);
  const [hasTakeawayQR, setHasTakeawayQR]     = useState(false);

  // Poster preview
  const [previewData, setPreviewData]               = useState<{ data: string; imageDataUrl?: string; label: string } | null>(null);
  const [posterPreviewUrl, setPosterPreviewUrl]     = useState<string | null>(null);
  const [posterPreviewLoading, setPosterPreviewLoading] = useState(false);
  const posterUrlRef = useRef<string | null>(null);

  // Table count auto-save debounce
  const tableSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slug      = activeSite?.slug ?? '';
  const siteId    = activeSite?.id ?? '';
  const storeName = activeSite?.name ?? 'My Store';
  const slugLabel = slug.replace(/-/g, ' ');

  /**
   * The last sticker order placed from this browser.
   *
   * Ordering stickers only sends an email — there is no orders table — so once
   * the success modal closed the card looked exactly as it did before and the
   * owner had no way to tell whether their request went through.
   *
   * Held in localStorage, which means it is per-device: signing in on a second
   * phone will not show it. Making this durable needs a table and a migration,
   * which is not something to add unasked. Good enough to stop an owner
   * ordering twice because they were not sure the first one worked.
   */
  const [lastOrder, setLastOrder] = useState<{ qty: number; at: string } | null>(null);

  const orderKey = siteId ? `vsite_sticker_order_${siteId}` : '';

  useEffect(() => {
    if (!orderKey) return;
    try {
      const raw = localStorage.getItem(orderKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { qty?: unknown; at?: unknown };
        if (typeof parsed.qty === 'number' && typeof parsed.at === 'string') {
          setLastOrder({ qty: parsed.qty, at: parsed.at });
        }
      }
    } catch { /* unreadable or cleared storage — treat as no order */ }
  }, [orderKey]);

  const recordOrder = useCallback((qty: number) => {
    const entry = { qty, at: new Date().toISOString() };
    setLastOrder(entry);
    if (!orderKey) return;
    try { localStorage.setItem(orderKey, JSON.stringify(entry)); } catch { /* quota */ }
  }, [orderKey]);


  // The owner's own artwork. qr_menu and qr_order use the "Scan & Order"
  // template; pay_eat uses the default one.
  const posterTemplate = (qrMenuOnly || isQrOrder)
    ? '/brand poster scan order.png'
    : '/brand poster template.png';

  const makePoster = useCallback(
    (data: string, imageDataUrl?: string) => brandPosterBlob(data, imageDataUrl, posterTemplate),
    [posterTemplate],
  );

  useEffect(() => {
    if (slug) setBaseUrl(`${window.location.origin}/shop/${slug}`);
  }, [slug]);

  // Per-table HMAC signatures fetched once on mount. Without these, the
  // table-mode QR URLs are unsigned and the server logs a PHASE 1 warning
  // (but still accepts the order). Once STRICT_TABLE_SIG=1 in prod, missing
  // sigs will be rejected — re-prints required at that point.
  const [tableSigs, setTableSigs] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!siteId) return;
    (async () => {
      try {
        const token = await firebaseAuth.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch(`/api/manage/sites/${siteId}/table-qr-sigs`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const d = await res.json() as { sigs: Record<string, string> };
          setTableSigs(d.sigs ?? {});
        }
      } catch { /* sigs missing → falls back to unsigned URLs (PHASE 1) */ }
    })();
  }, [siteId]);

  // Build the QR URL for a given table number, including its signature.
  // Falls back to the legacy unsigned URL if sigs haven't loaded yet.
  const tableUrl = useCallback((n: number) => {
    const sig = tableSigs[String(n)];
    return sig ? `${baseUrl}?table=${n}&sig=${sig}` : `${baseUrl}?table=${n}`;
  }, [baseUrl, tableSigs]);

  useEffect(() => {
    if (!siteId) return;
    (async () => {
      try {
        const token = await firebaseAuth.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch(`/api/manage/sites/${siteId}/qr-mode`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const d = await res.json();
          // pay_eat = common QR only; qr_order = table QR only; others follow DB
          const m = (isQrOrder ? 'table' : (isPayEat || qrMenuOnly) ? 'common' : (d.qr_mode ?? 'common')) as 'common' | 'table';
          const c = d.table_count ?? 4;
          setQrMode(m); setSavedQrMode(m);
          setTableCount(c); setSavedTableCount(c);
          setPendingMode(d.pending_qr_mode ?? null);
          setSwitchAt(d.qr_mode_switch_at ?? null);
        }
      } catch { /* ignore */ } finally { setLoaded(true); }
    })();
  }, [siteId, isQrOrder, isPayEat, qrMenuOnly]);

  useEffect(() => {
    if (!switchAt) { setTimeLeft(''); return; }
    const tick = () => {
      const diff = new Date(switchAt).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft('imminent'); return; }
      const h = Math.floor(diff / 3_600_000), m = Math.floor((diff % 3_600_000) / 60_000);
      setTimeLeft(`${h}h ${m}m`);
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [switchAt]);

  // Auto-select first QR for preview when mode/url loads
  useEffect(() => {
    if (!baseUrl || !loaded) return;
    if (qrMode === 'common') {
      setPreviewData({ data: baseUrl, label: 'Common QR' });
    }
    // table mode auto-select handled after badges are ready
  }, [qrMode, baseUrl, loaded]);

  // Pre-generate table badge blob: URLs — using blob: instead of data: so that
  // qr-code-styling can fetch() them without violating the CSP connect-src policy.
  const [tableBadges, setTableBadges] = useState<Record<number, string>>({});
  const badgeUrlsRef = useRef<string[]>([]);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let cancelled = false;
    const count = Math.max(tableCount, savedTableCount);
    const promises = Array.from({ length: count }, (_, i) => makeTableBadgeBlobUrl(i + 1, 80));
    Promise.all(promises).then(urls => {
      if (cancelled) { urls.forEach(u => u && URL.revokeObjectURL(u)); return; }
      badgeUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
      badgeUrlsRef.current = urls.filter(Boolean);
      const map: Record<number, string> = {};
      urls.forEach((u, i) => { if (u) map[i + 1] = u; });
      setTableBadges(map);
    });
    return () => { cancelled = true; };
  }, [tableCount, savedTableCount]);
  // Revoke blob URLs on page unmount
  useEffect(() => () => { badgeUrlsRef.current.forEach(u => URL.revokeObjectURL(u)); }, []);

  // Once badges are ready in table mode, select table 1 for preview
  useEffect(() => {
    if (!baseUrl || !loaded || qrMode !== 'table') return;
    if (tableBadges[1] && !previewData) {
      setPreviewData({ data: tableUrl(1), imageDataUrl: tableBadges[1], label: 'Table 1' });
    }
  }, [baseUrl, loaded, qrMode, tableBadges, previewData, tableUrl]);

  // Generate poster preview whenever selected QR changes
  useEffect(() => {
    if (!previewData?.data) return;
    let cancelled = false;
    setPosterPreviewLoading(true);
    makePoster(previewData.data, previewData.imageDataUrl).then(blob => {
      if (cancelled || !blob) { if (!cancelled) setPosterPreviewLoading(false); return; }
      const url = URL.createObjectURL(blob);
      if (posterUrlRef.current) URL.revokeObjectURL(posterUrlRef.current);
      posterUrlRef.current = url;
      setPosterPreviewUrl(url);
      setPosterPreviewLoading(false);
    }).catch(() => { if (!cancelled) setPosterPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [previewData, makePoster]);

  useEffect(() => () => { if (posterUrlRef.current) URL.revokeObjectURL(posterUrlRef.current); }, []);

  async function saveMode(mode: 'common' | 'table', startNow = false, count?: number) {
    if (!siteId) return;
    setSavingMode(true);
    try {
      const token = await firebaseAuth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(`/api/manage/sites/${siteId}/qr-mode`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, tableCount: count ?? tableCount, startNow }),
      });
      if (res.ok) {
        const d = await res.json();
        const m = d.qr_mode as 'common' | 'table', c = d.table_count ?? tableCount;
        setQrMode(m); setSavedQrMode(m); setTableCount(c); setSavedTableCount(c);
        setPendingMode(d.pending_qr_mode ?? null); setSwitchAt(d.qr_mode_switch_at ?? null);
        setShowSwitchPanel(false);
      }
    } catch { /* ignore */ } finally { setSavingMode(false); }
  }

  function addTable() {
    const next = tableCount + 1;
    setTableCount(next);
    // Auto-save table count change immediately
    if (tableSaveTimer.current) clearTimeout(tableSaveTimer.current);
    tableSaveTimer.current = setTimeout(() => saveMode('table', true, next), 600);
  }

  function removeLastTable() {
    if (tableCount <= 1) return;
    const next = tableCount - 1;
    // If previewing the removed table, switch to previous
    if (previewData?.data === tableUrl(tableCount)) {
      setPreviewData({ data: tableUrl(next), imageDataUrl: tableBadges[next], label: `Table ${next}` });
    }
    setTableCount(next);
    if (tableSaveTimer.current) clearTimeout(tableSaveTimer.current);
    tableSaveTimer.current = setTimeout(() => saveMode('table', true, next), 600);
  }

  const hasPending   = !!pendingMode && !!switchAt;
  const targetMode   = qrMode === 'table' ? 'common' : 'table';
  // For qr_order plan, takeaway QR is always present (can't be removed)
  const showTakeawayQR = hasTakeawayQR || isQrOrder;

  // ── Download handlers ─────────────────────────────────────────────────────
  const dlCommonPoster = useCallback(async () => {
    setDownloading('poster');
    try {
      const blob = await makePoster(baseUrl);
      if (!blob) throw new Error('empty');
      downloadBlob(blob, `${slug}-qr-poster.png`);
    } catch {
      toast.error('Could not make the poster. Please try again.');
    } finally { setDownloading(null); }
  }, [baseUrl, slug, makePoster]);

  const dlCommonQR = useCallback(async () => {
    setDownloading('qr');
    try {
      const blob = await getStyledQRBlob(baseUrl, undefined, 1000);
      if (!blob) throw new Error('empty');
      downloadBlob(blob, `${slug}-qr.png`);
    } catch {
      toast.error('Could not make the QR code. Please try again.');
    } finally { setDownloading(null); }
  }, [baseUrl, slug]);

  const dlTablePoster = useCallback(async (n: number) => {
    setDownloading(`poster-${n}`);
    try {
      const url = tableUrl(n);
      const blob = await makePoster(url, tableBadges[n]);
      if (!blob) throw new Error('empty');
      downloadBlob(blob, `${slug}-table-${n}-poster.png`);
    } catch {
      toast.error('Could not make the poster. Please try again.');
    } finally { setDownloading(null); }
  }, [baseUrl, slug, tableBadges, makePoster]);

  const dlTableQR = useCallback(async (n: number) => {
    setDownloading(`qr-${n}`);
    try {
      const url = tableUrl(n);
      const blob = await getStyledQRBlob(url, tableBadges[n], 1000);
      if (!blob) throw new Error('empty');
      downloadBlob(blob, `${slug}-table-${n}-qr.png`);
    } catch {
      toast.error('Could not make the QR code. Please try again.');
    } finally { setDownloading(null); }
  }, [baseUrl, slug, tableBadges]);

  const dlTakeawayPoster = useCallback(async () => {
    setDownloading('takeaway-poster');
    try {
      const blob = await makePoster(baseUrl);
      if (!blob) throw new Error('empty');
      downloadBlob(blob, `${slug}-takeaway-poster.png`);
    } catch {
      toast.error('Could not make the poster. Please try again.');
    } finally { setDownloading(null); }
  }, [baseUrl, slug, makePoster]);

  const dlTakeawayQR = useCallback(async () => {
    setDownloading('takeaway-qr');
    try {
      const blob = await getStyledQRBlob(baseUrl, undefined, 1000);
      if (!blob) throw new Error('empty');
      downloadBlob(blob, `${slug}-takeaway-qr.png`);
    } catch {
      toast.error('Could not make the QR code. Please try again.');
    } finally { setDownloading(null); }
  }, [baseUrl, slug]);

  const dlPreviewPoster = useCallback(async () => {
    if (!previewData) return;
    setDownloading('preview-poster');
    try {
      const blob = await makePoster(previewData.data, previewData.imageDataUrl);
      if (!blob) throw new Error('empty');
      downloadBlob(blob, `${slug}-${previewData.label.toLowerCase().replace(/\s+/g, '-')}-poster.png`);
    } catch {
      toast.error('Could not make the poster. Please try again.');
    } finally { setDownloading(null); }
  }, [previewData, slug, makePoster]);

  // ── Empty / loading state ─────────────────────────────────────────────────
  if (!baseUrl) {
    return (
      <div className="px-4 md:px-8 py-8">
        <h1 style={{ fontSize: 26, fontWeight: 600, color: A.dark, marginBottom: 4 }}>QR Codes</h1>
        <p style={{ fontSize: 14, color: A.muted }}>Download your menu QR codes and posters</p>
        <div style={{ marginTop: 48, textAlign: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 52, color: A.muted }}>qr_code_2</span>
          <p style={{ fontSize: 15, fontWeight: 600, color: A.dark, margin: '12px 0 4px' }}>No store found</p>
          <p style={{ fontSize: 13, color: A.muted }}>Create a store first to generate your QR codes.</p>
        </div>
      </div>
    );
  }

  // The sticker offer, shared by the current layout and the print kit.
  const stickerCard = (
      <div style={{
        border: `1px solid ${A.border}`, borderRadius: 14,
        background: A.white, padding: '20px 24px',
        display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, background: A.primaryBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 24, color: A.primary }}>nfc</span>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 600, color: A.dark }}>Get NFC + QR stickers</p>
          <p style={{ margin: 0, fontSize: 13, color: A.muted, lineHeight: 1.5 }}>
            A peel-and-stick label with a printed QR and an NFC tag inside — tap or scan. Order directly from us at {formatPrice(QR_STICKER_PRICE_INR)} per sticker.
          </p>
        </div>
        <button
          onClick={openCardModal}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
            background: A.primary, color: '#fff', border: 'none',
            borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>shopping_cart</span>
          {lastOrder ? 'Order more' : 'Order stickers'}
        </button>
        {lastOrder && (
          <div style={{
            // flexBasis 100% makes this wrap onto its own line inside the
            // card rather than squeezing in beside the button.
            flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 12px',
            background: '#E8F5EE', border: '1px solid #B7E2C8', borderRadius: 8,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 17, color: '#16794C', flexShrink: 0 }} aria-hidden>
              local_shipping
            </span>
            <p style={{ margin: 0, fontSize: 12.5, color: '#16794C', lineHeight: 1.45 }}>
              <strong>{lastOrder.qty} sticker{lastOrder.qty > 1 ? 's' : ''} ordered</strong>
              {' on '}
              {new Date(lastOrder.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              {' — we\u2019ll call you to confirm and arrange payment.'}
            </p>
          </div>
        )}
      </div>
  );

  // Menu-only stores get the print kit when NEXT_PUBLIC_QR_PRINT_KIT is on;
  // ordering plans keep this layout, which is built around their table modes.
  const kitOn = QR_PRINT_KIT && qrMenuOnly;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="px-4 md:px-8 py-8" style={{ minHeight: '100vh' }}>
      <style>{`
        /* The poster is the artefact the owner came for — it gets the wide
           column. The status/link/upsell cards explain it, so they get the
           narrow one. Previously this was reversed: 676px of explanation
           beside a 340px poster.
           Source order still puts the explaining column first in the DOM, so
           on a phone the poster was landing a full screen below the fold;
           the order property promotes it to the top there without disturbing tab order
           on desktop, where the two sit side by side anyway. */
        /* Intrinsic tracks: a hard 340px aside had no way to give ground when
           the content column narrowed (a sidebar, a zoom level), so the
           poster was squeezed instead of the layout reflowing. */
        .qr-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 340px); gap: 24px; align-items: start; }
        .qr-grid > .qr-aside { order: 2; }
        .qr-grid > .qr-poster { order: 1; }
        /* Sticky only where there are two columns to be sticky against. In
           the single-column mobile layout a sticky poster taller than the
           viewport stays pinned and paints over the cards below it — which
           hid the sticker card completely. */
        @media (min-width: 961px) { .qr-poster { position: sticky; top: 24px; } }
        @media (max-width: 960px) {
          .qr-grid { grid-template-columns: minmax(0, 1fr); }
          .qr-grid > .qr-poster { order: 0; position: static; }
        }
        .qr-row { cursor: pointer; transition: background 0.12s; }
        .qr-row:hover { background: ${A.bg} !important; }
      `}</style>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, color: A.dark, margin: 0 }}>QR Codes</h1>
        <p style={{ fontSize: 14, color: A.muted, margin: '4px 0 0' }}>
          {kitOn
            ? 'Print it for your tables, or share the link.'
            : <>{storeName} · <span style={{ color: A.muted }}>{slugLabel}</span></>}
        </p>
      </div>

      {kitOn ? (
        <MenuQrPanel
          menuUrl={baseUrl}
          siteId={siteId}
          slug={slug}
          storeName={storeName}
          posterTemplate={posterTemplate}
          stickerCard={stickerCard}
        />
      ) : (
        <div className="qr-grid">

          {/* ══════════════ SECONDARY COLUMN: status, link, cards ══════════════ */}
          <div className="qr-aside" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Pending switch banner */}
            {hasPending && (
              <div style={{
                background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10,
                padding: '12px 16px', display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', gap: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#D97706' }}>schedule</span>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#92400E' }}>
                      Switching to {pendingMode === 'table' ? 'Table QR' : 'Common QR'} in {timeLeft || 'soon'}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: '#B45309' }}>
                      Current orders continue with existing mode until switch completes
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => saveMode(pendingMode as 'common' | 'table', true)}
                  disabled={savingMode}
                  style={{
                    background: A.primary, color: '#fff', border: 'none', borderRadius: 8,
                    padding: '8px 18px', fontSize: 13, fontWeight: 500,
                    cursor: savingMode ? 'not-allowed' : 'pointer', opacity: savingMode ? 0.7 : 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {savingMode ? 'Applying…' : 'Apply Now'}
                </button>
              </div>
            )}

            {/* ── Mode Status Bar ── */}
            {loaded && (
              <div style={{ border: `1px solid ${A.border}`, borderRadius: 14, background: A.white, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 10,
                      background: A.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 19, color: A.primary }}>
                        {qrMode === 'table' ? 'table_restaurant' : 'qr_code'}
                      </span>
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: A.dark }}>
                        {qrMode === 'table' ? 'Table QR Active' : 'Common QR Active'}
                      </p>
                      <p style={{ margin: '1px 0 0', fontSize: 12, color: A.muted }}>
                        {qrMode === 'table'
                          ? 'Individual QR per table + one Takeaway QR. Orders are grouped by table.'
                          : 'One QR code for every table. Customers scan it to open your menu.'}
                      </p>
                      {isQrOrder && (
                        <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: '#92400E' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#F97316' }}>info</span>
                          QR Ordering (No Payment) uses table QR codes only
                        </div>
                      )}
                      {isPayEat && (
                        <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: '#3730A3' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#5137EF' }}>info</span>
                          QR Ordering + Payment uses a single Common QR code
                        </div>
                      )}
                    </div>
                  </div>
                  {!hasPending && !isQrOrder && !isPayEat && !qrMenuOnly && (
                    <button
                      onClick={() => setShowSwitchPanel(p => !p)}
                      style={{
                        flexShrink: 0,
                        border: `1.5px solid ${showSwitchPanel ? A.primary : A.border}`,
                        background: showSwitchPanel ? A.primaryBg : A.white,
                        color: showSwitchPanel ? A.primary : A.text,
                        borderRadius: 8, padding: '7px 16px',
                        fontSize: 13, fontWeight: 500, cursor: 'pointer',
                      }}
                    >
                      Switch Mode
                    </button>
                  )}
                </div>

                {/* Inline switch confirmation */}
                {showSwitchPanel && !hasPending && (
                  <div style={{ padding: '14px 20px', borderTop: `1px solid ${A.border}`, background: A.bg }}>
                    <p style={{ margin: '0 0 12px', fontSize: 13, color: A.text }}>
                      Switch to <strong style={{ color: A.dark }}>{targetMode === 'table' ? 'Table QR' : 'Common QR'}</strong> mode?
                    </p>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        onClick={() => saveMode(targetMode, false)}
                        disabled={savingMode}
                        style={{
                          flex: 1, padding: '9px', border: `1px solid ${A.border}`,
                          borderRadius: 8, background: A.white,
                          fontSize: 13, fontWeight: 500, color: A.text,
                          cursor: savingMode ? 'not-allowed' : 'pointer', opacity: savingMode ? 0.6 : 1,
                        }}
                      >
                        Schedule (active in 24h)
                      </button>
                      <button
                        onClick={() => saveMode(targetMode, true)}
                        disabled={savingMode}
                        style={{
                          flex: 1, padding: '9px', border: 'none',
                          borderRadius: 8, background: A.primary,
                          fontSize: 13, fontWeight: 500, color: '#fff',
                          cursor: savingMode ? 'not-allowed' : 'pointer', opacity: savingMode ? 0.6 : 1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}
                      >
                        {savingMode ? <><Spinner size={14} color="#fff" />Saving…</> : 'Apply Now'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ══ TABLE QR MODE ══ */}
            {loaded && qrMode === 'table' && (
              <>
                {/* Table QR Codes section */}
                <div style={{ border: `1px solid ${A.border}`, borderRadius: 14, background: A.white, overflow: 'hidden' }}>
                  <div style={{
                    padding: '14px 20px', borderBottom: `1px solid ${A.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: A.dark }}>Table QR Codes</p>
                      <p style={{ margin: '2px 0 0', fontSize: 13, color: A.muted }}>Manage codes assigned to specific dining tables.</p>
                    </div>
                    <button
                      onClick={addTable}
                      style={{
                        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                        background: A.primary, color: '#fff', border: 'none',
                        borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                      Add Table
                    </button>
                  </div>

                  <div>
                    {Array.from({ length: tableCount }, (_, i) => {
                      const n        = i + 1;
                      const url      = tableUrl(n);
                      const isActive = previewData?.data === url;
                      const isLast   = n === tableCount;

                      return (
                        <div
                          key={n}
                          className="qr-row"
                          onClick={() => setPreviewData({ data: url, imageDataUrl: tableBadges[n], label: `Table ${n}` })}
                          style={{
                            padding: '10px 20px',
                            borderLeft: `3px solid ${isActive ? A.primary : 'transparent'}`,
                            background: isActive ? A.primaryBg : 'transparent',
                            display: 'flex', alignItems: 'center', gap: 12,
                            borderBottom: n < tableCount ? `1px solid ${A.border}` : 'none',
                          }}
                        >
                          {/* Number badge */}
                          <div style={{
                            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                            background: isActive ? A.primary : A.bg,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: isActive ? '#fff' : A.dark }}>{n}</span>
                          </div>

                          <span style={{ fontSize: 14, fontWeight: 500, color: isActive ? A.primary : A.dark, flex: 1 }}>
                            Table {n}
                          </span>

                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <ActionBtn
                              label="Poster"
                              icon="download"
                              loading={downloading === `poster-${n}`}
                              disabled={!!downloading}
                              onClick={e => { e.stopPropagation(); dlTablePoster(n); }}
                            />
                            <ActionBtn
                              label="QR"
                              icon="qr_code"
                              loading={downloading === `qr-${n}`}
                              disabled={!!downloading}
                              onClick={e => { e.stopPropagation(); dlTableQR(n); }}
                            />
                            {isLast && tableCount > 1 && (
                              <button
                                type="button"
                                aria-label="Remove last table"
                                onClick={e => { e.stopPropagation(); removeLastTable(); }}
                                title="Remove last table"
                                style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: 'transparent', border: `1px solid ${A.border}`,
                                  borderRadius: 7, padding: 0, cursor: 'pointer', color: A.muted,
                                  width: 36, height: 36, flexShrink: 0,
                                }}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>delete</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Takeaway QR Codes section */}
                <div style={{ border: `1px solid ${A.border}`, borderRadius: 14, background: A.white, overflow: 'hidden' }}>
                  <div style={{
                    padding: '14px 20px', borderBottom: `1px solid ${A.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: A.dark }}>Takeaway QR Codes</p>
                      <p style={{ margin: '2px 0 0', fontSize: 13, color: A.muted }}>General codes for pickup and delivery orders.</p>
                    </div>
                    {!showTakeawayQR && (
                      <button
                        onClick={() => {
                          setHasTakeawayQR(true);
                          setPreviewData({ data: baseUrl, label: 'Takeaway QR' });
                        }}
                        style={{
                          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                          background: A.white, color: A.primary,
                          border: `1.5px solid ${A.primary}`,
                          borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                        Add Code
                      </button>
                    )}
                  </div>

                  {!showTakeawayQR ? (
                    <div style={{ padding: '36px 24px', textAlign: 'center' }}>
                      <div style={{
                        width: 48, height: 48, borderRadius: 12, background: A.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 24, color: A.muted }}>shopping_bag</span>
                      </div>
                      <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 500, color: A.dark }}>No takeaway codes created yet.</p>
                      <p style={{ margin: 0, fontSize: 13, color: A.muted }}>Create one to start accepting pickup orders.</p>
                    </div>
                  ) : (
                    <div
                      className="qr-row"
                      onClick={() => setPreviewData({ data: baseUrl, label: 'Takeaway QR' })}
                      style={{
                        padding: '10px 20px',
                        borderLeft: `3px solid ${previewData?.data === baseUrl && previewData?.label === 'Takeaway QR' ? A.primary : 'transparent'}`,
                        background: previewData?.data === baseUrl && previewData?.label === 'Takeaway QR' ? A.primaryBg : 'transparent',
                        display: 'flex', alignItems: 'center', gap: 12,
                      }}
                    >
                      {(() => {
                        const isTakeawayActive = previewData?.data === baseUrl && previewData?.label === 'Takeaway QR';
                        return (
                          <>
                            <div style={{
                              width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                              background: isTakeawayActive ? A.primary : A.bg,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 16, color: isTakeawayActive ? '#fff' : A.muted }}>
                                shopping_bag
                              </span>
                            </div>
                            <span style={{ fontSize: 14, fontWeight: 500, color: isTakeawayActive ? A.primary : A.dark, flex: 1 }}>
                              Takeaway
                            </span>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <ActionBtn
                                label="Poster"
                                icon="download"
                                loading={downloading === 'takeaway-poster'}
                                disabled={!!downloading}
                                onClick={e => { e.stopPropagation(); dlTakeawayPoster(); }}
                              />
                              <ActionBtn
                                label="QR"
                                icon="qr_code"
                                loading={downloading === 'takeaway-qr'}
                                disabled={!!downloading}
                                onClick={e => { e.stopPropagation(); dlTakeawayQR(); }}
                              />
                              {!isQrOrder && (
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    setHasTakeawayQR(false);
                                    if (previewData?.label === 'Takeaway QR') {
                                      setPreviewData(tableCount > 0
                                        ? { data: tableUrl(1), imageDataUrl: tableBadges[1], label: 'Table 1' }
                                        : null);
                                    }
                                  }}
                                  title="Remove takeaway QR"
                                  style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'transparent', border: `1px solid ${A.border}`,
                                    borderRadius: 7, padding: '6px', cursor: 'pointer', color: A.muted,
                                  }}
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                                </button>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ══ COMMON QR MODE ══ */}
            {loaded && qrMode === 'common' && (
              <div style={{ border: `1px solid ${A.border}`, borderRadius: 14, background: A.white, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: `1px solid ${A.border}` }}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: A.dark }}>Your QR Code</p>
                  <p style={{ margin: '2px 0 0', fontSize: 13, color: A.muted }}>Share this or print the poster for your store</p>
                </div>
                {(() => {
                  const isActive = previewData?.data === baseUrl;
                  return (
                    <div
                      className="qr-row"
                      onClick={() => setPreviewData({ data: baseUrl, label: 'Common QR' })}
                      style={{
                        padding: '12px 20px',
                        borderLeft: `3px solid ${isActive ? A.primary : 'transparent'}`,
                        background: isActive ? A.primaryBg : 'transparent',
                        display: 'flex', alignItems: 'center', gap: 12,
                      }}
                    >
                      <div style={{
                        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                        background: isActive ? A.primary : A.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: isActive ? '#fff' : A.muted }}>qr_code</span>
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 500, color: isActive ? A.primary : A.dark, flex: 1 }}>
                        Common QR
                      </span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <ActionBtn
                          label="Poster"
                          icon="download"
                          loading={downloading === 'poster'}
                          disabled={!!downloading}
                          onClick={e => { e.stopPropagation(); dlCommonPoster(); }}
                        />
                        <ActionBtn
                          label="QR Code"
                          icon="qr_code"
                          loading={downloading === 'qr'}
                          disabled={!!downloading}
                          onClick={e => { e.stopPropagation(); dlCommonQR(); }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {stickerCard}

          </div>

          {/* ══════════════ PRIMARY COLUMN: Poster Preview ══════════════ */}
          <div className="qr-poster">
            <div style={{ border: `1px solid ${A.border}`, borderRadius: 14, background: A.white, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${A.border}` }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: A.dark }}>Poster Preview</p>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: A.muted }}>Real-time view of your customer-facing material</p>
              </div>

              {/* Preview image */}
              <div style={{ padding: '16px 20px' }}>
                <div style={{
                  borderRadius: 10, border: `1px solid ${A.border}`,
                  overflow: 'hidden', background: A.bg,
                  minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {posterPreviewLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '32px 0' }}>
                      <Spinner size={24} color={A.primary} />
                      <p style={{ margin: 0, fontSize: 13, color: A.muted }}>Generating preview…</p>
                    </div>
                  ) : posterPreviewUrl ? (
                    <img
                      src={posterPreviewUrl}
                      alt="QR Poster preview"
                      style={{ width: '100%', display: 'block' }}
                    />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '32px 0' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 40, color: A.muted }}>image</span>
                      <p style={{ margin: 0, fontSize: 13, color: A.muted }}>Select a QR code to preview</p>
                    </div>
                  )}
                </div>
                {previewData && !posterPreviewLoading && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: A.muted, textAlign: 'center' }}>
                    Previewing: <strong style={{ color: A.dark }}>{previewData.label}</strong>
                  </p>
                )}
              </div>

              {/* Actions */}
              <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={dlPreviewPoster}
                  disabled={!!downloading || !previewData || posterPreviewLoading}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    background: A.primary, color: '#fff', border: 'none',
                    borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 500,
                    cursor: (!previewData || posterPreviewLoading || !!downloading) ? 'not-allowed' : 'pointer',
                    opacity: (!previewData || posterPreviewLoading || downloading === 'preview-poster') ? 0.7 : 1,
                  }}
                >
                  {downloading === 'preview-poster'
                    ? <><Spinner size={14} color="#fff" />Generating…</>
                    : <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>Download poster (PNG)</>
                  }
                </button>

              </div>


            </div>
          </div>
        </div>
      )}

      {/* ══ NFC Card Request Modal ══ */}
      {showCardModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) closeCardModal(); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 500,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
          }}
        >
          <div style={{
            background: A.white, borderRadius: 16, width: '100%', maxWidth: 520,
            maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          }}>
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${A.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: A.dark }}>Request NFC + QR stickers</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: A.muted }}>NFC tag + printed QR · {formatPrice(QR_STICKER_PRICE_INR)} per sticker · delivered to your address</p>
              </div>
              <button onClick={closeCardModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: A.muted, display: 'flex', padding: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>

            {cardSuccess ? (
              <div style={{ padding: '48px 32px', textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#16A34A' }}>check_circle</span>
                </div>
                <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: A.dark }}>Request Sent!</p>
                <p style={{ margin: '0 0 24px', fontSize: 13, color: A.muted }}>We&apos;ll contact you shortly to confirm your order and arrange payment.</p>
                <button onClick={closeCardModal} style={{ background: A.primary, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 28px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  Done
                </button>
              </div>
            ) : (
              <div style={{ padding: '24px' }}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: A.dark, marginBottom: 6 }}>Shop Name</label>
                  <input
                    value={cardForm.shopName}
                    onChange={e => setCardForm(f => ({ ...f, shopName: e.target.value }))}
                    placeholder="e.g. Spice Garden Restaurant"
                    style={{ width: '100%', height: 40, border: `1px solid ${A.border}`, borderRadius: 8, padding: '0 12px', fontSize: 14, color: A.dark, background: A.bg, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  {/* Menu-only stores get a plain quantity. Every sticker opens
                      the same menu, so a per-table QR would carry a table
                      signature that nothing reads while ordering is frozen —
                      offering the choice would sell a distinction that does not
                      exist. Ordering plans keep it for when the freeze lifts. */}
                  {qrMenuOnly ? (
                    <>
                      <label htmlFor="sticker-qty" style={{ display: 'block', fontSize: 13, fontWeight: 500, color: A.dark, marginBottom: 6 }}>How many stickers?</label>
                      <input
                        id="sticker-qty"
                        name="sticker-qty"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={MAX_STICKER_QTY}
                        value={cardForm.tableCount}
                        onChange={e => setCardForm(f => ({ ...f, tableCount: normaliseStickerQty(e.target.value) }))}
                        style={{ width: '100%', minHeight: 44, border: `1px solid ${A.border}`, borderRadius: 8, padding: '0 12px', fontSize: 14, color: A.dark, background: A.bg, outline: 'none', boxSizing: 'border-box' }}
                      />
                      <p style={{ margin: '6px 0 0', fontSize: 12, color: A.muted }}>
                        Most places order one per table, plus one for the counter.
                      </p>
                    </>
                  ) : (
                    <>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: A.dark, marginBottom: 6 }}>QR Code Type</label>
                      <div style={{ display: 'flex', gap: 10 }}>
                        {(['common', 'table'] as const).map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setCardForm(f => ({ ...f, qrType: t }))}
                            style={{
                              flex: 1, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                              border: `1.5px solid ${cardForm.qrType === t ? A.primary : A.border}`,
                              background: cardForm.qrType === t ? A.primaryBg : A.white,
                            }}
                          >
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: cardForm.qrType === t ? A.primary : A.dark }}>
                              {t === 'common' ? 'Common QR' : 'Table QR'}
                            </p>
                            <p style={{ margin: '2px 0 0', fontSize: 11, color: A.muted }}>
                              {t === 'common' ? '1 sticker' : 'One per table'}
                            </p>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {!qrMenuOnly && cardForm.qrType === 'table' && (
                  <div style={{ marginBottom: 16 }}>
                    <label htmlFor="table-count" style={{ display: 'block', fontSize: 13, fontWeight: 500, color: A.dark, marginBottom: 6 }}>Total Number of Tables</label>
                    <input
                      id="table-count"
                      name="table-count"
                      type="number" inputMode="numeric" min={1} max={MAX_STICKER_QTY}
                      value={cardForm.tableCount}
                      onChange={e => setCardForm(f => ({ ...f, tableCount: normaliseStickerQty(e.target.value) }))}
                      style={{ width: '100%', minHeight: 44, border: `1px solid ${A.border}`, borderRadius: 8, padding: '0 12px', fontSize: 14, color: A.dark, background: A.bg, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                )}

                <div style={{ background: A.primaryBg, borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: A.primary }}>
                    {stickerQty} sticker{stickerQty > 1 ? 's' : ''} × {formatPrice(QR_STICKER_PRICE_INR)}
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: A.primary }}>
                    {formatPrice(stickerOrderTotal(stickerQty))}
                  </span>
                </div>

                <div style={{ height: 1, background: A.border, marginBottom: 20 }} />
                <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 600, color: A.dark }}>Courier Address &amp; Contact</p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: A.dark, marginBottom: 6 }}>Contact Name</label>
                    <input value={cardForm.contactName} onChange={e => setCardForm(f => ({ ...f, contactName: e.target.value }))} placeholder="Full name" autoComplete="name" style={{ width: '100%', minHeight: 44, border: `1px solid ${A.border}`, borderRadius: 8, padding: '0 12px', fontSize: 14, color: A.dark, background: A.bg, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: A.dark, marginBottom: 6 }}>Phone Number</label>
                    <input value={cardForm.phone} onChange={e => setCardForm(f => ({ ...f, phone: e.target.value }))} placeholder="98765 43210" type="tel" inputMode="numeric" autoComplete="tel" style={{ width: '100%', minHeight: 44, border: `1px solid ${A.border}`, borderRadius: 8, padding: '0 12px', fontSize: 14, color: A.dark, background: A.bg, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: A.dark, marginBottom: 6 }}>Address Line 1</label>
                  <input value={cardForm.line1} onChange={e => setCardForm(f => ({ ...f, line1: e.target.value }))} placeholder="Street / building / area" autoComplete="address-line1" style={{ width: '100%', minHeight: 44, border: `1px solid ${A.border}`, borderRadius: 8, padding: '0 12px', fontSize: 14, color: A.dark, background: A.bg, outline: 'none', boxSizing: 'border-box' }} />
                </div>

                {/* City was missing from an Indian courier address entirely, so
                    every request needed a follow-up call before it could ship. */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: A.dark, marginBottom: 6 }}>City / Town</label>
                  <input value={cardForm.city} onChange={e => setCardForm(f => ({ ...f, city: e.target.value }))} placeholder="e.g. Coimbatore" autoComplete="address-level2" style={{ width: '100%', minHeight: 44, border: `1px solid ${A.border}`, borderRadius: 8, padding: '0 12px', fontSize: 14, color: A.dark, background: A.bg, outline: 'none', boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: A.dark, marginBottom: 6 }}>State</label>
                    <input value={cardForm.state} onChange={e => setCardForm(f => ({ ...f, state: e.target.value }))} placeholder="e.g. Tamil Nadu" autoComplete="address-level1" style={{ width: '100%', minHeight: 44, border: `1px solid ${A.border}`, borderRadius: 8, padding: '0 12px', fontSize: 14, color: A.dark, background: A.bg, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: A.dark, marginBottom: 6 }}>Pin Code</label>
                    <input value={cardForm.pincode} onChange={e => setCardForm(f => ({ ...f, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))} placeholder="600001" inputMode="numeric" maxLength={6} autoComplete="postal-code" style={{ width: '100%', minHeight: 44, border: `1px solid ${A.border}`, borderRadius: 8, padding: '0 12px', fontSize: 14, color: A.dark, background: A.bg, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: A.dark, marginBottom: 6 }}>Country</label>
                  <input value={cardForm.country} onChange={e => setCardForm(f => ({ ...f, country: e.target.value }))} autoComplete="country-name" style={{ width: '100%', minHeight: 44, border: `1px solid ${A.border}`, borderRadius: 8, padding: '0 12px', fontSize: 14, color: A.dark, background: A.bg, outline: 'none', boxSizing: 'border-box' }} />
                </div>

                {cardError && <p style={{ fontSize: 13, color: '#DC2626', marginBottom: 12 }}>{cardError}</p>}

                <button
                  disabled={cardSubmitting}
                  onClick={async () => {
                    const { shopName, qrType, contactName, phone, line1, city, state, pincode, country } = cardForm;
                    if (!shopName.trim()) { setCardError('Please enter your shop name.'); return; }
                    if (!contactName.trim()) { setCardError('Please enter a contact name.'); return; }
                    // A courier cannot ring a malformed number — catch the shape
                    // here rather than at dispatch.
                    if (!/^[6-9]\d{9}$/.test(phone.replace(/\D/g, '').replace(/^91/, ''))) {
                      setCardError('Enter a 10-digit Indian mobile number.'); return;
                    }
                    if (!line1.trim() || !city.trim() || !state.trim()) { setCardError('Please fill in the full address, including your city.'); return; }
                    if (!/^\d{6}$/.test(pincode.trim())) { setCardError('Pin code must be 6 digits.'); return; }
                    setCardError(''); setCardSubmitting(true);
                    try {
                      const token = await firebaseAuth.currentUser?.getIdToken();
                      const email = firebaseAuth.currentUser?.email ?? '';
                      const res = await fetch('/api/manage/qr-card-request', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-User-Email': email },
                        body: JSON.stringify({ shopName: shopName.trim(), qrType, quantity: stickerQty, contact: { name: contactName.trim(), phone: phone.trim() }, address: { line1: line1.trim(), city: city.trim(), state: state.trim(), pincode: pincode.trim(), country: country.trim() || 'India' } }),
                      });
                      if (!res.ok) throw new Error();
                      recordOrder(stickerQty);
                      setCardSuccess(true);
                    } catch {
                      setCardError('Something went wrong. Please try again.');
                    } finally {
                      setCardSubmitting(false);
                    }
                  }}
                  style={{
                    width: '100%', height: 44,
                    background: cardSubmitting ? '#A5B4FC' : A.primary,
                    color: '#fff', border: 'none', borderRadius: 8,
                    fontSize: 14, fontWeight: 600,
                    cursor: cardSubmitting ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  {cardSubmitting
                    ? <><Spinner size={16} color="#fff" />Sending…</>
                    : 'Submit Request'
                  }
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
