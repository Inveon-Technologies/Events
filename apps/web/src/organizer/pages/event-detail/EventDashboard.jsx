import React, { useEffect, useState } from 'react';
import { useParams, NavLink, useNavigate } from 'react-router-dom';
import {
  Calendar,
  MapPin,
  Users,
  Ticket,
  CreditCard,
  QrCode,
  ExternalLink,
  Edit,
  XCircle
} from 'lucide-react';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';
import { useEvents } from '../../context/EventsContext';
import EventLookupState from '../../components/common/EventLookupState';
import EventGalleryCard from '../../components/EventGalleryCard';
import UserAvatar from '../../components/common/UserAvatar';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../lib/api';

function formatRupees(paise) {
  return `₹${Math.round((paise || 0) / 100).toLocaleString('en-IN')}`;
}

function EventDashboardContent({ event }) {
  const { bookings, cancelEvent } = useEvents();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Everything on this page comes from the real API: the event's tiers
  // (with real sold counts), its tickets (check-ins and recent arrivals)
  // and its financials. Previously the tier list was always empty (the
  // events list never carries tiers), check-ins came from a mock roster,
  // and "Average order: ₹2,450" was hardcoded.
  const [detail, setDetail] = useState(null);
  const [ticketData, setTicketData] = useState(null);
  const [financials, setFinancials] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const token = user?.token;
    Promise.allSettled([
      apiRequest(`/organizer/events/${event.id}`, { token }),
      apiRequest(`/organizer/tickets?eventId=${event.id}`, { token }),
      apiRequest(`/organizer/events/${event.id}/financials`, { token }),
    ]).then(([d, t, f]) => {
      if (cancelled) return;
      if (d.status === 'fulfilled') setDetail(d.value);
      if (t.status === 'fulfilled') setTicketData(t.value);
      if (f.status === 'fulfilled') setFinancials(f.value);
    });
    return () => {
      cancelled = true;
    };
  }, [event.id, user?.token]);

  const eventBookings = bookings.filter((b) => b.eventId === event.id);
  const paidBookings = eventBookings.filter((b) => b.amount > 0 && b.bookingStatus !== 'cancelled');
  const averageOrder = paidBookings.length ? paidBookings.reduce((sum, b) => sum + b.amount, 0) / paidBookings.length : 0;
  const ticketsSold = event.ticketsSold;
  const checkedInCount = ticketData?.counts?.checked_in ?? event.checkedInCount ?? 0;
  const capacityPercent = Math.min(100, Math.round((ticketsSold / (event.totalCapacity || 1)) * 100));
  const checkInPercent = ticketsSold > 0 ? Math.round((checkedInCount / ticketsSold) * 100) : 0;
  const recentCheckIns = (Array.isArray(ticketData?.tickets) ? ticketData.tickets : [])
    .filter((t) => t.status === 'checked_in')
    .sort((a, b) => (b.checkedInAt || '').localeCompare(a.checkedInAt || ''))
    .slice(0, 5);
  const tiers = Array.isArray(detail?.ticketTiers) ? detail.ticketTiers : [];

  return (
    <div className="space-y-6">
      {/* Event Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <img
            src={event.bannerImage}
            alt={event.title}
            className="w-20 h-20 rounded-xl object-cover ring-1 ring-slate-200 shrink-0"
          />
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <StatusBadge status={event.status} />
              <span className="text-xs text-slate-400 font-semibold">{event.category}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{event.title}</h1>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-2">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>{event.startDate} • {event.startTime}</span>
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>{[event.venueName, event.city].filter(Boolean).join(', ') || 'Venue not set'}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <NavLink
            to="/organizer/check-in"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs"
          >
            <QrCode className="w-4 h-4" />
            <span>Launch Check-in</span>
          </NavLink>
          <NavLink
            to={`/organizer/events/${event.id}/preview`}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Public Preview</span>
          </NavLink>
          {event.status !== 'cancelled' && (
            <NavLink
              to={`/organizer/events/${event.id}/edit/basic`}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200"
            >
              <Edit className="w-3.5 h-3.5" />
              <span>Edit Event</span>
            </NavLink>
          )}
          {event.status !== 'cancelled' && (
            <button
              type="button"
              onClick={() => {
                const reason = window.prompt(`Why are you cancelling "${event.title}"? This will refund every confirmed booking in full.`);
                if (reason && reason.trim()) {
                  cancelEvent(event.id, reason.trim());
                }
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold border border-rose-200"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Cancel Event</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub Navigation Bar for this event */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-slate-200 pb-2">
        <NavLink
          to={`/organizer/events/${event.id}/dashboard`}
          className={({ isActive }) =>
            `px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              isActive ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`
          }
        >
          Event Overview
        </NavLink>
        <NavLink
          to={`/organizer/events/${event.id}/bookings`}
          className={({ isActive }) =>
            `px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              isActive ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`
          }
        >
          Bookings ({eventBookings.length})
        </NavLink>
        <NavLink
          to={`/organizer/events/${event.id}/participants`}
          className={({ isActive }) =>
            `px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              isActive ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`
          }
        >
          Attendee Roster ({ticketsSold})
        </NavLink>
        <NavLink
          to={`/organizer/events/${event.id}/payments`}
          className={({ isActive }) =>
            `px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              isActive ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`
          }
        >
          Financials & Payout
        </NavLink>
        <NavLink
          to={`/organizer/events/${event.id}/tickets`}
          className={({ isActive }) =>
            `px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              isActive ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`
          }
        >
          Ticket Tiers ({event.ticketTiers?.length || 0})
        </NavLink>
        <NavLink
          to={`/organizer/events/${event.id}/certificate`}
          className={({ isActive }) =>
            `px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              isActive ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`
          }
        >
          Certificate
        </NavLink>
      </div>

      {/* Post-event photos & videos link — near the top so it's easy to find once the event is over */}
      <EventGalleryCard eventId={event.id} eventDate={`${event.startDate}T${event.startTime || '00:00'}:00+05:30`} />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Gross Ticket Revenue"
          value={`₹${(event.grossRevenue || 0).toLocaleString('en-IN')}`}
          subtitle={financials ? `Your payout: ${formatRupees(financials.netPayoutPaise)} after ${financials.platformFeePercent}% fee` : 'Paid bookings only'}
          icon={CreditCard}
          iconBg="bg-blue-50 text-brand-600"
          onClick={() => navigate(`/organizer/events/${event.id}/payments`)}
        />
        <StatCard
          title="Capacity Filled"
          value={`${ticketsSold} / ${event.totalCapacity}`}
          subtitle={`${capacityPercent}% total allocation`}
          icon={Ticket}
          iconBg="bg-purple-50 text-purple-600"
          onClick={() => navigate(`/organizer/events/${event.id}/tickets`)}
        />
        <StatCard
          title="Live Verified Attendees"
          value={`${checkedInCount} / ${ticketsSold}`}
          subtitle={`${checkInPercent}% checked in`}
          icon={QrCode}
          iconBg="bg-emerald-50 text-emerald-600"
          onClick={() => navigate('/organizer/check-in')}
        />
        <StatCard
          title="Total Orders / Bookings"
          value={eventBookings.length}
          subtitle={paidBookings.length ? `Average paid order: ₹${Math.round(averageOrder).toLocaleString('en-IN')}` : 'No paid orders yet'}
          icon={Users}
          iconBg="bg-cyan-50 text-cyan-600"
          onClick={() => navigate(`/organizer/events/${event.id}/bookings`)}
        />
      </div>

      {/* Two Column Workspace Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Ticket Tiers Progress & Details */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Tier Breakdown & Capacities</h3>
              <NavLink to={`/organizer/events/${event.id}/tickets`} className="text-xs text-brand-600 font-bold hover:underline">
                Manage Tiers →
              </NavLink>
            </div>

            <div className="space-y-4">
              {!detail && <p className="text-xs text-slate-400">Loading tiers…</p>}
              {detail && tiers.length === 0 && <p className="text-xs text-slate-500">No ticket tiers yet.</p>}
              {tiers.map((tier) => {
                const tierPercent = tier.quantity > 0 ? Math.round((tier.sold / tier.quantity) * 100) : 0;
                return (
                  <div key={tier.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-slate-900">{tier.name}</h4>
                          <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border">
                            ₹{tier.price}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">{tier.description}</p>
                      </div>
                      <span className="text-xs font-bold text-slate-800 shrink-0">
                        {tier.sold} / {tier.quantity} ({tierPercent}%)
                      </span>
                    </div>

                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full ${tierPercent >= 100 ? 'bg-amber-500' : 'bg-brand-600'}`}
                        style={{ width: `${tierPercent}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right 1 Col: Quick Roster Activity */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Recent Checked-in Attendees</h3>
              <NavLink to={`/organizer/events/${event.id}/participants`} className="text-xs text-brand-600 font-bold hover:underline">
                View All
              </NavLink>
            </div>

            <div className="divide-y divide-slate-100">
              {!ticketData && <p className="py-3 text-xs text-slate-400">Loading…</p>}
              {ticketData && recentCheckIns.length === 0 && (
                <p className="py-3 text-xs text-slate-500">No one has checked in yet.</p>
              )}
              {recentCheckIns.map((t) => (
                <div key={t.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <UserAvatar name={t.attendeeName} className="w-8 h-8 text-[11px]" />
                    <div>
                      <p className="text-xs font-bold text-slate-900">{t.attendeeName}</p>
                      <p className="text-[10px] text-slate-500">
                        {t.tierName} · {new Date(t.checkedInAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status="checked_in" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EventDashboard() {
  const { id } = useParams();
  const { events, eventsLoaded, eventsLoadError } = useEvents();
  const event = events.find((e) => e.id === id);
  if (!event) return <EventLookupState loaded={eventsLoaded} error={eventsLoadError} />;
  return <EventDashboardContent event={event} />;
}
