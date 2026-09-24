import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  Calendar,
  Ticket,
  Users,
  CreditCard,
  QrCode,
  ArrowUpRight,
  Plus,
  Clock,
  MapPin,
  ChevronRight,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  Layers,
  DollarSign
} from 'lucide-react';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';
import { useEvents } from '../../context/EventsContext';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../lib/api';

export default function OrganizerDashboard() {
  const { events, bookings } = useEvents();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Week/month figures from GET /organizer/dashboard. The cards used to
  // show invented trends ("+18.4%", "+12.2%", "+4 today") and a check-in
  // count taken from a mock attendee list.
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    if (!user?.token) return undefined;
    let cancelled = false;
    apiRequest('/organizer/dashboard', { token: user.token })
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.token]);

  const publishedEvents = events.filter((e) => e.status === 'published');
  const totalRevenue = events.reduce((acc, curr) => acc + (curr.grossRevenue || 0), 0);
  const totalTicketsSold = events.reduce((acc, curr) => acc + (curr.ticketsSold || 0), 0);
  const totalCheckedIn = events.reduce((acc, curr) => acc + (curr.checkedInCount || 0), 0);
  const revenueThisMonth = summary ? Math.round(summary.revenuePaiseThisMonth / 100) : null;

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-navy-900 via-navy-850 to-brand-900 p-6 sm:p-8 text-white shadow-lg border border-navy-800">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-brand-600/20 to-transparent pointer-events-none"></div>
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-brand-500/20 text-cyan-300 text-[11px] font-semibold mb-2 border border-brand-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Organizer Portal Active</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Welcome back, {user?.name}!
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
              You have <span className="font-bold text-white">{publishedEvents.length} upcoming event{publishedEvents.length === 1 ? '' : 's'}</span> on sale
              {summary?.nextUpcomingEventName ? <> — next up: <span className="font-bold text-white">{summary.nextUpcomingEventName}</span></> : null}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <NavLink
              to="/organizer/check-in"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors"
            >
              <QrCode className="w-4 h-4" />
              <span>Live Check-in Tool</span>
            </NavLink>
            <NavLink
              to="/organizer/create-event/basic"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Host New Event</span>
            </NavLink>
          </div>
        </div>
      </div>

      {/* KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Gross Revenue"
          value={`₹${(totalRevenue).toLocaleString('en-IN')}`}
          subtitle={revenueThisMonth !== null ? `₹${revenueThisMonth.toLocaleString('en-IN')} this month` : 'Paid bookings, all events'}
          icon={CreditCard}
          iconBg="bg-blue-50 text-brand-600"
          onClick={() => navigate('/organizer/payments')}
        />
        <StatCard
          title="Total Tickets Sold"
          value={totalTicketsSold.toLocaleString('en-IN')}
          subtitle={summary ? `${summary.bookingsThisWeek} booking${summary.bookingsThisWeek === 1 ? '' : 's'} this week` : 'Across all events'}
          icon={Ticket}
          iconBg="bg-emerald-50 text-emerald-600"
          onClick={() => navigate('/organizer/tickets')}
        />
        <StatCard
          title="Live Verified Check-Ins"
          value={totalCheckedIn}
          subtitle={totalTicketsSold > 0 ? `of ${totalTicketsSold.toLocaleString('en-IN')} tickets (${Math.round((totalCheckedIn / totalTicketsSold) * 100)}%)` : 'No tickets sold yet'}
          icon={QrCode}
          iconBg="bg-cyan-50 text-cyan-600"
          onClick={() => navigate('/organizer/check-in')}
        />
        <StatCard
          title="Active Hosted Events"
          value={publishedEvents.length}
          subtitle={`${events.filter(e => e.status === 'draft').length} drafts in progress`}
          icon={Calendar}
          iconBg="bg-purple-50 text-purple-600"
          onClick={() => navigate('/organizer/events')}
        />
      </div>

      {/* Two Column Section: Active Events & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Featured Events Spotlight */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Featured Active Events</h2>
            <NavLink to="/organizer/events" className="text-xs font-semibold text-brand-600 hover:underline flex items-center gap-1">
              <span>View All Events ({events.length})</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </NavLink>
          </div>

          <div className="space-y-3">
            {events.slice(0, 3).map((event) => {
              const capacityPercent = Math.min(100, Math.round((event.ticketsSold / (event.totalCapacity || 1)) * 100));

              return (
                <div
                  key={event.id}
                  className="bg-white rounded-xl p-4 sm:p-5 border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5">
                    <img
                      src={event.bannerImage}
                      alt={event.title}
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg object-cover shrink-0 border border-slate-100 shadow-xs"
                    />
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <StatusBadge status={event.status} />
                        <span className="text-[11px] text-slate-400 font-medium">{event.category}</span>
                      </div>
                      <h3
                        onClick={() => navigate(`/organizer/events/${event.id}/dashboard`)}
                        className="text-sm font-bold text-slate-900 hover:text-brand-600 cursor-pointer line-clamp-1"
                      >
                        {event.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1.5">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{event.startDate} • {event.startTime}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span>{event.city || event.venueName || 'Venue not set'}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Progress & Quick Actions */}
                  <div className="w-full sm:w-48 shrink-0 flex flex-col justify-end">
                    <div className="flex items-center justify-between text-xs mb-1 font-semibold">
                      <span className="text-slate-600">Sales Capacity</span>
                      <span className="text-slate-900">{event.ticketsSold} / {event.totalCapacity} ({capacityPercent}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden mb-3">
                      <div
                        className="bg-brand-600 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${capacityPercent}%` }}
                      ></div>
                    </div>
                    <div className="flex items-center gap-2">
                      <NavLink
                        to={`/organizer/events/${event.id}/dashboard`}
                        className="flex-1 text-center py-1.5 px-2 text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-md border border-slate-200 transition-colors"
                      >
                        Manage
                      </NavLink>
                      <NavLink
                        to={`/organizer/events/${event.id}/preview`}
                        className="p-1.5 text-slate-500 hover:text-brand-600 hover:bg-slate-50 rounded-md border border-slate-200"
                        title="Customer Preview"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </NavLink>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 1 Col: Recent Bookings Feed & Quick Links */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Recent Bookings</h2>
            <NavLink to="/organizer/bookings" className="text-xs font-semibold text-brand-600 hover:underline">
              View All
            </NavLink>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs divide-y divide-slate-100">
            {bookings.slice(0, 4).map((booking) => (
              <div key={booking.id} className="p-3.5 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-slate-900 truncate">{booking.customerName}</p>
                    <StatusBadge status={booking.bookingStatus} />
                  </div>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">{booking.eventName}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{booking.bookingDate} • {booking.ticketsCount} tickets</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-bold text-slate-900">₹{booking.amount.toLocaleString('en-IN')}</span>
                  <p className="text-[10px] text-emerald-600 font-semibold uppercase">{booking.paymentStatus}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Tools Shortcuts Banner */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 rounded-xl p-4 border border-blue-100 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-600" />
              <h3 className="text-xs font-bold text-slate-900">Organizer Quick Station</h3>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Launch real-time attendee admissions, issue refunds, or export manifest reports.
            </p>
            <div className="pt-1 flex flex-wrap items-center gap-2">
              <NavLink
                to="/organizer/check-in"
                className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-800"
              >
                <span>Launch QR Check-In</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </NavLink>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
