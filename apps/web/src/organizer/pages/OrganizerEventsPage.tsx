import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOrganizerAuth } from '../context/AuthContext';
import { apiRequest, ApiError } from '../lib/api';
import { OrganizerLayout } from '../components/OrganizerLayout';

type DisplayEventStatus = 'draft' | 'published' | 'completed' | 'cancelled';

interface OrganizerEventRow {
  id: string;
  eventCode: string;
  name: string;
  eventDate: string;
  venueAddress: string | null;
  bannerUrl: string | null;
  capacity: number;
  ticketsSold: number;
  revenuePaise: number;
  displayStatus: DisplayEventStatus;
}

interface OrganizerEventsData {
  organizerName: string;
  counts: Record<'all' | DisplayEventStatus, number>;
  events: OrganizerEventRow[];
}

function formatINR(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function initials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

const STATUS_BADGE: Record<DisplayEventStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  published: 'bg-emerald-50 text-emerald-700',
  completed: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-red-50 text-red-700',
};

const TABS: { key: 'all' | DisplayEventStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Drafts' },
  { key: 'published', label: 'Published' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

type SortKey = 'newest' | 'oldest' | 'revenue_desc' | 'name_asc';

export function OrganizerEventsPage() {
  const { user, token, logout } = useOrganizerAuth();

  const [status, setStatus] = useState<'all' | DisplayEventStatus>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');

  const [data, setData] = useState<OrganizerEventsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setError(null);

    const params = new URLSearchParams();
    params.set('status', status);

    apiRequest<OrganizerEventsData>(`/organizer/events?${params.toString()}`, { token })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load events');
      });

    return () => {
      cancelled = true;
    };
  }, [user, token, status]);

  const visibleEvents = useMemo(() => {
    if (!data) return [];
    let rows = data.events;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (e) => e.name.toLowerCase().includes(q) || e.eventCode.toLowerCase().includes(q) || (e.venueAddress ?? '').toLowerCase().includes(q),
      );
    }
    const sorted = [...rows];
    if (sort === 'newest') sorted.sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
    else if (sort === 'oldest') sorted.sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
    else if (sort === 'revenue_desc') sorted.sort((a, b) => b.revenuePaise - a.revenuePaise);
    else if (sort === 'name_asc') sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [data, search, sort]);

  return (
    <OrganizerLayout activeNav="events" onLogout={logout} organizerName={data?.organizerName ?? null} pageTitle="My Events">
      <div className="space-y-5">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">
            {error}
          </div>
        )}

        {/* Search & Controls Toolbar */}
        <section className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3" data-purpose="toolbar-controls">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
              </svg>
            </div>
            <input
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-lg text-sm placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition shadow-sm"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search events by name, location or event ID..."
              type="text"
              value={search}
            />
          </div>
          <div className="flex items-center flex-wrap sm:flex-nowrap gap-2.5">
            <div className="relative inline-block">
              <select
                aria-label="Sort events"
                className="appearance-none inline-flex items-center justify-between px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition shadow-sm min-w-[170px] pr-8"
                onChange={(e) => setSort(e.target.value as SortKey)}
                value={sort}
              >
                <option value="newest">Sort: Newest First</option>
                <option value="oldest">Sort: Oldest First</option>
                <option value="revenue_desc">Sort: Revenue High-Low</option>
                <option value="name_asc">Sort: Name A-Z</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                </svg>
              </div>
            </div>
            <Link
              className="inline-flex items-center px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm transition"
              to="/organizer/events/new"
            >
              <span className="mr-1.5 font-bold">+</span> Create Event
            </Link>
          </div>
        </section>

        {/* Status Filter Tabs */}
        <section className="border-b border-slate-200" data-purpose="filter-tabs">
          <div className="flex space-x-6 overflow-x-auto no-scrollbar scroll-smooth">
            {TABS.map((tab) => (
              <button
                className={
                  status === tab.key
                    ? 'whitespace-nowrap pb-3 px-1 border-b-2 border-blue-600 text-sm font-semibold text-blue-600 transition'
                    : 'whitespace-nowrap pb-3 px-1 border-b-2 border-transparent text-sm font-medium text-slate-500 hover:text-slate-700 hover:border-slate-300 transition'
                }
                key={tab.key}
                onClick={() => setStatus(tab.key)}
                type="button"
              >
                {tab.label} ({data?.counts[tab.key] ?? 0})
              </button>
            ))}
          </div>
        </section>

        {/* Events Table */}
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-slate-50/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-4 font-semibold">Event</th>
                  <th className="py-3 px-4 font-semibold whitespace-nowrap">Date</th>
                  <th className="py-3 px-4 font-semibold">Location</th>
                  <th className="py-3 px-4 font-semibold">Tickets Sold</th>
                  <th className="py-3 px-4 font-semibold">Revenue</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {data && visibleEvents.length === 0 && (
                  <tr>
                    <td className="py-6 px-4 text-slate-500" colSpan={7}>
                      No events match these filters.
                    </td>
                  </tr>
                )}
                {visibleEvents.map((event) => {
                  const pct = event.capacity > 0 ? Math.min(100, (event.ticketsSold / event.capacity) * 100) : 0;
                  return (
                    <tr className="hover:bg-slate-50/70 transition" key={event.id}>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-3.5">
                          <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0 shadow-sm flex items-center justify-center text-slate-400 font-bold text-xs">
                            {event.bannerUrl ? (
                              <img alt={`${event.name} thumbnail`} className="w-full h-full object-cover" src={event.bannerUrl} />
                            ) : (
                              initials(event.name)
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-900 text-sm tracking-tight truncate block">{event.name}</span>
                            <div className="flex items-center space-x-2 mt-0.5">
                              <span className="text-xs text-slate-400 font-mono">#{event.eventCode}</span>
                            </div>
                            {/*
                              The mockup also shows a category badge
                              (TREK/WORKSHOP) and a public event URL here.
                              Left out deliberately: events have no category
                              field in this schema, and the public event page
                              isn't wired to real event data yet (Phase 1
                              FE-06 still uses mock data) — a link to it
                              would be misleading rather than useful.
                            */}
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-800">{formatDate(event.eventDate)}</div>
                        <div className="text-xs text-slate-400">{formatTime(event.eventDate)}</div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center text-slate-600 text-xs sm:text-sm">
                          <svg className="w-4 h-4 mr-1 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                            <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                          </svg>
                          {event.venueAddress ?? '—'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="text-xs font-semibold text-slate-800 mb-1">
                          <span className="text-sm font-bold">{event.ticketsSold}</span> <span className="text-slate-400">/ {event.capacity}</span>
                        </div>
                        <div className="w-28 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${pct}%` }}></div>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">{Math.max(0, event.capacity - event.ticketsSold)} seats available</div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap font-bold text-slate-900 text-sm">{formatINR(event.revenuePaise)}</td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-0.5 text-[11px] font-bold rounded-full tracking-wide uppercase ${STATUS_BADGE[event.displayStatus]}`}>
                          {event.displayStatus.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-right text-sm">
                        <div className="flex items-center justify-end space-x-2">
                          <Link className="inline-flex items-center font-medium text-blue-600 hover:text-blue-700 text-xs group" to={`/organizer/bookings?eventId=${event.id}`}>
                            View bookings <span className="ml-1 group-hover:translate-x-0.5 transition-transform">→</span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </OrganizerLayout>
  );
}
