'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type QRCodeStylingClass from 'qr-code-styling';
import type { Options as QROptions } from 'qr-code-styling';

async function loadQRLib(): Promise<typeof QRCodeStylingClass> {
  const mod = await import('qr-code-styling');
  return mod.default;
}
import { useSite } from '@/components/SiteContext';
import { usePlan } from '@/components/PlanContext';
import { firebaseAuth } from '@/lib/firebase';

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

function qrOptions(data: string, size: number, imageUrl?: string): QROptions {
  return {
    width: size, height: size, type: 'canvas', data,
    qrOptions: { errorCorrectionLevel: 'H' },
    dotsOptions: { color: '#000000', type: 'extra-rounded' },
    cornersSquareOptions: { color: '#000000', type: 'extra-rounded' },
    cornersDotOptions: { color: '#000000', type: 'dot' },
    backgroundOptions: { color: '#ffffff' },
    ...(imageUrl ? {
      image: imageUrl,
      imageOptions: { margin: 6, imageSize: 0.28, crossOrigin: 'anonymous', saveAsBlob: true },
    } : {}),
  };
}

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

async function getStyledQRBlob(data: string, imageDataUrl?: string, size = 1000): Promise<Blob | null> {
  const QRCodeStyling = await loadQRLib();
  const qr = new QRCodeStyling(qrOptions(data, size, imageDataUrl));
  const raw = await qr.getRawData('png');
  if (!raw) return null;
  if (typeof Blob !== 'undefined' && raw instanceof Blob) return raw;
  return null;
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

function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function detectWhiteBox(template: HTMLImageElement): { x: number; y: number; w: number; h: number } {
  const W = template.naturalWidth, H = template.naturalHeight;
  const sc = Math.min(1, 400 / W);
  const sw = Math.round(W * sc), sh = Math.round(H * sc);
  const tmp = document.createElement('canvas'); tmp.width = sw; tmp.height = sh;
  const ctx = tmp.getContext('2d')!;
  ctx.drawImage(template, 0, 0, sw, sh);
  const d = ctx.getImageData(0, 0, sw, sh).data;
  const isWhite = (x: number, y: number) => { const i = (y * sw + x) * 4; return d[i] > 220 && d[i + 1] > 220 && d[i + 2] > 220 && d[i + 3] > 200; };
  const sy = Math.round(sh * 0.55);
  let L = -1, R = -1;
  for (let x = 0; x < sw; x++) if (isWhite(x, sy)) { if (L < 0) L = x; R = x; }
  const sx = L > 0 ? Math.round((L + R) / 2) : Math.round(sw / 2);
  const minY = Math.round(sh * 0.30);
  let T = -1, B = -1;
  for (let y = minY; y < sh; y++) if (isWhite(sx, y)) { if (T < 0) T = y; B = y; }
  if (L < 0 || T < 0) return { x: W * 0.127, y: H * 0.385, w: W * 0.746, h: H * 0.494 };
  return { x: Math.round(L / sc), y: Math.round(T / sc), w: Math.round((R - L) / sc), h: Math.round((B - T) / sc) };
}

async function brandPosterBlob(qrData: string, imageDataUrl?: string): Promise<Blob | null> {
  const [template, qrBlob] = await Promise.all([
    loadImage('/brand poster template.png'),
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
function Spinner({ size = 14, color = A.text }: { size?: number; color?: string }) {
  return (
    <div style={{
      width: size, height: size,
      border: `2px solid ${color}33`,
      borderTopColor: color,
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  );
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
  const { isQrOrder, isPayEat } = usePlan();

  const [baseUrl, setBaseUrl]         = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [savingMode, setSavingMode]   = useState(false);

  // NFC card request modal
  const [showCardModal, setShowCardModal] = useState(false);
  const [cardForm, setCardForm] = useState({
    shopName: '', qrType: 'common' as 'common' | 'table', tableCount: 1,
    contactName: '', phone: '',
    line1: '', state: '', pincode: '', country: 'India',
  });
  const [cardSubmitting, setCardSubmitting] = useState(false);
  const [cardSuccess, setCardSuccess]       = useState(false);
  const [cardError, setCardError]           = useState('');

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
      line1: '', state: '', pincode: '', country: 'India',
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
          const m = (isQrOrder ? 'table' : isPayEat ? 'common' : (d.qr_mode ?? 'common')) as 'common' | 'table';
          const c = d.table_count ?? 4;
          setQrMode(m); setSavedQrMode(m);
          setTableCount(c); setSavedTableCount(c);
          setPendingMode(d.pending_qr_mode ?? null);
          setSwitchAt(d.qr_mode_switch_at ?? null);
        }
      } catch { /* ignore */ } finally { setLoaded(true); }
    })();
  }, [siteId, isQrOrder, isPayEat]);

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
    brandPosterBlob(previewData.data, previewData.imageDataUrl).then(blob => {
      if (cancelled || !blob) { if (!cancelled) setPosterPreviewLoading(false); return; }
      const url = URL.createObjectURL(blob);
      if (posterUrlRef.current) URL.revokeObjectURL(posterUrlRef.current);
      posterUrlRef.current = url;
      setPosterPreviewUrl(url);
      setPosterPreviewLoading(false);
    }).catch(() => { if (!cancelled) setPosterPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [previewData]);

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
    const blob = await brandPosterBlob(baseUrl, undefined);
    if (blob) downloadBlob(blob, `${slug}-qr-poster.png`);
    setDownloading(null);
  }, [baseUrl, slug]);

  const dlCommonQR = useCallback(async () => {
    setDownloading('qr');
    const blob = await getStyledQRBlob(baseUrl, undefined, 1000);
    if (blob) downloadBlob(blob, `${slug}-qr.png`);
    setDownloading(null);
  }, [baseUrl, slug]);

  const dlTablePoster = useCallback(async (n: number) => {
    setDownloading(`poster-${n}`);
    const url = tableUrl(n);
    const blob = await brandPosterBlob(url, tableBadges[n]);
    if (blob) downloadBlob(blob, `${slug}-table-${n}-poster.png`);
    setDownloading(null);
  }, [baseUrl, slug, tableBadges]);

  const dlTableQR = useCallback(async (n: number) => {
    setDownloading(`qr-${n}`);
    const url = tableUrl(n);
    const blob = await getStyledQRBlob(url, tableBadges[n], 1000);
    if (blob) downloadBlob(blob, `${slug}-table-${n}-qr.png`);
    setDownloading(null);
  }, [baseUrl, slug, tableBadges]);

  const dlTakeawayPoster = useCallback(async () => {
    setDownloading('takeaway-poster');
    const blob = await brandPosterBlob(baseUrl, undefined);
    if (blob) downloadBlob(blob, `${slug}-takeaway-poster.png`);
    setDownloading(null);
  }, [baseUrl, slug]);

  const dlTakeawayQR = useCallback(async () => {
    setDownloading('takeaway-qr');
    const blob = await getStyledQRBlob(baseUrl, undefined, 1000);
    if (blob) downloadBlob(blob, `${slug}-takeaway-qr.png`);
    setDownloading(null);
  }, [baseUrl, slug]);

  const dlPreviewPoster = useCallback(async () => {
    if (!previewData) return;
    setDownloading('preview-poster');
    const blob = await brandPosterBlob(previewData.data, previewData.imageDataUrl);
    if (blob) downloadBlob(blob, `${slug}-${previewData.label.toLowerCase().replace(/\s+/g, '-')}-poster.png`);
    setDownloading(null);
  }, [previewData, slug]);

  // ── Empty / loading state ─────────────────────────────────────────────────
  if (!baseUrl) {
    return (
      <div className="px-4 md:px-8 py-8">
        <h1 style={{ fontSize: 26, fontWeight: 600, color: A.dark, marginBottom: 4 }}>QR Codes</h1>
        <p style={{ fontSize: 14, color: A.muted }}>Download your menu QR codes and posters</p>
        <div style={{ marginTop: 48, textAlign: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 52, color: A.faint }}>qr_code_2</span>
          <p style={{ fontSize: 15, fontWeight: 600, color: A.dark, margin: '12px 0 4px' }}>No store found</p>
          <p style={{ fontSize: 13, color: A.muted }}>Create a store first to generate your QR codes.</p>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="px-4 md:px-8 py-8" style={{ minHeight: '100vh' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .qr-grid { display: grid; grid-template-columns: 1fr 340px; gap: 24px; align-items: start; }
        @media (max-width: 960px) { .qr-grid { grid-template-columns: 1fr; } }
        .qr-row { cursor: pointer; transition: background 0.12s; }
        .qr-row:hover { background: ${A.bg} !important; }
      `}</style>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, color: A.dark, margin: 0 }}>QR Codes</h1>
        <p style={{ fontSize: 14, color: A.muted, margin: '4px 0 0' }}>
          {storeName} · <span style={{ color: A.faint }}>{slugLabel}</span>
        </p>
      </div>

      <div className="qr-grid">

        {/* ══════════════ LEFT COLUMN ══════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

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
                        : 'One QR code for all customers. Tokens are sequential: 1, 2, 3…'}
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
                {!hasPending && !isQrOrder && !isPayEat && (
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
                      <span className="material-symbols-outlined" style={{ fontSize: 24, color: A.faint }}>shopping_bag</span>
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

          {/* NFC Card promo */}
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
              <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 600, color: A.dark }}>Get a Physical QR Code Card</p>
              <p style={{ margin: 0, fontSize: 13, color: A.muted, lineHeight: 1.5 }}>
                Need a printed QR card or an NFC-enabled QR card for your tables? Order one directly from us — ₹99 per card.
              </p>
            </div>
            <button
              onClick={() => { setCardError(''); setCardSuccess(false); setShowCardModal(true); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
                background: A.primary, color: '#fff', border: 'none',
                borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>shopping_cart</span>
              Request Cards
            </button>
          </div>
        </div>

        {/* ══════════════ RIGHT COLUMN: Poster Preview ══════════════ */}
        <div style={{ position: 'sticky', top: 24 }}>
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
                    <span className="material-symbols-outlined" style={{ fontSize: 40, color: A.faint }}>image</span>
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
                  : <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>picture_as_pdf</span>Download PDF</>
                }
              </button>
              <button
                disabled
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  background: A.white, color: A.muted,
                  border: `1.5px solid ${A.border}`,
                  borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 500, cursor: 'not-allowed', opacity: 0.7,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>palette</span>
                Customise Poster
                <span style={{ fontSize: 10, background: A.bg, borderRadius: 4, padding: '2px 6px', color: A.faint, marginLeft: 4 }}>
                  Soon
                </span>
              </button>
            </div>

            {/* Design Tip */}
            <div style={{
              margin: '0 20px 20px',
              background: '#FFF7ED', border: '1px solid #FED7AA',
              borderRadius: 10, padding: '12px 14px',
              display: 'flex', gap: 10,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#EA580C', flexShrink: 0, marginTop: 1 }}>lightbulb</span>
              <div>
                <p style={{ margin: '0 0 3px', fontSize: 12, fontWeight: 600, color: '#9A3412' }}>Design Tip</p>
                <p style={{ margin: 0, fontSize: 12, color: '#C2410C', lineHeight: 1.5 }}>
                  Use high-contrast QR codes and place them at eye-level on your tables for the best scan rates.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

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
                <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: A.dark }}>Request QR Card</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: A.muted }}>NFC-enabled · ₹99 per card · delivered to your address</p>
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
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: A.dark, marginBottom: 6 }}>QR Code Type</label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {(['common', 'table'] as const).map(t => (
                      <button
                        key={t}
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
                          {t === 'common' ? '1 card' : 'One per table'}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {cardForm.qrType === 'table' && (
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: A.dark, marginBottom: 6 }}>Total Number of Tables</label>
                    <input
                      type="number" min={1} max={200}
                      value={cardForm.tableCount}
                      onChange={e => setCardForm(f => ({ ...f, tableCount: Math.max(1, parseInt(e.target.value) || 1) }))}
                      style={{ width: '100%', height: 40, border: `1px solid ${A.border}`, borderRadius: 8, padding: '0 12px', fontSize: 14, color: A.dark, background: A.bg, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                )}

                <div style={{ background: A.primaryBg, borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: A.primary }}>
                    {cardForm.qrType === 'table' ? cardForm.tableCount : 1} card{(cardForm.qrType === 'table' ? cardForm.tableCount : 1) > 1 ? 's' : ''} × ₹99
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: A.primary }}>
                    ₹{(cardForm.qrType === 'table' ? cardForm.tableCount : 1) * 99}
                  </span>
                </div>

                <div style={{ height: 1, background: A.border, marginBottom: 20 }} />
                <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 600, color: A.dark }}>Courier Address &amp; Contact</p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: A.dark, marginBottom: 6 }}>Contact Name</label>
                    <input value={cardForm.contactName} onChange={e => setCardForm(f => ({ ...f, contactName: e.target.value }))} placeholder="Full name" style={{ width: '100%', height: 40, border: `1px solid ${A.border}`, borderRadius: 8, padding: '0 12px', fontSize: 14, color: A.dark, background: A.bg, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: A.dark, marginBottom: 6 }}>Phone Number</label>
                    <input value={cardForm.phone} onChange={e => setCardForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 98765 43210" type="tel" style={{ width: '100%', height: 40, border: `1px solid ${A.border}`, borderRadius: 8, padding: '0 12px', fontSize: 14, color: A.dark, background: A.bg, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: A.dark, marginBottom: 6 }}>Address Line 1</label>
                  <input value={cardForm.line1} onChange={e => setCardForm(f => ({ ...f, line1: e.target.value }))} placeholder="Street / building / area" style={{ width: '100%', height: 40, border: `1px solid ${A.border}`, borderRadius: 8, padding: '0 12px', fontSize: 14, color: A.dark, background: A.bg, outline: 'none', boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: A.dark, marginBottom: 6 }}>State</label>
                    <input value={cardForm.state} onChange={e => setCardForm(f => ({ ...f, state: e.target.value }))} placeholder="e.g. Tamil Nadu" style={{ width: '100%', height: 40, border: `1px solid ${A.border}`, borderRadius: 8, padding: '0 12px', fontSize: 14, color: A.dark, background: A.bg, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: A.dark, marginBottom: 6 }}>Pin Code</label>
                    <input value={cardForm.pincode} onChange={e => setCardForm(f => ({ ...f, pincode: e.target.value }))} placeholder="600001" style={{ width: '100%', height: 40, border: `1px solid ${A.border}`, borderRadius: 8, padding: '0 12px', fontSize: 14, color: A.dark, background: A.bg, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: A.dark, marginBottom: 6 }}>Country</label>
                  <input value={cardForm.country} onChange={e => setCardForm(f => ({ ...f, country: e.target.value }))} style={{ width: '100%', height: 40, border: `1px solid ${A.border}`, borderRadius: 8, padding: '0 12px', fontSize: 14, color: A.dark, background: A.bg, outline: 'none', boxSizing: 'border-box' }} />
                </div>

                {cardError && <p style={{ fontSize: 13, color: '#DC2626', marginBottom: 12 }}>{cardError}</p>}

                <button
                  disabled={cardSubmitting}
                  onClick={async () => {
                    const { shopName, qrType, tableCount: tc, contactName, phone, line1, state, pincode, country } = cardForm;
                    if (!shopName.trim()) { setCardError('Please enter your shop name.'); return; }
                    if (!contactName.trim() || !phone.trim()) { setCardError('Please enter contact name and phone number.'); return; }
                    if (!line1.trim() || !state.trim() || !pincode.trim()) { setCardError('Please fill in all address fields.'); return; }
                    setCardError(''); setCardSubmitting(true);
                    try {
                      const token = await firebaseAuth.currentUser?.getIdToken();
                      const email = firebaseAuth.currentUser?.email ?? '';
                      const res = await fetch('/api/manage/qr-card-request', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-User-Email': email },
                        body: JSON.stringify({ shopName: shopName.trim(), qrType, tableCount: tc, contact: { name: contactName.trim(), phone: phone.trim() }, address: { line1: line1.trim(), state: state.trim(), pincode: pincode.trim(), country: country.trim() || 'India' } }),
                      });
                      if (!res.ok) throw new Error();
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
