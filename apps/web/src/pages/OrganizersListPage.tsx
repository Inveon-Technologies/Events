import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';

interface OrganizerSummary {
  slug: string;
  name: string;
  logoUrl: string | null;
  about: string | null;
  publishedEventCount: number;
}

export function OrganizersListPage() {
  const [organizers, setOrganizers] = useState<OrganizerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/organizers')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load organizers'))))
      .then((data) => {
        if (!cancelled) setOrganizers(data.organizers);
      })
      .catch(() => {
        if (!cancelled) setError('Unable to load organizers right now. Please try again shortly.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Layout>
      <div className="bg-[#f8fbff] min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Organizers</h1>
            <p className="text-sm text-slate-500 mt-1">Every registered and verified organizer hosting events on Inveon Events.</p>
          </div>

          {loading && (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-slate-600 font-semibold text-sm">Loading organizers…</p>
            </div>
          )}

          {!loading && error && (
            <div className="p-12 text-center bg-white rounded-2xl border border-red-200 shadow-sm">
              <p className="text-red-600 font-semibold text-sm">{error}</p>
            </div>
          )}

          {!loading && !error && organizers.length === 0 && (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-slate-600 font-semibold text-sm">No verified organizers yet — check back soon.</p>
            </div>
          )}

          {!loading && !error && organizers.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {organizers.map((org) => (
                <Link
                  key={org.slug}
                  to={`/organizers/${org.slug}`}
                  className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all flex flex-col"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-brand-50 flex items-center justify-center shrink-0 overflow-hidden border border-slate-100">
                      {org.logoUrl ? (
                        <img src={org.logoUrl} alt={org.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-lg font-black text-brand-600">{org.name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900 leading-snug truncate">{org.name}</h3>
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 mt-0.5">
                        <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                          verified
                        </span>
                        Verified
                      </span>
                    </div>
                  </div>

                  {org.about && <p className="text-xs text-slate-600 mt-4 line-clamp-3 leading-relaxed">{org.about}</p>}

                  <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500 font-medium">
                    {org.publishedEventCount} {org.publishedEventCount === 1 ? 'event' : 'events'} live
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
