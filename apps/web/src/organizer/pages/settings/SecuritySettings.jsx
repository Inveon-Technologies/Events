import React, { useState } from 'react';
import { Lock, Smartphone, Laptop } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { apiRequest, ApiError } from '../../lib/api';
import SettingsTabs from '../../components/common/SettingsTabs';

export default function SecuritySettings() {
  const { user } = useAuth();
  const { showToast } = useNotifications();
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [saving, setSaving] = useState(false);

  async function handlePasswordChange(e) {
    e.preventDefault();
    if (!currentPwd || !newPwd) return;
    setSaving(true);
    try {
      await apiRequest('/organizer/change-password', {
        method: 'POST',
        token: user?.token,
        body: { currentPassword: currentPwd, newPassword: newPwd },
      });
      showToast('Password updated successfully!', 'success');
      setCurrentPwd('');
      setNewPwd('');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not update your password.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Security & Authentication</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Manage your account password.
        </p>
      </div>

      <SettingsTabs />

      <div className="space-y-6">
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
              disabled={saving}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg shadow-xs disabled:opacity-60"
            >
              {saving ? 'Updating…' : 'Update Password'}
            </button>
          </div>
        </form>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex items-start gap-4 opacity-70">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Two-Factor Authentication</h3>
            <p className="text-xs text-slate-500 mt-0.5">Not available yet.</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex items-start gap-4 opacity-70">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
            <Laptop className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Active Login Sessions</h3>
            <p className="text-xs text-slate-500 mt-0.5">Not available yet.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
