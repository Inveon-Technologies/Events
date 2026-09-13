import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import { mockBooking } from '../mockData/rajgadTrek';

type ContactMethod = 'email' | 'mobile';

export function VerificationLookupPage() {
  const navigate = useNavigate();
  const [bookingIdInput, setBookingIdInput] = useState('');
  const [contact, setContact] = useState('');
  const [method, setMethod] = useState<ContactMethod>('email');
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!bookingIdInput.trim() || !contact.trim()) {
      setError('Enter both your Booking ID and registered contact.');
      return;
    }
    if (bookingIdInput.trim().toUpperCase() !== mockBooking.id) {
      navigate('/bookings/not-found');
      return;
    }
    // Wire to POST /bookings/:id/send-code once OTP delivery exists.
    setCodeSent(true);
  }

  function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim().length < 4) {
      setError('Enter the 4+ digit code sent to you.');
      return;
    }
    navigate(`/bookings/${mockBooking.id}`);
  }

  return (
    <Layout>
      <div className="max-w-md mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-2xl font-bold text-ink mb-2 text-center">Verify your booking</h1>
        <p className="text-sm text-ink-muted text-center mb-8">
          Look up your booking to view tickets or manage cancellations.
        </p>

        <div className="bg-white rounded-2xl shadow-card p-6">
          {!codeSent ? (
            <form onSubmit={handleSendCode} className="space-y-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink-muted">Booking ID</span>
                <input
                  value={bookingIdInput}
                  onChange={(e) => setBookingIdInput(e.target.value)}
                  placeholder="INV-BKG-1001"
                  className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMethod('email')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                    method === 'email' ? 'border-brand-500 bg-brand-50 text-brand-600' : 'border-slate-200 text-ink-muted'
                  }`}
                >
                  Email
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('mobile')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                    method === 'mobile' ? 'border-brand-500 bg-brand-50 text-brand-600' : 'border-slate-200 text-ink-muted'
                  }`}
                >
                  Mobile
                </button>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink-muted">Registered contact</span>
                <input
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder={method === 'email' ? 'you@example.com' : '+91 98765 43210'}
                  className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </label>

              {error && <p className="text-xs text-danger-600">{error}</p>}

              <Button type="submit" className="w-full">
                <Icon name="sms" className="text-[18px]" /> Send Verification Code
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              <p className="text-sm text-ink-body">
                We sent a code to your registered {method}. Enter it below to continue.
              </p>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink-muted">Verification code</span>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="1234"
                  className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </label>
              {error && <p className="text-xs text-danger-600">{error}</p>}
              <Button type="submit" className="w-full">
                Verify &amp; Continue
              </Button>
            </form>
          )}
        </div>

        <p className="text-xs text-ink-muted text-center mt-6">
          Can't find your Booking ID? Check the confirmation email or WhatsApp message from Inveon
          Events.
        </p>
      </div>
    </Layout>
  );
}
