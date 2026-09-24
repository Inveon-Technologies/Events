import React, { useState, useEffect, useCallback } from 'react';
import { useParams, NavLink } from 'react-router-dom';
import { Search, Download, QrCode } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { apiRequest, ApiError } from '../../lib/api';
import { downloadCsv, ATTENDEE_CSV_COLUMNS } from '../../lib/csv';
import { useEvents } from '../../context/EventsContext';
import StatusBadge from '../../components/common/StatusBadge';
import EventLookupState from '../../components/common/EventLookupState';

function EventParticipantsContent({ event }) {
  const { user } = useAuth();
  const { showToast } = useNotifications();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCheckIn, setFilterCheckIn] = useState('all');
  const [actioningId, setActioningId] = useState(null);

  // Every real ticket issued for this event (one row per attendee), with
  // its live check-in status — previously a mock roster with invented
  // emergency contacts, blood groups and pickup points.
  const load = useCallback(async () => {
    try {
      const res = await apiRequest(`/organizer/tickets?eventId=${event.id}`, { token: user?.token });
      setData(res);
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load attendees.');
    }
  }, [event.id, user?.token]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCheckIn(ticket) {
    setActioningId(ticket.id);
    try {
      await apiRequest(`/organizer/events/${event.id}/checkin/ticket/${ticket.id}`, { method: 'POST', token: user?.token });
      showToast(`${ticket.attendeeName} checked in`, 'success');
      await load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not check in this attendee.', 'error');
    } finally {
      setActioningId(null);
    }
  }

  async function handleUndo(ticket) {
    setActioningId(ticket.id);
    try {
      await apiRequest(`/organizer/events/${event.id}/checkin/${ticket.id}/undo`, { method: 'POST', token: user?.token });
      showToast('Check-in undone', 'success');
      await load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not undo the check-in.', 'error');
    } finally {
      setActioningId(null);
    }
  }

  const tickets = data?.tickets ?? [];
  const filtered = tickets.filter((t) => {
    if (filterCheckIn !== 'all' && t.status !== filterCheckIn) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (![t.attendeeName, t.customerEmail, t.customerPhone, t.bookingReference].some((v) => v?.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            Attendee Roster & Check-ins — {event.title}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Every ticket issued for this event, with live check-in status.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={filtered.length === 0}
            onClick={() => downloadCsv(`attendees-${event.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`, ATTENDEE_CSV_COLUMNS, filtered)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 shadow-xs disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <NavLink
            to="/organizer/check-in"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Open QR Scanner</span>
          </NavLink>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-slate-200 pb-2">
        <NavLink to={`/organizer/events/${event.id}/dashboard`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Event Overview</NavLink>
        <NavLink to={`/organizer/events/${event.id}/bookings`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Bookings</NavLink>
        <NavLink to={`/organizer/events/${event.id}/participants`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-brand-600 text-white">Attendee Roster ({tickets.length})</NavLink>
        <NavLink to={`/organizer/events/${event.id}/payments`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Financials</NavLink>
        <NavLink to={`/organizer/events/${event.id}/tickets`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Ticket Tiers</NavLink>
      </div>

      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {[
            ['Total tickets', data.counts.all],
            ['Checked in', data.counts.checked_in],
            ['Not yet arrived', data.counts.valid],
            ['Cancelled', data.counts.cancelled],
          ].map(([label, value]) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-3">
              <p className="text-slate-500">{label}</p>
              <p className="text-lg font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search name, email, phone or booking ID"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <select
            value={filterCheckIn}
            onChange={(e) => setFilterCheckIn(e.target.value)}
            aria-label="Filter by check-in status"
            className="py-1.5 px-3 text-xs bg-white border border-slate-200 rounded-lg"
          >
            <option value="all">All statuses</option>
            <option value="checked_in">Checked in</option>
            <option value="valid">Not yet checked in</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {loadError ? (
          <p className="p-6 text-xs text-rose-600">{loadError}</p>
        ) : !data ? (
          <p className="p-6 text-xs text-slate-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-xs text-slate-500">{tickets.length === 0 ? 'No tickets have been booked for this event yet.' : 'No attendees match this filter.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/60 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Attendee</th>
                  <th className="py-3 px-4">Contact (booking)</th>
                  <th className="py-3 px-4">Ticket</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Check-in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900">{t.attendeeName}</td>
                    <td className="py-3.5 px-4">
                      <p className="text-slate-700">{t.customerEmail}</p>
                      <p className="text-[11px] text-slate-500">{t.customerPhone}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-800">{t.tierName}</div>
                      <div className="font-mono text-brand-600 text-[11px] mt-0.5">{t.bookingReference}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={t.status === 'valid' ? 'confirmed' : t.status} />
                      {t.checkedInAt && (
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          {new Date(t.checkedInAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {t.status === 'checked_in' ? (
                        <button
                          type="button"
                          disabled={actioningId === t.id}
                          onClick={() => handleUndo(t)}
                          className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded font-bold text-[11px] disabled:opacity-50"
                        >
                          Undo
                        </button>
                      ) : t.status === 'cancelled' ? (
                        <span className="text-slate-400 text-xs italic">Cancelled</span>
                      ) : (
                        <button
                          type="button"
                          disabled={actioningId === t.id}
                          onClick={() => handleCheckIn(t)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-xs shadow-xs disabled:opacity-50"
                        >
                          Check In
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EventParticipants() {
  const { id } = useParams();
  const { events, eventsLoaded, eventsLoadError } = useEvents();
  const event = events.find((e) => e.id === id);
  if (!event) return <EventLookupState loaded={eventsLoaded} error={eventsLoadError} />;
  return <EventParticipantsContent event={event} />;
}
