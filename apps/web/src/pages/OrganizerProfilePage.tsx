import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { formatINR } from '../lib/format';

interface OrganizerEvent {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  eventDate: string;
  venueAddress: string | null;
  bannerUrl: string | null;
  minPricePaise: number | null;
}

interface OrganizerDetail {
  slug: string;
  name: string;
  logoUrl: string | null;
  about: string | null;
  contactEmail: string | null;
  events: OrganizerEvent[];
}

const PLACEHOLDER_EVENT_IMAGE = 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=800&q=80';

export function OrganizerProfilePage() {
  const { organizerSlug } = useParams();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [organizer, setOrganizer] = useState<OrganizerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!organizerSlug) return undefined;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    fetch(`/api/organizers/${organizerSlug}`)
      .then((res) => {
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return null;
        }
        if (!res.ok) throw new Error('Failed to load organizer');
        return res.json();
      })
      .then((data) => {
        if (!cancelled && data) setOrganizer(data);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizerSlug]);

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((c) => (c === msg ? null : c));
    }, 2800);
  }

  function handleShare() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      showToast('Organizer profile link copied to clipboard!');
    } else {
      showToast('Profile link: ' + window.location.href);
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-20 text-center">
          <p className="text-slate-500 font-semibold text-sm">Loading organizer…</p>
        </div>
      </Layout>
    );
  }

  if (notFound || !organizer) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-20 text-center">
          <h1 className="text-xl font-bold text-slate-900">Organizer not found</h1>
          <p className="text-sm text-slate-500 mt-2">This organizer doesn't exist, or isn't verified yet.</p>
          <Link to="/organizers" className="inline-block mt-6 px-5 py-2.5 rounded-lg bg-primary text-white font-semibold text-sm">
            Browse Organizers
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col w-full bg-[#f8f9ff]">

        {/* BREADCRUMB */}
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-4 pb-2">
          <nav className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <Link to="/" className="hover:text-primary transition">Home</Link>
            <span>/</span>
            <Link to="/organizers" className="hover:text-primary transition">Organizers</Link>
            <span>/</span>
            <span className="text-slate-800 font-semibold">{organizer.name}</span>
          </nav>
        </div>

        {/* HERO BANNER SECTION */}
        <section className="relative overflow-hidden bg-gradient-to-r from-[#d9e6fc] via-[#eaf2ff] to-[#d6e7ff] border-y border-slate-200/80">

          <div className="absolute inset-0 opacity-40 pointer-events-none">
            <img
              src="https://images.unsplash.com/photo-1544216428-d0e10da5ee56?q=80&w=1600&auto=format&fit=crop"
              alt=""
              className="w-full h-full object-cover object-right"
            />
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 relative z-10">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-6 sm:gap-8">

              {/* Circular Avatar Logo Badge — real logo if the organizer has
                  one, otherwise their initial letter, never a fabricated logo */}
              <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-white shadow-xl border-4 border-white flex flex-col items-center justify-center p-3 shrink-0 text-center relative z-10 overflow-hidden">
                {organizer.logoUrl ? (
                  <img src={organizer.logoUrl} alt={organizer.name} className="w-full h-full object-cover rounded-full" />
                ) : (
                  <span className="text-3xl sm:text-4xl font-black text-primary">{organizer.name.charAt(0).toUpperCase()}</span>
                )}
              </div>

              {/* Organizer Details */}
              <div className="flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#0b1c30] tracking-tight uppercase">
                    {organizer.name}
                  </h1>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary bg-blue-100/80 px-2.5 py-1 rounded-full">
                    <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                      verified
                    </span>{' '}
                    Verified Organizer
                  </span>
                </div>

                {organizer.about && (
                  <p className="text-xs sm:text-sm text-slate-700 max-w-2xl leading-relaxed">
                    {organizer.about}
                  </p>
                )}

                {/* Contact Badges Row — only real, known contact info */}
                {organizer.contactEmail && (
                  <div className="flex flex-wrap items-center gap-y-2 gap-x-5 text-xs text-slate-600 pt-1 font-medium">
                    <a href={`mailto:${organizer.contactEmail}`} className="flex items-center gap-1.5 hover:text-primary transition">
                      <span className="material-symbols-outlined text-[15px] text-slate-400">mail</span>
                      <span>{organizer.contactEmail}</span>
                    </a>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => document.getElementById('organizer-events')?.scrollIntoView({ behavior: 'smooth' })}
                    className="px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-container text-white font-semibold text-xs sm:text-sm shadow-sm transition flex items-center gap-1.5 active:scale-98"
                  >
                    View Events <span className="material-symbols-outlined text-base">arrow_downward</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleShare}
                    aria-label="Share profile"
                    className="w-10 h-10 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm flex items-center justify-center transition active:scale-95"
                  >
                    <span className="material-symbols-outlined text-lg">share</span>
                  </button>
                </div>
              </div>

              {/* Right Side Stats Card */}
              <div className="hidden lg:flex flex-col items-end self-end z-10 space-y-4">
                <div className="bg-white/95 backdrop-blur-md px-4 py-2.5 rounded-xl shadow-md border border-slate-200/80 flex items-center gap-3">
                  <span className="material-symbols-outlined text-2xl text-primary">calendar_month</span>
                  <div>
                    <span className="text-base font-extrabold text-slate-900 block leading-none">{organizer.events.length}</span>
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Upcoming Events</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ABOUT THE ORGANIZER CARD — only shown when there's real content */}
        {(organizer.about || organizer.contactEmail) && (
          <section className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-sm">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">

                {organizer.about && (
                  <div className="lg:col-span-6 space-y-2">
                    <h2 className="text-xl font-bold text-[#0b1c30] tracking-tight">About the Organizer</h2>
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{organizer.about}</p>
                  </div>
                )}

                {organizer.contactEmail && (
                  <div className={`grid grid-cols-1 sm:grid-cols-3 gap-4 ${organizer.about ? 'lg:col-span-6 border-t lg:border-t-0 lg:border-l border-slate-100 lg:pl-6 pt-4 lg:pt-0' : 'lg:col-span-12'}`}>
                    <div className="flex items-start gap-2.5">
                      <span className="material-symbols-outlined text-primary text-xl mt-0.5">mail</span>
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">Contact</span>
                        <a href={`mailto:${organizer.contactEmail}`} className="text-xs text-primary hover:underline font-medium break-all">
                          {organizer.contactEmail}
                        </a>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </section>
        )}

        {/* UPCOMING EVENTS SECTION */}
        <section id="organizer-events" className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-[#0b1c30] tracking-tight">Upcoming Events</h2>
              <p className="text-sm text-slate-500 mt-0.5">Explore the latest experiences hosted by {organizer.name}.</p>
            </div>
            <Link to="/events" className="text-xs sm:text-sm font-semibold text-primary hover:underline flex items-center gap-1">
              View All Events <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </Link>
          </div>

          {organizer.events.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-slate-600 font-semibold text-sm">No upcoming events right now — check back soon.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {organizer.events.map((event) => (
                <div
                  key={event.id}
                  className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between group"
                >
                  <div className="relative h-48 w-full overflow-hidden bg-slate-100">
                    <img
                      src={event.bannerUrl || PLACEHOLDER_EVENT_IMAGE}
                      alt={event.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900 text-base leading-snug tracking-tight group-hover:text-primary transition">
                        {event.name}
                      </h3>

                      <div className="space-y-1.5 my-3 text-xs text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[15px] text-slate-400">calendar_today</span>
                          <span>{new Date(event.eventDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[15px] text-slate-400">location_on</span>
                          <span>{event.venueAddress || 'Venue to be announced'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <span className="text-[11px] text-slate-400 uppercase font-semibold block">From</span>
                        <span className="text-base font-extrabold text-slate-900">
                          {event.minPricePaise != null ? formatINR(Math.round(event.minPricePaise / 100)) : '—'}
                        </span>
                      </div>

                      <Link
                        to={`/events/${event.slug}`}
                        className="px-4 py-2 rounded-lg bg-slate-50 group-hover:bg-primary text-slate-700 group-hover:text-white font-semibold text-xs border border-slate-200 group-hover:border-primary transition flex items-center gap-1"
                      >
                        View Event <span className="material-symbols-outlined text-xs">arrow_forward</span>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* BOTTOM PROMO HERO CARD */}
        <section className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-14">
          <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-[#eef4ff] via-[#e5eeff] to-[#d6e6ff] p-6 sm:p-10 border border-blue-200/60 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6">

            <div className="max-w-lg space-y-2 text-center sm:text-left">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0b1c30] tracking-tight">
                Looking for your next experience?
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Discover events from organizers on Inveon Events.
              </p>
            </div>

            <div className="flex items-center gap-6 shrink-0">
              <Link
                to="/events"
                className="px-6 py-3 rounded-lg bg-primary hover:bg-primary-container text-white font-semibold text-sm shadow-md transition flex items-center gap-2 active:scale-98"
              >
                Explore Events <span className="material-symbols-outlined text-base">arrow_forward</span>
              </Link>
            </div>

          </div>
        </section>

        {/* FLOATING TOAST NOTIFICATION */}
        {toastMessage && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-[#0b1c30] text-white px-4 py-2.5 rounded-full shadow-xl border border-slate-700 text-xs sm:text-sm transition-all duration-200 animate-in fade-in slide-in-from-top-4">
            <span className="material-symbols-outlined text-emerald-400 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
              check_circle
            </span>
            <span>{toastMessage}</span>
          </div>
        )}

      </div>
    </Layout>
  );
}
