import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Calendar,
  PlusCircle,
  Ticket,
  Users,
  CreditCard,
  QrCode,
  RotateCcw,
  Settings,
  Bell,
  FileSpreadsheet
} from 'lucide-react';
import { useEvents } from '../../context/EventsContext';
import { useNotifications } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import UserAvatar from '../common/UserAvatar';

const ROLE_LABELS = {
  organizer_owner: 'Owner',
  organizer_staff: 'Staff',
  gate_volunteer: 'Gate Volunteer',
};

export default function Sidebar({ mobileOpen, setMobileOpen }) {
  const { events } = useEvents();
  const { unreadCount } = useNotifications();
  const { user } = useAuth();
  const navigate = useNavigate();

  const mainNavItems = [
    { label: 'Dashboard', path: '/organizer/dashboard', icon: LayoutDashboard },
    { label: 'My Events', path: '/organizer/events', icon: Calendar, badge: events.length },
    { label: 'Bookings', path: '/organizer/bookings', icon: FileSpreadsheet },
    { label: 'Tickets', path: '/organizer/tickets', icon: Ticket },
    { label: 'Participants', path: '/organizer/participants', icon: Users },
    { label: 'Payments', path: '/organizer/payments', icon: CreditCard },
    { label: 'Live Check-In', path: '/organizer/check-in', icon: QrCode, highlight: true },
    { label: 'Cancellations', path: '/organizer/cancellations-refunds', icon: RotateCcw },
    { label: 'Notifications', path: '/organizer/notifications', icon: Bell, badge: unreadCount > 0 ? unreadCount : null },
    { label: 'Settings', path: '/organizer/settings/account', icon: Settings },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-navy-900 text-slate-300 flex flex-col justify-between transition-transform duration-300 transform ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 lg:static lg:min-h-screen lg:shrink-0 border-r border-navy-800`}
      >
        <div className="flex flex-col h-full overflow-y-auto no-scrollbar">
          {/* Brand Header */}
          <div className="p-4 border-b border-navy-800/80 flex items-center justify-between">
            <div 
              onClick={() => { navigate('/organizer/dashboard'); setMobileOpen(false); }}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <div className="relative flex items-center justify-center">
                <svg className="w-8 h-8 group-hover:scale-105 transition-transform" fill="none" viewBox="0 0 40 40">
                  <rect fill="#0066FF" fillOpacity="0.85" height="16" rx="3" width="16" x="2" y="8"></rect>
                  <rect fill="#2E90FA" height="16" rx="3" width="16" x="14" y="2"></rect>
                  <rect fill="#004EEB" height="16" rx="3" width="16" x="18" y="16"></rect>
                  <path d="M16 14L24 22M24 14L16 22" stroke="white" strokeLinecap="round" strokeWidth="2"></path>
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <span className="text-white font-black text-base tracking-wider leading-none">INVEON</span>
                  <span className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider">EVENTS</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">Organizer Workspace</p>
              </div>
            </div>
          </div>

          {/* Quick Create Button */}
          <div className="p-3">
            <NavLink
              to="/organizer/create-event/basic"
              onClick={() => setMobileOpen(false)}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs shadow-md transition-all duration-150"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create Event</span>
            </NavLink>
          </div>

          {/* Navigation Links */}
          <div className="px-3 py-2 space-y-4 flex-1">
            <nav className="space-y-1">
              {mainNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-brand-600 text-white shadow-xs font-semibold'
                          : 'text-slate-300 hover:bg-navy-800 hover:text-white'
                      }`
                    }
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-navy-750 text-slate-200 border border-navy-700">
                        {item.badge}
                      </span>
                    )}
                    {item.highlight && !item.badge && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                        LIVE
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          {/* Footer User Info */}
          <div className="p-3 border-t border-navy-800/80 bg-navy-950/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <UserAvatar src={user?.avatar} name={user?.orgName || user?.name || user?.email} className="w-8 h-8 text-xs shadow-xs ring-1 ring-white/20" />
                <div className="overflow-hidden">
                  <p className="text-xs font-semibold text-white truncate">{user?.name}</p>
                  <p className="text-[10px] text-slate-400 truncate">{user?.orgName || ROLE_LABELS[user?.role] || ''}</p>
                </div>
              </div>
              <NavLink to="/organizer/settings/account" className="p-1.5 text-slate-400 hover:text-white hover:bg-navy-800 rounded">
                <Settings className="w-4 h-4" />
              </NavLink>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
