import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Lock, ArrowRight, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';

export default function CreateNewPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const { showToast } = useNotifications();
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }
    if (password.length < 8) {
      showToast('Password must be at least 8 characters', 'error');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      showToast('Password reset successfully! Please verify identity.', 'success');
      navigate('/organizer/verify-identity');
    }, 400);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Create New Password</h2>
        <p className="text-xs text-slate-500 mt-1">
          Set a secure, complex password for your organizer workspace account.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full pl-9 pr-10 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm New Password</label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              className="w-full pl-9 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>
        </div>

        <div className="space-y-1.5 p-3 rounded-lg bg-slate-50 border border-slate-100 text-[11px] text-slate-600">
          <p className="font-semibold text-slate-700 mb-1">Password Requirements:</p>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className={`w-3.5 h-3.5 ${password.length >= 8 ? 'text-emerald-600' : 'text-slate-400'}`} />
            <span>Minimum 8 characters</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className={`w-3.5 h-3.5 ${/[A-Z]/.test(password) ? 'text-emerald-600' : 'text-slate-400'}`} />
            <span>At least one uppercase letter</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className={`w-3.5 h-3.5 ${/[0-9]/.test(password) ? 'text-emerald-600' : 'text-slate-400'}`} />
            <span>At least one number</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-70"
        >
          <span>{loading ? 'Updating Password...' : 'Save & Continue'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
