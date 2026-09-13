import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';

export function BookingNotFoundPage() {
  const navigate = useNavigate();

  return (
    <Layout>
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-danger-50 flex items-center justify-center mb-5">
          <Icon name="search_off" className="text-danger-500 text-[32px]" />
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink mb-3">
          We couldn't find that booking
        </h1>
        <p className="text-ink-muted max-w-md mx-auto mb-8">
          Double-check the Booking ID and the contact details you entered — they need to match
          exactly what was used when the tickets were booked.
        </p>

        <div className="w-full max-w-sm bg-white rounded-2xl shadow-card p-5 text-left mb-6">
          <h3 className="text-sm font-semibold text-ink mb-2">Try again</h3>
          <Button className="w-full" onClick={() => navigate('/bookings/lookup')}>
            Find Booking
          </Button>
        </div>

        <div className="w-full max-w-sm bg-white rounded-2xl shadow-card p-5 text-left mb-6">
          <h3 className="text-sm font-semibold text-ink mb-2">Can't find your Booking ID?</h3>
          <p className="text-xs text-ink-muted mb-3">
            It's in your confirmation email and WhatsApp message, usually formatted like
            INV-BKG-1001.
          </p>
          <Button variant="outline" className="w-full">
            Recover My Booking
          </Button>
        </div>

        <div className="w-full max-w-sm bg-white rounded-2xl shadow-card p-5 text-left">
          <h3 className="text-sm font-semibold text-ink mb-2">Still having trouble?</h3>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" size="sm">
              Contact Organizer
            </Button>
            <Button variant="outline" className="flex-1" size="sm">
              Contact Inveon Events
            </Button>
          </div>
        </div>

        <Link to="/" className="text-sm text-brand-500 font-semibold hover:underline mt-8">
          ← Back to Explore Events
        </Link>
      </div>
    </Layout>
  );
}
