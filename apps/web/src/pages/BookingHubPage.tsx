import { Link, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { rajgadTrek, mockBooking } from '../mockData/rajgadTrek';
import { formatDate, formatINR } from '../lib/format';

export function BookingHubPage() {
  const { bookingId } = useParams();
  const booking = { ...mockBooking, id: bookingId ?? mockBooking.id };

  function resendTickets() {
    // Wire to POST /bookings/:id/resend-tickets once the notifications
    // queue (BullMQ + WhatsApp/Email) is built.
    alert('Tickets resent to your WhatsApp and Email.');
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs text-ink-muted uppercase tracking-wide">Booking {booking.id}</p>
            <h1 className="text-2xl font-bold text-ink">Your Booking</h1>
          </div>
          <Badge tone="success">Paid</Badge>
        </div>

        <div className="bg-white rounded-2xl shadow-card p-5 mb-6">
          <h2 className="font-semibold text-ink mb-1">{rajgadTrek.name}</h2>
          <p className="text-sm text-ink-muted mb-4">
            {formatDate(rajgadTrek.date)} · {rajgadTrek.venue}
          </p>

          <h3 className="text-sm font-semibold text-ink mb-3">Your Tickets</h3>
          <ul className="space-y-3 mb-4">
            {booking.attendees.map((a) => (
              <li
                key={a.ticketId}
                className="flex items-center justify-between border border-slate-100 rounded-xl p-3"
              >
                <div>
                  <p className="text-sm font-medium text-ink">{a.name}</p>
                  <p className="text-xs text-ink-muted">
                    {a.category} · {a.ticketId}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={a.status === 'confirmed' ? 'success' : 'danger'}>
                    {a.status === 'confirmed' ? 'Confirmed' : 'Cancelled'}
                  </Badge>
                  <Button size="sm" variant="outline">
                    <Icon name="qr_code_2" className="text-[16px]" /> View Ticket
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <Button variant="outline" onClick={resendTickets}>
            <Icon name="send" className="text-[16px]" /> Resend Tickets
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
          <div className="bg-white rounded-2xl shadow-card p-5">
            <h3 className="text-sm font-semibold text-ink mb-3">Booking Contact</h3>
            <p className="text-sm text-ink-body">{booking.contactName}</p>
            <p className="text-sm text-ink-muted">{booking.contactEmail}</p>
            <p className="text-sm text-ink-muted">{booking.contactPhone}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-card p-5">
            <h3 className="text-sm font-semibold text-ink mb-3">Payment Summary</h3>
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted">Amount paid</span>
              <span className="font-semibold text-ink">{formatINR(booking.amountPaid)}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-ink-muted">Method</span>
              <span className="text-ink-body capitalize">{booking.paymentMethod}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-card p-5 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink">Need to cancel?</h3>
            <p className="text-xs text-ink-muted">Refunds follow the event's cancellation policy.</p>
          </div>
          <Link to={`/bookings/${booking.id}/manage`}>
            <Button variant="outline">Manage Cancellation</Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
}
