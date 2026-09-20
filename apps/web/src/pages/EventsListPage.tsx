import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { formatINR } from '../lib/format';
import { fetchDiscoverEvents, DiscoverEvent } from '../lib/events';

export function EventsListPage() {
  const [events, setEvents] = useState<DiscoverEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchDiscoverEvents()
      .then((data) => {
        if (!cancelled) setEvents(data);
      })
      .catch(() => {
        if (!cancelled) setError('Unable to load events right now. Please try again shortly.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredEvents = events.filter((event) => {
    if (searchQuery.trim() === '') return true;
    const q = searchQuery.toLowerCase();
    return (
      event.name.toLowerCase().includes(q) ||
      event.location.toLowerCase().includes(q) ||
      event.organizer.toLowerCase().includes(q)
    );
  });

  return (
    <Layout>
      <div className="bg-[#f8fbff] min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">All Events</h1>
            <p className="text-sm text-slate-500 mt-1">Every event currently live on Inveon Events, from every organizer.</p>
          </div>

          <div className="mb-8 max-w-md">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by event, city, or organizer"
              className="w-full px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 shadow-sm"
            />
          </div>

          {loading && (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-slate-600 font-semibold text-sm">Loading events…</p>
            </div>
          )}

          {!loading && error && (
            <div className="p-12 text-center bg-white rounded-2xl border border-red-200 shadow-sm">
              <p className="text-red-600 font-semibold text-sm">{error}</p>
            </div>
          )}

          {!loading && !error && filteredEvents.length === 0 && (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-slate-600 font-semibold text-sm">
                {events.length === 0 ? 'No events are live yet — check back soon.' : 'No events match your search.'}
              </p>
            </div>
          )}

          {!loading && !error && filteredEvents.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredEvents.map((event) => (
                <article
                  key={event.id}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-lg transition-shadow"
                >
                  <Link to={`/events/${event.id}`}>
                    <img src={event.image} alt={event.name} className="w-full h-44 object-cover" />
                  </Link>
                  <div className="p-5">
                    <h3 className="font-bold text-slate-900 leading-snug line-clamp-2">
                      <Link to={`/events/${event.id}`} className="hover:text-brand-600 transition-colors">
                        {event.name}
                      </Link>
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">{event.organizer}</p>

                    <div className="mt-4 space-y-1.5 text-xs text-slate-600">
                      <div>{event.date}</div>
                      <div>{event.location}</div>
                    </div>

                    <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <span className="text-[11px] text-slate-400 uppercase font-semibold block leading-tight">From</span>
                        <span className="text-lg font-black text-slate-900 leading-none">{formatINR(event.price)}</span>
                      </div>
                      <Link
                        to={`/events/${event.id}`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-3.5 py-2 rounded-lg transition-colors"
                      >
                        View Details
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
