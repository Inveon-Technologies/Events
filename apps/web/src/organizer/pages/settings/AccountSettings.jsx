import React, { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Mail, Phone, Save, Camera } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { apiRequest, uploadOrganizerLogoFile, ApiError } from '../../lib/api';

export default function AccountSettings() {
  const { user, updateUserProfile } = useAuth();
  const { showToast } = useNotifications();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    apiRequest('/organizer/profile', { token: user?.token })
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((err) => {
        if (!cancelled) showToast(err instanceof ApiError ? err.message : 'Could not load your profile.', 'error');
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
        body: { name: profile.name, contactEmail: profile.contactEmail || '', contactPhone: profile.contactPhone || '', about: profile.about || '' },
      });
      setProfile(updated);
      updateUserProfile({ orgName: updated.name, avatar: updated.logoUrl });
      showToast('Profile saved successfully!', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not save your profile.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const result = await uploadOrganizerLogoFile(file, user?.token);
      setProfile((prev) => ({ ...prev, logoUrl: result.logoUrl }));
      updateUserProfile({ avatar: result.logoUrl });
      showToast('Logo updated successfully!', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not upload the logo.', 'error');
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  }

  if (loading || !profile) {
    return <p className="text-xs text-slate-500">Loading…</p>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Organizer Profile & Account</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Manage your organization's public profile and contact details.
        </p>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-slate-200 pb-2">
        <NavLink to="/organizer/settings/account" className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-brand-600 text-white">Account Profile</NavLink>
        <NavLink to="/organizer/settings/verification" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Payment Verification</NavLink>
        <NavLink to="/organizer/settings/organization" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Organization & Team</NavLink>
        <NavLink to="/organizer/settings/security" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Security & 2FA</NavLink>
        <NavLink to="/organizer/settings/notifications" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Notification Alerts</NavLink>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingLogo}
            className="relative group cursor-pointer disabled:cursor-wait"
          >
            {profile.logoUrl ? (
              <img src={profile.logoUrl} alt={profile.name} className="w-20 h-20 rounded-full object-cover ring-2 ring-brand-500" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-slate-100 ring-2 ring-brand-500 flex items-center justify-center text-slate-400 text-xl font-bold">
                {profile.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {uploadingLogo ? <span className="text-white text-[10px] font-bold">…</span> : <Camera className="w-5 h-5 text-white" />}
            </div>
          </button>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleLogoChange} className="hidden" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">{profile.name}</h3>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="text-[11px] text-brand-600 font-semibold mt-1 hover:underline">
              {uploadingLogo ? 'Uploading…' : 'Change Logo'}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Organizer / Club Name</label>
          <input
            type="text"
            required
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1"><Mail className="w-3 h-3" /> Contact Email</label>
            <input
              type="email"
              value={profile.contactEmail || ''}
              onChange={(e) => setProfile({ ...profile, contactEmail: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1"><Phone className="w-3 h-3" /> Contact Phone</label>
            <input
              type="tel"
              value={profile.contactPhone || ''}
              onChange={(e) => setProfile({ ...profile, contactPhone: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Organizer Bio / Mission</label>
          <textarea
            rows={3}
            value={profile.about || ''}
            onChange={(e) => setProfile({ ...profile, about: e.target.value })}
            className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 leading-relaxed"
          ></textarea>
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-100">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-lg shadow-sm transition-all disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving…' : 'Save Profile Changes'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
