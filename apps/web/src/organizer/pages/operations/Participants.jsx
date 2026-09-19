import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Users, Search, Download, QrCode, Phone, Mail, CheckCircle2 } from 'lucide-react';
import { useEvents } from '../../context/EventsContext';
import StatusBadge from '../../components/common/StatusBadge';

export default function Participants() {
  const { participants, events, checkInParticipant, undoCheckIn } = useEvents();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEventId, setSelectedEventId] = useState('all');

  const filtered = participants.filter((p) => {
    if (selectedEventId !== 'all' && p.eventId !== selectedEventId) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchName = p.fullName.toLowerCase().includes(q);
      const matchCode = p.ticketCode.toLowerCase().includes(q);
      const matchEmail = p.email.toLowerCase().includes(q);
      const matchEvent = p.eventName.toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchEmail && !matchEvent) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Global Attendees Directory</h1>
          <p className="text-xs text-slate-500 mt-1">
            Complete roster of all participants across all your hosted experiences with contact details and check-in statuses.
          </p>
        </div>

        <button
          onClick={() => alert('Exporting participant roster to CSV...')}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 shadow-xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Attendee List (CSV)</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search participant name, email, code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="py-1.5 px-3 text-xs bg-white border border-slate-200 rounded-lg"
            >
              <option value="all">All Events</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>{e.title}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/60 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Participant Details</th>
                <th className="py-3 px-4">Event Name</th>
                <th className="py-3 px-4">Ticket Pass</th>
                <th className="py-3 px-4">Pickup Point</th>
                <th className="py-3 px-4">Check-in Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p) => {
                const isCheckedIn = p.checkInStatus === 'checked_in';

                return (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={p.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80"}
                          alt={p.fullName}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                        <div>
                          <p className="font-bold text-slate-900">{p.fullName}</p>
                          <p className="text-[11px] text-slate-500">{p.email} • {p.phone}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-mono text-[10px] text-brand-600 font-semibold">{p.ticketCode}</span>
                            <span className="text-[10px] text-slate-400">•</span>
                            <span className="font-mono text-[10px] text-slate-500 font-medium">Order: {p.bookingId}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <NavLink to={`/organizer/events/${p.eventId}/dashboard`} className="font-bold text-slate-900 hover:text-brand-600">
                        {p.eventName}
                      </NavLink>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-800">
                      {p.tierName}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {p.pickupLocation || 'Direct Base Arrival'}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={p.checkInStatus} />
                      {p.checkInTime && <span className="text-[10px] text-slate-400 block mt-0.5">{p.checkInTime}</span>}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {isCheckedIn ? (
                        <button
                          onClick={() => undoCheckIn(p.id)}
                          className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded font-bold text-[11px]"
                        >
                          Undo
                        </button>
                      ) : p.checkInStatus === 'cancelled' ? (
                        <span className="text-slate-400 text-xs italic">Cancelled</span>
                      ) : (
                        <button
                          onClick={() => checkInParticipant(p.ticketCode)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-xs shadow-xs"
                        >
                          Check In
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
