import React from 'react';
import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/organizer/settings/account', label: 'Account Profile' },
  { to: '/organizer/settings/verification', label: 'Payment Verification' },
  { to: '/organizer/settings/organization', label: 'Organization & Team' },
  { to: '/organizer/settings/security', label: 'Security & 2FA' },
  { to: '/organizer/settings/notifications', label: 'Notification Alerts' },
  { to: '/organizer/settings/integrations', label: 'Integrations' },
];

// Shared tab bar for every settings page (each page used to carry its
// own hand-copied copy of this list).
export default function SettingsTabs() {
  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-slate-200 pb-2">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${
              isActive ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
}
