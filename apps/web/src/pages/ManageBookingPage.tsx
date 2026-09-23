import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import { formatINR } from '../lib/format';

interface BookingDetail {
  bookingReference: string;
  bookingStatus: 'pending' | 'confirmed' | 'cancelled';
  eventName: string;
  eventDate: string;
  totalAmountPaise: number;
  refundAmountPaise: number | null;
  refundStatus: string | null;
  allowSelfServiceCancellation: boolean;
  refundCutoffPassed: boolean;
  tickets: { id: string; attendeeName: string; tierName: string; status: 'valid' | 'checked_in' | 'cancelled' }[];
}

export function ManageBookingPage() {
  const location = useLocation();
  const [bookingReference, setBookingReference] = useState((location.state as { bookingReference?: string } | null)?.bookingReference ?? '');
  const [email, setEmail] = useState('');
  const [verified, setVerified] = useState(false);
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  async function loadBooking(e?: React.FormEvent) {
    e?.preventDefault();
    if (!bookingReference.trim() || !email.trim()) {
      setError('Enter your Booking ID and the email used to book.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(bookingReference.trim())}/tickets?email=${encodeURIComponent(email.trim())}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not find that booking.');
        return;
      }
      setDetail(data);
      setVerified(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!cancelReason.trim()) {
      setError('Please tell us why you\u2019re cancelling.');
      return;
    }
    setCancelling(true);
    setError('');
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(bookingReference.trim())}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), reason: cancelReason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not cancel this booking.');
        return;
      }
      await loadBooking();
      setShowCancelForm(false);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setCancelling(false);
    }
  }

  if (!verified) {
    return (
      <Layout>
        <div className="max-w-md mx-auto px-4 sm:px-6 py-16">
          <h1 className="text-xl font-bold text-ink mb-2 text-center">Manage Your Booking</h1>
          <p className="text-sm text-ink-muted text-center mb-8">
            Enter your Booking ID and the email used to book to view your tickets.
          </p>
          <form onSubmit={loadBooking} className="bg-white rounded-2xl shadow-card p-6 space-y-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-muted">Booking ID</span>
              <input
                value={bookingReference}
                onChange={(e) => setBookingReference(e.target.value)}
                placeholder="INV-BKG-2026-12345"
                className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-muted">Email used to book</span>
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
              {loading ? 'Looking up…' : 'View My Booking'}
            </Button>
          </form>
        </div>
      </Layout>
    );
  }

  if (!detail) return null;

  const canCancel = detail.bookingStatus === 'confirmed' && detail.allowSelfServiceCancellation && !detail.refundCutoffPassed;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-xl font-bold text-ink mb-1">{detail.eventName}</h1>
        <p className="text-sm text-ink-muted mb-6">
          Booking {detail.bookingReference} — <span className="capitalize font-medium">{detail.bookingStatus}</span>
        </p>

        {detail.bookingStatus === 'cancelled' && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 text-sm">
            <p className="font-semibold text-ink mb-1">This booking has been cancelled.</p>
            {detail.refundAmountPaise !== null && detail.refundAmountPaise > 0 && (
              <p className="text-ink-muted">
                Refund: {formatINR(detail.refundAmountPaise)} — status: {detail.refundStatus ?? 'pending'}
              </p>
            )}
          </div>
        )}

        <div className="space-y-4 mb-8">
          {detail.tickets.map((ticket) => (
            <div key={ticket.id} className="bg-white rounded-2xl shadow-card p-5 flex items-center gap-4">
              <img
                src={`/api/bookings/${encodeURIComponent(bookingReference)}/tickets/${ticket.id}/qr?email=${encodeURIComponent(email)}`}
                alt={`QR code for ${ticket.attendeeName}`}
                className="w-24 h-24 rounded-lg border border-slate-100 shrink-0"
              />
              <div>
                <p className="font-semibold text-ink">{ticket.attendeeName}</p>
                <p className="text-xs text-ink-muted">{ticket.tierName}</p>
                <p className="text-xs mt-1 capitalize font-medium text-ink-muted">{ticket.status.replace('_', ' ')}</p>
              </div>
            </div>
          ))}
        </div>

        {detail.bookingStatus === 'confirmed' && !detail.allowSelfServiceCancellation && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-700">
            <Icon name="block" className="text-[18px] shrink-0" />
            <p className="text-sm font-semibold">No Refund Policy — this event does not offer cancellations or refunds.</p>
          </div>
        )}

        {detail.bookingStatus === 'confirmed' && detail.allowSelfServiceCancellation && detail.refundCutoffPassed && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-amber-800">
            <Icon name="schedule" className="text-[18px] shrink-0" />
            <p className="text-sm font-semibold">The cancellation window for this event has closed.</p>
          </div>
        )}

        {canCancel && (
          <div className="bg-white rounded-2xl shadow-card p-5">
            {!showCancelForm ? (
              <Button variant="outline" onClick={() => setShowCancelForm(true)}>
                <Icon name="cancel" className="text-[16px]" /> Cancel This Booking
              </Button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-ink">Why are you cancelling?</p>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
                {error && <p className="text-xs text-danger-600">{error}</p>}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowCancelForm(false)}>Back</Button>
                  <Button onClick={handleCancel} disabled={cancelling}>
                    {cancelling ? 'Cancelling…' : 'Confirm Cancellation'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
