import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ShieldCheck, ShieldAlert, Clock, RefreshCw, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest, ApiError } from '../../lib/api';

const STATUS_META = {
  not_started: { label: 'Not started', tone: 'bg-slate-100 text-slate-600', icon: ShieldAlert },
  in_bene_creation: { label: 'Verification in progress', tone: 'bg-amber-100 text-amber-800', icon: Clock },
  active: { label: 'Verified', tone: 'bg-emerald-100 text-emerald-800', icon: ShieldCheck },
  blocked: { label: 'Blocked — contact support', tone: 'bg-red-100 text-red-800', icon: ShieldAlert },
  deleted: { label: 'Removed — contact support', tone: 'bg-red-100 text-red-800', icon: ShieldAlert },
};

export default function PaymentVerificationSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest('/organizer/verification', { token: user?.token });
      setDetails(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load verification status.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    setError('');
    try {
      await apiRequest('/organizer/verification/refresh', { method: 'POST', token: user?.token });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not refresh status.');
    } finally {
      setRefreshing(false);
    }
  }

  const status = details?.cashfreeVendorStatus || 'not_started';
  const meta = STATUS_META[status] || STATUS_META.not_started;
  const StatusIcon = meta.icon;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Organizer Profile & Account</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Manage your personal organizer profile, credentials, and regional preferences.
        </p>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-slate-200 pb-2">
        <NavLink to="/organizer/settings/account" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Account Profile</NavLink>
        <NavLink to="/organizer/settings/verification" className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-brand-600 text-white">Payment Verification</NavLink>
        <NavLink to="/organizer/settings/organization" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Organization & Team</NavLink>
        <NavLink to="/organizer/settings/security" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Security & 2FA</NavLink>
        <NavLink to="/organizer/settings/notifications" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Notification Alerts</NavLink>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-5">
        {loading ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : (
          <>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${meta.tone}`}>
                <StatusIcon className="w-4 h-4" />
                {meta.label}
              </div>
              {status !== 'not_started' && (
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh status
                </button>
              )}
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            {status === 'not_started' ? (
              <div>
                <p className="text-sm text-slate-600 mb-4">
                  You haven't submitted your KYC and bank details yet. This is required before you can publish
                  events with paid tickets — Cashfree needs a verified vendor account to pay out ticket sales
                  directly to your bank.
                </p>
                <button
                  onClick={() => navigate('/organizer/verify-identity')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs rounded-lg shadow-sm"
                >
                  Start Verification <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <dt className="text-slate-500 mb-0.5">PAN</dt>
                    <dd className="font-mono font-semibold text-slate-900">{details?.panNumber || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 mb-0.5">Account type</dt>
                    <dd className="font-semibold text-slate-900 capitalize">{details?.kycAccountType || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 mb-0.5">Bank account holder</dt>
                    <dd className="font-semibold text-slate-900">{details?.bankAccountHolderName || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 mb-0.5">Bank account</dt>
                    <dd className="font-mono font-semibold text-slate-900">
                      {details?.bankAccountNumberLast4 ? `•••• ${details.bankAccountNumberLast4}` : '—'}
                    </dd>
                  </div>
                </dl>
                {(status === 'blocked' || status === 'deleted') && (
                  <p className="text-xs text-slate-600 pt-2 border-t border-slate-100">
                    Contact support to resolve this before submitting new details.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
