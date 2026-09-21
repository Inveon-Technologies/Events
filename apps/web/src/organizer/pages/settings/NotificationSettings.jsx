import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Bell, Mail, MessageSquare, Smartphone, Save } from 'lucide-react';
import { useEvents } from '../../context/EventsContext';
import { useNotifications } from '../../context/NotificationContext';

export default function NotificationSettings() {
  const { settings, updateNotificationSettings } = useEvents();
  const { showToast } = useNotifications();
  const [formData, setFormData] = useState(settings.notifications);

  const handleToggle = (key) => {
    const updated = { ...formData, [key]: !formData[key] };
    setFormData(updated);
    updateNotificationSettings(updated);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Notification Channels & Alerts</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure how you and your team receive instant updates on bookings, payouts, and cancellations.
        </p>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-slate-200 pb-2">
        <NavLink to="/organizer/settings/account" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Account Profile</NavLink>
        <NavLink to="/organizer/settings/verification" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Payment Verification</NavLink>
        <NavLink to="/organizer/settings/organization" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Organization & Team</NavLink>
        <NavLink to="/organizer/settings/security" className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Security & 2FA</NavLink>
        <NavLink to="/organizer/settings/notifications" className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-brand-600 text-white">Notification Alerts</NavLink>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-5">
        <div className="space-y-4 divide-y divide-slate-100">
          <div className="flex items-center justify-between pt-2">
            <div>
              <p className="text-xs font-bold text-slate-900">Email on New Booking</p>
              <p className="text-[11px] text-slate-500">Receive order confirmation copy whenever an attendee buys tickets.</p>
            </div>
            <input
              type="checkbox"
              checked={formData.emailOnNewBooking}
              onChange={() => handleToggle('emailOnNewBooking')}
              className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500"
            />
          </div>

          <div className="flex items-center justify-between pt-4">
            <div>
              <p className="text-xs font-bold text-slate-900">Email on Cancellation & Refund Request</p>
              <p className="text-[11px] text-slate-500">Immediate alert when an attendee asks for order cancellation.</p>
            </div>
            <input
              type="checkbox"
              checked={formData.emailOnCancellation}
              onChange={() => handleToggle('emailOnCancellation')}
              className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500"
            />
          </div>

          <div className="flex items-center justify-between pt-4">
            <div>
              <p className="text-xs font-bold text-slate-900">WhatsApp Instant Ticket Alerts</p>
              <p className="text-[11px] text-slate-500">Receive WhatsApp notifications for sold-out tiers and gate check-in milestones.</p>
            </div>
            <input
              type="checkbox"
              checked={formData.whatsappTicketAlerts}
              onChange={() => handleToggle('whatsappTicketAlerts')}
              className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500"
            />
          </div>

          <div className="flex items-center justify-between pt-4">
            <div>
              <p className="text-xs font-bold text-slate-900">Payout & Bank Settlement Updates</p>
              <p className="text-[11px] text-slate-500">Notifications when bank UTR references and payouts are dispatched.</p>
            </div>
            <input
              type="checkbox"
              checked={formData.payoutAlerts}
              onChange={() => handleToggle('payoutAlerts')}
              className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
