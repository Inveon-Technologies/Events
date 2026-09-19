import React, { useState } from 'react';
import { useParams, NavLink } from 'react-router-dom';
import { Search, Filter, Download, QrCode, CheckCircle2, XCircle, Phone, Mail, UserCheck, ShieldAlert } from 'lucide-react';
import { useEvents } from '../../context/EventsContext';
import StatusBadge from '../../components/common/StatusBadge';

export default function EventParticipants() {
  const { id } = useParams();
  const { events, participants, checkInParticipant, undoCheckIn } = useEvents();

  const eventId = id || 'rajgad-sunrise-trek';
  const event = events.find((e) => e.id === eventId) || events[0];

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCheckIn, setFilterCheckIn] = useState('all');

  const eventParticipants = participants.filter((p) => p.eventId === event.id);

  const filtered = eventParticipants.filter((p) => {
    if (filterCheckIn !== 'all' && p.checkInStatus !== filterCheckIn) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchName = p.fullName.toLowerCase().includes(q);
      const matchCode = p.ticketCode.toLowerCase().includes(q);
      const matchEmail = p.email.toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchEmail) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            Attendee Roster & Check-ins — {event.title}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Verify attendee identities, emergency contacts, medical/dietary notes, and live check-in statuses.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <NavLink
            to="/organizer/check-in"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Open QR Scanner</span>
          </NavLink>
        </div>
      </div>

      {/* Sub Navigation Bar for this event */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-slate-200 pb-2">
        <NavLink to={`/organizer/events/${event.id}/dashboard`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Event Overview</NavLink>
        <NavLink to={`/organizer/events/${event.id}/bookings`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Bookings</NavLink>
        <NavLink to={`/organizer/events/${event.id}/participants`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-brand-600 text-white">Attendee Roster ({eventParticipants.length})</NavLink>
        <NavLink to={`/organizer/events/${event.id}/payments`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Financials</NavLink>
        <NavLink to={`/organizer/events/${event.id}/tickets`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Ticket Tiers</NavLink>
      </div>

      {/* Roster Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, ticket code (INV-...)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <select
              value={filterCheckIn}
              onChange={(e) => setFilterCheckIn(e.target.value)}
              className="py-1.5 px-3 text-xs bg-white border border-slate-200 rounded-lg"
            >
              <option value="all">All Check-In Statuses</option>
              <option value="checked_in">Checked In</option>
              <option value="confirmed">Not Yet Checked In</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/60 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Attendee</th>
                <th className="py-3 px-4">Ticket Pass & Code</th>
                <th className="py-3 px-4">Emergency & Health</th>
                <th className="py-3 px-4">Pickup Point</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Quick Check-in</th>
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
                          className="w-8 h-8 rounded-full object-cover shrink-0"
                        />
                        <div>
                          <p className="font-bold text-slate-900">{p.fullName}</p>
                          <p className="text-[11px] text-slate-500">{p.email}</p>
                          <p className="text-[10px] text-slate-400">{p.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-800">{p.tierName}</div>
                      <div className="font-mono text-brand-600 text-[11px] mt-0.5">{p.ticketCode}</div>
                      <div className="text-[10px] text-slate-400 font-mono">Order: {p.bookingId}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-slate-700">
                        {p.emergencyContactName ? (
                          <>
                            <span className="font-semibold">{p.emergencyContactName}</span>
                            <span className="text-[11px] text-slate-500 block">{p.emergencyContactPhone}</span>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        {p.bloodGroup && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.2 bg-rose-50 text-rose-700 rounded text-[10px] font-bold border border-rose-200">
                            Blood: {p.bloodGroup}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 font-medium">
                      {p.pickupLocation || 'Direct Base Arrival'}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={p.checkInStatus} />
                      {p.checkInTime && (
                        <span className="text-[10px] text-slate-400 block mt-0.5">{p.checkInTime}</span>
                      )}
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
