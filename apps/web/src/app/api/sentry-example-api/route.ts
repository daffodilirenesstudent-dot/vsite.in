import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// A test route that throws a server-side error — used to verify Sentry is capturing API route exceptions.
export function GET() {
  throw new Error('Sentry server-side error test — safe to ignore');
  return NextResponse.json({ ok: true });
}
