'use client';
import { Spinner, PageLoader } from '@/components/loading';
import { LogoMark } from '@/components/Logo';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthContext';
import { useOtpInput } from '@/hooks/useOtpInput';
import { OTP_LENGTH } from '@/lib/auth/otpInput';

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="bg-white">
        <PageLoader />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get('expired') === 'true';
  // Only honour internal paths — prevents open-redirect attacks via crafted URLs
  const rawRedirect = searchParams.get('redirectTo') ?? '';
  const redirectTo = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')
    ? rawRedirect
    : '/manage/dashboard';
  const { sendOTP, verifyOTP, resetOTP, user, loading: authLoading } = useAuth();

  // Step: 'phone' | 'otp'
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Assigned during render, not in an effect: the hook's auto-submit effect is
  // registered before this component's effects, so on the commit that lands the
  // sixth digit an effect-based assignment would still hold the PREVIOUS
  // render's closure.
  const verifyRef = useRef<(code: string) => void>(() => {});
  const {
    otp, inputRefs: otpRefs, handleChange: handleOtpChange,
    handleKeyDown: handleOtpKeyDown, handlePaste: handleOtpPaste, resetOtp,
  } = useOtpInput({ onComplete: (code) => verifyRef.current(code) });

  // If the user already has a valid Firebase session (restored from IndexedDB),
  // redirect immediately. This handles the case where the cookie expired (browser
  // deleted it) but the Firebase session is still valid — syncCookie in AuthProvider
  // will have already re-set the cookie by the time this runs.
  useEffect(() => {
    if (!authLoading && user) {
      window.location.replace(redirectTo);
    }
  }, [authLoading, user, redirectTo]);

  // Countdown timer for resend
  const startCountdown = () => {
    setCountdown(60);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // --- Phone step ---
  const handleSendOTP = async () => {
    setError('');
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    setLoading(true);
    const fullPhone = `+91${digits.slice(-10)}`;
    const { error: err } = await sendOTP(fullPhone);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    setStep('otp');
    startCountdown();
  };

  // --- OTP step ---
  // Entry, focus and auto-submit all live in useOtpInput so /login and /signup
  // cannot drift apart again.

  const handleVerify = async (submitted?: string) => {
    setError('');
    const code = submitted ?? otp.join('');
    if (code.length < OTP_LENGTH) {
      setError('Enter the complete 6-digit code.');
      return;
    }
    setLoading(true);
    const { error: err } = await verifyOTP(code);
    if (err) {
      setLoading(false);
      setError(err);
      // Hand the form back empty. The auto-submit guard is keyed on the code,
      // so leaving the rejected digits in place would swallow the retry.
      resetOtp();
      return;
    }
    // Stay in the loading state through the handoff — see the note in
    // /signup's handleVerify. The navigation below paints nothing until
    // /auth/continue answers, so the spinner is the only honest thing on
    // screen, and the disabled button is what stops a second press.
    // One server-side decision for both OTP pages. Firebase's isNewUser is
    // deliberately ignored here: it reports whether the Firebase account was
    // created just now, not whether this person owns any stores, and trusting
    // it sent existing owners into onboarding as new users.
    window.location.replace(
      redirectTo && redirectTo !== '/manage/dashboard'
        ? `/auth/continue?next=${encodeURIComponent(redirectTo)}`
        : '/auth/continue',
    );
  };

  verifyRef.current = (code: string) => { void handleVerify(code); };

  const handleResend = async () => {
    if (countdown > 0) return;
    setError('');
    resetOtp();
    resetOTP(); // destroy previous verifier so a fresh one is created
    const digits = phone.replace(/\D/g, '');
    const fullPhone = `+91${digits.slice(-10)}`;
    setLoading(true);
    const { error: err } = await sendOTP(fullPhone);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    startCountdown();
  };

  const formatCountdown = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-br from-violet-50 via-purple-50 to-slate-50 flex flex-col">
      <div id="recaptcha-container" />
      {/* Top bar */}
      <header className="flex items-center justify-between px-8 py-4">
        <Link href="/" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_back</span>
          Home
        </Link>
        <div className="flex items-center gap-6">
          {/* One link, one destination. These were two separate items both
              pointing at "#" — dead at exactly the moment an owner who cannot
              receive an OTP needs help. There is no help-centre route, so
              advertising one would just be a second dead end. */}
          <a href="/support" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            <span className="material-symbols-outlined text-base" style={{ fontSize: 18 }}>headset_mic</span>
            Support
          </a>
        </div>
      </header>

      {/* Centered card */}
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="mb-8 flex flex-col items-center gap-2">
            <LogoMark size={48} tone="brand" />
            <span className="text-2xl font-bold tracking-tight text-slate-800">vsite</span>
          </div>

          {step === 'phone' ? (
            <PhoneStep
              phone={phone}
              setPhone={setPhone}
              onSubmit={handleSendOTP}
              loading={loading}
              error={error}
              sessionExpired={sessionExpired}
            />
          ) : (
            <OtpStep
              phone={phone}
              otp={otp}
              otpRefs={otpRefs}
              onChange={handleOtpChange}
              onKeyDown={handleOtpKeyDown}
              onPaste={handleOtpPaste}
              onVerify={() => { void handleVerify(); }}
              onEdit={() => { resetOTP(); setStep('phone'); resetOtp(); setError(''); }}
              onResend={handleResend}
              countdown={countdown}
              formatCountdown={formatCountdown}
              loading={loading}
              error={error}
            />
          )}
        </div>
      </main>
    </div>
  );
}

