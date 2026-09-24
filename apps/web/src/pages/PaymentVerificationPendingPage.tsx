import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Badge } from '../components/Badge';
import { formatINR } from '../lib/format';

export function PaymentVerificationPendingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as { totalAmount?: number; bookingId?: string; eventName?: string } | null) ?? {};
  const [checkCount, setCheckCount] = useState(0);

  // Simulated polling — replace with a real GET /bookings/:id/status poll or a
  // websocket/Redis pub-sub push once the organizer cash-approval flow exists.
  useEffect(() => {
    const interval = setInterval(() => setCheckCount((c) => c + 1), 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Layout>
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-card p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-warning-50 flex items-center justify-center">
            <Icon name="hourglass_top" className="text-warning-600 text-[32px]" />
          </div>
          <h1 className="text-xl font-bold text-ink mb-2">We're verifying your payment</h1>
          <p className="text-sm text-ink-muted mb-6">
            Your cash payment reservation is awaiting organizer approval. You'll get your digital
            ticket over WhatsApp and Email the moment it's confirmed — no need to keep this page
            open.
          </p>

          <div className="bg-surface-sunken rounded-xl p-4 text-left mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-ink-body">{state.eventName ?? 'Your booking'}</span>
              <Badge tone="warning">Verification Pending</Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted">Amount due at gate</span>
              <span className="font-semibold text-ink">{formatINR(state.totalAmount ?? 0)}</span>
            </div>
          </div>

          <div className="text-left mb-6">
            <h3 className="text-sm font-semibold text-ink mb-2">What happens next?</h3>
            <ol className="space-y-1.5 text-sm text-ink-body list-decimal list-inside">
              <li>Hand over the cash amount to your event coordinator.</li>
              <li>The organizer approves your booking in their dashboard.</li>
              <li>Your QR ticket is sent instantly over WhatsApp and Email.</li>
            </ol>
          </div>

          <p className="text-xs text-ink-muted">
            Checked automatically ({checkCount} {checkCount === 1 ? 'check' : 'checks'} so far) — this
            page updates itself once approved.
          </p>
          <button
            onClick={() => navigate('/bookings/lookup')}
            className="text-xs text-brand-500 font-semibold hover:underline mt-3"
          >
            Look up this booking manually
          </button>
        </div>
      </div>
    </Layout>
  );
}
