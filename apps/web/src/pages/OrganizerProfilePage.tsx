import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { rajgadTrek, otherOrganizerEvents } from '../mockData/rajgadTrek';
import { formatINR } from '../lib/format';

export function OrganizerProfilePage() {
  const { organizerSlug } = useParams();
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const organizer = rajgadTrek.organizer;

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

  const allEvents = [
    {
      id: rajgadTrek.id,
      name: rajgadTrek.name,
      date: '20 Sep 2026',
      location: 'Pune, Maharashtra',
      price: 499,
      category: 'Trek',
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDb3kLEyre--DvykOTt1Z23K1GJIONOJXU56YD8x50r33WBhBT58rgeyQWDT32BFwKXAUxQkZweqycw2vUZNRyyGXOk94zpZwzMivFrdaJt6BpV_T7K-XR5h2-Sjcj7zqLiWovK3nOGq0iScQD5fCRJWdCDImXt5KmfZIbwGHkVC_0XS8cllxOLC97r4ePSKxwiBY3K5nVZNQEu4k3IztMPuWSMrXz-O5d8en0GRQ9e',
    },
    ...otherOrganizerEvents,
  ];

  return (
    <Layout>
      <div className="flex flex-col w-full bg-[#f8f9ff]">
        
        {/* BREADCRUMB */}
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-4 pb-2">
          <nav className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <Link to="/" className="hover:text-primary transition">Home</Link>
            <span>/</span>
            <Link to="/#categories" className="hover:text-primary transition">Organizers</Link>
            <span>/</span>
            <span className="text-slate-800 font-semibold">{organizer.name}</span>
          </nav>
        </div>

        {/* HERO BANNER SECTION */}
        <section className="relative overflow-hidden bg-gradient-to-r from-[#d9e6fc] via-[#eaf2ff] to-[#d6e7ff] border-y border-slate-200/80">
          
          {/* Background Scenic Mountain Landscape & Hikers Graphic */}
          <div className="absolute inset-0 opacity-40 pointer-events-none">
            <img
              src="https://images.unsplash.com/photo-1544216428-d0e10da5ee56?q=80&w=1600&auto=format&fit=crop"
              alt="Mountain Skyline"
              className="w-full h-full object-cover object-right"
            />
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 relative z-10">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-6 sm:gap-8">
              
              {/* Circular Avatar Logo Badge */}
              <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-white shadow-xl border-4 border-white flex flex-col items-center justify-center p-3 shrink-0 text-center relative z-10">
                {/* Mountain Logo graphic */}
                <div className="w-12 h-10 sm:w-14 sm:h-12 flex items-center justify-center text-primary">
                  <svg className="w-full h-full" viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="28" cy="24" r="12" fill="#F59E0B" />
                    <polygon points="10,75 45,25 75,75" fill="#0B1C30" />
                    <polygon points="35,75 60,35 85,75" fill="#0050CB" />
                    <polygon points="45,25 52,38 42,42 38,36" fill="#ffffff" />
                  </svg>
                </div>
                <span className="text-[10px] sm:text-[11px] font-extrabold text-[#0b1c30] uppercase tracking-tight leading-tight mt-1">
                  EXAMPLE<br />ADVENTURES
                </span>
                <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  EXPLORE MORE
                </span>
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

                <p className="text-xs sm:text-sm font-semibold text-slate-600">
                  Adventure • Travel • Outdoor Experiences
                </p>

                <p className="text-xs sm:text-sm text-slate-700 max-w-2xl leading-relaxed">
                  Creating memorable outdoor experiences, treks and weekend adventures for people who love exploring.
                </p>

                {/* Contact Badges Row */}
                <div className="flex flex-wrap items-center gap-y-2 gap-x-5 text-xs text-slate-600 pt-1 font-medium">
                  <a href="https://exampleadventures.in" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-primary transition">
                    <span className="material-symbols-outlined text-[15px] text-slate-400">link</span>
                    <span>exampleadventures.in</span>
                  </a>
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-slate-400">location_on</span>
                    <span>Pune, Maharashtra</span>
                  </span>
                  <a href="mailto:contact@exampleadventures.in" className="flex items-center gap-1.5 hover:text-primary transition">
                    <span className="material-symbols-outlined text-[15px] text-slate-400">mail</span>
                    <span>contact@exampleadventures.in</span>
                  </a>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => document.getElementById('organizer-events')?.scrollIntoView({ behavior: 'smooth' })}
                    className="px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-container text-white font-semibold text-xs sm:text-sm shadow-sm transition flex items-center gap-1.5 active:scale-98"
                  >
                    View Events <span className="material-symbols-outlined text-base">arrow_downward</span>
                  </button>

                  <a
                    href="https://exampleadventures.in"
                    target="_blank"
                    rel="noreferrer"
                    className="px-5 py-2.5 rounded-lg bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs sm:text-sm border border-slate-300 shadow-sm transition flex items-center gap-1.5 active:scale-98"
                  >
                    Visit Website <span className="material-symbols-outlined text-base">arrow_outward</span>
                  </a>

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
                {/* Handwritten Tagline */}
                <span className="font-serif italic font-medium text-slate-700 text-sm tracking-wide transform rotate-[-3deg] block mb-2">
                  More<br />Adventures<br />Brighter People
                </span>

                {/* 3 Upcoming Events pill */}
                <div className="bg-white/95 backdrop-blur-md px-4 py-2.5 rounded-xl shadow-md border border-slate-200/80 flex items-center gap-3">
                  <span className="material-symbols-outlined text-2xl text-primary">calendar_month</span>
                  <div>
                    <span className="text-base font-extrabold text-slate-900 block leading-none">{allEvents.length}</span>
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Upcoming Events</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ABOUT THE ORGANIZER CARD */}
        <section className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              
              {/* Left Column: Description */}
              <div className="lg:col-span-6 space-y-2">
                <h2 className="text-xl font-bold text-[#0b1c30] tracking-tight">About the Organizer</h2>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Example Adventures creates curated outdoor experiences including treks, weekend trips and adventure activities. Our goal is to make discovering and joining memorable experiences simple, safe and enjoyable.
                </p>
              </div>

              {/* Right Column: Contact & Location Grid */}
              <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t lg:border-t-0 lg:border-l border-slate-100 lg:pl-6 pt-4 lg:pt-0">
                <div className="flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-primary text-xl mt-0.5">language</span>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Website</span>
                    <a href="https://exampleadventures.in" target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline font-medium break-all">
                      exampleadventures.in
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-primary text-xl mt-0.5">location_on</span>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Location</span>
                    <span className="text-xs text-slate-600 font-medium">Pune, Maharashtra</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-primary text-xl mt-0.5">mail</span>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Contact</span>
                    <a href="mailto:contact@exampleadventures.in" className="text-xs text-primary hover:underline font-medium break-all">
                      contact@exampleadventures.in
                    </a>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* UPCOMING EVENTS SECTION */}
        <section id="organizer-events" className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-[#0b1c30] tracking-tight">Upcoming Events</h2>
              <p className="text-sm text-slate-500 mt-0.5">Explore the latest experiences hosted by {organizer.name}.</p>
            </div>
            <Link to="/" className="text-xs sm:text-sm font-semibold text-primary hover:underline flex items-center gap-1">
              View All Events <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </Link>
          </div>

          {/* 3-Column Event Card Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {allEvents.map((event) => (
              <div
                key={event.id}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between group"
              >
                {/* Image Banner with Category Tag */}
                <div className="relative h-48 w-full overflow-hidden bg-slate-100">
                  <img
                    src={event.image}
                    alt={event.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <span className="absolute top-3 left-3 bg-white/90 backdrop-blur-md text-slate-800 text-[11px] font-bold px-3 py-1 rounded-full shadow-sm">
                    {event.category}
                  </span>
                </div>

                {/* Card Body */}
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base leading-snug tracking-tight group-hover:text-primary transition">
                      {event.name}
                    </h3>

                    <div className="space-y-1.5 my-3 text-xs text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[15px] text-slate-400">calendar_today</span>
                        <span>{event.date}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[15px] text-slate-400">location_on</span>
                        <span>{event.location}</span>
                      </div>
                    </div>
                  </div>

                  {/* Price & Action Button */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-slate-400 uppercase font-semibold block">From</span>
                      <span className="text-base font-extrabold text-slate-900">{formatINR(event.price)}</span>
                    </div>

                    <Link
                      to={`/events/${rajgadTrek.id}`}
                      className="px-4 py-2 rounded-lg bg-slate-50 group-hover:bg-primary text-slate-700 group-hover:text-white font-semibold text-xs border border-slate-200 group-hover:border-primary transition flex items-center gap-1"
                    >
                      View Event <span className="material-symbols-outlined text-xs">arrow_forward</span>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
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
                to="/"
                className="px-6 py-3 rounded-lg bg-primary hover:bg-primary-container text-white font-semibold text-sm shadow-md transition flex items-center gap-2 active:scale-98"
              >
                Explore Events <span className="material-symbols-outlined text-base">arrow_forward</span>
              </Link>

              {/* Handwritten Good Experiences Go Further */}
              <div className="hidden md:block text-right">
                <span className="font-serif italic font-semibold text-slate-700 text-sm tracking-wide block transform rotate-[-4deg]">
                  Good<br />Experiences<br />Go Further
                </span>
              </div>
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

