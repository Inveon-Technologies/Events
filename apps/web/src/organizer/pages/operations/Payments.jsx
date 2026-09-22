import React, { useEffect, useState } from 'react';
import { DollarSign, CreditCard, ArrowDownRight, Building, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest, ApiError } from '../../lib/api';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';

function formatINR(paise) {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

export default function Payments() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiRequest('/organizer/payments', { token: user?.token })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load payments.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.token]);

  if (loading) return <p className="text-xs text-slate-500">Loading…</p>;
  if (error || !data) return <p className="text-xs text-red-600">{error || 'Could not load payments.'}</p>;

  const { summary, transactions, bankAccountHolderName, bankAccountNumberLast4, bankIfsc, payoutActive } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Payments & Revenue</h1>
        <p className="text-xs text-slate-500 mt-1">
          Real revenue and refunds across all your events.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          title="Total Gross Revenue"
          value={formatINR(summary.totalRevenuePaise)}
          subtitle="All-time, across every event"
          icon={CreditCard}
        />
        <StatCard
          title={`Net (after ${summary.platformFeePercent}% platform fee)`}
          value={formatINR(summary.netPaise)}
          subtitle="Revenue minus fee and refunds"
          icon={DollarSign}
          iconBg="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          title="Refunded to Customers"
          value={formatINR(summary.refundedAmountPaise)}
          subtitle="From real cancellations"
          icon={ArrowDownRight}
          iconBg="bg-purple-50 text-purple-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Transactions</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/60 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Customer & Event</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Net</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 px-4 text-center text-slate-400">No transactions yet.</td>
                  </tr>
                ) : transactions.map((txn) => (
                  <tr key={txn.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 text-slate-500">
                      {new Date(txn.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{txn.customerName}</div>
                      <div className="text-[11px] text-slate-500">{txn.eventName}</div>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">{formatINR(txn.amountPaise)}</td>
                    <td className="py-3.5 px-4 font-bold text-emerald-700">{formatINR(txn.netAmountPaise)}</td>
                    <td className="py-3.5 px-4 text-slate-600 font-medium capitalize">{txn.method}</td>
                    <td className="py-3.5 px-4"><StatusBadge status={txn.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900">Payout Bank Account</h3>
            {bankAccountNumberLast4 ? (
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 text-brand-600 flex items-center justify-center">
                    <Building className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">{bankAccountHolderName}</p>
                    <p className="text-[11px] text-slate-600">•••• {bankAccountNumberLast4} (IFSC: {bankIfsc})</p>
                  </div>
                </div>
                {payoutActive ? (
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg font-bold border border-emerald-200 w-fit">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Direct Payout Active</span>
                  </div>
                ) : (
                  <div className="text-[11px] text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg font-bold border border-amber-200 w-fit">
                    Verification Pending
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No bank account linked yet — complete Payment Verification in Settings.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
