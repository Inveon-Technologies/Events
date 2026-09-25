import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import {
  getCustomerSession,
  normalizeBookingReference,
  saveCustomerSession,
  validateBookingReference,
  validateEmailOrPhone,
} from '../lib/customerSession';

type Step = 'login' | 'otp';

interface FieldErrors {
  bookingReference?: string;
  contact?: string;
}

export function VerificationLookupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('login');
  const [bookingReference, setBookingReference] = useState('');
  const [contact, setContact] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [sentTo, setSentTo] = useState('');
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
    const next: FieldErrors = {};
    const refError = validateBookingReference(bookingReference);
    const contactError = validateEmailOrPhone(contact);
    if (refError) next.bookingReference = refError;
    if (contactError) next.contact = contactError;
    setFieldErrors(next);
    return !refError && !contactError;
  }

  async function requestCode(): Promise<boolean> {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const res = await fetch('/api/bookings/login/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingReference: normalizeBookingReference(bookingReference), contact: contact.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429 && typeof data.retryAfterSeconds === 'number') setResendIn(data.retryAfterSeconds);
        if (data.code === 'BOOKING_NOT_FOUND') setFieldErrors({ bookingReference: data.error });
        else if (data.code === 'CONTACT_MISMATCH') setFieldErrors({ contact: data.error });
        else setError(data.error || 'Something went wrong. Please try again.');
        return false;
      }
      setSentTo(data.sentTo || '');
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
    setNotice('');
    const code = otpDigits.join('');
    if (code.length !== 6) {
      setError('Enter all 6 digits of the code sent to your email.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/bookings/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingReference: normalizeBookingReference(bookingReference), code }),
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
            ? 'Enter your Booking ID and the email address or mobile number you booked with. We\'ll email you a one-time login code.'
            : `We sent a 6-digit code to ${sentTo || 'your booking email'}. It's valid for ${expiresInMinutes} minutes.`}
        </p>

        <div className="bg-white rounded-2xl shadow-card p-6">
          {step === 'login' ? (
            <form onSubmit={handleSendCode} noValidate className="space-y-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink-muted">Booking ID</span>
                <input
                  value={bookingReference}
                  onChange={(e) => {
                    setBookingReference(e.target.value.toUpperCase());
                    if (fieldErrors.bookingReference) setFieldErrors((f) => ({ ...f, bookingReference: undefined }));
                  }}
                  onBlur={() => bookingReference && setFieldErrors((f) => ({ ...f, bookingReference: validateBookingReference(bookingReference) || undefined }))}
                  placeholder="INV-BKG-2026-AB12CD"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={Boolean(fieldErrors.bookingReference)}
                  aria-describedby="booking-ref-error"
                  className={`border rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 ${
                    fieldErrors.bookingReference ? 'border-danger-500 focus:ring-danger-50' : 'border-slate-200 focus:ring-brand-100'
                  }`}
                />
                {fieldErrors.bookingReference && (
                  <span id="booking-ref-error" role="alert" className="text-xs text-danger-600">
                    {fieldErrors.bookingReference}
                  </span>
                )}
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink-muted">Email or mobile number</span>
                <input
                  value={contact}
                  onChange={(e) => {
                    setContact(e.target.value);
                    if (fieldErrors.contact) setFieldErrors((f) => ({ ...f, contact: undefined }));
                  }}
                  onBlur={() => contact && setFieldErrors((f) => ({ ...f, contact: validateEmailOrPhone(contact) || undefined }))}
                  placeholder="you@example.com or 98765 43210"
                  autoComplete="email"
                  aria-invalid={Boolean(fieldErrors.contact)}
                  aria-describedby="contact-error"
                  className={`border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${
                    fieldErrors.contact ? 'border-danger-500 focus:ring-danger-50' : 'border-slate-200 focus:ring-brand-100'
                  }`}
                />
                {fieldErrors.contact && (
                  <span id="contact-error" role="alert" className="text-xs text-danger-600">
                    {fieldErrors.contact}
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
                    onPaste={i === 0 ? handleOtpPaste : undefined}
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    maxLength={1}
                    className="w-11 h-14 sm:w-12 sm:h-16 text-center text-xl sm:text-2xl font-extrabold text-ink bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition-all"
                  />
                ))}
              </div>

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
                Didn't get it? Check your spam or promotions folder.{' '}
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
                ← Use a different Booking ID, email or mobile
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
