import React from 'react';
import { DollarSign, CreditCard, ArrowDownRight, Building, CheckCircle2, Download, ExternalLink } from 'lucide-react';
import { useEvents } from '../../context/EventsContext';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';

export default function Payments() {
  const { payments } = useEvents();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Payments & Payouts Dashboard</h1>
          <p className="text-xs text-slate-500 mt-1">
            Track revenue settlements, pending bank transfers, platform commissions, and transaction histories.
          </p>
        </div>

        <button
          onClick={() => alert('Payout tax statement downloaded!')}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 shadow-xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download Statement</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Gross Revenue"
          value={`₹${payments.summary.totalRevenue.toLocaleString('en-IN')}`}
          subtitle="All-time earnings"
          icon={CreditCard}
        />
        <StatCard
          title="Available for Payout"
          value={`₹${payments.summary.availablePayout.toLocaleString('en-IN')}`}
          subtitle="Ready for disbursement"
          icon={DollarSign}
          iconBg="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          title="Processing in Bank"
          value={`₹${payments.summary.pendingPayout.toLocaleString('en-IN')}`}
          subtitle="Batch settling in 24h"
          icon={ArrowDownRight}
          iconBg="bg-amber-50 text-amber-600"
        />
        <StatCard
          title="Refunded to Customers"
          value={`₹${payments.summary.refundedAmount.toLocaleString('en-IN')}`}
          subtitle="Processed according to policy"
          icon={ArrowDownRight}
          iconBg="bg-purple-50 text-purple-600"
        />
      </div>

      {/* Two Column Layout: Recent Payout Batches & Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Transactions Log */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Recent Transactions & Bookings</h3>
            <span className="text-xs text-slate-400 font-medium">Real-time ledger</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/60 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Transaction ID</th>
                  <th className="py-3 px-4">Customer & Event</th>
                  <th className="py-3 px-4">Gross</th>
                  <th className="py-3 px-4">Net</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.transactions.map((txn) => (
                  <tr key={txn.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                      {txn.id}
                      <span className="text-[10px] text-slate-400 font-sans block">{txn.date}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{txn.customerName}</div>
                      <div className="text-[11px] text-slate-500">{txn.eventName}</div>
                    </td>
                    <td className={`py-3.5 px-4 font-bold ${txn.amount < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                      ₹{txn.amount.toLocaleString('en-IN')}
                    </td>
                    <td className={`py-3.5 px-4 font-bold ${txn.netAmount < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                      ₹{txn.netAmount.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 font-medium">
                      {txn.paymentMethod}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={txn.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right 1 Col: Payout Batches & Bank Accounts */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900">Bank Disbursement Batches</h3>

            <div className="space-y-3">
              {payments.payouts.map((po) => (
                <div key={po.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-sm">₹{po.amount.toLocaleString('en-IN')}</span>
                    <StatusBadge status={po.status} />
                  </div>
                  <p className="text-[11px] text-slate-600 font-medium">{po.eventName}</p>
                  <p className="text-[10px] text-slate-400">{po.bankAccount}</p>
                  <p className="text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-200/60">Ref: {po.reference}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
