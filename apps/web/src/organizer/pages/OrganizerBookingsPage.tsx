import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOrganizerAuth } from '../context/AuthContext';
import { apiRequest, ApiError } from '../lib/api';
import { OrganizerLayout } from '../components/OrganizerLayout';

type DisplayBookingStatus = 'confirmed' | 'pending' | 'cancelled' | 'partially_cancelled';

interface OrganizerBookingRow {
  id: string;
  bookingReference: string;
  customerName: string;
  customerEmail: string;
  eventName: string;
  ticketCount: number;
  totalAmountPaise: number;
  paymentStatus: string | null;
  displayStatus: DisplayBookingStatus;
  createdAt: string;
}

interface OrganizerBookingsData {
  organizerName: string;
  event: { id: string; name: string; eventDate: string; status: string } | null;
  organizerEvents: { id: string; name: string }[];
  counts: Record<'all' | DisplayBookingStatus, number>;
  bookings: OrganizerBookingRow[];
  pagination: { page: number; pageSize: number; total: number };
}

function formatINR(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_LABEL: Record<DisplayBookingStatus, string> = {
  confirmed: 'CONFIRMED',
  pending: 'PENDING',
  cancelled: 'CANCELLED',
  partially_cancelled: 'PARTIALLY CANCELLED',
};

const STATUS_BADGE: Record<DisplayBookingStatus, string> = {
  confirmed: 'bg-[#ECFDF5] text-[#059669]',
  pending: 'bg-amber-50 text-amber-700',
  cancelled: 'bg-slate-100 text-slate-500',
  partially_cancelled: 'bg-orange-50 text-orange-700',
};

const PAYMENT_BADGE: Record<string, string> = {
  paid: 'bg-[#ECFDF5] text-[#059669]',
  pending: 'bg-amber-50 text-amber-700',
  failed: 'bg-red-50 text-red-700',
  refunded: 'bg-slate-100 text-slate-500',
};

const TABS: { key: 'all' | DisplayBookingStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'pending', label: 'Pending' },
  { key: 'partially_cancelled', label: 'Partially Cancelled' },
  { key: 'cancelled', label: 'Cancelled' },
];

