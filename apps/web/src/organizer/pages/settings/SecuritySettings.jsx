import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Shield, Key, Lock, Smartphone, Laptop, Trash2, Save, CheckCircle2 } from 'lucide-react';
import { useEvents } from '../../context/EventsContext';
import { useNotifications } from '../../context/NotificationContext';

export default function SecuritySettings() {
  const { settings, updateSecuritySettings } = useEvents();
  const { showToast } = useNotifications();
  const [formData, setFormData] = useState(settings.security);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');

  const handleToggle2FA = () => {
    const updated = { ...formData, twoFactorEnabled: !formData.twoFactorEnabled };
    setFormData(updated);
    updateSecuritySettings(updated);
    showToast(updated.twoFactorEnabled ? '2FA enabled' : '2FA disabled', 'info');
  };

  const handlePasswordChange = (e) => {
    e.preventDefault();
    if (!currentPwd || !newPwd) return;
    showToast('Account password updated successfully!', 'success');
    setCurrentPwd('');
    setNewPwd('');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Security & Authentication</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Two-factor authentication, active devices, and API credentials.
        </p>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-slate-200 pb-2">
        <NavLink to="/organizer/settings/account" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Account Profile</NavLink>
        <NavLink to="/organizer/settings/organization" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Organization & Team</NavLink>
        <NavLink to="/organizer/settings/security" className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-brand-600 text-white">Security & 2FA</NavLink>
        <NavLink to="/organizer/settings/notifications" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Notification Alerts</NavLink>
      </div>

      <div className="space-y-6">
        {/* 2FA Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-brand-600 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">Two-Factor Authentication (2FA)</h3>
                <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${formData.twoFactorEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                  {formData.twoFactorEnabled ? 'ENABLED' : 'DISABLED'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Protects ticket funds and organizer admin controls with TOTP authenticator app tokens.
              </p>
            </div>
          </div>

          <button
            onClick={handleToggle2FA}
            type="button"
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
              formData.twoFactorEnabled
                ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                : 'bg-brand-600 text-white hover:bg-brand-700 shadow-xs'
            }`}
          >
            {formData.twoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA'}
          </button>
        </div>

        {/* Change Password Form */}
        <form onSubmit={handlePasswordChange} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Lock className="w-4 h-4 text-slate-500" />
            <span>Change Password</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Current Password</label>
              <input
                type="password"
                required
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">New Password</label>
              <input
                type="password"
                required
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg shadow-xs"
            >
              Update Password
            </button>
          </div>
        </form>

        {/* Active Sessions */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Laptop className="w-4 h-4 text-slate-500" />
            <span>Active Login Sessions</span>
          </h3>

          <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
            {formData.activeSessions?.map((s, idx) => (
              <div key={idx} className="p-3.5 flex items-center justify-between text-xs">
                <div>
                  <p className="font-bold text-slate-900">{s.device}</p>
                  <p className="text-[11px] text-slate-500">{s.location} • IP: {s.ip}</p>
                </div>
                <span className="text-[10px] text-slate-400 font-semibold">{s.lastActive}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
