import React from 'react';
import { useParams, NavLink } from 'react-router-dom';
import { DollarSign, CreditCard, ArrowDownRight, CheckCircle2, Building, ShieldCheck, Download } from 'lucide-react';
import { useEvents } from '../../context/EventsContext';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';

export default function EventPayments() {
  const { id } = useParams();
  const { events, payments } = useEvents();

  const eventId = id || 'rajgad-sunrise-trek';
  const event = events.find((e) => e.id === eventId) || events[0];

  const gross = event.grossRevenue || 0;
  const platformFee = Math.round(gross * 0.035);
  const netPayout = gross - platformFee;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            Financials & Payout Settlement — {event.title}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Gross sales, ticketing gateway fees, platform commissions, and bank transfer receipts.
          </p>
        </div>

        <button
          onClick={() => alert('GST Tax Invoice downloaded!')}
          className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 shadow-xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download Tax Invoice</span>
        </button>
      </div>

      {/* Sub Navigation Bar for this event */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-slate-200 pb-2">
        <NavLink to={`/organizer/events/${event.id}/dashboard`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Event Overview</NavLink>
        <NavLink to={`/organizer/events/${event.id}/bookings`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Bookings</NavLink>
        <NavLink to={`/organizer/events/${event.id}/participants`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Attendee Roster</NavLink>
        <NavLink to={`/organizer/events/${event.id}/payments`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-brand-600 text-white">Financials</NavLink>
        <NavLink to={`/organizer/events/${event.id}/tickets`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Ticket Tiers</NavLink>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Gross Ticket Sales"
          value={`₹${gross.toLocaleString('en-IN')}`}
          subtitle={`${event.ticketsSold} paid tickets`}
          icon={CreditCard}
        />
        <StatCard
          title="Platform & Gateway Fee (3.5%)"
          value={`₹${platformFee.toLocaleString('en-IN')}`}
          subtitle="Includes 18% GST on fee"
          icon={ArrowDownRight}
          iconBg="bg-rose-50 text-rose-600"
        />
        <StatCard
          title="Net Receivable Payout"
          value={`₹${netPayout.toLocaleString('en-IN')}`}
          subtitle="Automated T+1 settlement"
          icon={DollarSign}
          iconBg="bg-emerald-50 text-emerald-600"
        />
      </div>

      {/* Settlement Breakdown Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h3 className="text-base font-bold text-slate-900">Settlement Ledger & Bank Info</h3>

        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-brand-600 flex items-center justify-center">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">Linked Bank Account</p>
              <p className="text-xs text-slate-600">HDFC Bank •••• 4912 (IFSC: HDFC0000123)</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg font-bold border border-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Direct Payout Active</span>
          </div>
        </div>

        <div className="divide-y divide-slate-100 text-xs">
          <div className="py-2.5 flex justify-between">
            <span className="text-slate-600">Gross Ticket Collection</span>
            <span className="font-bold text-slate-900">₹{gross.toLocaleString('en-IN')}</span>
          </div>
          <div className="py-2.5 flex justify-between text-rose-600">
            <span>Inveon Platform Fee (2.0%)</span>
            <span>- ₹{(gross * 0.02).toLocaleString('en-IN')}</span>
          </div>
          <div className="py-2.5 flex justify-between text-rose-600">
            <span>Payment Gateway Charge (1.5% + GST)</span>
            <span>- ₹{(gross * 0.015).toLocaleString('en-IN')}</span>
          </div>
          <div className="py-3 flex justify-between text-sm font-black text-slate-900 bg-slate-50/50 px-2 rounded-lg">
            <span>Net Estimated Payout</span>
            <span className="text-emerald-700">₹{netPayout.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
