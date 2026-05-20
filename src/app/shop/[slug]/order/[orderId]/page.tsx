'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

interface OrderItem {
  name: string;
  qty: number;
  price: number;
  variantSize?: string;
}

interface OrderStatus {
  counter_number: string | null;
  token_number: string | null;
  table_number: string | null;
  payment_status: 'pending' | 'paid';
  payment_method: 'online' | 'counter' | 'no_payment';
  status: 'preparing' | 'ready' | 'completed';
  order_number: string;
  items: OrderItem[] | null;
  subtotal: string | number | null;
  customer_name: string | null;
}

const STATUS_INFO: Record<string, { label: string; color: string; bg: string; border: string; desc: string }> = {
  preparing: { label: 'Preparing',  color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA', desc: 'Your order is being prepared in the kitchen.' },
  completed: { label: 'Completed',  color: '#5137EF', bg: '#EEEEFF', border: '#C7D2FE', desc: 'Your order is ready — please collect it now. Enjoy!' },
};

function tokenMeta(token: string): { label: string; subtitle: string; fontSize: number } {
  if (token.startsWith('Table '))    return { label: 'TABLE',          subtitle: 'Your table order is confirmed',               fontSize: 40 };
  if (token.startsWith('Takeaway ')) return { label: 'TAKEAWAY TOKEN', subtitle: 'Show this when collecting your takeaway order', fontSize: 36 };
  return { label: 'TOKEN NUMBER', subtitle: 'Show this when collecting your order', fontSize: 56 };
}

function OrderStatusContent() {
  const searchParams = useSearchParams();
  const { slug, orderId } = useParams<{ slug: string; orderId: string }>();
  const signedToken = searchParams.get('t') ?? '';

  const [status, setStatus]   = useState<OrderStatus | null>(null);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) { setError('Invalid link.'); setLoading(false); return; }

    const poll = async () => {
      try {
        const qs = signedToken ? `?t=${encodeURIComponent(signedToken)}` : '';
        const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/status${qs}`, { cache: 'no-store' });
        if (res.status === 410) { setError('This link has expired.');  setLoading(false); return false; }
        if (res.status === 401) { setError('Invalid link.');           setLoading(false); return false; }
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
          setLoading(false);
          return data.status !== 'completed';
        }
      } catch { /* retry */ }
      return true;
    };

    poll().then(keepPolling => {
      if (!keepPolling) return;
      const id = setInterval(async () => {
        const cont = await poll();
        if (!cont) clearInterval(id);
      }, 3000);
      return () => clearInterval(id);
    });
  }, [orderId, signedToken]);

  const isOnline       = status?.payment_method === 'online';
  const isCounter      = status?.payment_method === 'counter';
  const isNoPayment    = status?.payment_method === 'no_payment';
  const tokenReady     = !!status?.token_number;
  const tableReady     = isNoPayment && !!status?.table_number && !tokenReady;
  const waitingPayment = isCounter && status?.payment_status === 'pending';
  const waitingToken   = isCounter && status?.payment_status === 'paid' && !tokenReady;
  const statusInfo     = status ? (STATUS_INFO[status.status] ?? STATUS_INFO.preparing) : null;
  const stillActive    = status && status.status !== 'completed';

  const meta  = status?.token_number ? tokenMeta(status.token_number) : null;
  const items = status?.items ?? [];
  const total = status?.subtotal != null
    ? parseFloat(String(status.subtotal))
    : Math.round(items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;

  return (
    <div style={{
      minHeight: '100svh', background: '#F4F4F5',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '24px 16px 48px',
      fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{
        width: '100%', maxWidth: 420,
        background: '#FFFFFF', borderRadius: 20, overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
      }}>
        {/* ── Header ── */}
        <div style={{ background: '#5137EF', padding: '22px 24px' }}>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff' }}>Order Status</p>
          {status && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
              #{status.order_number}{status.customer_name ? ` · ${status.customer_name}` : ''}
            </p>
          )}
        </div>

        <div style={{ padding: '22px 20px' }}>

          {/* ── Loading ── */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{
                width: 32, height: 32, margin: '0 auto 14px',
                border: '3px solid #E4E4E7', borderTopColor: '#5137EF',
                borderRadius: '50%', animation: 'spin 0.8s linear infinite',
              }} />
              <p style={{ margin: 0, fontSize: 14, color: '#71717A' }}>Loading your order…</p>
            </div>
          )}

          {/* ── Error ── */}
          {error && (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <p style={{ margin: '0 0 20px', fontSize: 15, color: '#E7000B', fontWeight: 500 }}>{error}</p>
              <a href={`/shop/${slug}`} style={{
                display: 'inline-block', background: '#5137EF', color: '#fff',
                borderRadius: 8, padding: '10px 22px', fontSize: 14, fontWeight: 600, textDecoration: 'none',
              }}>Back to Menu</a>
            </div>
          )}

          {!loading && !error && status && (
            <>
              {/* ── Payment badge ── */}
              <div style={{ marginBottom: 16 }}>
                {isOnline && (
                  <span style={{
                    fontSize: 13, fontWeight: 600, color: '#16A34A',
                    background: '#F0FDF4', border: '1px solid #BBF7D0',
                    borderRadius: 20, padding: '4px 14px', display: 'inline-block',
                  }}>✓ Paid Online</span>
                )}
                {isCounter && status.payment_status === 'paid' && (
                  <span style={{
                    fontSize: 13, fontWeight: 600, color: '#16A34A',
                    background: '#F0FDF4', border: '1px solid #BBF7D0',
                    borderRadius: 20, padding: '4px 14px', display: 'inline-block',
                  }}>✓ Payment Confirmed</span>
                )}
                {isNoPayment && (
                  <span style={{
                    fontSize: 13, fontWeight: 600, color: '#5137EF',
                    background: '#EEEEFF', border: '1px solid #C7D2FE',
                    borderRadius: 20, padding: '4px 14px', display: 'inline-block',
                  }}>✓ No Payment Required</span>
                )}
                {waitingPayment && (
                  <span style={{
                    fontSize: 13, fontWeight: 600, color: '#EA580C',
                    background: '#FFF7ED', border: '1px solid #FED7AA',
                    borderRadius: 20, padding: '4px 14px', display: 'inline-block',
                  }}>⏳ Awaiting Payment</span>
                )}
              </div>

              {/* ── Table card (no_payment table orders) ── */}
              {tableReady && (
                <div style={{
                  border: '2px solid #FED7AA', borderRadius: 16, padding: '20px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  marginBottom: 16,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: '#737373' }}>TABLE</span>
                  <span style={{ fontWeight: 900, lineHeight: 1.15, color: '#171717', textAlign: 'center', fontSize: 56 }}>
                    {status.table_number}
                  </span>
                  <span style={{ fontSize: 12, color: '#525252', textAlign: 'center' }}>Your order will be brought to your table</span>
                </div>
              )}

              {/* ── Token / Counter card ── */}
              {(tokenReady || waitingPayment) && (
                <div style={{
                  border: `2px solid ${tokenReady ? '#FFE2BD' : '#FED7AA'}`,
                  borderRadius: 16, padding: '20px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  marginBottom: 16,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: '#737373' }}>
                    {tokenReady && meta ? meta.label : 'Counter Number'}
                  </span>
                  <span style={{
                    fontWeight: 900, lineHeight: 1.15, color: '#171717', textAlign: 'center',
                    fontSize: tokenReady && meta ? meta.fontSize : 56,
                  }}>
                    {tokenReady ? status.token_number : status.counter_number}
                  </span>
                  <span style={{ fontSize: 12, color: '#525252', textAlign: 'center' }}>
                    {tokenReady && meta ? meta.subtitle : `Go to counter ${status.counter_number} to pay`}
                  </span>
                </div>
              )}

              {/* Waiting for token after counter payment */}
              {waitingToken && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
                  padding: '14px 16px', background: '#F0FDF4', borderRadius: 12,
                }}>
                  <div style={{
                    width: 20, height: 20, flexShrink: 0,
                    border: '2.5px solid #BBF7D0', borderTopColor: '#16A34A',
                    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                  }} />
                  <p style={{ margin: 0, fontSize: 13, color: '#16A34A', fontWeight: 500 }}>
                    Payment confirmed — token will appear here shortly
                  </p>
                </div>
              )}

              {/* ── Order status card ── */}
              {statusInfo && (isOnline || tokenReady || tableReady) && (
                <div style={{
                  background: statusInfo.bg, border: `1px solid ${statusInfo.border}`,
                  borderRadius: 14, padding: '14px 18px', marginBottom: 16, textAlign: 'center',
                }}>
                  <p style={{
                    margin: '0 0 4px', fontSize: 14, fontWeight: 700,
                    color: statusInfo.color, textTransform: 'uppercase', letterSpacing: '0.5px',
                  }}>{statusInfo.label}</p>
                  <p style={{ margin: 0, fontSize: 13, color: '#52525C' }}>{statusInfo.desc}</p>
                </div>
              )}

              {/* ── Order items + total ── */}
              {items.length > 0 && (
                <div style={{
                  border: '1px solid #E4E4E7', borderRadius: 14,
                  overflow: 'hidden', marginBottom: 16,
                }}>
                  {/* Section header */}
                  <div style={{
                    padding: '12px 16px', borderBottom: '1px solid #E4E4E7',
                    background: '#F9F9F9',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#0A0A0A' }}>Order Summary</p>
                    <span style={{ fontSize: 12, color: '#71717A' }}>
                      {items.length} item{items.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Item rows */}
                  {items.map((item, idx) => (
                    <div key={idx} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                      padding: '11px 16px',
                      borderBottom: idx < items.length - 1 ? '1px solid #F4F4F5' : 'none',
                    }}>
                      <div style={{ flex: 1, marginRight: 12 }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#0A0A0A', lineHeight: 1.3 }}>
                          {item.name}{item.variantSize ? ` (${item.variantSize})` : ''}
                        </p>
                        <span style={{ fontSize: 12, color: '#71717A' }}>
                          ₹{item.price} × {item.qty}
                        </span>
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#0A0A0A', whiteSpace: 'nowrap' }}>
                        ₹{Math.round(item.price * item.qty * 100) / 100}
                      </span>
                    </div>
                  ))}

                  {/* Total row */}
                  <div style={{
                    padding: '12px 16px', borderTop: '1px solid #E4E4E7', background: '#F9F9F9',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#0A0A0A' }}>Total</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: '#0A0A0A' }}>₹{total}</span>
                  </div>
                </div>
              )}

              {/* ── Live polling indicator ── */}
              {stillActive && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
                  padding: '10px 14px', background: '#F4F4F5', borderRadius: 10,
                }}>
                  <div style={{
                    width: 16, height: 16, flexShrink: 0,
                    border: '2px solid #E4E4E7', borderTopColor: '#5137EF',
                    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                  }} />
                  <p style={{ margin: 0, fontSize: 12, color: '#71717A' }}>This page updates automatically</p>
                </div>
              )}

              <a href={`/shop/${slug}`} style={{
                display: 'inline-block', background: '#F4F4F5', color: '#0A0A0A',
                borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 500,
                textDecoration: 'none',
              }}>← Back to Menu</a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OrderStatusPage() {
  return (
    <Suspense>
      <OrderStatusContent />
    </Suspense>
  );
}
