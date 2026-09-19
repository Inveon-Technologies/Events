import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Trash2, Calendar, CreditCard, Shield, RotateCcw } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import Tabs from '../components/common/Tabs';

export default function NotificationsPage() {
  const { notifications, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const [activeTab, setActiveTab] = useState('all');
  const navigate = useNavigate();

  const tabs = [
    { id: 'all', label: 'All Notifications', count: notifications.length },
    { id: 'unread', label: 'Unread', count: notifications.filter(n => !n.read).length },
    { id: 'bookings', label: 'Bookings', count: notifications.filter(n => n.category === 'bookings').length },
    { id: 'payments', label: 'Financials', count: notifications.filter(n => n.category === 'payments').length },
  ];

  const filtered = notifications.filter((n) => {
    if (activeTab === 'unread') return !n.read;
    if (activeTab !== 'all' && n.category !== activeTab) return false;
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Organizer Notifications Feed</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time feed of ticket purchases, refunds, check-in summaries, and platform updates.
          </p>
        </div>

        <button
          onClick={markAllAsRead}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 shadow-xs"
        >
          <CheckCheck className="w-4 h-4 text-brand-600" />
          <span>Mark All as Read</span>
        </button>
      </div>

      {/* Tabs and Feed */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
        </div>

        <div className="divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              <Bell className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="font-bold text-slate-700">No notifications in this filter</p>
            </div>
          ) : (
            filtered.map((notif) => (
              <div
                key={notif.id}
                onClick={() => {
                  markAsRead(notif.id);
                  if (notif.link) navigate(notif.link);
                }}
                className={`p-4 sm:p-5 flex items-start justify-between gap-4 hover:bg-slate-50 cursor-pointer transition-colors ${
                  !notif.read ? 'bg-blue-50/40 font-medium' : ''
                }`}
              >
                <div className="flex items-start gap-3.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    notif.category === 'bookings' ? 'bg-blue-100 text-brand-600' :
                    notif.category === 'payments' ? 'bg-emerald-100 text-emerald-700' :
                    notif.category === 'cancellations' ? 'bg-rose-100 text-rose-700' :
                    'bg-slate-100 text-slate-700'
                  }`}>
                    {notif.category === 'bookings' && <Calendar className="w-4 h-4" />}
                    {notif.category === 'payments' && <CreditCard className="w-4 h-4" />}
                    {notif.category === 'cancellations' && <RotateCcw className="w-4 h-4" />}
                    {notif.category === 'security' && <Shield className="w-4 h-4" />}
                    {!['bookings', 'payments', 'cancellations', 'security'].includes(notif.category) && <Bell className="w-4 h-4" />}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-slate-900">{notif.title}</h4>
                      {!notif.read && (
                        <span className="w-2 h-2 rounded-full bg-brand-600"></span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{notif.message}</p>
                    <span className="text-[10px] text-slate-400 block mt-1.5">{notif.timestamp}</span>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteNotification(notif.id);
                  }}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
