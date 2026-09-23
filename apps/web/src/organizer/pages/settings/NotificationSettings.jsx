import React from 'react';
import { NavLink } from 'react-router-dom';
import { Bell } from 'lucide-react';

export default function NotificationSettings() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Notification Channels & Alerts</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure how you and your team receive updates on bookings, payouts, and cancellations.
        </p>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-slate-200 pb-2">
        <NavLink to="/organizer/settings/account" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Account Profile</NavLink>
        <NavLink to="/organizer/settings/verification" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Payment Verification</NavLink>
        <NavLink to="/organizer/settings/organization" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Organization & Team</NavLink>
        <NavLink to="/organizer/settings/security" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Security & 2FA</NavLink>
        <NavLink to="/organizer/settings/notifications" className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-brand-600 text-white">Notification Alerts</NavLink>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs flex flex-col items-center text-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center">
          <Bell className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900">Notification preferences aren't available yet</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            You'll still receive a real email for booking confirmations and account-related messages — configurable alert channels are coming later.
          </p>
        </div>
      </div>
    </div>
  );
}
