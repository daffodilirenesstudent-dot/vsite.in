'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from './AuthContext';

// Top-SaaS-style notification bell. Pulls /api/notifications on mount + on
// every dropdown open, polls every 60s while the tab is visible, and updates
// the badge in real time. Click an item to jump to its deep link and mark
// read; "Mark all read" zeroes the badge in one shot.

interface NotificationItem {
  id:         string;
  type:       string;
  title:      string;
  body:       string | null;
  link:       string | null;
  is_read:    boolean;
  created_at: string;
}

interface FetchResult {
  items:  NotificationItem[];
  unread: number;
}

const ICON_BY_TYPE: Record<string, { icon: string; tint: string; bg: string }> = {
  subscription_activated: { icon: 'verified',          tint: '#16A34A', bg: '#ECFDF5' },
  razorpay_connected:     { icon: 'credit_card',       tint: '#2563EB', bg: '#EFF6FF' },
  razorpay_revoked:       { icon: 'link_off',          tint: '#DC2626', bg: '#FEF2F2' },
  plan_expiring:          { icon: 'schedule',          tint: '#D97706', bg: '#FFFBEB' },
  plan_expired:           { icon: 'error',             tint: '#DC2626', bg: '#FEF2F2' },
  trial_ending:           { icon: 'hourglass_bottom',  tint: '#2563EB', bg: '#EFF6FF' },
  trial_expired:          { icon: 'lock_clock',        tint: '#DC2626', bg: '#FEF2F2' },
  payment_failed:         { icon: 'report',            tint: '#DC2626', bg: '#FEF2F2' },
  order_paid:             { icon: 'shopping_bag',      tint: '#16A34A', bg: '#ECFDF5' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)   return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen]       = useState(false);
  const [data, setData]       = useState<FetchResult>({ items: [], unread: 0 });
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const getToken = useCallback(async () => {
    const { firebaseAuth } = await import('@/lib/firebase');
    return firebaseAuth.currentUser?.getIdToken();
  }, []);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/notifications', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [user, getToken]);

  // Initial fetch + 60s poll while visible.
  useEffect(() => {
    if (!user) return;
    fetchAll();
    const id = setInterval(() => { if (document.visibilityState === 'visible') fetchAll(); }, 60_000);
    const onVis = () => { if (document.visibilityState === 'visible') fetchAll(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [user, fetchAll]);

  // Refresh whenever the dropdown opens.
  useEffect(() => { if (open) fetchAll(); }, [open, fetchAll]);

  // Click-outside dismiss.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const markRead = async (id: string) => {
    // Optimistic — drop the unread flag locally first.
    setData(d => ({
      items:  d.items.map(it => it.id === id ? { ...it, is_read: true } : it),
      unread: Math.max(0, d.unread - (d.items.find(i => i.id === id)?.is_read ? 0 : 1)),
    }));
    try {
      const token = await getToken();
      if (!token) return;
      await fetch(`/api/notifications/${id}/read`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    } catch { /* will reconcile on next poll */ }
  };

  const markAllRead = async () => {
    setData(d => ({ items: d.items.map(it => ({ ...it, is_read: true })), unread: 0 }));
    try {
      const token = await getToken();
      if (!token) return;
      await fetch('/api/notifications/read-all', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    } catch { /* */ }
  };

  if (!user) return null;

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Notifications"
        style={{
          position: 'relative', width: 36, height: 36, borderRadius: 8,
          background: open ? '#F4F4F5' : '#FFFFFF',
          border: '1px solid #E4E4E7', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#52525C' }}>notifications</span>
        {data.unread > 0 && (
          <span
            aria-label={`${data.unread} unread`}
            style={{
              position: 'absolute', top: -4, right: -4,
              minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
              background: '#DC2626', color: '#FFFFFF',
              fontSize: 10, fontWeight: 700, lineHeight: '18px', textAlign: 'center',
              boxShadow: '0 0 0 2px #FFFFFF',
            }}
          >
            {data.unread > 99 ? '99+' : data.unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            width: 380, maxHeight: 480, overflow: 'hidden',
            background: '#FFFFFF', borderRadius: 12,
            border: '1px solid #E4E4E7',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            display: 'flex', flexDirection: 'column',
            zIndex: 50,
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid #E4E4E7',
          }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#0A0A0A' }}>Notifications</p>
            {data.unread > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 500, color: '#2563EB',
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading && data.items.length === 0 && (
              <p style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#71717A' }}>Loading…</p>
            )}
            {!loading && data.items.length === 0 && (
              <div style={{ padding: '36px 16px', textAlign: 'center' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 24, background: '#F4F4F5',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 12px',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#99A1AF' }}>notifications_off</span>
                </div>
                <p style={{ fontSize: 13, color: '#71717A' }}>You&rsquo;re all caught up.</p>
              </div>
            )}
            {data.items.map((n) => {
              const ic = ICON_BY_TYPE[n.type] ?? { icon: 'info', tint: '#52525C', bg: '#F4F4F5' };
              const onClick = () => {
                if (!n.is_read) markRead(n.id);
                if (n.link) { setOpen(false); /* Link below handles nav */ }
              };
              const Inner = (
                <div
                  style={{
                    display: 'flex', gap: 12, padding: '12px 16px',
                    background: n.is_read ? '#FFFFFF' : '#FAFBFE',
                    borderBottom: '1px solid #F4F4F5',
                    cursor: n.link ? 'pointer' : 'default',
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, background: ic.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: ic.tint }}>{ic.icon}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {n.title}
                      </p>
                      {!n.is_read && (
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563EB', flexShrink: 0 }} />
                      )}
                    </div>
                    {n.body && (
                      <p style={{ fontSize: 12, color: '#52525C', lineHeight: '16px', margin: '0 0 4px' }}>{n.body}</p>
                    )}
                    <p style={{ fontSize: 11, color: '#99A1AF' }}>{timeAgo(n.created_at)}</p>
                  </div>
                </div>
              );
              return n.link
                ? <Link key={n.id} href={n.link} onClick={onClick} style={{ textDecoration: 'none', color: 'inherit' }}>{Inner}</Link>
                : <div key={n.id} onClick={onClick}>{Inner}</div>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
