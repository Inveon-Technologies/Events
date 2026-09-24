import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';

interface CustomerBooking {
  bookingReference: string;
  bookingStatus: 'pending' | 'confirmed' | 'cancelled';
  eventId: string;
  eventName: string;
  eventDate: string;
  bannerUrl: string | null;
  totalAmountPaise: number;
  ticketCount: number;
  galleryAvailable?: boolean;
}

type FilterTab = 'all' | 'upcoming' | 'past' | 'cancelled';

function formatINR(paise: number) {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function getSession(): { token: string; email: string } | null {
  try {
    const raw = localStorage.getItem('inveon_customer_session');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function MyBookingsPage() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<CustomerBooking[] | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const session = getSession();
    if (!session) {
      navigate('/bookings/lookup');
      return;
    }
    let cancelled = false;
    fetch('/api/bookings/my', { headers: { Authorization: `Bearer ${session.token}` } })
      .then(async (res) => {
        if (!res.ok) {
          localStorage.removeItem('inveon_customer_session');
          if (!cancelled) navigate('/bookings/lookup');
          return;
        }
        const data = await res.json();
        if (!cancelled) setBookings(data.bookings);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load your bookings. Please try again.');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleLogout() {
    localStorage.removeItem('inveon_customer_session');
    navigate('/bookings/lookup');
  }

  if (error) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 text-center">
          <p className="text-sm text-danger-600">{error}</p>
        </div>
      </Layout>
    );
  }

  if (!bookings) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
          <p className="text-xs text-ink-muted text-center">Loading your bookings…</p>
        </div>
      </Layout>
    );
  }

  const now = Date.now();
  const withComputedState = bookings.map((b) => ({
    ...b,
    isUpcoming: b.bookingStatus !== 'cancelled' && new Date(b.eventDate).getTime() >= now,
    isPast: b.bookingStatus !== 'cancelled' && new Date(b.eventDate).getTime() < now,
  }));

  const counts = {
    all: withComputedState.length,
    upcoming: withComputedState.filter((b) => b.isUpcoming).length,
    past: withComputedState.filter((b) => b.isPast).length,
    cancelled: withComputedState.filter((b) => b.bookingStatus === 'cancelled').length,
  };

  const filtered = withComputedState.filter((b) => {
    if (tab === 'upcoming' && !b.isUpcoming) return false;
    if (tab === 'past' && !b.isPast) return false;
    if (tab === 'cancelled' && b.bookingStatus !== 'cancelled') return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!b.eventName.toLowerCase().includes(q) && !b.bookingReference.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All Bookings' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'past', label: 'Past Events' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-ink">My Bookings</h1>
          <button onClick={handleLogout} className="text-xs font-semibold text-ink-muted hover:text-ink flex items-center gap-1">
            <Icon name="logout" className="text-[16px]" /> Log out
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  tab === t.key ? 'bg-white shadow-xs text-brand-600' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {t.label} <span className="ml-1 text-[10px] opacity-70">{counts[t.key]}</span>
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-56">
            <Icon name="search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ID, event name…"
              className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-ink-muted text-center py-12">No bookings found.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map((b) => (
              <article key={b.bookingReference} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="px-5 py-3 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                    <Icon name="confirmation_number" className="text-[15px]" />
                    <span className="font-mono font-semibold text-ink">{b.bookingReference}</span>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide ${
                      b.bookingStatus === 'cancelled'
                        ? 'bg-rose-50 text-rose-700'
                        : b.isPast
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {b.bookingStatus === 'cancelled' ? 'Cancelled' : b.isPast ? 'Completed' : 'Confirmed'}
                  </span>
                </div>

                <div className="p-5 space-y-3">
                  <h3 className="font-bold text-ink">{b.eventName}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                    <Icon name="calendar_month" className="text-[15px]" />
                    <span>{formatDate(b.eventDate)}</span>
                  </div>
                  {b.galleryAvailable && (
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-700">
                      <Icon name="photo_library" className="text-[15px]" />
                      <span>Event photos &amp; videos available</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div className="text-xs text-ink-muted">
                      {b.ticketCount} ticket{b.ticketCount === 1 ? '' : 's'} · <span className="font-bold text-ink">{formatINR(b.totalAmountPaise)}</span>
                    </div>
                    <Link
                      to={`/bookings/${b.bookingReference}/manage`}
                      state={{ bookingReference: b.bookingReference, email: getSession()?.email }}
                      className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
                    >
                      View Details <Icon name="arrow_forward" className="text-[14px]" />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
