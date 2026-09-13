import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { rajgadTrek, mockBooking, MockAttendee } from '../mockData/rajgadTrek';
import { formatINR } from '../lib/format';

function daysUntil(dateIso: string): number {
  const diffMs = new Date(dateIso).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function refundTierFor(days: number): { label: string; rate: number } {
  if (days > 7) return { label: 'Full 100% Refund', rate: 1 };
  if (days >= 3) return { label: '50% Refund', rate: 0.5 };
  return { label: 'No Refund', rate: 0 };
}

const TICKET_PRICE_BY_CATEGORY: Record<string, number> = Object.fromEntries(
  rajgadTrek.ticketCategories.map((t) => [t.name, t.price]),
);

export function ManageBookingPage() {
  const { bookingId } = useParams();
  const [attendees, setAttendees] = useState<MockAttendee[]>(mockBooking.attendees);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelledJustNow, setCancelledJustNow] = useState<string[]>([]);

  const days = daysUntil(rajgadTrek.date);
  const tier = refundTierFor(days);

  const refundAmount = useMemo(
    () =>
      selected.reduce((sum, ticketId) => {
        const a = attendees.find((x) => x.ticketId === ticketId);
        const price = a ? TICKET_PRICE_BY_CATEGORY[a.category] ?? 0 : 0;
        return sum + price * tier.rate;
      }, 0),
    [selected, attendees, tier.rate],
  );

  function toggleSelect(ticketId: string) {
    setSelected((s) => (s.includes(ticketId) ? s.filter((id) => id !== ticketId) : [...s, ticketId]));
  }

  function confirmCancellation() {
    setAttendees((prev) =>
      prev.map((a) => (selected.includes(a.ticketId) ? { ...a, status: 'cancelled' } : a)),
    );
    setCancelledJustNow(selected);
    setSelected([]);
    setConfirmOpen(false);
  }

  const activeAttendees = attendees.filter((a) => a.status === 'confirmed');

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <nav className="text-xs text-ink-muted mb-4 flex items-center gap-1">
          <span>Home</span>
          <Icon name="chevron_right" className="text-[14px]" />
          <span>Manage Booking</span>
          <Icon name="chevron_right" className="text-[14px]" />
          <span className="text-ink font-medium">{bookingId}</span>
        </nav>

        <h1 className="text-2xl font-bold text-ink mb-1">Manage Your Booking</h1>
        <p className="text-sm text-ink-muted mb-6">
          View your booking details, access digital passes, or manage eligible ticket cancellations.
        </p>

        {cancelledJustNow.length > 0 && (
          <div className="bg-success-50 text-success-600 rounded-xl p-4 mb-6 text-sm flex items-center gap-2">
            <Icon name="check_circle" filled className="text-[20px]" />
            {cancelledJustNow.length} ticket(s) cancelled. Refund of {formatINR(refundAmount)} will be
            processed to your original payment method within 5–7 business days.
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-ink">{rajgadTrek.name}</h2>
            <Badge tone={tier.rate === 1 ? 'success' : tier.rate === 0.5 ? 'warning' : 'danger'}>
              {tier.label} if cancelled today
            </Badge>
          </div>

          <h3 className="text-sm font-semibold text-ink mb-3">Your Tickets</h3>
          <ul className="space-y-2 mb-4">
            {attendees.map((a) => (
              <li
                key={a.ticketId}
                className={`flex items-center justify-between border rounded-xl p-3 ${
                  a.status === 'cancelled' ? 'border-slate-100 opacity-50' : 'border-slate-100'
                }`}
              >
                <label className="flex items-center gap-3 flex-1">
                  <input
                    type="checkbox"
                    disabled={a.status === 'cancelled'}
                    checked={selected.includes(a.ticketId)}
                    onChange={() => toggleSelect(a.ticketId)}
                    className="w-4 h-4 accent-brand-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-ink">{a.name}</span>
                    <span className="block text-xs text-ink-muted">
                      {a.category} · {a.ticketId}
                    </span>
                  </span>
                </label>
                <Badge tone={a.status === 'confirmed' ? 'success' : 'neutral'}>
                  {a.status === 'confirmed' ? 'Confirmed' : 'Cancelled'}
                </Badge>
              </li>
            ))}
          </ul>

          {selected.length > 0 && (
            <div className="bg-surface-sunken rounded-xl p-4 mb-4 flex items-center justify-between text-sm">
              <span className="text-ink-body">
                Refund for {selected.length} ticket(s) at {Math.round(tier.rate * 100)}%
              </span>
              <span className="font-bold text-ink">{formatINR(refundAmount)}</span>
            </div>
          )}

          <Button
            variant="danger"
            disabled={selected.length === 0}
            onClick={() => setConfirmOpen(true)}
          >
            Request Cancellation
          </Button>
        </div>

        <div className="bg-white rounded-2xl shadow-card p-5">
          <h3 className="text-sm font-semibold text-ink mb-3">Cancellation Policy &amp; Refund Rules</h3>
          <ul className="space-y-2 text-sm">
            {rajgadTrek.cancellationPolicy.map((p) => (
              <li key={p.window} className="flex justify-between">
                <span className="text-ink-body">{p.window}</span>
                <span className="font-semibold text-ink">{p.refund}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-muted mt-3">
            {activeAttendees.length} of {attendees.length} tickets still active on this booking.
          </p>
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-card max-w-sm w-full p-6">
            <h3 className="font-bold text-ink mb-2">Confirm Ticket Cancellation</h3>
            <p className="text-sm text-ink-muted mb-4">
              You're cancelling {selected.length} ticket(s) for a refund of{' '}
              <span className="font-semibold text-ink">{formatINR(refundAmount)}</span> ({Math.round(tier.rate * 100)}%
              per policy). This cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmOpen(false)}>
                Keep Tickets
              </Button>
              <Button variant="danger" className="flex-1" onClick={confirmCancellation}>
                Confirm Cancellation
              </Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
