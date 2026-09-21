import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { User, Mail, Phone, MapPin, Save, Camera } from 'lucide-react';
import { useEvents } from '../../context/EventsContext';
import { useNotifications } from '../../context/NotificationContext';

export default function AccountSettings() {
  const { settings, updateAccountSettings } = useEvents();
  const { showToast } = useNotifications();
  const [formData, setFormData] = useState(settings.account);

  const handleSubmit = (e) => {
    e.preventDefault();
    updateAccountSettings(formData);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Organizer Profile & Account</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Manage your personal organizer profile, credentials, and regional preferences.
        </p>
      </div>

      {/* Settings Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-slate-200 pb-2">
        <NavLink to="/organizer/settings/account" className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-brand-600 text-white">Account Profile</NavLink>
        <NavLink to="/organizer/settings/verification" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Payment Verification</NavLink>
        <NavLink to="/organizer/settings/organization" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Organization & Team</NavLink>
        <NavLink to="/organizer/settings/security" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Security & 2FA</NavLink>
        <NavLink to="/organizer/settings/notifications" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Notification Alerts</NavLink>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        {/* Avatar Upload */}
        <div className="flex items-center gap-5">
          <div className="relative group cursor-pointer">
            <img
              src={formData.avatar}
              alt={formData.fullName}
              className="w-20 h-20 rounded-full object-cover ring-2 ring-brand-500"
            />
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="w-5 h-5 text-white" />
            </div>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">{formData.fullName}</h3>
            <p className="text-xs text-slate-500">{formData.role}</p>
            <p className="text-[11px] text-brand-600 font-semibold mt-1">Change Profile Picture</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Full Legal Name</label>
            <input
              type="text"
              required
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Role Title</label>
            <input
              type="text"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
            <input
              type="tel"
              required
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Organizer Bio / Mission</label>
          <textarea
            rows={3}
            value={formData.bio}
            onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
            className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 leading-relaxed"
          ></textarea>
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-100">
          <button
            type="submit"
            className="flex items-center gap-1.5 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-lg shadow-sm transition-all"
          >
            <Save className="w-4 h-4" />
            <span>Save Profile Changes</span>
          </button>
        </div>
      </form>
    </div>
  );
}
