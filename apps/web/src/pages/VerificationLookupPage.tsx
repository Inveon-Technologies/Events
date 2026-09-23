import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';

type Step = 'login' | 'otp';

export function VerificationLookupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('login');
  const [bookingReference, setBookingReference] = useState('');
  const [email, setEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!bookingReference.trim() || !email.trim()) {
      setError('Enter both your Booking ID and registered email.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/bookings/login/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingReference: bookingReference.trim(), email: email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }
      // The server deliberately gives the identical response whether or
      // not this booking/email combination is real — this UI moves to
      // the OTP step regardless, exactly the way the real login flow is
      // supposed to work (an invalid combination just never actually
      // receives a code).
      setStep('otp');
      setTimeout(() => otpInputRefs.current[0]?.focus(), 50);
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleOtpDigitChange(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1);
    setOtpDigits((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      e.preventDefault();
      setOtpDigits(pasted.split(''));
      otpInputRefs.current[5]?.focus();
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const code = otpDigits.join('');
    if (code.length !== 6) {
      setError('Enter the 6-digit code sent to your email.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/bookings/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Invalid or expired code. Please try again.');
        setOtpDigits(['', '', '', '', '', '']);
        otpInputRefs.current[0]?.focus();
        return;
      }
      localStorage.setItem('inveon_customer_session', JSON.stringify({ token: data.token, email: email.trim() }));
      navigate('/bookings/my');
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div className="max-w-md mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-2xl font-bold text-ink mb-2 text-center">
          {step === 'login' ? 'Manage Your Booking' : 'Verify Your Identity'}
        </h1>
        <p className="text-sm text-ink-muted text-center mb-8">
          {step === 'login'
            ? "Enter your Booking ID and registered email. We'll send an instant passwordless code to access your tickets and bookings."
            : `We sent a 6-digit code to ${email}. Enter it below to continue.`}
        </p>

        <div className="bg-white rounded-2xl shadow-card p-6">
          {step === 'login' ? (
            <form onSubmit={handleSendCode} className="space-y-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink-muted">Booking ID</span>
                <input
                  value={bookingReference}
                  onChange={(e) => setBookingReference(e.target.value)}
                  placeholder="INV-BKG-2026-12345"
                  className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink-muted">Registered email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </label>

              {error && <p className="text-xs text-danger-600">{error}</p>}

              <Button type="submit" className="w-full" disabled={loading}>
                <Icon name="mail" className="text-[18px]" /> {loading ? 'Sending…' : 'Send Login Code'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-5">
              <div className="flex justify-center gap-2">
                {otpDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      otpInputRefs.current[i] = el;
                    }}
                    value={digit}
                    onChange={(e) => handleOtpDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    onPaste={i === 0 ? handleOtpPaste : undefined}
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    maxLength={1}
                    className="w-11 h-14 sm:w-12 sm:h-16 text-center text-xl sm:text-2xl font-extrabold text-ink bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition-all"
                  />
                ))}
              </div>

              {error && <p className="text-xs text-danger-600 text-center">{error}</p>}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Verifying…' : 'Verify & Continue'}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setStep('login');
                  setOtpDigits(['', '', '', '', '', '']);
                  setError('');
                }}
                className="w-full text-xs text-ink-muted hover:text-ink text-center"
              >
                ← Use a different Booking ID or email
              </button>
            </form>
          )}
        </div>

        <p className="text-xs text-ink-muted text-center mt-6">
          Can't find your Booking ID? Check the confirmation email from Inveon Events.
        </p>
      </div>
    </Layout>
  );
}
