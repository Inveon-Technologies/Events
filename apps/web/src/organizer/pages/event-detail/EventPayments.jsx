import React, { useEffect, useState } from 'react';
import { useParams, NavLink } from 'react-router-dom';
import { DollarSign, CreditCard, ArrowDownRight, CheckCircle2, Building } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest, ApiError } from '../../lib/api';
import StatCard from '../../components/common/StatCard';

function formatINR(paise) {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

export default function EventPayments() {
  const { id } = useParams();
  const { user } = useAuth();
  const [financials, setFinancials] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    apiRequest(`/organizer/events/${id}/financials`, { token: user?.token })
      .then((data) => {
        if (!cancelled) setFinancials(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load financials.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, user?.token]);

  if (loading) {
    return <p className="text-xs text-slate-500">Loading…</p>;
  }
  if (error || !financials) {
    return <p className="text-xs text-red-600">{error || 'Could not load financials.'}</p>;
  }

  const { eventName, ticketsSold, grossRevenuePaise, platformFeePercent, platformFeePaise, netPayoutPaise, bankAccountHolderName, bankAccountNumberLast4, bankIfsc, payoutActive } = financials;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            Financials & Payout Settlement — {eventName}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Gross sales and the platform fee this account is actually configured to take.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-slate-200 pb-2">
        <NavLink to={`/organizer/events/${id}/dashboard`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Event Overview</NavLink>
        <NavLink to={`/organizer/events/${id}/bookings`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Bookings</NavLink>
        <NavLink to={`/organizer/events/${id}/participants`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Attendee Roster</NavLink>
        <NavLink to={`/organizer/events/${id}/payments`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-brand-600 text-white">Financials</NavLink>
        <NavLink to={`/organizer/events/${id}/tickets`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Ticket Tiers</NavLink>
        <NavLink to={`/organizer/events/${id}/certificate`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Certificate</NavLink>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Gross Ticket Sales"
          value={formatINR(grossRevenuePaise)}
          subtitle={`${ticketsSold} ticket(s)`}
          icon={CreditCard}
        />
        <StatCard
          title={`Platform Fee (${platformFeePercent}%)`}
          value={formatINR(platformFeePaise)}
          subtitle={platformFeePercent === 0 ? 'No fee currently charged' : 'Deducted before settlement'}
          icon={ArrowDownRight}
          iconBg="bg-rose-50 text-rose-600"
        />
        <StatCard
          title="Net Payout"
          value={formatINR(netPayoutPaise)}
          subtitle="Automated T+1 settlement"
          icon={DollarSign}
          iconBg="bg-emerald-50 text-emerald-600"
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h3 className="text-base font-bold text-slate-900">Settlement Ledger & Bank Info</h3>

        {bankAccountNumberLast4 ? (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-brand-600 flex items-center justify-center">
                <Building className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">{bankAccountHolderName}</p>
                <p className="text-xs text-slate-600">•••• {bankAccountNumberLast4} (IFSC: {bankIfsc})</p>
              </div>
            </div>

            {payoutActive ? (
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg font-bold border border-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Direct Payout Active</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg font-bold border border-amber-200">
                <span>Payout Verification Pending</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-500">No bank account linked yet — complete Payment Verification in Settings.</p>
        )}

        <div className="divide-y divide-slate-100 text-xs">
          <div className="py-2.5 flex justify-between">
            <span className="text-slate-600">Gross Ticket Collection</span>
            <span className="font-bold text-slate-900">{formatINR(grossRevenuePaise)}</span>
          </div>
          <div className="py-2.5 flex justify-between text-rose-600">
            <span>Inveon Platform Fee ({platformFeePercent}%)</span>
            <span>- {formatINR(platformFeePaise)}</span>
          </div>
          <div className="py-3 flex justify-between text-sm font-black text-slate-900 bg-slate-50/50 px-2 rounded-lg">
            <span>Net Payout</span>
            <span className="text-emerald-700">{formatINR(netPayoutPaise)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
