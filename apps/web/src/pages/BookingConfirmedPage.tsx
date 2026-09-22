import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams, Link, Navigate } from 'react-router-dom';import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { formatINR } from '../lib/format';

interface ConfirmedState {
  totalAmount?: number;
  participants?: { name: string }[];
  eventName?: string;
}

type BookingStatus = 'loading' | 'confirmed' | 'pending' | 'cancelled' | 'not_found';

export function BookingConfirmedPage() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as ConfirmedState | null) ?? {};
  const participants = state.participants?.length ? state.participants : undefined;

  const [status, setStatus] = useState<BookingStatus>('loading');
  const [eventName, setEventName] = useState<string | null>(state.eventName ?? null);
  const [bookingReference, setBookingReference] = useState<string | null>(null);

  // Cashfree redirects the browser back here right after checkout — a
  // fresh page load with no router state, since it's a real external
  // navigation, not an in-app one. So the actual confirmation status
  // always comes from the server, never assumed from having reached
  // this URL at all: a customer whose payment failed lands here too,
  // and must see that, not a false "Confirmed!".
  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;

    async function pollStatus(attemptsLeft: number) {
      try {
        const res = await fetch(`/api/bookings/${bookingId}/status`);
        if (res.status === 404) {
          if (!cancelled) setStatus('not_found');
          return;
        }
        const data = await res.json();
        if (cancelled) return;

        setEventName(data.eventName);
        setBookingReference(data.bookingReference);

        if (data.status === 'confirmed') {
          setStatus('confirmed');
        } else if (data.status === 'cancelled') {
          setStatus('cancelled');
        } else if (attemptsLeft > 0) {
          // Still pending — Cashfree's webhook can land a moment after
          // (or before) this redirect. A few short retries covers the
          // ordinary case without leaving the customer stuck on a
          // "processing" screen for long.
          setStatus('pending');
          setTimeout(() => pollStatus(attemptsLeft - 1), 2000);
        } else {
          setStatus('pending');
        }
      } catch {
        if (!cancelled) setStatus('pending');
      }
    }

    void pollStatus(5);
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  function copyBookingId() {
    if (bookingId) navigator.clipboard?.writeText(bookingReference ?? bookingId);
  }

  if (status === 'loading') {
    return (
      <Layout>
        <div className="min-h-[50vh] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (status === 'not_found') {
    return (
      <Layout>
        <div className="max-w-md mx-auto px-4 sm:px-6 py-16 text-center">
          <h1 className="text-xl font-bold text-ink mb-2">Booking not found</h1>
          <p className="text-sm text-ink-muted mb-6">We couldn't find a booking with that reference.</p>
          <Link to="/">
            <Button variant="outline">Back to Home</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  if (status === 'pending') {
    return (
      <Layout>
        <div className="max-w-md mx-auto px-4 sm:px-6 py-16 text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-amber-50 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <h1 className="text-xl font-bold text-ink mb-2">Confirming your payment…</h1>
          <p className="text-sm text-ink-muted mb-6">
            This usually takes just a few seconds. Your booking ID is <span className="font-mono font-semibold text-ink">{bookingReference ?? bookingId}</span> — hold on to it in case you need to check back later.
          </p>
        </div>
      </Layout>
    );
  }

  if (status === 'cancelled') {
    // Reuses the existing PaymentFailedPage rather than a second
    // "your payment didn't work" screen with its own copy and its own
    // retry button to keep in sync — that page already has both, and
    // is reached the same way (router state) from everywhere else it's
    // used.
    return <Navigate to="/checkout/failed" state={{ eventName: eventName ?? undefined }} replace />;
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 text-center">
        <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-success-50 flex items-center justify-center">
          <Icon name="check_circle" filled className="text-success-500 text-[36px]" />
        </div>
        <h1 className="text-2xl font-bold text-ink mb-2">Booking Confirmed!</h1>
        <p className="text-sm text-ink-muted mb-6">
          Your tickets for <span className="font-semibold text-ink">{eventName ?? 'this event'}</span> are
          confirmed and on their way to your WhatsApp and Email.
        </p>

        <div className="bg-white rounded-2xl shadow-card p-5 text-left mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-ink-muted uppercase tracking-wide">Booking ID</p>
              <p className="font-bold text-ink">{bookingReference ?? bookingId}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={copyBookingId} className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-surface-sunken">
                <Icon name="content_copy" className="text-[18px]" />
              </button>
              <button onClick={() => window.print()} className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-surface-sunken">
                <Icon name="print" className="text-[18px]" />
              </button>
            </div>
          </div>
          {state.totalAmount !== undefined && (
            <div className="flex justify-between text-sm border-t border-slate-100 pt-4">
              <span className="text-ink-muted">Amount paid</span>
              <span className="font-semibold text-ink">{formatINR(state.totalAmount)}</span>
            </div>
          )}
        </div>

        {participants && (
          <div className="bg-white rounded-2xl shadow-card p-5 text-left mb-8">
            <h3 className="font-semibold text-ink mb-3">Issued Attendee Tickets</h3>
            <ul className="space-y-3">
              {participants.map((p, i) => (
                <li key={i} className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center">
                      <Icon name="person" className="text-[18px]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink">{p.name}</p>
                      <Badge tone="success">Confirmed</Badge>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-ink-muted mt-3">
              Your QR passes are on their way by email — or view them anytime under Manage Reservation below.
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button variant="outline" onClick={() => navigate('/')}>
            ← Book Another Event
          </Button>
          <Button
            onClick={() =>
              navigate(`/bookings/${bookingId}/manage`, {
                state: { bookingReference: bookingReference ?? undefined },
              })
            }
          >
            <Icon name="settings" className="text-[18px]" /> Manage Reservation
          </Button>
        </div>
      </div>
    </Layout>
  );
}

