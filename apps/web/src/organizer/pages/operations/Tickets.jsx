import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Ticket, Search, Filter, QrCode, Download, UserCheck, ShieldCheck, Eye, ExternalLink, FileSpreadsheet } from 'lucide-react';
import { useEvents } from '../../context/EventsContext';
import StatusBadge from '../../components/common/StatusBadge';
import Tabs from '../../components/common/Tabs';
import Modal from '../../components/common/Modal';

export default function Tickets() {
  const { participants, events, bookings, checkInParticipant, undoCheckIn } = useEvents();
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEventId, setSelectedEventId] = useState('all');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [selectedBookingModal, setSelectedBookingModal] = useState(null);

  const tabs = [
    { id: 'all', label: 'All Issued Tickets', count: participants.length },
    { id: 'confirmed', label: 'Confirmed (Valid)', count: participants.filter(p => p.checkInStatus === 'confirmed').length },
    { id: 'checked_in', label: 'Checked In', count: participants.filter(p => p.checkInStatus === 'checked_in').length },
    { id: 'cancelled', label: 'Cancelled', count: participants.filter(p => p.checkInStatus === 'cancelled').length },
  ];

  const filtered = participants.filter((p) => {
    if (activeTab !== 'all' && p.checkInStatus !== activeTab) return false;
    if (selectedEventId !== 'all' && p.eventId !== selectedEventId) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchName = p.fullName?.toLowerCase().includes(q);
      const matchCode = p.ticketCode?.toLowerCase().includes(q);
      const matchEmail = p.email?.toLowerCase().includes(q);
      const matchEvent = p.eventName?.toLowerCase().includes(q);
      const matchOrder = p.bookingId?.toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchEmail && !matchEvent && !matchOrder) return false;
    }
    return true;
  });

  const handleOpenBooking = (bookingId) => {
    const b = bookings.find(b => b.id === bookingId);
    if (b) {
      setSelectedBookingModal(b);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Tickets Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            Browse and manage all individual issued tickets, Order / Booking references, QR passes, and check-in statuses.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <NavLink
            to="/organizer/check-in"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs"
          >
            <QrCode className="w-4 h-4" />
            <span>Launch Live Check-in</span>
          </NavLink>
        </div>
      </div>

      {/* Info Callout */}
      <div className="flex items-center gap-3 bg-blue-50/90 border border-blue-100 p-3.5 rounded-xl text-xs text-blue-900">
        <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 font-bold text-[11px]">
          i
        </div>
        <p>
          Each ticket is uniquely tied to an <strong>Order / Booking ID</strong> and includes a unique secure QR code for gate check-in verification.
        </p>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
          <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-72">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search ticket code, Order ID (BK-...), holder..."
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
              {events.map((e) => (
                <option key={e.id} value={e.id}>{e.title}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/60 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Ticket ID / Code</th>
                <th className="py-3 px-4">Order / Booking ID</th>
                <th className="py-3 px-4">Participant Holder</th>
                <th className="py-3 px-4">Event</th>
                <th className="py-3 px-4">Ticket Tier</th>
                <th className="py-3 px-4">Price</th>
                <th className="py-3 px-4">QR Code</th>
                <th className="py-3 px-4">Check-In Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No tickets found matching your search.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const isCheckedIn = p.checkInStatus === 'checked_in';

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Ticket Code */}
                      <td className="py-3.5 px-4 font-mono font-bold text-brand-600">
                        {p.ticketCode}
                      </td>

                      {/* Order ID / Booking ID */}
                      <td className="py-3.5 px-4 font-mono font-semibold">
                        <button
                          onClick={() => handleOpenBooking(p.bookingId)}
                          className="text-brand-600 hover:text-brand-800 hover:underline flex items-center gap-1 font-bold text-xs"
                          title="Click to view full Order details"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-brand-500" />
                          <span>{p.bookingId || 'N/A'}</span>
                        </button>
                      </td>

                      {/* Participant */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={p.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80"}
                            alt={p.fullName}
                            className="w-7 h-7 rounded-full object-cover"
                          />
                          <div>
                            <div className="font-bold text-slate-900">{p.fullName}</div>
                            <div className="text-[10px] text-slate-500">{p.phone || p.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Event */}
                      <td className="py-3.5 px-4">
                        <NavLink to={`/organizer/events/${p.eventId}/dashboard`} className="font-bold text-slate-900 hover:text-brand-600 line-clamp-1 max-w-xs">
                          {p.eventName}
                        </NavLink>
                      </td>

                      {/* Tier Pass */}
                      <td className="py-3.5 px-4 font-medium text-slate-800">
                        {p.tierName}
                      </td>

                      {/* Price */}
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        ₹{p.tierPrice}
                      </td>

                      {/* View QR Button */}
                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => setSelectedTicket(p)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-md transition-colors"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>View QR</span>
                        </button>
                      </td>

                      {/* Check-In Status */}
                      <td className="py-3.5 px-4">
                        <StatusBadge status={p.checkInStatus} />
                        {p.checkInTime && <span className="text-[10px] text-slate-400 block mt-0.5">{p.checkInTime}</span>}
                      </td>

                      {/* Quick Actions */}
                      <td className="py-3.5 px-4 text-right">
                        {isCheckedIn ? (
                          <button
                            onClick={() => undoCheckIn(p.id)}
                            className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded font-bold text-[11px]"
                          >
                            Undo Check-in
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
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ticket QR Modal */}
      {selectedTicket && (
        <Modal
          isOpen={!!selectedTicket}
          onClose={() => setSelectedTicket(null)}
          title={`Ticket Pass: ${selectedTicket.ticketCode}`}
          maxWidth="max-w-md"
        >
          <div className="space-y-4 text-center">
            <div className="p-6 bg-navy-950 rounded-2xl flex flex-col items-center justify-center text-white border-2 border-dashed border-brand-500/60 shadow-inner">
              <QrCode className="w-36 h-36 text-cyan-400" />
              <p className="mt-3 font-mono font-black text-sm text-cyan-300 tracking-wider">
                {selectedTicket.ticketCode}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Order Ref: {selectedTicket.bookingId}</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-left text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Attendee Name:</span>
                <span className="font-bold text-slate-900">{selectedTicket.fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Order / Booking ID:</span>
                <button
                  onClick={() => {
                    const b = bookings.find(b => b.id === selectedTicket.bookingId);
                    setSelectedTicket(null);
                    if (b) setSelectedBookingModal(b);
                  }}
                  className="font-bold text-brand-600 hover:underline font-mono"
                >
                  {selectedTicket.bookingId} →
                </button>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Event:</span>
                <span className="font-bold text-slate-900">{selectedTicket.eventName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Pass Type:</span>
                <span className="font-semibold text-slate-800">{selectedTicket.tierName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Check-In Status:</span>
                <StatusBadge status={selectedTicket.checkInStatus} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setSelectedTicket(null)}
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg"
              >
                Close Ticket
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Order / Booking Details Modal */}
      {selectedBookingModal && (
        <Modal
          isOpen={!!selectedBookingModal}
          onClose={() => setSelectedBookingModal(null)}
          title={`Order Details: ${selectedBookingModal.id}`}
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div>
                <span className="text-slate-400 font-medium">Order / Booking ID:</span>
                <p className="font-mono font-bold text-brand-600 text-base mt-0.5">{selectedBookingModal.id}</p>
                <p className="text-slate-500 mt-1">Booked on: {selectedBookingModal.bookingDate}</p>
              </div>
              <div>
                <span className="text-slate-400 font-medium">Customer:</span>
                <p className="font-bold text-slate-900 text-sm mt-0.5">{selectedBookingModal.customerName}</p>
                <p className="text-slate-600">{selectedBookingModal.customerEmail}</p>
                <p className="text-slate-600">{selectedBookingModal.customerPhone}</p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-600">Event Name:</span>
                <span className="font-bold text-slate-900">{selectedBookingModal.eventName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Tickets Purchased:</span>
                <span className="font-semibold text-slate-800">{selectedBookingModal.ticketsCount}x {selectedBookingModal.tierName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Total Order Amount:</span>
                <span className="font-bold text-slate-900 text-sm">₹{selectedBookingModal.amount.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                <span className="text-slate-600">Payment Status:</span>
                <StatusBadge status={selectedBookingModal.paymentStatus} />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Order Status:</span>
                <StatusBadge status={selectedBookingModal.bookingStatus} />
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t">
              <button
                onClick={() => setSelectedBookingModal(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
