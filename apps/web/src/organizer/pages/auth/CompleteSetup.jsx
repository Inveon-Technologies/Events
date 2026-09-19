import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { CheckCircle2, Sparkles, Building2, CreditCard, ArrowRight } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';

export default function CompleteSetup() {
  const [bankAccount, setBankAccount] = useState({
    holderName: 'Sahyadri Wanderers LLP',
    accountNumber: '50200089214912',
    ifsc: 'HDFC0000123',
    bankName: 'HDFC Bank Ltd, Pune Branch'
  });
  const [loading, setLoading] = useState(false);

  const { showToast } = useNotifications();
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      showToast('Organizer Setup Completed! Welcome to Inveon Events.', 'success');
      navigate('/organizer/dashboard');
    }, 500);
  };

  return (
    <div>
      <div className="mb-6">
        <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Complete Organization Setup</h2>
        <p className="text-xs text-slate-500 mt-1">
          Link your payout bank account to start receiving ticket sales revenue directly.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Account Beneficiary Name</label>
          <input
            type="text"
            required
            value={bankAccount.holderName}
            onChange={(e) => setBankAccount({ ...bankAccount, holderName: e.target.value })}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Account Number</label>
            <input
              type="text"
              required
              value={bankAccount.accountNumber}
              onChange={(e) => setBankAccount({ ...bankAccount, accountNumber: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">IFSC Code</label>
            <input
              type="text"
              required
              value={bankAccount.ifsc}
              onChange={(e) => setBankAccount({ ...bankAccount, ifsc: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-mono uppercase"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Bank & Branch Name</label>
          <input
            type="text"
            required
            value={bankAccount.bankName}
            onChange={(e) => setBankAccount({ ...bankAccount, bankName: e.target.value })}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>

        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-start gap-2.5 text-xs text-emerald-800">
          <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>All ticket transactions are automatically settled on a T+1 schedule directly into this bank account.</span>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-70 mt-3"
        >
          <span>{loading ? 'Finalizing Setup...' : 'Launch Organizer Dashboard'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
