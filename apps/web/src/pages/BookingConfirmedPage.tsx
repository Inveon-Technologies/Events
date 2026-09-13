import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { rajgadTrek } from '../mockData/rajgadTrek';
import { formatINR } from '../lib/format';

interface ConfirmedState {
  totalAmount?: number;
  participants?: { name: string }[];
  eventName?: string;
}

export function BookingConfirmedPage() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as ConfirmedState | null) ?? {};
  const participants = state.participants?.length ? state.participants : [{ name: 'Guest Attendee' }];

  function copyBookingId() {
    if (bookingId) navigator.clipboard?.writeText(bookingId);
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 text-center">
        <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-success-50 flex items-center justify-center">
          <Icon name="check_circle" filled className="text-success-500 text-[36px]" />
        </div>
        <h1 className="text-2xl font-bold text-ink mb-2">Booking Confirmed!</h1>
        <p className="text-sm text-ink-muted mb-6">
          Your tickets for <span className="font-semibold text-ink">{state.eventName ?? rajgadTrek.name}</span> are
          confirmed and on their way to your WhatsApp and Email.
        </p>

        <div className="bg-white rounded-2xl shadow-card p-5 text-left mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-ink-muted uppercase tracking-wide">Booking ID</p>
              <p className="font-bold text-ink">{bookingId}</p>
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
          <div className="flex justify-between text-sm border-t border-slate-100 pt-4">
            <span className="text-ink-muted">Amount paid</span>
            <span className="font-semibold text-ink">{formatINR(state.totalAmount ?? 0)}</span>
          </div>
        </div>

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
                <Button size="sm" variant="outline">
                  <Icon name="qr_code_2" className="text-[16px]" /> View QR Pass
                </Button>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button variant="outline" onClick={() => navigate('/')}>
            ← Book Another Event
          </Button>
          <Button onClick={() => navigate(`/bookings/${bookingId}/manage`)}>
            <Icon name="settings" className="text-[18px]" /> Manage Reservation
          </Button>
        </div>
      </div>
    </Layout>
  );
}
