'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/components/AuthContext';

export default function SignupPage() {
  const { sendOTP, verifyOTP, resetOTP } = useAuth();

  const [step, setStep] = useState<'details' | 'otp'>('details');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Middleware already bounces logged-in users away from /signup, so no
  // client-side auth-state listener is needed here.

  const startCountdown = () => {
    setCountdown(60);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(countdownRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, []);

  const handleSendOTP = async () => {
    setError('');
    if (!name.trim()) { setError('Please enter your name.'); return; }
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) { setError('Enter a valid 10-digit mobile number.'); return; }
    setLoading(true);
    const { error: err } = await sendOTP(`+91${digits.slice(-10)}`);
    setLoading(false);
    if (err) { setError(err); return; }
    setStep('otp');
    startCountdown();
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) { setOtp(pasted.split('')); otpRefs.current[5]?.focus(); }
  };

  const handleVerify = async () => {
    setError('');
    const code = otp.join('');
    if (code.length < 6) { setError('Enter the complete 6-digit code.'); return; }
    setLoading(true);
    const { error: err, isNewUser } = await verifyOTP(code, name.trim());
    setLoading(false);
    if (err) { setError(err); return; }
    // ?new=true hides the "← Dashboard" back button on /onboarding so fresh
    // users don't bounce back to an empty dashboard during their first flow.
    window.location.replace(isNewUser ? '/onboarding?new=true' : '/manage/dashboard');
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setError('');
    setOtp(['', '', '', '', '', '']);
    resetOTP(); // destroy previous verifier so a fresh one is created
    setLoading(true);
    const digits = phone.replace(/\D/g, '');
    const { error: err } = await sendOTP(`+91${digits.slice(-10)}`);
    setLoading(false);
    if (err) { setError(err); return; }
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
          <a href="#" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>headset_mic</span>
            Support
          </a>
          <a href="#" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>help_outline</span>
            Help Center
          </a>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="mb-8 flex flex-col items-center gap-2">
            <Image src="/android-chrome-192x192.png" alt="Vsite" width={56} height={56} className="h-14 w-14 rounded-2xl shadow-md shadow-primary/30" />
            <span className="text-2xl font-bold tracking-tight text-slate-800">vsite</span>
          </div>

          {step === 'details' ? (
            <DetailsStep
              name={name}
              setName={setName}
              phone={phone}
              setPhone={setPhone}
              onSubmit={handleSendOTP}
              loading={loading}
              error={error}
            />
          ) : (
            <OtpStep
              phone={phone}
              otp={otp}
              otpRefs={otpRefs}
              onChange={handleOtpChange}
              onKeyDown={handleOtpKeyDown}
              onPaste={handleOtpPaste}
              onVerify={handleVerify}
              onEdit={() => { resetOTP(); setStep('details'); setOtp(['', '', '', '', '', '']); setError(''); }}
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

/* ─── Details Step ───────────────────────────────────────── */
function DetailsStep({
  name, setName, phone, setPhone, onSubmit, loading, error,
}: {
  name: string; setName: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  onSubmit: () => void; loading: boolean; error: string;
}) {
  return (
    <div>
      <h1 className="mb-1 text-center text-2xl font-bold text-slate-800">Create Account</h1>
      <p className="mb-6 text-center text-sm text-slate-400">Convert crowds into orders. No hassle needed.</p>

      {/* Returning user hint */}
      <div className="mb-6 flex items-center gap-2 rounded-[10px] border border-primary/20 bg-primary-light px-4 py-3 text-sm text-primary">
        <span className="material-symbols-outlined shrink-0" style={{ fontSize: 18 }}>info</span>
        Already have an account?{' '}
        <Link href="/login" className="font-semibold underline underline-offset-2 hover:opacity-80">
          Sign in here
        </Link>
      </div>

      {/* Name */}
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        Your name <span className="text-red-500">*</span>
      </label>
      <input
        type="text"
        placeholder="Eg. John Smith"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        className="mb-4 w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-300 shadow-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
        autoFocus
      />

      {/* Phone */}
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
        />
      </div>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      <button
        onClick={onSubmit}
        disabled={loading}
        className="mt-5 w-full rounded-[10px] bg-primary py-3 text-sm font-semibold text-white shadow-md shadow-primary/25 transition-all hover:bg-primary-dark active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Sending…
          </span>
        ) : 'Create Account'}
      </button>


    </div>
  );
}

/* ─── OTP Step ───────────────────────────────────────────── */
function OtpStep({
  phone, otp, otpRefs, onChange, onKeyDown, onPaste,
  onVerify, onEdit, onResend, countdown, formatCountdown, loading, error,
}: {
  phone: string;
  otp: string[];
  otpRefs: React.MutableRefObject<(HTMLInputElement | null)[]>;
  onChange: (i: number, v: string) => void;
  onKeyDown: (i: number, e: React.KeyboardEvent<HTMLInputElement>) => void;
  onPaste: (e: React.ClipboardEvent) => void;
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
        Enter the 6-digit code sent to your mobile number to continue your order.
      </p>

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

      <label className="mb-3 block text-sm font-medium text-slate-700">Enter OTP</label>
      <div className="flex justify-between gap-2" onPaste={onPaste}>
        {otp.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { otpRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => onChange(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            autoFocus={i === 0}
            className={`w-full max-w-[52px] rounded-[10px] border text-center text-lg font-bold text-slate-800 outline-none transition-all
              ${digit
                ? 'border-primary bg-primary/5 shadow-sm shadow-primary/20 ring-1 ring-primary/30'
                : 'border-slate-200 bg-white shadow-sm'
              }
              focus:border-primary focus:ring-2 focus:ring-primary/25`}
            style={{ aspectRatio: '1/1' }}
          />
        ))}
      </div>

      {error && <p className="mt-3 text-center text-xs text-red-500">{error}</p>}

      <button
        onClick={onVerify}
        disabled={loading || otp.join('').length < 6}
        className="mt-5 w-full rounded-[10px] bg-primary py-3 text-sm font-semibold text-white shadow-md shadow-primary/25 transition-all hover:bg-primary-dark active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Verifying…
          </span>
        ) : 'Verify'}
      </button>

      <p className="mt-5 text-center text-xs text-slate-400">
        Didn&apos;t receive the code?{' '}
        {countdown > 0 ? (
          <span className="font-medium text-slate-500">{formatCountdown(countdown)}</span>
        ) : (
          <button onClick={onResend} className="font-medium text-primary hover:underline">
            Resend OTP
          </button>
        )}
      </p>
    </div>
  );
}
