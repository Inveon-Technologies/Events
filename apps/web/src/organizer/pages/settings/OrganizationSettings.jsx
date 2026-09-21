import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Building2, Users, Plus, Trash2, Save, CheckCircle2, Shield } from 'lucide-react';
import { useEvents } from '../../context/EventsContext';
import { useNotifications } from '../../context/NotificationContext';

export default function OrganizationSettings() {
  const { settings, updateOrgSettings } = useEvents();
  const { showToast } = useNotifications();
  const [formData, setFormData] = useState(settings.organization);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('Check-in Agent');

  const handleSubmit = (e) => {
    e.preventDefault();
    updateOrgSettings(formData);
  };

  const handleAddMember = (e) => {
    e.preventDefault();
    if (!newMemberEmail) return;

    const newMember = {
      id: `tm-${Date.now()}`,
      name: newMemberEmail.split('@')[0],
      email: newMemberEmail,
      role: newMemberRole,
      status: 'invited'
    };

    setFormData({
      ...formData,
      team: [...formData.team, newMember]
    });
    setNewMemberEmail('');
    showToast(`Invitation sent to ${newMemberEmail}`, 'success');
  };

  const removeMember = (id) => {
    setFormData({
      ...formData,
      team: formData.team.filter(m => m.id !== id)
    });
    showToast('Team member removed', 'info');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Organization Profile & Team</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Manage legal entity registration, team members, staff roles, and GST tax information.
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
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">GSTIN Number (Tax Exemption / Credit)</label>
            <input
              type="text"
              value={formData.gstNumber}
              onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono uppercase"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Support Email</label>
            <input
              type="email"
              value={formData.supportEmail}
              onChange={(e) => setFormData({ ...formData, supportEmail: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Support Phone</label>
            <input
              type="tel"
              value={formData.supportPhone}
              onChange={(e) => setFormData({ ...formData, supportPhone: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Official Website</label>
            <input
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>
        </div>

        {/* Team Members Management */}
        <div className="pt-4 border-t border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Staff & Check-in Team Roles</h3>
              <p className="text-xs text-slate-500">Invite colleagues and gate staff with granular permission levels.</p>
            </div>
          </div>

          <div className="flex gap-2">
            <input
              type="email"
              placeholder="colleague@domain.com"
              value={newMemberEmail}
              onChange={(e) => setNewMemberEmail(e.target.value)}
              className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
            <select
              value={newMemberRole}
              onChange={(e) => setNewMemberRole(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            >
              <option value="Check-in Agent">Check-in Agent</option>
              <option value="Finance Manager">Finance Manager</option>
              <option value="Event Co-Host">Event Co-Host</option>
              <option value="Admin">Admin</option>
            </select>
            <button
              type="button"
              onClick={handleAddMember}
              className="px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-lg shadow-xs shrink-0"
            >
              Invite Member
            </button>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
            {formData.team.map((m) => (
              <div key={m.id} className="p-3.5 flex items-center justify-between text-xs">
                <div>
                  <p className="font-bold text-slate-900">{m.name} <span className="text-[10px] font-normal text-slate-400">({m.email})</span></p>
                  <span className="text-[11px] text-brand-600 font-semibold">{m.role}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${m.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                    {m.status}
                  </span>
                  {m.role !== 'Owner' && (
                    <button
                      type="button"
                      onClick={() => removeMember(m.id)}
                      className="p-1 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-100">
          <button
            type="submit"
            className="flex items-center gap-1.5 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-lg shadow-sm"
          >
            <Save className="w-4 h-4" />
            <span>Save Organization Settings</span>
          </button>
        </div>
      </form>
    </div>
  );
}
