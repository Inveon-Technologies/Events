import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { RotateCcw, Search, CheckCircle2, XCircle, AlertCircle, Download, ShieldCheck } from 'lucide-react';
import { useEvents } from '../../context/EventsContext';
import StatusBadge from '../../components/common/StatusBadge';

export default function Cancellations() {
  const { bookings } = useEvents();
  const [searchTerm, setSearchTerm] = useState('');

  const cancelledBookings = bookings.filter(
    (b) => b.bookingStatus === 'cancelled' || b.bookingStatus === 'partially_cancelled' || b.paymentStatus === 'refunded'
  );

  const filtered = cancelledBookings.filter((b) => {
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchCust = b.customerName.toLowerCase().includes(q);
      const matchId = b.id.toLowerCase().includes(q);
      const matchEvent = b.eventName.toLowerCase().includes(q);
      if (!matchCust && !matchId && !matchEvent) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Cancellations & Refunds Portal</h1>
          <p className="text-xs text-slate-500 mt-1">
            Review attendee cancellation requests, policy enforcement, and gateway refund logs.
          </p>
        </div>

        <button
          onClick={() => alert('Exporting refund report...')}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 shadow-xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Refund Log</span>
        </button>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-4 bg-slate-50/50">
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search cancellation request..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <span className="text-xs text-slate-500 font-semibold">{filtered.length} requests logged</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/60 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Booking Ref</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Event Name</th>
                <th className="py-3 px-4">Order Value</th>
                <th className="py-3 px-4">Cancellation Reason / Notes</th>
                <th className="py-3 px-4">Refund Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-bold text-brand-600">
                    {b.id}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-900">{b.customerName}</div>
                    <div className="text-[11px] text-slate-500">{b.customerEmail}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <NavLink to={`/organizer/events/${b.eventId}/dashboard`} className="font-bold text-slate-900 hover:text-brand-600">
                      {b.eventName}
                    </NavLink>
                  </td>
                  <td className="py-3.5 px-4 font-bold text-slate-900">
                    ₹{b.amount.toLocaleString('en-IN')}
                  </td>
                  <td className="py-3.5 px-4 text-slate-600 max-w-xs">
                    {b.notes || 'Attendee requested cancellation via portal'}
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusBadge status={b.paymentStatus === 'refunded' ? 'refunded' : b.bookingStatus} />
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {b.paymentStatus === 'refunded' ? (
                      <span className="text-emerald-700 font-bold text-[11px] bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                        Refund Settled
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[11px] italic">
                        Refunds process automatically on cancellation
                      </span>
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
