import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Building, Phone, ArrowRight, Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { ApiError } from '../../lib/api';

export default function SignUp() {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    orgName: '',
    category: 'Adventure & Trekking',
    password: '',
    agreeTerms: false
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const { signup } = useAuth();
  const { showToast } = useNotifications();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    // Clear that one field's error as soon as they start correcting it,
    // rather than making them resubmit to find out it's fixed.
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  function validate(data) {
    const errors = {};

    if (!data.fullName.trim()) {
      errors.fullName = 'Full name is required.';
    } else if (data.fullName.trim().length < 2) {
      errors.fullName = 'Full name looks too short.';
    }

    if (!data.email.trim()) {
      errors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
      errors.email = 'Enter a valid email address.';
    }

    const digitsOnly = data.phone.replace(/[^0-9]/g, '');
    if (!data.phone.trim()) {
      errors.phone = 'Phone number is required.';
    } else if (digitsOnly.length < 10) {
      errors.phone = 'Enter a valid phone number (at least 10 digits).';
    }

    if (!data.orgName.trim()) {
      errors.orgName = 'Organization name is required.';
    }

    if (!data.password) {
      errors.password = 'Password is required.';
    } else if (data.password.length < 8) {
      errors.password = 'Password must be at least 8 characters.';
    }

    return errors;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.agreeTerms) {
      showToast('Please accept terms of service to proceed', 'error');
      return;
    }

    const errors = validate(formData);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setError(null);
    setFieldErrors({});
    setLoading(true);
    try {
      await signup(formData);
      showToast('Verification code sent to your email', 'info');
      navigate('/organizer/verify-otp', { state: { email: formData.email, context: 'signup' } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign up. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Create Organizer Account</h2>
        <p className="text-xs text-slate-500 mt-1">
          Start hosting, managing, and selling tickets in minutes.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700" role="alert">
            {error}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="fullName">Full Name</label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                name="fullName"
                id="fullName"
                required
                value={formData.fullName}
                onChange={handleChange}
                placeholder="Eeshan Agrawal"
                className={`w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${fieldErrors.fullName ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-brand-500'}`}
              />
            </div>
            {fieldErrors.fullName && <p className="mt-1 text-[11px] text-red-600">{fieldErrors.fullName}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="phone">Phone Number</label>
            <div className="relative">
              <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="tel"
                name="phone"
                id="phone"
                required
                value={formData.phone}
                onChange={handleChange}
                placeholder="+91 98765 43210"
                className={`w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${fieldErrors.phone ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-brand-500'}`}
              />
            </div>
            {fieldErrors.phone && <p className="mt-1 text-[11px] text-red-600">{fieldErrors.phone}</p>}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="email">Work / Official Email</label>
          <div className="relative">
            <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              name="email"
                id="email"
              required
              value={formData.email}
              onChange={handleChange}
              placeholder="eeshan@organization.com"
              className={`w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${fieldErrors.email ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-brand-500'}`}
            />
          </div>
          {fieldErrors.email && <p className="mt-1 text-[11px] text-red-600">{fieldErrors.email}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="orgName">Organization / Brand Name</label>
          <div className="relative">
            <Building className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              name="orgName"
                id="orgName"
              required
              value={formData.orgName}
              onChange={handleChange}
              placeholder="Sahyadri Wanderers Club"
              className={`w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${fieldErrors.orgName ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-brand-500'}`}
            />
          </div>
          {fieldErrors.orgName && <p className="mt-1 text-[11px] text-red-600">{fieldErrors.orgName}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="password">Password</label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              name="password"
                id="password"
              required
              value={formData.password}
              onChange={handleChange}
              placeholder="At least 8 characters"
              className={`w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${fieldErrors.password ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-brand-500'}`}
            />
          </div>
          {fieldErrors.password && <p className="mt-1 text-[11px] text-red-600">{fieldErrors.password}</p>}
        </div>

        <div className="pt-1">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="agreeTerms"
              checked={formData.agreeTerms}
              onChange={handleChange}
              className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-[11px] text-slate-600 leading-tight select-none">
              I agree to Inveon Events <a href="#terms" className="text-brand-600 font-semibold underline">Terms of Service</a>, <a href="#privacy" className="text-brand-600 font-semibold underline">Privacy Policy</a>, and Organizer Merchant Guidelines.
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-70 mt-2"
        >
          <span>{loading ? 'Creating Account...' : 'Continue to Verification'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>

      <div className="mt-5 pt-5 border-t border-slate-100 text-center">
        <p className="text-xs text-slate-600">
          Already registered?{' '}
          <NavLink to="/organizer/login" className="text-brand-600 font-bold hover:underline">
            Sign In to your account
          </NavLink>
        </p>
      </div>
    </div>
  );
}
