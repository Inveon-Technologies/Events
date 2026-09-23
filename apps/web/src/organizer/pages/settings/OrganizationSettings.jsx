import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Save } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { apiRequest, ApiError } from '../../lib/api';

export default function OrganizationSettings() {
  const { user } = useAuth();
  const { showToast } = useNotifications();
  const [profile, setProfile] = useState(null);
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiRequest('/organizer/profile', { token: user?.token }),
      apiRequest('/organizer/team', { token: user?.token }),
    ])
      .then(([profileData, teamData]) => {
        if (!cancelled) {
          setProfile(profileData);
          setTeam(teamData.team);
        }
      })
      .catch((err) => {
        if (!cancelled) showToast(err instanceof ApiError ? err.message : 'Could not load organization settings.', 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await apiRequest('/organizer/profile', {
        method: 'PATCH',
        token: user?.token,
        body: {
          name: profile.name,
          contactEmail: profile.contactEmail || '',
          contactPhone: profile.contactPhone || '',
          gstNumber: profile.gstNumber || '',
          website: profile.website || '',
        },
      });
      setProfile(updated);
      showToast('Organization settings saved successfully!', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not save organization settings.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !profile) {
    return <p className="text-xs text-slate-500">Loading…</p>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Organization Profile & Team</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Manage legal entity registration, tax information, and your team roster.
        </p>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-slate-200 pb-2">
        <NavLink to="/organizer/settings/account" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Account Profile</NavLink>
        <NavLink to="/organizer/settings/verification" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Payment Verification</NavLink>
        <NavLink to="/organizer/settings/organization" className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-brand-600 text-white">Organization & Team</NavLink>
        <NavLink to="/organizer/settings/security" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Security & 2FA</NavLink>
        <NavLink to="/organizer/settings/notifications" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Notification Alerts</NavLink>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Company / Organization Legal Name</label>
            <input
              type="text"
              required
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label htmlFor="org-gst-number" className="block text-xs font-bold text-slate-700 mb-1">GSTIN Number (Tax Exemption / Credit)</label>
            <input
              id="org-gst-number"
              type="text"
              value={profile.gstNumber || ''}
              onChange={(e) => setProfile({ ...profile, gstNumber: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono uppercase"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Support Email</label>
            <input
              type="email"
              value={profile.contactEmail || ''}
              onChange={(e) => setProfile({ ...profile, contactEmail: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Support Phone</label>
            <input
              type="tel"
              value={profile.contactPhone || ''}
              onChange={(e) => setProfile({ ...profile, contactPhone: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Official Website</label>
            <input
              type="url"
              value={profile.website || ''}
              onChange={(e) => setProfile({ ...profile, website: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Team</h3>
            <p className="text-xs text-slate-500">
              Everyone with access to this organizer account. Team invitations aren't available yet.
            </p>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
            {(team ?? []).length === 0 ? (
              <p className="p-4 text-xs text-slate-400 text-center">No team members found.</p>
            ) : (
              team.map((m) => (
                <div key={m.id} className="p-3.5 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-bold text-slate-900">{m.name || m.email} <span className="text-[10px] font-normal text-slate-400">({m.email})</span></p>
                    <span className="text-[11px] text-brand-600 font-semibold capitalize">{m.role.replace(/_/g, ' ')}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-100">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-lg shadow-sm disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving…' : 'Save Organization Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