/* ─── Phone Step ─────────────────────────────────────────── */
function PhoneStep({
  phone,
  setPhone,
  onSubmit,
  loading,
  error,
  sessionExpired,
}: {
  phone: string;
  setPhone: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  error: string;
  sessionExpired?: boolean;
}) {
  return (
    <div>
      {sessionExpired && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>schedule</span>
          Your session expired. Please sign in again.
        </div>
      )}
      <h1 className="mb-1 text-center text-2xl font-bold text-slate-800">Welcome Back</h1>
      <p className="mb-8 text-center text-sm text-slate-400">Your menu, one scan away. No app to install.</p>

      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        Mobile number <span className="text-red-500">*</span>
      </label>
      <div className="flex overflow-hidden rounded-[10px] border border-slate-200 bg-white shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
        <div className="flex items-center gap-1.5 border-r border-slate-200 bg-slate-50 px-3 py-3">
          <span className="text-base">🇮🇳</span>
          <span className="text-sm font-medium text-slate-600">+91</span>
        </div>
        <input
          type="tel"
          inputMode="numeric"
          placeholder="Eg. 9876543210"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
          className="flex-1 bg-transparent px-3 py-3 text-sm text-slate-800 placeholder-slate-300 outline-none"
          autoFocus
        />
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-500">{error}</p>
      )}

      <button
        onClick={onSubmit}
        disabled={loading}
        className="mt-5 w-full rounded-[10px] bg-primary py-3 text-sm font-semibold text-white shadow-md shadow-primary/25 transition-all hover:bg-primary-dark active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Spinner size="sm" tone="onBrand" />
            Sending…
          </span>
        ) : 'Login'}
      </button>

      <p className="mt-5 text-center text-xs text-slate-400">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="font-medium text-primary hover:underline">Sign Up</Link>
      </p>
    </div>
  );
}

/* ─── OTP Step ───────────────────────────────────────────── */
function OtpStep({
  phone,
  otp,
  otpRefs,
  onChange,
  onKeyDown,
  onPaste,
  onVerify,
  onEdit,
  onResend,
  countdown,
  formatCountdown,
  loading,
  error,
}: {
  phone: string;
  otp: string[];
  otpRefs: React.MutableRefObject<(HTMLInputElement | null)[]>;
  onChange: (i: number, v: string) => void;
  onKeyDown: (i: number, e: React.KeyboardEvent<HTMLInputElement>) => void;
  onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  onVerify: () => void;
  onEdit: () => void;
  onResend: () => void;
  countdown: number;
  formatCountdown: (s: number) => string;
  loading: boolean;
  error: string;
}) {
  const displayPhone = `+91 ${phone.replace(/\D/g, '').slice(-10)}`;

  return (
    <div>
      <h1 className="mb-1 text-center text-2xl font-bold text-slate-800">Verify your number</h1>
      <p className="mb-4 text-center text-sm text-slate-400">
        Enter the 6-digit code sent to your mobile number to continue.
      </p>

      {/* Phone display */}
      <div className="mb-6 flex items-center justify-center gap-2">
        <span className="text-sm font-semibold text-slate-700">{displayPhone}</span>
        <button
          onClick={onEdit}
          className="rounded-full p-1 text-primary hover:bg-primary/10 transition-colors"
          title="Edit number"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
        </button>
      </div>

      {/* OTP boxes */}
      <label className="mb-3 block text-sm font-medium text-slate-700">Enter OTP</label>
      <div className="flex justify-between gap-2">
        {otp.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { otpRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            // Lets Android/iOS offer the code straight from the SMS instead of
            // making the owner memorise six digits and switch apps. It sits on
            // EVERY box, not just the first: the OS fills whichever box has
            // focus, and an owner who taps box 3 first is otherwise offered
            // nothing.
            autoComplete="one-time-code"
            id={`otp-${i + 1}`}
            name={`otp-${i + 1}`}
            aria-label={`Digit ${i + 1} of 6`}
            // No maxLength: autofill and paste both deliver all six digits to
            // a single box, and the browser would truncate them before React
            // ever saw the value. The handler distributes them instead.
            value={digit}
            onChange={(e) => onChange(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={onPaste}
            // With maxLength gone, typing into a filled box would otherwise
            // append. Selecting on focus makes a keystroke replace, which is
            // what the owner expects from a single-character box.
            onFocus={(e) => e.currentTarget.select()}
            autoFocus={i === 0}
            className={`h-13 w-full max-w-[52px] rounded-[10px] border text-center text-lg font-bold text-slate-800 outline-none transition-all
              ${digit
                ? 'border-primary bg-primary/5 shadow-sm shadow-primary/20 ring-1 ring-primary/30'
                : 'border-slate-200 bg-white shadow-sm'
              }
              focus:border-primary focus:ring-2 focus:ring-primary/25`}
            style={{ aspectRatio: '1/1' }}
          />
        ))}
      </div>

      {error && (
        <p className="mt-3 text-center text-xs text-red-500">{error}</p>
      )}

      <button
        onClick={onVerify}
        disabled={loading || otp.join('').length < 6}
        className="mt-5 w-full rounded-[10px] bg-primary py-3 text-sm font-semibold text-white shadow-md shadow-primary/25 transition-all hover:bg-primary-dark active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Spinner size="sm" tone="onBrand" />
            Verifying…
          </span>
        ) : 'Verify'}
      </button>

      <p className="mt-5 text-center text-xs text-slate-400">
        Didn&apos;t receive the code?{' '}
        {countdown > 0 ? (
          <span className="font-medium text-slate-500">{formatCountdown(countdown)}</span>
        ) : (
          <button
            onClick={onResend}
            className="font-medium text-primary hover:underline"
          >
            Resend OTP
          </button>
        )}
      </p>
    </div>
  );
}
