import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import {
  getCustomerSession,
  normalizeLoginIdentifier,
  saveCustomerSession,
  validateLoginIdentifier,
} from '../lib/customerSession';

type Step = 'login' | 'otp';


export function VerificationLookupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('login');
  const [identifier, setIdentifier] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [sentToWhatsapp, setSentToWhatsapp] = useState('');
  const [expiresInMinutes, setExpiresInMinutes] = useState(10);
  const [resendIn, setResendIn] = useState(0);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Already logged in — straight to the bookings list.
  useEffect(() => {
    if (getCustomerSession()) navigate('/bookings/my', { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  function validate(): boolean {
    const message = validateLoginIdentifier(identifier);
    setFieldError(message);
    return !message;
  }

  async function requestCode(): Promise<boolean> {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const res = await fetch('/api/bookings/login/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: normalizeLoginIdentifier(identifier) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429 && typeof data.retryAfterSeconds === 'number') setResendIn(data.retryAfterSeconds);
        if (data.code === 'BOOKING_NOT_FOUND' || data.code === 'CONTACT_MISMATCH') setFieldError(data.error);
        else setError(data.error || 'Something went wrong. Please try again.');
        return false;
      }
      setSentTo(data.sentTo || '');
      setSentToWhatsapp(data.sentToWhatsapp || '');
      setExpiresInMinutes(data.expiresInMinutes || 10);
      setResendIn(data.resendAfterSeconds || 30);
      return true;
    } catch {
      setError('Could not reach the server. Please check your connection and try again.');
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    if (await requestCode()) {
      setStep('otp');
      setOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => otpInputRefs.current[0]?.focus(), 50);
    }
  }

  async function handleResend() {
    if (resendIn > 0 || loading) return;
    if (await requestCode()) {
      setOtpDigits(['', '', '', '', '', '']);
      setNotice('A new code is on its way. Codes sent earlier no longer work.');
      otpInputRefs.current[0]?.focus();
    }
  }

  function fillOtp(code: string): boolean {
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) return false;
    setOtpDigits(digits.split(''));
    otpInputRefs.current[5]?.focus();
    return true;
  }

  function handleOtpDigitChange(index: number, value: string) {
    // Keyboard / SMS autofill can drop the whole code into one box.
    if (fillOtp(value)) return;
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

  // The code copied from the email or WhatsApp, pasted into any box.
  function handleOtpPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      e.preventDefault();
      fillOtp(pasted);
    }
  }

  async function handlePasteButton() {
    setError('');
    try {
      const text = await navigator.clipboard.readText();
      if (!fillOtp(text.replace(/\D/g, '').slice(0, 6))) {
        setError('No 6-digit code found on your clipboard. Copy the code from the email or WhatsApp first.');
      }
    } catch {
      setError('Your browser blocked pasting. Tap a box and paste the code instead.');
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    const code = otpDigits.join('');
    if (code.length !== 6) {
      setError('Enter all 6 digits of the code we sent you.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/bookings/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: normalizeLoginIdentifier(identifier), code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Invalid or expired code. Please try again.');
        setOtpDigits(['', '', '', '', '', '']);
        otpInputRefs.current[0]?.focus();
        return;
      }
      saveCustomerSession({ token: data.token, email: data.email });
      navigate('/bookings/my', { replace: true });
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
            ? 'Enter your mobile number, email or Booking ID. We\'ll send a one-time login code to your email and WhatsApp.'
            : `We sent a 6-digit code to ${sentDestination(sentTo, sentToWhatsapp)}. It's valid for ${expiresInMinutes} minutes.`}
        </p>

        <div className="bg-white rounded-2xl shadow-card p-6">
          {step === 'login' ? (
            <form onSubmit={handleSendCode} noValidate className="space-y-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink-muted">Mobile number, email or Booking ID</span>
                <input
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    if (fieldError) setFieldError('');
                  }}
                  onBlur={() => identifier && setFieldError(validateLoginIdentifier(identifier))}
                  placeholder="98765 43210, you@example.com or INV-BKG-…"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-invalid={Boolean(fieldError)}
                  aria-describedby="identifier-error"
                  className={`border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${
                    fieldError ? 'border-danger-500 focus:ring-danger-50' : 'border-slate-200 focus:ring-brand-100'
                  }`}
                />
                {fieldError && (
                  <span id="identifier-error" role="alert" className="text-xs text-danger-600">
                    {fieldError}
                  </span>
                )}
              </label>

              {error && (
                <p role="alert" className="text-xs text-danger-600">
                  {error}
                  {resendIn > 0 && ` (${resendIn}s)`}
                </p>
              )}

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
                    onPaste={handleOtpPaste}
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    maxLength={i === 0 ? 6 : 1}
                    aria-label={`Digit ${i + 1}`}
                    className="w-11 h-14 sm:w-12 sm:h-16 text-center text-xl sm:text-2xl font-extrabold text-ink bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition-all"
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={handlePasteButton}
                className="mx-auto flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700"
              >
                <Icon name="content_paste" className="text-[16px]" /> Paste code
              </button>

              {error && (
                <p role="alert" className="text-xs text-danger-600 text-center">
                  {error}
                </p>
              )}
              {notice && <p className="text-xs text-emerald-700 text-center">{notice}</p>}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Verifying…' : 'Verify & Continue'}
              </Button>

              <p className="text-xs text-ink-muted text-center">
                Didn't get it? Check WhatsApp and your spam or promotions folder.{' '}
                {resendIn > 0 ? (
                  <span>Resend in {resendIn}s</span>
                ) : (
                  <button type="button" onClick={handleResend} disabled={loading} className="font-semibold text-brand-600 hover:text-brand-700">
                    Resend code
                  </button>
                )}
              </p>

              <button
                type="button"
                onClick={() => {
                  setStep('login');
                  setOtpDigits(['', '', '', '', '', '']);
                  setError('');
                  setNotice('');
                }}
                className="w-full text-xs text-ink-muted hover:text-ink text-center"
              >
                ← Use a different mobile number, email or Booking ID
              </button>
            </form>
          )}
        </div>

        <p className="text-xs text-ink-muted text-center mt-6">
          Can't find your Booking ID? It's in the confirmation email and WhatsApp message from Inveon Events — the Ticket ID on your ticket works too.
        </p>
      </div>
    </Layout>
  );
}

// "r***l@example.com and WhatsApp ••••3210"
function sentDestination(email: string, whatsapp: string): string {
  const whatsappPart = whatsapp ? `WhatsApp ${whatsapp}` : '';
  if (email && whatsappPart) return `${email} and ${whatsappPart}`;
  return email || whatsappPart || 'your booking email';
}
