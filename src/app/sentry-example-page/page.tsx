'use client';

import * as Sentry from '@sentry/nextjs';
import { useState } from 'react';

export default function SentryExamplePage() {
  const [serverResult, setServerResult] = useState<string | null>(null);

  function triggerClientError() {
    throw new Error('Sentry client-side error test — safe to ignore');
  }

  async function triggerServerError() {
    setServerResult('sending…');
    const res = await fetch('/api/sentry-example-api');
    setServerResult(res.ok ? 'no error returned' : `server threw — check Sentry (status ${res.status})`);
  }

  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: 480, margin: '80px auto', padding: '0 24px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Sentry Verification</h1>
      <p style={{ color: '#555', marginBottom: 32 }}>
        Click either button to send a test error to Sentry. Check your{' '}
        <a href="https://vsite.sentry.io/issues/" target="_blank" rel="noreferrer" style={{ color: '#6366f1' }}>
          Sentry Issues
        </a>{' '}
        dashboard to confirm it arrived.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button
          onClick={triggerClientError}
          style={btnStyle('#ef4444')}
        >
          Throw Client-Side Error
        </button>

        <button
          onClick={triggerServerError}
          style={btnStyle('#f97316')}
        >
          Throw Server-Side Error (API Route)
        </button>

        <button
          onClick={() => Sentry.captureMessage('Manual test message from sentry-example-page')}
          style={btnStyle('#6366f1')}
        >
          Send Test Message (no exception)
        </button>
      </div>

      {serverResult && (
        <p style={{ marginTop: 24, padding: '12px 16px', background: '#f3f4f6', borderRadius: 8, fontSize: 14 }}>
          {serverResult}
        </p>
      )}

      <p style={{ marginTop: 48, fontSize: 12, color: '#aaa' }}>
        This page is for verification only — safe to delete after confirming Sentry works.
      </p>
    </main>
  );
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '12px 20px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
  };
}
