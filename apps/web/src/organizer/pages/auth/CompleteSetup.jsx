import React, { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { CheckCircle2, Sparkles, ArrowRight } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { apiRequest, ApiError } from '../../lib/api';

const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export default function CompleteSetup() {
  const location = useLocation();
  const kyc = location.state;

  const [bankAccountHolderName, setBankAccountHolderName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { showToast } = useNotifications();
  const { user } = useAuth();
  const navigate = useNavigate();

  // This step needs the KYC data collected on the previous step — if
  // someone lands here directly (a stale bookmark, a page refresh that
  // lost router state) rather than via that form, send them back to
  // collect it properly instead of submitting an incomplete request.
  if (!kyc?.panNumber) {
    return <Navigate to="/organizer/verify-identity" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const ifsc = bankIfsc.trim().toUpperCase();
    if (!IFSC_PATTERN.test(ifsc)) {
      setError('Enter a valid bank IFSC code.');
      return;
    }
    if (!/^\d{6,20}$/.test(bankAccountNumber.trim())) {
      setError('Enter a valid bank account number.');
      return;
    }
    if (!bankAccountHolderName.trim()) {
      setError('Enter the account holder name.');
      return;
    }

    setLoading(true);
    try {
      await apiRequest('/organizer/verification', {
        method: 'POST',
        token: user?.token,
        body: {
          panNumber: kyc.panNumber,
          accountType: kyc.accountType,
          businessType: kyc.businessType || undefined,
          contactPhone: kyc.contactPhone,
          bankAccountHolderName: bankAccountHolderName.trim(),
          bankAccountNumber: bankAccountNumber.trim(),
          bankIfsc: ifsc,
        },
      });
      showToast('Verification submitted! Your account is being reviewed by Cashfree.', 'success');
      navigate('/organizer/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
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
            value={bankAccountHolderName}
            onChange={(e) => setBankAccountHolderName(e.target.value)}
            placeholder="As it appears on your bank account"
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Account Number</label>
            <input
              type="text"
              required
              value={bankAccountNumber}
              onChange={(e) => setBankAccountNumber(e.target.value)}
              placeholder="e.g. 50200089214912"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">IFSC Code</label>
            <input
              type="text"
              required
              value={bankIfsc}
              onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
              placeholder="e.g. HDFC0000123"
              maxLength={11}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-mono uppercase"
            />
          </div>
        </div>

        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-start gap-2.5 text-xs text-emerald-800">
          <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>Cashfree verifies your bank account before it can start receiving settlements — this usually takes a few minutes, occasionally longer.</span>
        </div>

        {error && <p className="text-[11px] text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-70 mt-3"
        >
          <span>{loading ? 'Submitting…' : 'Submit for Verification'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
