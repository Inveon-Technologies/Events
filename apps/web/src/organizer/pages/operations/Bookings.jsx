import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Search, Filter, Download, Eye, FileSpreadsheet, RotateCcw, CheckCircle2 } from 'lucide-react';
import { useEvents } from '../../context/EventsContext';
import StatusBadge from '../../components/common/StatusBadge';
import Tabs from '../../components/common/Tabs';
import Modal from '../../components/common/Modal';

export default function Bookings() {
  const { bookings, events, processRefund } = useEvents();
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEventId, setSelectedEventId] = useState('all');
  const [selectedBooking, setSelectedBooking] = useState(null);

  const tabs = [
    { id: 'all', label: 'All Bookings', count: bookings.length },
    { id: 'confirmed', label: 'Confirmed', count: bookings.filter(b => b.bookingStatus === 'confirmed').length },
    { id: 'pending', label: 'Pending', count: bookings.filter(b => b.bookingStatus === 'pending').length },
    { id: 'cancelled', label: 'Cancelled', count: bookings.filter(b => b.bookingStatus === 'cancelled').length },
    { id: 'partially_cancelled', label: 'Partially Cancelled', count: bookings.filter(b => b.bookingStatus === 'partially_cancelled').length },
  ];

  const filtered = bookings.filter((b) => {
    if (activeTab !== 'all' && b.bookingStatus !== activeTab) return false;
    if (selectedEventId !== 'all' && b.eventId !== selectedEventId) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchCust = b.customerName.toLowerCase().includes(q);
      const matchId = b.id.toLowerCase().includes(q);
      const matchEmail = b.customerEmail.toLowerCase().includes(q);
      const matchEvent = b.eventName.toLowerCase().includes(q);
      if (!matchCust && !matchId && !matchEmail && !matchEvent) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Bookings & Orders Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            Global repository of all ticket transactions, payment verifications, and order histories.
          </p>
        </div>

        <button
          onClick={() => alert('Exporting all bookings to CSV...')}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 shadow-xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Manifest (CSV)</span>
        </button>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search order ID, customer, email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="py-1.5 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none"
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
                <th className="py-3 px-4">Order ID & Date</th>
                <th className="py-3 px-4">Event</th>
                <th className="py-3 px-4">Customer Details</th>
                <th className="py-3 px-4">Quantity & Pass</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No bookings match your current filter.
                  </td>
                </tr>
              ) : (
                filtered.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-brand-600">
                      {b.id}
                      <div className="text-[10px] text-slate-400 font-sans font-normal">{b.bookingDate}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <NavLink to={`/organizer/events/${b.eventId}/dashboard`} className="font-bold text-slate-900 hover:text-brand-600">
                        {b.eventName}
                      </NavLink>
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
                        Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
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
                <p className="text-slate-600">Booked on: {selectedBooking.bookingDate}</p>
                <div className="mt-1 flex gap-2">
                  <StatusBadge status={selectedBooking.bookingStatus} />
                  <StatusBadge status={selectedBooking.paymentStatus} />
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-2">
              <span className="font-bold text-slate-700">Order Information:</span>
              <div className="flex justify-between font-semibold">
                <span>{selectedBooking.ticketsCount}x {selectedBooking.tierName}</span>
                <span>₹{selectedBooking.amount}</span>
              </div>
              {selectedBooking.notes && (
                <div className="pt-2 border-t text-slate-500">
                  <strong>Notes / Special Request:</strong> {selectedBooking.notes}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t">
              {selectedBooking.bookingStatus !== 'cancelled' && (
                <button
                  onClick={() => {
                    processRefund(selectedBooking.id, selectedBooking.amount);
                    setSelectedBooking(null);
                  }}
                  className="px-3.5 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold text-xs rounded-lg border border-rose-200"
                >
                  Cancel & Issue Refund
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
