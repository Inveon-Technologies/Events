import React from 'react';
import { Bell } from 'lucide-react';
import SettingsTabs from '../../components/common/SettingsTabs';

export default function NotificationSettings() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Notification Channels & Alerts</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure how you and your team receive updates on bookings, payouts, and cancellations.
        </p>
      </div>

      <SettingsTabs />

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
