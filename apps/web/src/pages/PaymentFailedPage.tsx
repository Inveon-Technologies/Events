import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import { rajgadTrek } from '../mockData/rajgadTrek';
import { formatINR } from '../lib/format';

export function PaymentFailedPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { eventId } = useParams();
  const state = (location.state as { totalAmount?: number; quantities?: Record<string, number>; eventName?: string } | null) ?? {};

  function handleRetry() {
    navigate(`/events/${eventId ?? rajgadTrek.id}/checkout`, { state: { quantities: state.quantities } });
  }

  return (
    <Layout bare>
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-card p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-danger-50 flex items-center justify-center">
            <Icon name="error" className="text-danger-500 text-[32px]" />
          </div>
          <h1 className="text-xl font-bold text-ink mb-2">Payment could not be completed</h1>
          <p className="text-sm text-ink-muted mb-6">
            <span className="font-semibold text-ink">Your booking is not confirmed.</span> No amount
            has been charged, or any amount deducted will be automatically refunded within 5–7
            business days.
          </p>

          <div className="bg-surface-sunken rounded-xl p-4 text-left mb-6">
            <p className="text-xs uppercase tracking-wide text-ink-muted mb-2">Booking Summary</p>
            <div className="flex justify-between text-sm">
              <span className="text-ink-body">{state.eventName ?? rajgadTrek.name}</span>
              <span className="font-semibold text-ink">{formatINR(state.totalAmount ?? 0)}</span>
            </div>
          </div>

          <Button className="w-full mb-3" onClick={handleRetry}>
            Try Payment Again
          </Button>
          <p className="text-xs text-ink-muted">
            Payment already deducted?{' '}
            <a href="mailto:support@inveontechnologies.in" className="text-brand-500 font-semibold hover:underline">
              Still having issues? Contact support
            </a>
          </p>
        </div>
      </div>
    </Layout>
  );
}
