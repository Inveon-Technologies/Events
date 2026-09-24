import React, { useState } from 'react';
import { useParams, NavLink } from 'react-router-dom';
import { Search, Filter, Download, MoreVertical, Eye, RotateCcw, CheckCircle, FileSpreadsheet } from 'lucide-react';
import { useEvents } from '../../context/EventsContext';
import StatusBadge from '../../components/common/StatusBadge';
import Modal from '../../components/common/Modal';
import EventLookupState from '../../components/common/EventLookupState';

function EventBookingsContent({ event }) {
  const { bookings, cancelBooking } = useEvents();


  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedBooking, setSelectedBooking] = useState(null);

  const eventBookings = bookings.filter((b) => b.eventId === event.id);

  const filtered = eventBookings.filter((b) => {
    if (statusFilter !== 'all' && b.bookingStatus !== statusFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchCust = b.customerName.toLowerCase().includes(q);
      const matchId = b.id.toLowerCase().includes(q);
      const matchEmail = b.customerEmail.toLowerCase().includes(q);
      if (!matchCust && !matchId && !matchEmail) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            Bookings — {event.title}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage transactions, review attendee orders, issue refunds, and export attendee manifests.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => alert('CSV Export generated!')}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Sub Navigation Bar for this event */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-slate-200 pb-2">
        <NavLink to={`/organizer/events/${event.id}/dashboard`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Event Overview</NavLink>
        <NavLink to={`/organizer/events/${event.id}/bookings`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-brand-600 text-white">Bookings ({eventBookings.length})</NavLink>
        <NavLink to={`/organizer/events/${event.id}/participants`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Attendee Roster</NavLink>
        <NavLink to={`/organizer/events/${event.id}/payments`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Financials</NavLink>
        <NavLink to={`/organizer/events/${event.id}/tickets`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Ticket Tiers</NavLink>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Filter bar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by customer name, order ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="py-1.5 px-3 text-xs bg-white border border-slate-200 rounded-lg"
            >
              <option value="all">All Booking Statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="pending">Pending Verification</option>
              <option value="cancelled">Cancelled</option>
              <option value="partially_cancelled">Partially Cancelled</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/60 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Booking ID</th>
                <th className="py-3 px-4">Customer Details</th>
                <th className="py-3 px-4">Tickets & Tier</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-bold text-brand-600">
                    {b.id}
                    <div className="text-[10px] text-slate-400 font-sans font-normal">{b.bookingDate}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-900">{b.customerName}</div>
                    <div className="text-[11px] text-slate-500">{b.customerEmail}</div>
                    <div className="text-[10px] text-slate-400">{b.customerPhone}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="font-semibold text-slate-800">{b.ticketsCount}x {b.tierName}</span>
                  </td>
                  <td className="py-3.5 px-4 font-bold text-slate-900">
                    ₹{b.amount.toLocaleString('en-IN')}
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusBadge status={b.paymentStatus} />
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusBadge status={b.bookingStatus} />
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => setSelectedBooking(b)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded text-xs transition-colors"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Booking Detail Modal */}
      {selectedBooking && (
        <Modal
          isOpen={!!selectedBooking}
          onClose={() => setSelectedBooking(null)}
          title={`Booking Details: ${selectedBooking.id}`}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100 text-xs">
              <div>
                <span className="text-slate-400 font-medium">Customer:</span>
                <p className="font-bold text-slate-900 text-sm">{selectedBooking.customerName}</p>
                <p className="text-slate-600">{selectedBooking.customerEmail}</p>
                <p className="text-slate-600">{selectedBooking.customerPhone}</p>
              </div>
              <div>
                <span className="text-slate-400 font-medium">Event:</span>
                <p className="font-bold text-slate-900">{selectedBooking.eventName}</p>
                <p className="text-slate-600">Booked: {selectedBooking.bookingDate}</p>
                <div className="mt-1 flex gap-2">
                  <StatusBadge status={selectedBooking.bookingStatus} />
                  <StatusBadge status={selectedBooking.paymentStatus} />
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-2">
              <span className="font-bold text-slate-700">Order Summary:</span>
              <div className="flex justify-between font-semibold">
                <span>{selectedBooking.ticketsCount}x {selectedBooking.tierName}</span>
                <span>₹{selectedBooking.amount}</span>
              </div>
              {selectedBooking.notes && (
                <div className="pt-2 border-t text-slate-500">
                  <strong>Notes:</strong> {selectedBooking.notes}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t">
              {selectedBooking.bookingStatus !== 'cancelled' && (
                <button
                  onClick={() => {
                    const reason = window.prompt(`Why are you cancelling this booking for ${selectedBooking.customerName}? They will be refunded in full.`);
                    if (reason && reason.trim()) {
                      cancelBooking(selectedBooking.bookingId, reason.trim());
                    }
                    setSelectedBooking(null);
                  }}
                  className="px-3.5 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold text-xs rounded-lg border border-rose-200"
                >
                  Cancel & Refund
                </button>
              )}
              <button
                onClick={() => setSelectedBooking(null)}
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

export default function EventBookings() {
  const { id } = useParams();
  const { events, eventsLoaded, eventsLoadError } = useEvents();
  const event = events.find((e) => e.id === id);
  if (!event) return <EventLookupState loaded={eventsLoaded} error={eventsLoadError} />;
  return <EventBookingsContent event={event} />;
}
