import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import { rajgadTrek } from '../mockData/rajgadTrek';
import { formatINR } from '../lib/format';

interface CheckoutState {
  totalAmount?: number;
  contactEmail?: string;
  contactPhone?: string;
  quantities?: Record<string, number>;
  participants?: { name: string }[];
  eventName?: string;
}

export function PaymentProcessingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as CheckoutState | null) ?? {};
  const [secondsLeft, setSecondsLeft] = useState(4);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  function handleSuccess() {
    const bookingId = `INV-BKG-${Math.floor(1000 + Math.random() * 9000)}`;
    navigate(`/bookings/${bookingId}/confirmed`, { state: { ...state, bookingId } });
  }

  function handleFailure() {
    navigate('/checkout/failed', { state });
  }

  return (
    <Layout bare>
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-card p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-full border-4 border-brand-100 border-t-brand-500 animate-spin" />
          <h1 className="text-xl font-bold text-ink mb-1">Proceeding to Secure Payment</h1>
          <p className="text-sm text-ink-muted mb-6">
            Redirecting to payment gateway{secondsLeft > 0 ? ` in ${secondsLeft}s...` : '...'}
          </p>

          <div className="grid grid-cols-3 gap-3 mb-6 text-xs text-ink-muted">
            <div className="flex flex-col items-center gap-1">
              <Icon name="lock" className="text-brand-500 text-[20px]" />
              Secure Payment
            </div>
            <div className="flex flex-col items-center gap-1">
              <Icon name="bolt" className="text-brand-500 text-[20px]" />
              Instant Verification
            </div>
            <div className="flex flex-col items-center gap-1">
              <Icon name="qr_code_2" className="text-brand-500 text-[20px]" />
              Digital QR Ticket
            </div>
          </div>

          <div className="bg-surface-sunken rounded-xl p-4 text-left mb-6">
            <p className="text-xs uppercase tracking-wide text-ink-muted mb-2">Payment Summary</p>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-ink-body">{state.eventName ?? rajgadTrek.name}</span>
              <span className="font-semibold text-ink">{formatINR(state.totalAmount ?? 0)}</span>
            </div>
            {state.contactEmail && <p className="text-xs text-ink-muted">{state.contactEmail}</p>}
          </div>

          <div className="border-t border-slate-100 pt-5">
            <p className="text-xs text-ink-muted mb-3">
              Dev tools — replace this block with the real Cashfree redirect once integrated:
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={handleFailure}>
                <Icon name="cancel" className="text-[18px]" /> Simulate Failure
              </Button>
              <Button className="flex-1" onClick={handleSuccess}>
                <Icon name="check_circle" className="text-[18px]" /> Simulate Success
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
