import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Mail, ArrowRight, ArrowLeft } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';

export default function ForgotPassword() {
  const [email, setEmail] = useState('eeshan.agrawal@inveon.dev');
  const [loading, setLoading] = useState(false);
  const { showToast } = useNotifications();
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      showToast('Password reset OTP sent to ' + email, 'info');
      navigate('/organizer/verify-otp');
    }, 400);
  };

  return (
    <div>
      <div className="mb-6">
        <NavLink to="/organizer/login" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-brand-600 mb-4">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Sign In</span>
        </NavLink>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Forgot Password?</h2>
        <p className="text-xs text-slate-500 mt-1">
          Enter your registered work email. We'll send a 6-digit verification code to reset your account password.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Registered Email Address</label>
          <div className="relative">
            <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="organizer@inveon.dev"
              className="w-full pl-9 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-70"
        >
          <span>{loading ? 'Sending Code...' : 'Send Verification OTP'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>

      <div className="mt-6 pt-6 border-t border-slate-100 text-center">
        <p className="text-xs text-slate-600">
          Remember your password?{' '}
          <NavLink to="/organizer/login" className="text-brand-600 font-bold hover:underline">
            Sign In
          </NavLink>
        </p>
      </div>
    </div>
  );
}
