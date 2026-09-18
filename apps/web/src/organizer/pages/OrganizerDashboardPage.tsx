import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOrganizerAuth } from '../context/AuthContext';
import { apiRequest, ApiError } from '../lib/api';
import { OrganizerLayout, initials } from '../components/OrganizerLayout';

interface DashboardEventSummary {
  id: string;
  name: string;
  eventDate: string;
  venueAddress: string | null;
  bannerUrl: string | null;
  status: string;
  capacity: number;
  bookedCount: number;
  revenuePaise: number;
}

interface DashboardBookingSummary {
  id: string;
  bookingReference: string;
  eventName: string;
  customerName: string;
  ticketCount: number;
  totalAmountPaise: number;
  status: string;
}

interface DashboardActivityDay {
  date: string;
  count: number;
}

interface OrganizerDashboardData {
  organizerName: string;
  totalEvents: number;
  upcomingEventsCount: number;
  nextUpcomingEventName: string | null;
  totalBookings: number;
  bookingsThisWeek: number;
  totalParticipants: number;
  revenuePaiseThisMonth: number;
  checkedInCount: number;
  checkedInEligibleCount: number;
  upcomingEvents: DashboardEventSummary[];
  recentBookings: DashboardBookingSummary[];
  bookingActivity: DashboardActivityDay[];
}

