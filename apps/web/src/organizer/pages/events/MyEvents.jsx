import React, { useState } from 'react';
import { NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Calendar,
  Search,
  Filter,
  Plus,
  MoreVertical,
  Clock,
  MapPin,
  Users,
  CreditCard,
  Copy,
  Trash2,
  Edit,
  ExternalLink,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import StatusBadge from '../../components/common/StatusBadge';
import Tabs from '../../components/common/Tabs';
import { useEvents } from '../../context/EventsContext';

export default function MyEvents() {
  const { events, duplicateEvent, deleteEvent, toggleEventStatus } = useEvents();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const currentTab = searchParams.get('tab') || 'all';
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [activeMenuId, setActiveMenuId] = useState(null);

  const tabs = [
    { id: 'all', label: 'All Events', count: events.length },
    { id: 'published', label: 'Published', count: events.filter(e => e.status === 'published').length },
    { id: 'draft', label: 'Drafts', count: events.filter(e => e.status === 'draft').length },
    { id: 'completed', label: 'Completed', count: events.filter(e => e.status === 'completed').length },
    { id: 'cancelled', label: 'Cancelled', count: events.filter(e => e.status === 'cancelled').length },
  ];

  const handleTabChange = (tabId) => {
    if (tabId === 'all') {
      searchParams.delete('tab');
    } else {
      searchParams.set('tab', tabId);
    }
    setSearchParams(searchParams);
  };

  // Filter logic
  const filteredEvents = events.filter((e) => {
    // Tab filter
    if (currentTab !== 'all' && e.status !== currentTab) return false;
    // Category filter
    if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
    // Search filter
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchTitle = e.title.toLowerCase().includes(q);
      const matchCity = e.city?.toLowerCase().includes(q);
      const matchCat = e.category?.toLowerCase().includes(q);
      if (!matchTitle && !matchCity && !matchCat) return false;
    }
    return true;
  });

  const categories = ['all', ...new Set(events.map(e => e.category))];

  return (
    <div className="space-y-6">
      {/* Header Banner & New Event Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Events Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage your published experiences, track ticket sales, draft itineraries, and event performance.
          </p>
        </div>

        <NavLink
          to="/organizer/create-event/basic"
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Event</span>
        </NavLink>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <Tabs tabs={tabs} activeTab={currentTab} onChange={handleTabChange} />

          {/* Search & Category Filter Controls */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 md:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search events..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="py-1.5 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="all">All Categories</option>
              {categories.filter(c => c !== 'all').map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Events List Grid */}
        <div className="p-4">
          {filteredEvents.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-700">No events found</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                No events match your current tab or search criteria. Try modifying your filters or create a new event.
              </p>
              <NavLink
                to="/organizer/create-event/basic"
                className="inline-flex items-center gap-1.5 mt-4 px-3.5 py-2 bg-brand-600 text-white rounded-lg text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create an Event</span>
              </NavLink>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredEvents.map((event) => {
                const capacityPercent = Math.min(100, Math.round((event.ticketsSold / (event.totalCapacity || 1)) * 100));

                return (
                  <div
                    key={event.id}
                    className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
                  >
                    {/* Event Banner */}
                    <div className="relative h-44 overflow-hidden bg-slate-100">
                      <img
                        src={event.bannerImage}
                        alt={event.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent"></div>

                      <div className="absolute top-3 left-3">
                        <StatusBadge status={event.status} />
                      </div>

                      <div className="absolute top-3 right-3 relative">
                        <button
                          onClick={() => setActiveMenuId(activeMenuId === event.id ? null : event.id)}
                          className="p-1.5 bg-slate-900/60 hover:bg-slate-900 text-white rounded-lg backdrop-blur-xs transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {/* Dropdown Action Menu */}
                        {activeMenuId === event.id && (
                          <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-30 animate-in fade-in zoom-in-95">
                            <button
                              onClick={() => {
                                duplicateEvent(event.id);
                                setActiveMenuId(null);
                              }}
                              className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                            >
                              <Copy className="w-3.5 h-3.5 text-slate-400" />
                              <span>Duplicate Event</span>
                            </button>
                            <NavLink
                              to={`/organizer/events/${event.id}/preview`}
                              className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                              <span>Customer Preview</span>
                            </NavLink>
                            <button
                              onClick={() => {
                                toggleEventStatus(event.id, event.status === 'published' ? 'draft' : 'published');
                                setActiveMenuId(null);
                              }}
                              className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                            >
                              <Edit className="w-3.5 h-3.5 text-slate-400" />
                              <span>{event.status === 'published' ? 'Unpublish to Draft' : 'Publish Live'}</span>
                            </button>
                            <div className="border-t border-slate-100 my-1"></div>
                            <button
                              onClick={() => {
                                if (confirm(`Are you sure you want to delete "${event.title}"?`)) {
                                  deleteEvent(event.id);
                                }
                                setActiveMenuId(null);
                              }}
                              className="w-full text-left px-3.5 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete Event</span>
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="absolute bottom-3 left-3 right-3 text-white">
                        <span className="text-[10px] uppercase font-bold text-cyan-300 tracking-wider">
                          {event.category}
                        </span>
                        <h3 className="text-sm font-bold truncate mt-0.5">{event.title}</h3>
                      </div>
                    </div>

                    {/* Card Content Details */}
                    <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                      <div className="space-y-2 text-xs text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{event.startDate} • {event.startTime}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{event.venueName}, {event.city}</span>
                        </div>
                      </div>

                      {/* Ticket Sales Bar */}
                      <div className="pt-2 border-t border-slate-100">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-slate-500 font-medium">Tickets Sold</span>
                          <span className="font-bold text-slate-900">
                            {event.ticketsSold} / {event.totalCapacity} ({capacityPercent}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-2 rounded-full ${
                              capacityPercent >= 100 ? 'bg-amber-500' : 'bg-brand-600'
                            }`}
                            style={{ width: `${capacityPercent}%` }}
                          ></div>
                        </div>

                        <div className="flex items-center justify-between mt-2 text-xs">
                          <span className="text-slate-500">Gross Revenue</span>
                          <span className="font-bold text-slate-900">
                            ₹{(event.grossRevenue || 0).toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>

                      {/* Card Action Buttons */}
                      <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                        <NavLink
                          to={`/organizer/events/${event.id}/dashboard`}
                          className="flex-1 py-2 text-center text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors"
                        >
                          Event Workspace
                        </NavLink>
                        <NavLink
                          to={`/organizer/events/${event.id}/preview`}
                          className="p-2 text-slate-500 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                          title="View Live Preview"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </NavLink>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
