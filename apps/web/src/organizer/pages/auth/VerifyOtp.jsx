import React, { useState, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowRight, ArrowLeft, RefreshCw } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';

export default function VerifyOtp() {
  const [otp, setOtp] = useState(['8', '4', '2', '1', '9', '0']);
  const [loading, setLoading] = useState(false);
  const { showToast } = useNotifications();
  const navigate = useNavigate();
  const inputRefs = useRef([]);

  const handleChange = (index, value) => {
    if (value.length > 1) {
      value = value.slice(-1);
    }
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      showToast('Email verified successfully!', 'success');
      navigate('/organizer/create-new-password');
    }, 400);
  };

  return (
    <div>
      <div className="mb-6">
        <NavLink to="/organizer/forgot-password" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-brand-600 mb-4">
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </NavLink>
        <div className="w-12 h-12 rounded-xl bg-blue-50 text-brand-600 flex items-center justify-center mb-3">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Verify Your Email</h2>
        <p className="text-xs text-slate-500 mt-1">
          We've sent a 6-digit confirmation code to <span className="font-semibold text-slate-800">eeshan.agrawal@inveon.dev</span>.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex justify-between gap-2 max-w-xs mx-auto">
          {otp.map((digit, idx) => (
            <input
              key={idx}
              ref={(el) => (inputRefs.current[idx] = el)}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              className="w-11 h-12 text-center text-lg font-bold bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-slate-900 shadow-xs"
            />
          ))}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-70"
        >
          <span>{loading ? 'Verifying...' : 'Confirm & Proceed'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>

      <div className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-between text-xs">
        <span className="text-slate-500">Didn't receive code?</span>
        <button
          onClick={() => showToast('New OTP sent to your inbox', 'info')}
          type="button"
          className="text-brand-600 font-bold hover:underline flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Resend OTP</span>
        </button>
      </div>
    </div>
  );
}
