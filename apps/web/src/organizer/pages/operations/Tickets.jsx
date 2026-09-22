import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { QrCode, Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { apiRequest, ApiError } from '../../lib/api';
import StatusBadge from '../../components/common/StatusBadge';
import Tabs from '../../components/common/Tabs';

export default function Tickets() {
  const { user } = useAuth();
  const { showToast } = useNotifications();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEventId, setSelectedEventId] = useState('all');
  const [actioningId, setActioningId] = useState(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest('/organizer/tickets', { token: user?.token });
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load tickets.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUndo(ticket) {
    setActioningId(ticket.id);
    try {
      await apiRequest(`/organizer/events/${ticket.eventId}/checkin/${ticket.id}/undo`, { method: 'POST', token: user?.token });
      showToast('Check-in undone.');
      await load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not undo check-in.');
    } finally {
      setActioningId(null);
    }
  }

  if (loading) return <p className="text-xs text-slate-500">Loading…</p>;
  if (error || !data) return <p className="text-xs text-red-600">{error || 'Could not load tickets.'}</p>;

  const tabs = [
    { id: 'all', label: 'All Issued Tickets', count: data.counts.all },
    { id: 'valid', label: 'Confirmed (Valid)', count: data.counts.valid },
    { id: 'checked_in', label: 'Checked In', count: data.counts.checked_in },
    { id: 'cancelled', label: 'Cancelled', count: data.counts.cancelled },
  ];

  const filtered = data.tickets.filter((t) => {
    if (activeTab !== 'all' && t.status !== activeTab) return false;
    if (selectedEventId !== 'all' && t.eventId !== selectedEventId) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matches = [t.attendeeName, t.customerEmail, t.eventName, t.bookingReference].some((v) => v?.toLowerCase().includes(q));
      if (!matches) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Tickets Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            Real issued tickets across your events, with real Order/Booking references and check-in status.
          </p>
        </div>

        <NavLink
          to="/organizer/check-in"
          className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs"
        >
          <QrCode className="w-4 h-4" />
          <span>Launch Live Check-in</span>
        </NavLink>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
          <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-72">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search name, email, Order ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="py-1.5 px-3 text-xs bg-white border border-slate-200 rounded-lg"
            >
              <option value="all">All Events</option>
              {data.organizerEvents.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/60 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Order / Booking Ref</th>
                <th className="py-3 px-4">Attendee</th>
                <th className="py-3 px-4">Event</th>
                <th className="py-3 px-4">Tier</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">No tickets found matching your search.</td>
                </tr>
              ) : filtered.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-bold text-brand-600">{t.bookingReference}</td>
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-900">{t.attendeeName}</div>
                    <div className="text-[10px] text-slate-500">{t.customerEmail}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <NavLink to={`/organizer/events/${t.eventId}/dashboard`} className="font-bold text-slate-900 hover:text-brand-600 line-clamp-1 max-w-xs">
                      {t.eventName}
                    </NavLink>
                  </td>
                  <td className="py-3.5 px-4 font-medium text-slate-800">{t.tierName}</td>
                  <td className="py-3.5 px-4">
                    <StatusBadge status={t.status} />
                    {t.checkedInAt && (
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        {new Date(t.checkedInAt).toLocaleString('en-IN')}
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {t.status === 'checked_in' ? (
                      <button
                        onClick={() => handleUndo(t)}
                        disabled={actioningId === t.id}
                        className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded font-bold text-[11px] disabled:opacity-60"
                      >
                        {actioningId === t.id ? '…' : 'Undo'}
                      </button>
                    ) : t.status === 'cancelled' ? (
                      <span className="text-slate-400 text-xs italic">Cancelled</span>
                    ) : (
                      <span className="text-slate-400 text-xs italic">Not checked in</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