export function OrganizerBookingsPage() {
  const { user, token, logout } = useOrganizerAuth();

  const [searchParams] = useSearchParams();
  const [eventId, setEventId] = useState<string | undefined>(searchParams.get('eventId') ?? undefined);
  const [status, setStatus] = useState<'all' | DisplayBookingStatus>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'amount_desc' | 'amount_asc'>('newest');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<OrganizerBookingsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (eventId) params.set('eventId', eventId);
    params.set('status', status);
    if (search) params.set('search', search);
    params.set('sort', sort);
    params.set('page', String(page));

    apiRequest<OrganizerBookingsData>(`/organizer/bookings?${params.toString()}`, { token })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        // If we hadn't picked an event yet, lock in whichever the API
        // defaulted to, so subsequent requests stay on that event.
        if (!eventId && d.event) setEventId(d.event.id);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load bookings');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, token, eventId, status, search, sort, page]);

  const pageCount = data ? Math.max(1, Math.ceil(data.pagination.total / data.pagination.pageSize)) : 1;
  const rangeStart = data && data.pagination.total > 0 ? (data.pagination.page - 1) * data.pagination.pageSize + 1 : 0;
  const rangeEnd = data ? Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.total) : 0;

  return (
    <OrganizerLayout activeNav="bookings" onLogout={logout} organizerName={data?.organizerName ?? null} pageTitle="Bookings">
      <div className="space-y-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">
            {error}
          </div>
        )}

        {/* Event Context Selector */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:px-6 sm:py-3.5 flex flex-wrap items-center justify-between gap-4 shadow-sm" data-purpose="event-context-bar">
          <div className="flex flex-wrap items-center gap-3 sm:gap-6">
            <span className="text-sm font-medium text-slate-500">Event</span>
            <div className="relative">
              <select
                aria-label="Select event"
                className="appearance-none bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 pl-3.5 pr-9 py-1.5 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer shadow-xs"
                onChange={(e) => {
                  setEventId(e.target.value);
                  setPage(1);
                }}
                value={eventId ?? ''}
              >
                {data?.organizerEvents.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                </svg>
              </div>
            </div>
            {data?.event && (
              <div className="flex items-center space-x-2 text-sm text-slate-600 font-medium">
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75"></path>
                </svg>
                <span>{formatDate(data.event.eventDate)} · {data.pagination.total} booking{data.pagination.total === 1 ? '' : 's'}</span>
              </div>
            )}
          </div>
          {data?.event && (
            <span className="inline-flex items-center px-3 py-1 rounded-md text-xs font-semibold bg-[#ECFDF5] text-[#059669] border border-emerald-100 tracking-wide uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-[#059669] mr-1.5"></span>
              {data.event.status}
            </span>
          )}
        </section>

        {/* Status Filter Tabs */}
        <section className="border-b border-slate-200" data-purpose="status-filter-tabs">
          <nav aria-label="Tabs" className="flex space-x-8 overflow-x-auto no-scrollbar">
            {TABS.map((tab) => (
              <button
                className={
                  status === tab.key
                    ? 'border-b-2 border-blue-600 text-blue-600 py-3 px-1 text-sm font-semibold whitespace-nowrap'
                    : 'border-b-2 border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 py-3 px-1 text-sm font-medium whitespace-nowrap transition-colors'
                }
                key={tab.key}
                onClick={() => {
                  setStatus(tab.key);
                  setPage(1);
                }}
                type="button"
              >
                {tab.label} ({data?.counts[tab.key] ?? 0})
              </button>
            ))}
          </nav>
        </section>

        {/* Search & Filter Toolbar */}
        <section className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
              </svg>
            </div>
            <input
              className="block w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by booking ID, participant name or email..."
              type="text"
              value={search}
            />
          </div>
          <div className="flex items-center space-x-2.5">
            <div className="relative">
              <select
                aria-label="Sort bookings"
                className="appearance-none bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 pl-3.5 pr-8 py-2 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs cursor-pointer"
                onChange={(e) => setSort(e.target.value as typeof sort)}
                value={sort}
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="amount_desc">Amount: High to Low</option>
                <option value="amount_asc">Amount: Low to High</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                </svg>
              </div>
            </div>
          </div>
        </section>

        {/* Data Table */}
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6 whitespace-nowrap" scope="col">Booking ID</th>
                  <th className="py-3.5 px-4 sm:px-6 whitespace-nowrap" scope="col">Customer</th>
                  <th className="py-3.5 px-4 whitespace-nowrap" scope="col">Event</th>
                  <th className="py-3.5 px-4 text-center whitespace-nowrap" scope="col">Tickets</th>
                  <th className="py-3.5 px-4 whitespace-nowrap" scope="col">Amount</th>
                  <th className="py-3.5 px-4 whitespace-nowrap" scope="col">Payment</th>
                  <th className="py-3.5 px-4 whitespace-nowrap" scope="col">Status</th>
                  <th className="py-3.5 px-4 whitespace-nowrap" scope="col">Booked On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {!loading && data && data.bookings.length === 0 && (
                  <tr>
                    <td className="py-6 px-6 text-slate-500" colSpan={8}>
                      No bookings match these filters.
                    </td>
                  </tr>
                )}
                {data?.bookings.map((b) => (
                  <tr className="hover:bg-slate-50/70 transition-colors" key={b.id}>
                    <td className="py-4 px-4 sm:px-6 font-medium text-slate-900 whitespace-nowrap">{b.bookingReference}</td>
                    <td className="py-4 px-4 sm:px-6 whitespace-nowrap">
                      <div className="font-bold text-slate-900 text-sm">{b.customerName}</div>
                      <div className="text-slate-500 text-xs">{b.customerEmail}</div>
                    </td>
                    <td className="py-4 px-4 text-slate-700 whitespace-nowrap">{b.eventName}</td>
                    <td className="py-4 px-4 text-center text-slate-800 font-medium whitespace-nowrap">{b.ticketCount}</td>
                    <td className="py-4 px-4 font-semibold text-slate-900 whitespace-nowrap">{formatINR(b.totalAmountPaise)}</td>
                    <td className="py-4 px-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${b.paymentStatus ? PAYMENT_BADGE[b.paymentStatus] ?? 'bg-slate-100 text-slate-500' : 'bg-slate-100 text-slate-400'}`}>
                        {b.paymentStatus ? b.paymentStatus.toUpperCase() : '—'}
                      </span>
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap">
                      <span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold ${STATUS_BADGE[b.displayStatus]}`}>
                        {STATUS_LABEL[b.displayStatus]}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-slate-600 whitespace-nowrap">{formatDate(b.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Pagination */}
        {data && data.pagination.total > 0 && (
          <section className="pt-2 pb-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-600" data-purpose="pagination-controls">
            <div className="font-medium text-xs sm:text-sm">
              Showing <span className="font-semibold text-slate-800">{rangeStart}–{rangeEnd}</span> of{' '}
              <span className="font-semibold text-slate-800">{data.pagination.total}</span> bookings
            </div>
            <nav aria-label="Pagination" className="flex items-center space-x-1 sm:space-x-1.5">
              <button
                className="inline-flex items-center px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 bg-white hover:bg-slate-50 font-medium text-xs sm:text-sm transition disabled:cursor-not-allowed disabled:opacity-60"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                type="button"
              >
                <span className="mr-1">‹</span> Previous
              </button>
              {Array.from({ length: pageCount }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === pageCount || Math.abs(p - page) <= 1)
                .reduce<number[]>((acc, p) => {
                  if (acc.length && p - acc[acc.length - 1] > 1) acc.push(-1); // ellipsis marker
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === -1 ? (
                    <span className="px-1 text-slate-400 font-bold" key={`ellipsis-${i}`}>
                      ...
                    </span>
                  ) : (
                    <button
                      className={
                        p === page
                          ? 'w-8 h-8 flex items-center justify-center rounded-lg bg-[#1A68FF] text-white font-bold text-xs sm:text-sm shadow-xs'
                          : 'w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-medium text-xs sm:text-sm transition'
                      }
                      key={p}
                      onClick={() => setPage(p)}
                      type="button"
                    >
                      {p}
                    </button>
                  ),
                )}
              <button
                className="inline-flex items-center px-3 py-1.5 border border-slate-200 rounded-lg text-blue-600 bg-white hover:bg-slate-50 font-semibold text-xs sm:text-sm transition shadow-xs disabled:cursor-not-allowed disabled:opacity-60 disabled:text-slate-400"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                type="button"
              >
                Next <span className="ml-1">›</span>
              </button>
            </nav>
          </section>
        )}
      </div>
    </OrganizerLayout>
  );
}
