import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { formatINR } from '../lib/format';
import { fetchDiscoverEvents, DiscoverEvent } from '../lib/events';
import heroTrekkerImg from '../assets/hero-trekker.jpg';
import rajgadMiniatureImg from '../assets/rajgad-miniature.jpg';

interface CategoryItem {
  id: string;
  name: string;
  icon: 'mountain' | 'map-pin' | 'presentation' | 'users' | 'activity' | 'landmark' | 'music' | 'layout-grid';
}

const CATEGORIES: CategoryItem[] = [
  { id: 'Trek', name: 'Treks', icon: 'mountain' },
  { id: 'Trip', name: 'Trips', icon: 'map-pin' },
  { id: 'Workshop', name: 'Workshops', icon: 'presentation' },
  { id: 'Conference', name: 'Conferences', icon: 'users' },
  { id: 'Sports', name: 'Sports', icon: 'activity' },
  { id: 'Cultural', name: 'Cultural', icon: 'landmark' },
  { id: 'Music', name: 'Entertainment', icon: 'music' },
  { id: 'Other', name: 'Other', icon: 'layout-grid' },
];

export function HomePage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [discoverEvents, setDiscoverEvents] = useState<DiscoverEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchDiscoverEvents()
      .then((events) => {
        if (!cancelled) setDiscoverEvents(events);
      })
      .catch(() => {
        if (!cancelled) setDiscoverEvents([]);
      })
      .finally(() => {
        if (!cancelled) setEventsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleFavorite(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setFavorites((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    document.getElementById('upcoming')?.scrollIntoView({ behavior: 'smooth' });
  }

  function handleCategoryClick(categoryId: string, e: React.MouseEvent) {
    e.preventDefault();
    setSelectedCategory((prev) => (prev === categoryId ? null : categoryId));
    document.getElementById('upcoming')?.scrollIntoView({ behavior: 'smooth' });
  }

  const filteredEvents = discoverEvents.filter((event) => {
    const matchesSearch =
      searchQuery.trim() === '' ||
      event.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.organizer.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCat =
      !selectedCategory ||
      event.category.toLowerCase() === selectedCategory.toLowerCase() ||
      (selectedCategory === 'Other' && !['Trek', 'Trip', 'Workshop', 'Music'].includes(event.category)) ||
      (selectedCategory === 'Music' && (event.category === 'Music' || event.category === 'Entertainment'));

    return matchesSearch && matchesCat;
  });

  return (
    <Layout>
      <div className="flex flex-col w-full bg-[#fafcff] text-slate-800 antialiased font-sans overflow-x-hidden selection:bg-brand-500 selection:text-white">
        
        {/* BEGIN: HeroSection */}
        <section className="relative bg-gradient-to-b from-blue-50/50 via-white to-white overflow-hidden pt-8 pb-16 lg:pt-14 lg:pb-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-8 items-center">
              
              {/* Left Column: Hero Text & CTAs */}
              <div className="lg:col-span-5 z-20 space-y-4 sm:space-y-6 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full bg-blue-50 border border-blue-200/80 text-brand-600 text-[11px] sm:text-xs font-bold tracking-wider uppercase shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-brand-600 animate-pulse"></span>
                  EVENT MANAGEMENT &amp; ONLINE BOOKING
                </div>

                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight sm:leading-[1.15]">
                  Discover. Book.<br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-sky-500">Experience.</span>
                </h1>

                <p className="text-sm sm:text-base lg:text-lg text-slate-600 leading-relaxed max-w-xl mx-auto lg:mx-0">
                  Find experiences worth showing up for — from treks and trips to workshops, conferences, sports, and cultural events.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 sm:gap-4 pt-2">
                  <a
                    href="#upcoming"
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById('upcoming')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 sm:px-7 py-3 sm:py-3.5 rounded-xl bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-semibold text-sm sm:text-base shadow-lg shadow-brand-500/25 transition-all hover:scale-[1.02]"
                  >
                    <span>Explore Events</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-right w-4 h-4">
                      <path d="M5 12h14"></path>
                      <path d="m12 5 7 7-7 7"></path>
                    </svg>
                  </a>
                  <Link
                    to="/organizer/login"
                    className="w-full sm:w-auto inline-flex items-center justify-center px-6 sm:px-7 py-3 sm:py-3.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold text-sm sm:text-base shadow-sm transition-all hover:border-slate-400"
                  >
                    Host an Event
                  </Link>
                </div>
              </div>

              {/* Right Column: Hero Visual Process Map */}
              <div className="lg:col-span-7 relative h-[360px] sm:h-[460px] lg:h-[540px] w-full flex items-center justify-center">
                <div className="absolute inset-0 w-full h-full rounded-2xl sm:rounded-3xl lg:rounded-l-[3.5rem] lg:rounded-r-3xl overflow-hidden shadow-xl sm:shadow-2xl border border-slate-100/60 group">
                  <img
                    alt="Trekker overlooking sunrise mountain valley"
                    className="w-full h-full object-cover object-right transform scale-100 transition-transform duration-1000 group-hover:scale-105"
                    src={heroTrekkerImg}
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-white/90 via-white/20 to-transparent lg:via-transparent"></div>
                  <div className="absolute inset-0 bg-blue-900/10 mix-blend-multiply"></div>
                </div>

                <div className="absolute -bottom-3 sm:-bottom-4 right-4 sm:right-10 lg:right-28 z-30 pointer-events-none select-none drop-shadow-md">
                  <span className="font-script text-2xl sm:text-4xl lg:text-5xl text-blue-950 font-bold tracking-wide transform -rotate-3 block">
                    Events Bring People Together
                  </span>
                </div>

                <div className="relative w-full h-full z-20 pointer-events-none" style={{ transform: 'translateX(36px)' }}>
                  {/* Dashed curved connector lines */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 hidden sm:block" viewBox="0 0 700 500" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <linearGradient id="journeyGradient" x1="0%" y1="100%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#60a5fa"></stop>
                        <stop offset="50%" stopColor="#2563eb"></stop>
                        <stop offset="100%" stopColor="#1d4ed8"></stop>
                      </linearGradient>
                      <marker id="arrowBlue" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 1 L 8 5 L 0 9 z" fill="#2563eb"></path>
                      </marker>
                    </defs>
                    <path d="M 140 370 C 180 370, 190 280, 240 240" stroke="url(#journeyGradient)" strokeWidth="2.5" strokeDasharray="6 6" strokeLinecap="round" markerEnd="url(#arrowBlue)" opacity="0.9"></path>
                    <path d="M 320 220 C 370 210, 390 190, 440 160" stroke="url(#journeyGradient)" strokeWidth="2.5" strokeDasharray="6 6" strokeLinecap="round" markerEnd="url(#arrowBlue)" opacity="0.9"></path>
                    <path d="M 510 145 C 550 140, 560 110, 600 85" stroke="url(#journeyGradient)" strokeWidth="2.5" strokeDasharray="6 6" strokeLinecap="round" markerEnd="url(#arrowBlue)" opacity="0.9"></path>
                    <path d="M 80 430 C 260 480, 520 460, 620 380" stroke="#93c5fd" strokeWidth="2" strokeDasharray="4 8" strokeLinecap="round" opacity="0.6"></path>
                  </svg>

                  {/* Step 1 Thumbnail Card */}
                  <Link
                    to="/events"
                    className="absolute left-2 sm:left-4 bottom-4 sm:bottom-10 pointer-events-auto bg-white/95 backdrop-blur-md p-2 sm:p-2.5 rounded-xl sm:rounded-2xl shadow-xl border border-white/60 w-36 sm:w-48 transform -rotate-2 hover:rotate-0 hover:scale-105 transition-all duration-300 block"
                  >
                    <div className="h-16 sm:h-24 rounded-lg sm:rounded-xl overflow-hidden mb-1.5 sm:mb-2 relative">
                      <img
                        alt="Rajgad trek miniature"
                        className="w-full h-full object-cover"
                        src={rajgadMiniatureImg}
                      />
                      <span className="absolute top-1 left-1 sm:top-1.5 sm:left-1.5 bg-brand-600/90 text-white text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded">
                        Step 1
                      </span>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-1.5 px-0.5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-compass w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-600 shrink-0">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"></path>
                      </svg>
                      <div>
                        <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 leading-tight">Discover</p>
                        <p className="text-[11px] sm:text-xs font-bold text-slate-900 leading-tight">Amazing Events</p>
                      </div>
                    </div>
                  </Link>

                  {/* Step 2 Book Icon Card */}
                  <div className="absolute left-24 sm:left-40 top-24 sm:top-40 pointer-events-auto bg-white/95 backdrop-blur-md p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl shadow-xl border border-white/60 w-28 sm:w-36 hover:scale-105 transition-all duration-300">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-blue-50 text-brand-600 flex items-center justify-center mb-1.5 sm:mb-2 mx-auto">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-credit-card w-4 h-4 sm:w-5 sm:h-5">
                        <rect width="20" height="14" x="2" y="5" rx="2"></rect>
                        <line x1="2" x2="22" y1="10" y2="10"></line>
                        <path d="M6 14h2"></path>
                      </svg>
                    </div>
                    <p className="text-center text-[11px] sm:text-xs font-bold text-slate-900">Book</p>
                    <p className="text-center text-[10px] sm:text-[11px] text-slate-500 font-medium">in Minutes</p>
                  </div>

                  {/* Step 3 QR Card */}
                  <div className="absolute right-16 sm:right-36 top-10 sm:top-20 pointer-events-auto bg-white/95 backdrop-blur-md p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl shadow-xl border border-white/60 w-28 sm:w-40 text-center hover:scale-105 transition-all duration-300">
                    <div className="w-8 h-8 sm:w-11 sm:h-11 bg-slate-50 border border-slate-100 rounded-lg sm:rounded-xl flex items-center justify-center mx-auto mb-1 sm:mb-1.5 p-1 shadow-inner">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-qr-code w-5 h-5 sm:w-6 sm:h-6 text-brand-700">
                        <rect width="5" height="5" x="3" y="3" rx="1"></rect>
                        <rect width="5" height="5" x="16" y="3" rx="1"></rect>
                        <rect width="5" height="5" x="3" y="16" rx="1"></rect>
                        <path d="M21 16h-3a2 2 0 0 0-2 2v3"></path>
                        <path d="M21 21v.01"></path>
                        <path d="M12 7v3a2 2 0 0 1-2 2H7"></path>
                        <path d="M3 12h.01"></path>
                        <path d="M12 3h.01"></path>
                        <path d="M12 16v.01"></path>
                        <path d="M16 12h1"></path>
                        <path d="M21 12v.01"></path>
                        <path d="M12 21v-1"></path>
                      </svg>
                    </div>
                    <p className="text-[11px] sm:text-xs font-bold text-slate-900">Get Your</p>
                    <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium">Digital Ticket</p>
                  </div>

                  {/* Step 4 Check-in Badge Card */}
                  <div className="absolute right-2 sm:right-6 top-3 sm:top-6 pointer-events-auto bg-white/95 backdrop-blur-md p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl shadow-2xl border border-white/60 w-28 sm:w-36 hover:scale-105 transition-all duration-300">
                    <div className="relative w-8 h-9 sm:w-11 sm:h-12 bg-slate-900 text-white rounded-lg mx-auto mb-1 sm:mb-2 flex items-center justify-center border-2 border-slate-700 shadow-md">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-smartphone w-4 h-4 sm:w-6 sm:h-6 text-brand-400">
                        <rect width="14" height="20" x="5" y="2" rx="2" ry="2"></rect>
                        <path d="M12 18h.01"></path>
                      </svg>
                      <div className="absolute -right-1 -bottom-1 sm:-right-1.5 sm:-bottom-1.5 bg-emerald-500 text-white rounded-full p-0.5 shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-check w-2.5 h-2.5 sm:w-3 sm:h-3">
                          <path d="M20 6 9 17l-5-5"></path>
                        </svg>
                      </div>
                    </div>
                    <p className="text-center text-[11px] sm:text-xs font-bold text-slate-900">Event Day</p>
                    <p className="text-center text-[10px] sm:text-[11px] text-slate-500 font-medium">Check-In</p>
                  </div>

                </div>
              </div>

            </div>

            {/* FLOATING SEARCH BAR */}
            <div className="mt-8 sm:mt-10 lg:mt-8 relative z-30 max-w-4xl mx-auto" data-purpose="search-bar">
              <form
                onSubmit={handleSearchSubmit}
                className="bg-white rounded-2xl shadow-xl border border-slate-200/90 p-2 sm:p-3 flex flex-col sm:flex-row items-center gap-2 sm:gap-3"
              >
                <div className="flex-1 flex items-center gap-2.5 sm:gap-3 px-2 sm:px-3 w-full">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-search w-4 h-4 sm:w-5 sm:h-5 text-slate-400 shrink-0">
                    <path d="m21 21-4.34-4.34"></path>
                    <circle cx="11" cy="11" r="8"></circle>
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search events, treks, workshops, conferences..."
                    className="w-full bg-transparent border-0 focus:ring-0 text-slate-800 placeholder-slate-400 text-sm sm:text-base font-medium p-0 focus:outline-none"
                  />
                </div>

                <div className="hidden sm:block w-px h-8 bg-slate-200"></div>

                <div className="hidden md:flex items-center gap-2 text-slate-500 text-xs font-medium px-2 shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-compass w-4 h-4 text-brand-600">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"></path>
                  </svg>
                  <span>Find your next experience.</span>
                </div>

                <button
                  type="submit"
                  className="w-full sm:w-auto px-6 sm:px-8 py-2.5 sm:py-3 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-semibold text-xs sm:text-sm rounded-xl transition-all shadow-md shadow-brand-500/20 flex items-center justify-center gap-2"
                >
                  <span>Search</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-right w-4 h-4">
                    <path d="M5 12h14"></path>
                    <path d="m12 5 7 7-7 7"></path>
                  </svg>
                </button>
              </form>
            </div>

          </div>
        </section>
        {/* END: HeroSection */}

        {/* BEGIN: CategoriesSection */}
        <section className="py-16 bg-white border-y border-slate-100" data-purpose="category-browser" id="explore">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            {/* Section Title */}
            <div className="text-left mb-10">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Explore by Category</h2>
              <p className="text-sm sm:text-base text-slate-500 mt-1 font-medium">Find something that fits your next plan.</p>
            </div>

            {/* 8 Category Grid Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 sm:gap-4">
              
              {/* Category 1: Treks */}
              <button
                onClick={(e) => handleCategoryClick('Trek', e)}
                className={`group flex flex-col items-center justify-center p-4 rounded-2xl transition-all duration-200 text-center ${
                  selectedCategory === 'Trek'
                    ? 'bg-white border-2 border-brand-600 shadow-lg shadow-brand-500/15 -translate-y-1'
                    : 'bg-slate-50/70 hover:bg-white border border-slate-100 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-500/10 hover:-translate-y-1'
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors duration-200 ${
                  selectedCategory === 'Trek'
                    ? 'bg-brand-600 text-white'
                    : 'bg-blue-100/60 text-brand-600 group-hover:bg-brand-600 group-hover:text-white'
                }`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-mountain w-6 h-6">
                    <path d="m8 3 4 8 5-5 5 15H2L8 3z"></path>
                  </svg>
                </div>
                <span className={`text-xs sm:text-sm font-bold ${
                  selectedCategory === 'Trek' ? 'text-brand-600' : 'text-slate-700 group-hover:text-brand-600'
                }`}>
                  Treks
                </span>
              </button>

              {/* Category 2: Trips */}
              <button
                onClick={(e) => handleCategoryClick('Trip', e)}
                className={`group flex flex-col items-center justify-center p-4 rounded-2xl transition-all duration-200 text-center ${
                  selectedCategory === 'Trip'
                    ? 'bg-white border-2 border-brand-600 shadow-lg shadow-brand-500/15 -translate-y-1'
                    : 'bg-slate-50/70 hover:bg-white border border-slate-100 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-500/10 hover:-translate-y-1'
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors duration-200 ${
                  selectedCategory === 'Trip'
                    ? 'bg-brand-600 text-white'
                    : 'bg-blue-100/60 text-brand-600 group-hover:bg-brand-600 group-hover:text-white'
                }`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-map-pin w-6 h-6">
                    <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                </div>
                <span className={`text-xs sm:text-sm font-bold ${
                  selectedCategory === 'Trip' ? 'text-brand-600' : 'text-slate-700 group-hover:text-brand-600'
                }`}>
                  Trips
                </span>
              </button>

              {/* Category 3: Workshops */}
              <button
                onClick={(e) => handleCategoryClick('Workshop', e)}
                className={`group flex flex-col items-center justify-center p-4 rounded-2xl transition-all duration-200 text-center ${
                  selectedCategory === 'Workshop'
                    ? 'bg-white border-2 border-brand-600 shadow-lg shadow-brand-500/15 -translate-y-1'
                    : 'bg-slate-50/70 hover:bg-white border border-slate-100 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-500/10 hover:-translate-y-1'
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors duration-200 ${
                  selectedCategory === 'Workshop'
                    ? 'bg-brand-600 text-white'
                    : 'bg-blue-100/60 text-brand-600 group-hover:bg-brand-600 group-hover:text-white'
                }`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-presentation w-6 h-6">
                    <path d="M2 3h20"></path>
                    <path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"></path>
                    <path d="m7 21 5-5 5 5"></path>
                  </svg>
                </div>
                <span className={`text-xs sm:text-sm font-bold ${
                  selectedCategory === 'Workshop' ? 'text-brand-600' : 'text-slate-700 group-hover:text-brand-600'
                }`}>
                  Workshops
                </span>
              </button>

              {/* Category 4: Conferences */}
              <button
                onClick={(e) => handleCategoryClick('Conference', e)}
                className={`group flex flex-col items-center justify-center p-4 rounded-2xl transition-all duration-200 text-center ${
                  selectedCategory === 'Conference'
                    ? 'bg-white border-2 border-brand-600 shadow-lg shadow-brand-500/15 -translate-y-1'
                    : 'bg-slate-50/70 hover:bg-white border border-slate-100 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-500/10 hover:-translate-y-1'
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors duration-200 ${
                  selectedCategory === 'Conference'
                    ? 'bg-brand-600 text-white'
                    : 'bg-blue-100/60 text-brand-600 group-hover:bg-brand-600 group-hover:text-white'
                }`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-users w-6 h-6">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                    <path d="M16 3.128a4 4 0 0 1 0 7.744"></path>
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                  </svg>
                </div>
                <span className={`text-xs sm:text-sm font-bold ${
                  selectedCategory === 'Conference' ? 'text-brand-600' : 'text-slate-700 group-hover:text-brand-600'
                }`}>
                  Conferences
                </span>
              </button>

              {/* Category 5: Sports */}
              <button
                onClick={(e) => handleCategoryClick('Sports', e)}
                className={`group flex flex-col items-center justify-center p-4 rounded-2xl transition-all duration-200 text-center ${
                  selectedCategory === 'Sports'
                    ? 'bg-white border-2 border-brand-600 shadow-lg shadow-brand-500/15 -translate-y-1'
                    : 'bg-slate-50/70 hover:bg-white border border-slate-100 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-500/10 hover:-translate-y-1'
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors duration-200 ${
                  selectedCategory === 'Sports'
                    ? 'bg-brand-600 text-white'
                    : 'bg-blue-100/60 text-brand-600 group-hover:bg-brand-600 group-hover:text-white'
                }`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-activity w-6 h-6">
                    <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"></path>
                  </svg>
                </div>
                <span className={`text-xs sm:text-sm font-bold ${
                  selectedCategory === 'Sports' ? 'text-brand-600' : 'text-slate-700 group-hover:text-brand-600'
                }`}>
                  Sports
                </span>
              </button>

              {/* Category 6: Cultural */}
              <button
                onClick={(e) => handleCategoryClick('Cultural', e)}
                className={`group flex flex-col items-center justify-center p-4 rounded-2xl transition-all duration-200 text-center ${
                  selectedCategory === 'Cultural'
                    ? 'bg-white border-2 border-brand-600 shadow-lg shadow-brand-500/15 -translate-y-1'
                    : 'bg-slate-50/70 hover:bg-white border border-slate-100 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-500/10 hover:-translate-y-1'
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors duration-200 ${
                  selectedCategory === 'Cultural'
                    ? 'bg-brand-600 text-white'
                    : 'bg-blue-100/60 text-brand-600 group-hover:bg-brand-600 group-hover:text-white'
                }`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-landmark w-6 h-6">
                    <path d="M10 18v-7"></path>
                    <path d="M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z"></path>
                    <path d="M14 18v-7"></path>
                    <path d="M18 18v-7"></path>
                    <path d="M3 22h18"></path>
                    <path d="M6 18v-7"></path>
                  </svg>
                </div>
                <span className={`text-xs sm:text-sm font-bold ${
                  selectedCategory === 'Cultural' ? 'text-brand-600' : 'text-slate-700 group-hover:text-brand-600'
                }`}>
                  Cultural
                </span>
              </button>

              {/* Category 7: Entertainment */}
              <button
                onClick={(e) => handleCategoryClick('Music', e)}
                className={`group flex flex-col items-center justify-center p-4 rounded-2xl transition-all duration-200 text-center ${
                  selectedCategory === 'Music'
                    ? 'bg-white border-2 border-brand-600 shadow-lg shadow-brand-500/15 -translate-y-1'
                    : 'bg-slate-50/70 hover:bg-white border border-slate-100 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-500/10 hover:-translate-y-1'
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors duration-200 ${
                  selectedCategory === 'Music'
                    ? 'bg-brand-600 text-white'
                    : 'bg-blue-100/60 text-brand-600 group-hover:bg-brand-600 group-hover:text-white'
                }`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-music w-6 h-6">
                    <path d="M9 18V5l12-2v13"></path>
                    <circle cx="6" cy="18" r="3"></circle>
                    <circle cx="18" cy="16" r="3"></circle>
                  </svg>
                </div>
                <span className={`text-xs sm:text-sm font-bold ${
                  selectedCategory === 'Music' ? 'text-brand-600' : 'text-slate-700 group-hover:text-brand-600'
                }`}>
                  Entertainment
                </span>
              </button>

              {/* Category 8: Other */}
              <button
                onClick={(e) => handleCategoryClick('Other', e)}
                className={`group flex flex-col items-center justify-center p-4 rounded-2xl transition-all duration-200 text-center ${
                  selectedCategory === 'Other'
                    ? 'bg-white border-2 border-brand-600 shadow-lg shadow-brand-500/15 -translate-y-1'
                    : 'bg-slate-50/70 hover:bg-white border border-slate-100 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-500/10 hover:-translate-y-1'
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors duration-200 ${
                  selectedCategory === 'Other'
                    ? 'bg-brand-600 text-white'
                    : 'bg-blue-100/60 text-brand-600 group-hover:bg-brand-600 group-hover:text-white'
                }`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-layout-grid w-6 h-6">
                    <rect width="7" height="7" x="3" y="3" rx="1"></rect>
                    <rect width="7" height="7" x="14" y="3" rx="1"></rect>
                    <rect width="7" height="7" x="14" y="14" rx="1"></rect>
                    <rect width="7" height="7" x="3" y="14" rx="1"></rect>
                  </svg>
                </div>
                <span className={`text-xs sm:text-sm font-bold ${
                  selectedCategory === 'Other' ? 'text-brand-600' : 'text-slate-700 group-hover:text-brand-600'
                }`}>
                  Other
                </span>
              </button>

            </div>
          </div>
        </section>
        {/* END: CategoriesSection */}

        {/* BEGIN: UpcomingEventsSection */}
        <section className="py-16 sm:py-20 bg-[#f8fbff]" data-purpose="event-listings" id="upcoming">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            {/* Section Header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-10 gap-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Upcoming Events</h2>
                <p className="text-sm sm:text-base text-slate-500 mt-1">Discover experiences happening near you and beyond.</p>
              </div>

              <Link
                to="/events"
                className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-600 hover:text-brand-700 transition-colors group self-start sm:self-auto"
              >
                <span>View All Events</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-right w-4 h-4 transition-transform group-hover:translate-x-1">
                  <path d="M5 12h14"></path>
                  <path d="m12 5 7 7-7 7"></path>
                </svg>
              </Link>
            </div>

            {/* 4 Events Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {filteredEvents.map((event) => {
                const isFav = !!favorites[event.id];
                return (
                  <article
                    key={event.id}
                    onClick={() => navigate(`/events/${event.id}`)}
                    className="bg-white rounded-2xl overflow-hidden border border-slate-200/80 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1.5 flex flex-col cursor-pointer group"
                  >
                    <div className="relative h-48 overflow-hidden group bg-slate-900">
                      <img
                        alt={event.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        src={event.image}
                      />
                      <span className="absolute top-3 left-3 bg-white/90 backdrop-blur-md text-slate-800 text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                        {event.category}
                      </span>
                      <button
                        onClick={(e) => toggleFavorite(event.id, e)}
                        aria-label={`Save ${event.name} to favorites`}
                        className={`absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                          isFav
                            ? 'bg-rose-600 text-white'
                            : 'bg-black/40 backdrop-blur-sm text-white hover:bg-rose-600'
                        }`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill={isFav ? 'currentColor' : 'none'}
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="lucide lucide-heart w-4 h-4"
                        >
                          <path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"></path>
                        </svg>
                      </button>
                    </div>

                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div>
                        <h3 className="font-bold text-slate-900 text-lg group-hover:text-brand-600 transition-colors line-clamp-1">
                          {event.name}
                        </h3>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">{event.organizer}</p>

                        <div className="mt-4 space-y-1.5 text-xs text-slate-600">
                          <div className="flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-calendar w-3.5 h-3.5 text-brand-600">
                              <path d="M8 2v3"></path>
                              <path d="M16 2v3"></path>
                              <rect width="18" height="18" x="3" y="3" rx="2"></rect>
                              <path d="M3 9h18"></path>
                            </svg>
                            <span>{event.date}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-map-pin w-3.5 h-3.5 text-brand-600">
                              <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"></path>
                              <circle cx="12" cy="10" r="3"></circle>
                            </svg>
                            <span>{event.location}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                        <div>
                          <span className="text-[11px] text-slate-400 uppercase font-semibold block leading-tight">From</span>
                          <span className="text-lg font-black text-slate-900 leading-none">{formatINR(event.price)}</span>
                        </div>
                        <Link
                          to={`/events/${event.id}`}
                          className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-3.5 py-2 rounded-lg transition-colors"
                        >
                          <span>View Details</span>
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-right w-3.5 h-3.5">
                            <path d="M5 12h14"></path>
                            <path d="m12 5 7 7-7 7"></path>
                          </svg>
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {filteredEvents.length > 0 && (
              <div className="mt-10 text-center">
                <Link
                  to="/events"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 hover:text-slate-900 font-semibold text-sm shadow-sm transition-all hover:border-slate-400 hover:shadow"
                >
                  <span>Explore All Events</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-right w-4 h-4 text-brand-600">
                    <path d="M5 12h14"></path>
                    <path d="m12 5 7 7-7 7"></path>
                  </svg>
                </Link>
              </div>
            )}

            {eventsLoading && filteredEvents.length === 0 && (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 mt-6 shadow-sm">
                <p className="text-slate-600 font-semibold text-sm">Loading events…</p>
              </div>
            )}

            {!eventsLoading && filteredEvents.length === 0 && (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 mt-6 shadow-sm">
                <p className="text-slate-600 font-semibold text-sm">No events found matching your search.</p>
                <button
                  onClick={() => {
                    setSelectedCategory(null);
                    setSearchQuery('');
                  }}
                  className="mt-3 px-5 py-2 bg-brand-600 text-white rounded-xl text-xs font-semibold hover:bg-brand-700 transition"
                >
                  Clear Filters
                </button>
              </div>
            )}

          </div>
        </section>
        {/* END: UpcomingEventsSection */}

        {/* BEGIN: FeaturePillarsSection */}
        <section className="py-16 sm:py-20 bg-white" data-purpose="platform-features">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            {/* Section Title */}
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Everything you need to run an event.</h2>
                <p className="text-sm sm:text-base text-slate-500 mt-1">Built for organizers. Designed for real experiences.</p>
              </div>
            </div>

            {/* 4 Pillars Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              
              {/* Pillar 1 */}
              <div className="p-6 rounded-2xl bg-slate-50/70 border border-slate-200/70 hover:border-brand-200 hover:bg-white hover:shadow-lg transition-all duration-300 group">
                <div className="w-12 h-12 rounded-xl bg-blue-100/70 text-brand-600 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-brand-600 group-hover:text-white transition-all">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file-plus-2 w-6 h-6">
                    <path d="M11.35 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v5.35"></path>
                    <path d="M14 2v5a1 1 0 0 0 1 1h5"></path>
                    <path d="M14 19h6"></path>
                    <path d="M17 16v6"></path>
                  </svg>
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-1.5">Create &amp; Publish</h3>
                <p className="text-sm text-slate-500 leading-relaxed">Launch your event page with rich details, schedules, and pricing in minutes.</p>
              </div>

              {/* Pillar 2 */}
              <div className="p-6 rounded-2xl bg-slate-50/70 border border-slate-200/70 hover:border-brand-200 hover:bg-white hover:shadow-lg transition-all duration-300 group">
                <div className="w-12 h-12 rounded-xl bg-blue-100/70 text-brand-600 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-brand-600 group-hover:text-white transition-all">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-credit-card w-6 h-6">
                    <rect width="20" height="14" x="2" y="5" rx="2"></rect>
                    <line x1="2" x2="22" y1="10" y2="10"></line>
                    <path d="M6 14h2"></path>
                  </svg>
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-1.5">Online Booking</h3>
                <p className="text-sm text-slate-500 leading-relaxed">Accept instant registrations and secure online payments seamlessly.</p>
              </div>

              {/* Pillar 3 */}
              <div className="p-6 rounded-2xl bg-slate-50/70 border border-slate-200/70 hover:border-brand-200 hover:bg-white hover:shadow-lg transition-all duration-300 group">
                <div className="w-12 h-12 rounded-xl bg-blue-100/70 text-brand-600 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-brand-600 group-hover:text-white transition-all">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-ticket w-6 h-6">
                    <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"></path>
                    <path d="M13 5v2"></path>
                    <path d="M13 17v2"></path>
                    <path d="M13 11v2"></path>
                  </svg>
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-1.5">Digital Tickets</h3>
                <p className="text-sm text-slate-500 leading-relaxed">Generate encrypted digital passes with dynamic QR codes automatically.</p>
              </div>

              {/* Pillar 4 */}
              <div className="p-6 rounded-2xl bg-slate-50/70 border border-slate-200/70 hover:border-brand-200 hover:bg-white hover:shadow-lg transition-all duration-300 group">
                <div className="w-12 h-12 rounded-xl bg-blue-100/70 text-brand-600 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-brand-600 group-hover:text-white transition-all">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-scan-line w-6 h-6">
                    <path d="M3 7V5a2 2 0 0 1 2-2h2"></path>
                    <path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
                    <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>
                    <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
                    <path d="M7 12h10"></path>
                  </svg>
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-1.5">Easy Check-in</h3>
                <p className="text-sm text-slate-500 leading-relaxed">Scan tickets at the venue in under a second and monitor real-time attendance.</p>
              </div>

            </div>
          </div>
        </section>
        {/* END: FeaturePillarsSection */}

        {/* BEGIN: OrganizerCtaBanner */}
        <section className="pb-20 pt-4 bg-white" data-purpose="organizer-conversion" id="host">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-[#e7f1ff] via-[#dcedff] to-[#e4f0ff] border border-blue-200/60 p-8 sm:p-12 lg:p-14 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-8">
              
              {/* Left Banner Info */}
              <div className="max-w-2xl text-center lg:text-left z-10">
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight">
                  Have an event to host?
                </h2>
                <p className="text-base sm:text-lg text-slate-600 mt-2 font-medium">
                  Create your event, sell tickets and manage your attendees — all from one place.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 mt-6">
                  <Link
                    to="/organizer/login"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-bold text-sm shadow-md shadow-brand-500/25 transition-all"
                  >
                    <span>Host an Event</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-right w-4 h-4">
                      <path d="M5 12h14"></path>
                      <path d="m12 5 7 7-7 7"></path>
                    </svg>
                  </Link>
                  <button
                    type="button"
                    onClick={() => alert('Inveon Events Platform:\n• 0% setup fee\n• Instant QR ticketing\n• Cashfree 128-bit payouts\n• Real-time attendee dashboard')}
                    className="w-full sm:w-auto inline-flex items-center justify-center px-7 py-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold text-sm transition-all shadow-xs"
                  >
                    Learn how it works
                  </button>
                </div>
              </div>

              {/* Right Visual with Calendar Graphic & Handwritten Script */}
              <div className="relative flex items-center justify-center shrink-0 z-10">
                {/* Calendar 3D Mockup Badge */}
                <div className="bg-white rounded-2xl shadow-xl p-4 w-44 border border-blue-100/80 transform rotate-6 hover:rotate-3 transition-transform duration-300">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                    <span className="text-xs font-bold text-slate-700">SEP 2026</span>
                    <div className="flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-brand-500"></span>
                      <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] font-semibold text-slate-400">
                    <span className="text-slate-800 bg-brand-50 rounded p-1 font-bold">20</span>
                    <span className="p-1">21</span>
                    <span className="p-1">22</span>
                    <span className="p-1">23</span>
                    <span className="p-1">24</span>
                    <span className="text-white bg-brand-600 rounded p-1 shadow-xs font-bold">25</span>
                    <span className="p-1">26</span>
                    <span className="text-slate-800 bg-brand-50 rounded p-1 font-bold">28</span>
                  </div>
                </div>

                {/* Handwritten Script */}
                <div className="absolute -top-4 -right-2 sm:-right-6 transform rotate-12 pointer-events-none select-none">
                  <span className="font-script text-2xl sm:text-3xl text-brand-700 font-bold tracking-tight whitespace-nowrap drop-shadow-sm">
                    Turn Your Ideas<br />Into Experiences
                  </span>
                </div>
              </div>

            </div>
          </div>
        </section>
        {/* END: OrganizerCtaBanner */}

      </div>
    </Layout>
  );
}

