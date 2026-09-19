import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Menu,
  Bell,
  Search,
  Plus,
  QrCode,
  ExternalLink,
  ChevronDown,
  LogOut,
  User,
  Settings as SettingsIcon,
  HelpCircle,
  Layers
} from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { useEvents } from '../../context/EventsContext';

export default function Header({ setMobileOpen }) {
  const { notifications, unreadCount, markAsRead } = useNotifications();
  const { user, logout } = useAuth();
  const { events } = useEvents();
  const navigate = useNavigate();
  const location = useLocation();

  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Handle global search
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    navigate(`/organizer/events?q=${encodeURIComponent(searchQuery)}`);
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-xs">
      <div className="px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left Mobile Menu Toggle & Title / Search */}
        <div className="flex items-center gap-3 flex-1 max-w-xl">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            aria-label="Open Navigation"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Search bar */}
          <form onSubmit={handleSearchSubmit} className="relative w-full max-w-md hidden sm:block">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search events, bookings, attendees, ticket codes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors"
            />
          </form>
        </div>

        {/* Right Action Icons & Controls */}
        <div className="flex items-center gap-2 sm:gap-3">

          {/* Live Check-In Station Button */}
          <NavLink
            to="/organizer/check-in"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
          >
            <QrCode className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Check-In Tool</span>
          </NavLink>

          {/* Create Event CTA */}
          <NavLink
            to="/organizer/create-event/basic"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Event</span>
          </NavLink>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowNotifMenu(!showNotifMenu);
                setShowProfileMenu(false);
              }}
              className="relative p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white"></span>
              )}
            </button>

            {showNotifMenu && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                  <span className="font-bold text-sm text-slate-900">Notifications</span>
                  <NavLink
                    to="/organizer/notifications"
                    onClick={() => setShowNotifMenu(false)}
                    className="text-xs text-brand-600 font-semibold hover:underline"
                  >
                    View All
                  </NavLink>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                  {notifications.slice(0, 4).map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => {
                        markAsRead(notif.id);
                        if (notif.link) navigate(notif.link);
                        setShowNotifMenu(false);
                      }}
                      className={`p-3 text-xs hover:bg-slate-50 cursor-pointer transition-colors ${
                        !notif.read ? 'bg-blue-50/50 font-medium' : 'text-slate-600'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-slate-900">{notif.title}</p>
                        <span className="text-[10px] text-slate-400 shrink-0">{notif.timestamp}</span>
                      </div>
                      <p className="text-slate-600 mt-1 line-clamp-2">{notif.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Profile Menu Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowProfileMenu(!showProfileMenu);
                setShowNotifMenu(false);
              }}
              className="flex items-center gap-2 p-1 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-navy-900 text-white font-bold text-xs flex items-center justify-center ring-2 ring-slate-100">
                EA
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 hidden sm:block" />
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-4 py-2.5 border-b border-slate-100">
                  <p className="text-xs font-bold text-slate-900">{user?.name || "Eeshan Agrawal"}</p>
                  <p className="text-[11px] text-slate-500 truncate">{user?.email || "eeshan.agrawal@inveon.dev"}</p>
                </div>
                <NavLink
                  to="/organizer/settings/account"
                  onClick={() => setShowProfileMenu(false)}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-brand-600"
                >
                  <User className="w-4 h-4" />
                  <span>Account Settings</span>
                </NavLink>
                <NavLink
                  to="/organizer/settings/organization"
                  onClick={() => setShowProfileMenu(false)}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-brand-600"
                >
                  <SettingsIcon className="w-4 h-4" />
                  <span>Organization Profile</span>
                </NavLink>
                <NavLink
                  to="/organizer/events/rajgad-sunrise-trek/preview"
                  onClick={() => setShowProfileMenu(false)}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-brand-600"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Customer Preview Page</span>
                </NavLink>
                <div className="border-t border-slate-100 my-1"></div>
                <button
                  onClick={() => {
                    logout();
                    setShowProfileMenu(false);
                    navigate('/organizer/login');
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