function formatINR(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_BADGE: Record<string, string> = {
  confirmed: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border border-amber-200',
  cancelled: 'bg-slate-100 text-slate-500 border border-slate-200',
  published: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  draft: 'bg-slate-100 text-slate-500 border border-slate-200',
  closed: 'bg-slate-100 text-slate-500 border border-slate-200',
};

export function OrganizerDashboardPage() {
  const { user, token, logout } = useOrganizerAuth();
  const [data, setData] = useState<OrganizerDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiRequest<OrganizerDashboardData>('/organizer/dashboard', { token })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load dashboard');
      });
    return () => {
      cancelled = true;
    };
  }, [user, token]);

  const maxActivity = data ? Math.max(1, ...data.bookingActivity.map((d) => d.count)) : 1;

  return (
    <OrganizerLayout activeNav="overview" onLogout={logout} organizerName={data?.organizerName ?? null} pageTitle="Overview">
      {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">
              {error}
            </div>
          )}

          {/* Welcome Banner */}
          <section aria-label="Organizer Welcome" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <span className="text-[11px] font-bold tracking-widest text-slate-400 uppercase">ORGANIZER DASHBOARD</span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5 flex items-center gap-2">
                <span>Welcome back, {data?.organizerName ?? '…'}</span>
                <span className="inline-block animate-bounce text-2xl">👋</span>
              </h2>
              <p className="text-slate-500 text-sm mt-1">Here's what's happening across your events.</p>
            </div>
            <div className="shrink-0">
              <Link
                className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg shadow-sm hover:shadow transition-all space-x-1.5 focus:ring-4 focus:ring-blue-100"
                to="/organizer/events/new"
              >
                <span className="text-lg font-bold leading-none">+</span>
                <span>CREATE EVENT</span>
              </Link>
            </div>
          </section>

          {/* Stat / Metric Cards Grid */}
          <section aria-label="Summary Statistics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
            <StatCard
              color="blue"
              icon="events"
              label="Total Events"
              sub={data ? `${data.upcomingEventsCount} upcoming` : '—'}
              value={data?.totalEvents ?? '—'}
            />
            <StatCard
              color="sky"
              icon="upcoming"
              label="Upcoming Events"
              sub={data?.nextUpcomingEventName ? `Next: ${data.nextUpcomingEventName}` : 'None scheduled'}
              value={data?.upcomingEventsCount ?? '—'}
            />
            <StatCard
              color="indigo"
              icon="bookings"
              label="Total Bookings"
              sub={data ? `↑ +${data.bookingsThisWeek} this week` : '—'}
              subClassName="text-emerald-600 font-medium"
              value={data?.totalBookings ?? '—'}
            />
            <StatCard
              color="blue"
              icon="participants"
              label="Total Participants"
              sub="Across all events"
              value={data?.totalParticipants ?? '—'}
            />
            <StatCard
              color="emerald"
              icon="revenue"
              label="Revenue"
              sub="This month"
              value={data ? formatINR(data.revenuePaiseThisMonth) : '—'}
            />
            <StatCard
              color="sky"
              icon="checkin"
              label="Checked In"
              sub={
                data ? (
                  <>
                    <span className="text-emerald-600 font-semibold">
                      {data.checkedInEligibleCount > 0 ? Math.round((data.checkedInCount / data.checkedInEligibleCount) * 100) : 0}%
                    </span>{' '}
                    of eligible tickets
                  </>
                ) : (
                  '—'
                )
              }
              value={data?.checkedInCount ?? '—'}
            />
          </section>

          {/* Two-Column Main Content */}
          <section aria-label="Events and Activities" className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT COLUMN */}
            <div className="lg:col-span-7 xl:col-span-8 space-y-6">
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100">
                  <h3 className="font-bold text-slate-900 text-base">Upcoming Events</h3>
                  <Link className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 group" to="/organizer/events">
                    <span>View All</span>
                    <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                  </Link>
                </div>
                <div className="divide-y divide-slate-100">
                  {data && data.upcomingEvents.length === 0 && (
                    <p className="p-5 text-sm text-slate-500">No upcoming published events yet.</p>
                  )}
                  {data?.upcomingEvents.map((event) => {
                    const pct = event.capacity > 0 ? Math.min(100, (event.bookedCount / event.capacity) * 100) : 0;
                    return (
                      <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors" key={event.id}>
                        <div className="flex items-center space-x-3.5 min-w-0 w-full sm:w-auto">
                          <div className="w-14 h-14 rounded-lg overflow-hidden bg-slate-100 shrink-0 relative flex items-center justify-center text-slate-400 font-bold">
                            {event.bannerUrl ? (
                              <img alt={event.name} className="w-full h-full object-cover" src={event.bannerUrl} />
                            ) : (
                              initials(event.name)
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-sm sm:text-base text-slate-900 truncate">{event.name}</h4>
                            <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500 mt-1">
                              <span className="inline-flex items-center gap-1">
                                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                                {formatDate(event.eventDate)}
                              </span>
                              {event.venueAddress && (
                                <span className="inline-flex items-center gap-1">
                                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                                  {event.venueAddress}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-4 sm:gap-6 shrink-0">
                          <div className="w-32">
                            <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                              <span>{event.bookedCount} <span className="text-slate-400 font-normal">/ {event.capacity} booked</span></span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-600 rounded-full" style={{ width: `${pct}%` }}></div>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1">{Math.max(0, event.capacity - event.bookedCount)} seats available</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-slate-900 leading-tight">{formatINR(event.revenuePaise)}</p>
                            <p className="text-[11px] text-slate-400">Revenue</p>
                          </div>
                          <span className={`px-2.5 py-1 text-[10px] font-bold tracking-wider rounded-full ${STATUS_BADGE[event.status] ?? STATUS_BADGE.draft}`}>
                            {event.status.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100">
                  <h3 className="font-bold text-slate-900 text-base">Recent Bookings</h3>
                  <Link className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 group" to="/organizer/bookings">
                    <span>View All</span>
                    <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50 border-b border-slate-100">
                        <th className="py-3 px-4 font-semibold" scope="col">Booking ID</th>
                        <th className="py-3 px-4 font-semibold" scope="col">Event</th>
                        <th className="py-3 px-4 font-semibold" scope="col">Customer</th>
                        <th className="py-3 px-4 font-semibold text-center" scope="col">Tickets</th>
                        <th className="py-3 px-4 font-semibold" scope="col">Amount</th>
                        <th className="py-3 px-4 font-semibold" scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {data && data.recentBookings.length === 0 && (
                        <tr><td className="p-5 text-sm text-slate-500" colSpan={6}>No bookings yet.</td></tr>
                      )}
                      {data?.recentBookings.map((b) => (
                        <tr className="hover:bg-slate-50/60 transition-colors" key={b.id}>
                          <td className="py-3 px-4 font-medium text-slate-900">{b.bookingReference}</td>
                          <td className="py-3 px-4 text-slate-600 truncate max-w-[150px]">{b.eventName}</td>
                          <td className="py-3 px-4 text-slate-700 font-medium">{b.customerName}</td>
                          <td className="py-3 px-4 text-center">{b.ticketCount}</td>
                          <td className="py-3 px-4 font-semibold text-slate-900">{formatINR(b.totalAmountPaise)}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 text-[10px] font-bold tracking-wider rounded-md ${STATUS_BADGE[b.status] ?? STATUS_BADGE.pending}`}>
                              {b.status.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="lg:col-span-5 xl:col-span-4 space-y-6">
              <div className="space-y-2">
                <h3 className="font-bold text-slate-900 text-sm">Quick Actions</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <QuickAction color="bg-blue-600 text-white" icon="+" label="Create Event" sub="Set up a new event" to="/organizer/events/new" />
                  <QuickAction color="bg-blue-50 text-blue-600" icon="bookings" label="View Bookings" sub="See all bookings" to="/organizer/bookings" />
                  <QuickAction color="bg-sky-50 text-sky-600" icon="checkin" label="Check In Attendees" sub="Scan tickets at event" to="/organizer/check-in" />
                  <QuickAction color="bg-indigo-50 text-indigo-600" icon="payments" label="View Payments" sub="Track your revenue" to="/organizer/payments" />
                </div>
              </div>

              {/* Booking Activity Chart — real data, last 14 days */}
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-slate-900 text-sm">Booking Activity</h3>
                  <span className="text-xs font-medium text-slate-500">Last 14 days</span>
                </div>
                <div className="pt-2">
                  <div className="flex items-end h-36 gap-2 w-full pb-2 border-b border-slate-100 relative">
                    {data?.bookingActivity.map((day) => {
                      const heightPct = maxActivity > 0 ? Math.max(4, (day.count / maxActivity) * 100) : 4;
                      return (
                        <div
                          className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer z-10"
                          key={day.date}
                          title={`${formatDate(day.date)}: ${day.count} booking${day.count === 1 ? '' : 's'}`}
                        >
                          <div className="w-full max-w-[12px] bg-blue-500 rounded-t-sm transition-all group-hover:bg-blue-700" style={{ height: `${heightPct}%` }}></div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 mt-2 px-1">
                    {data && (
                      <>
                        <span>{formatDate(data.bookingActivity[0].date)}</span>
                        <span>{formatDate(data.bookingActivity[data.bookingActivity.length - 1].date)}</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center justify-center space-x-1.5 mt-3 pt-2 text-xs text-slate-500">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span>
                    <span>Bookings</span>
                  </div>
                </div>
              </div>

              {/* Needs Your Attention — not wired yet; see code comment */}
              {/*
                Left static: two of the three original mockup items need data
                this schema doesn't have yet (an event capacity-threshold
                alert needs a defined "warning %" per event; a "registration
                closing soon" alert needs a registration-close-date field
                that doesn't exist on events yet). Wiring a real, correct
                version of this card is follow-up work, not this pass.
              */}
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100">
                  <h3 className="font-bold text-slate-900 text-sm">Needs Your Attention</h3>
                </div>
                <div className="p-3.5">
                  <p className="text-xs text-slate-400 p-3">Nothing here yet — this card isn't wired to real data in this pass.</p>
                </div>
              </div>
            </div>
          </section>
    </OrganizerLayout>
  );
}

function StatCard({
  color,
  icon,
  label,
  sub,
  subClassName,
  value,
}: {
  color: 'blue' | 'sky' | 'indigo' | 'emerald';
  icon: 'events' | 'upcoming' | 'bookings' | 'participants' | 'revenue' | 'checkin';
  label: string;
  sub: React.ReactNode;
  subClassName?: string;
  value: React.ReactNode;
}) {
  const bg: Record<string, string> = { blue: 'bg-blue-50 text-blue-600', sky: 'bg-sky-50 text-sky-600', indigo: 'bg-indigo-50 text-indigo-600', emerald: 'bg-emerald-50 text-emerald-600' };
  return (
    <article className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-colors flex items-start space-x-3.5" data-testid={`stat-${icon}`}>
      <div className={`p-2.5 rounded-lg shrink-0 ${bg[color]}`}>
        <StatIcon icon={icon} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 font-medium truncate">{label}</p>
        <p className="text-2xl font-bold text-slate-900 mt-0.5 leading-tight">{value}</p>
        <p className={`text-[11px] mt-1 truncate ${subClassName ?? 'text-slate-400'}`}>{sub}</p>
      </div>
    </article>
  );
}

function QuickAction({ color, icon, label, sub, to }: { color: string; icon: string; label: string; sub: string; to: string }) {
  return (
    <Link className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs hover:border-blue-300 hover:shadow-xs transition-all flex items-center space-x-3 group" to={to}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform ${color}`}>
        {icon === '+' ? <span className="font-bold text-lg">+</span> : <StatIcon icon={icon as 'bookings' | 'checkin' | 'payments'} />}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-800 group-hover:text-blue-600 transition-colors truncate">{label}</p>
        <p className="text-[11px] text-slate-400 truncate">{sub}</p>
      </div>
    </Link>
  );
}

function StatIcon({ icon }: { icon: 'events' | 'upcoming' | 'bookings' | 'participants' | 'revenue' | 'checkin' | 'payments' }) {
  if (icon === 'revenue') {
    return <span className="w-5 h-5 font-bold text-lg flex items-center justify-center">₹</span>;
  }
  const paths: Record<string, string> = {
    events: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    upcoming: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
    bookings: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
    participants: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    checkin: 'M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z',
    payments: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
  };
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path d={paths[icon]} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
    </svg>
  );
}
