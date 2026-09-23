import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { fetchEventData, EventDetails } from '../mockData/rajgadTrek';
import { formatINR } from '../lib/format';

export function EventDetailsPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();

  const [event, setEvent] = useState<EventDetails | null>(null);
  const [reviews, setReviews] = useState<{ id: string; rating: number; reviewText: string | null; customerName: string; createdAt: string }[]>([]);

  const [activeTab, setActiveTab] = useState<'about' | 'details' | 'gear' | 'location' | 'policy'>('about');
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEventData(eventId).then((data) => {
      if (cancelled) return;
      setEvent(data);
      // Pre-select 1 of the first (cheapest) real ticket tier — the
      // previous hardcoded { general: 1, vip: 0 } only made sense for
      // the mock event's fixed tier ids.
      setQuantities(data.ticketCategories[0] ? { [data.ticketCategories[0].id]: 1 } : {});

      // A mock-fallback event's id doesn't correspond to any real
      // reviews — the fetch below simply returns nothing for it, same
      // "real data or nothing, never fabricated" handling as everywhere
      // else on this page.
      fetch(`/api/events/${data.id}/reviews`)
        .then((res) => (res.ok ? res.json() : { reviews: [] }))
        .then((reviewData) => {
          if (!cancelled) setReviews(reviewData.reviews || []);
        })
        .catch(() => {
          if (!cancelled) setReviews([]);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (!event) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  const galleryImages = event.galleryImages && event.galleryImages.length > 0
    ? event.galleryImages
    : [{ src: 'https://images.unsplash.com/photo-1544216428-d0e10da5ee56?q=80&w=1600&auto=format&fit=crop', alt: event.name }];

  const currentImage = galleryImages[galleryIdx] || galleryImages[0];

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((c) => (c === msg ? null : c));
    }, 2800);
  }

  function handleShare() {
    if (navigator.share) {
      navigator.share({
        title: event!.name,
        text: `Join me for ${event!.name}!`,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(window.location.href);
      showToast('Event link copied to clipboard!');
    }
  }

  function updateQty(tierId: string, delta: number) {
    const totalCount = Object.values(quantities).reduce((a, b) => a + b, 0);
    if (delta > 0 && totalCount >= 10) {
      showToast('Maximum 10 tickets per order');
      return;
    }
    setQuantities((prev) => {
      const current = prev[tierId] ?? 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [tierId]: next };
    });
  }

  const totalTickets = Object.values(quantities).reduce((a, b) => a + b, 0);
  const totalAmount = event.ticketCategories.reduce(
    (sum, t) => sum + t.price * (quantities[t.id] ?? 0),
    0,
  );

  function handleBookNow() {
    if (totalTickets === 0) {
      showToast('Please select at least 1 ticket to proceed');
      return;
    }
    navigate(`/events/${event!.id}/checkout`, {
      state: { quantities },
    });
  }

  return (
    <Layout>
      <div className="flex flex-col w-full bg-[#f8f9ff]">
        
        {/* BREADCRUMB BAR */}
        <div className="w-full bg-white shadow-[0_1px_2px_rgba(11,19,43,0.03)] border-b border-slate-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between text-xs text-slate-500 font-medium">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap">
              <Link to="/" className="hover:text-primary transition-colors">Home</Link>
              <span className="material-symbols-outlined text-[15px] text-slate-400">chevron_right</span>
              <Link to="/" className="hover:text-primary transition-colors">Events</Link>
              <span className="material-symbols-outlined text-[15px] text-slate-400">chevron_right</span>
              <span className="text-slate-800 font-semibold">{event.name}</span>
            </nav>
            <div className="hidden sm:flex items-center gap-1.5 text-slate-500">
              <span className="material-symbols-outlined text-[16px] text-primary">verified</span>
              <span className="text-[10px] font-bold tracking-wider uppercase">Inveon Assured Experience</span>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
          
          {/* TOP GRID: MEDIA GALLERY + PRIMARY METADATA PANEL */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Media Gallery (7 Cols) */}
            <div className="lg:col-span-7 flex flex-col gap-3">
              <div className="relative w-full aspect-[16/10] rounded-2xl overflow-hidden shadow-md bg-slate-100 group">
                <img
                  src={currentImage.src}
                  alt={currentImage.alt}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

                {/* Location Pill over image */}
                <div className="absolute bottom-4 left-4 flex items-center gap-1.5 bg-[#0b1c30]/80 backdrop-blur-md px-3 py-1 rounded-full text-white text-xs font-semibold shadow-sm">
                  <span className="material-symbols-outlined text-[16px] text-emerald-400">location_on</span>
                  <span>{event.venue}</span>
                </div>

                {/* Carousel Controls */}
                <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-[#0b1c30]/80 backdrop-blur-md px-2.5 py-1 rounded-full text-white text-xs font-semibold">
                  <button
                    type="button"
                    aria-label="Previous image"
                    onClick={() => setGalleryIdx((prev) => (prev > 0 ? prev - 1 : galleryImages.length - 1))}
                    className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                  </button>
                  <span className="font-mono text-[11px] tracking-widest px-1">
                    {galleryIdx + 1} / {galleryImages.length}
                  </span>
                  <button
                    type="button"
                    aria-label="Next image"
                    onClick={() => setGalleryIdx((prev) => (prev < galleryImages.length - 1 ? prev + 1 : 0))}
                    className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                  </button>
                </div>
              </div>

              {/* Thumbnails Row & Share Action */}
              <div className="flex items-center justify-between gap-3 overflow-x-auto pb-1">
                <div className="flex items-center gap-2">
                  {galleryImages.map((img, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setGalleryIdx(i)}
                      className={`relative w-16 sm:w-20 aspect-[4/3] rounded-xl overflow-hidden shrink-0 transition-all ${
                        galleryIdx === i
                          ? 'ring-2 ring-primary opacity-100 scale-105 shadow-md'
                          : 'opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={img.src} alt={img.alt} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleShare}
                  className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-xs border border-slate-200 shadow-sm transition-all"
                >
                  <span className="material-symbols-outlined text-[16px] text-primary">share</span>
                  <span className="hidden sm:inline">Share Event</span>
                </button>
              </div>

              {event.videoUrl && (
                <div className="rounded-2xl overflow-hidden shadow-md bg-black">
                  <video
                    src={event.videoUrl}
                    controls
                    playsInline
                    className="w-full aspect-video"
                  />
                </div>
              )}
            </div>

            {/* Quick Details Header & Fast Booking Widget (5 Cols) */}
            <div className="lg:col-span-5 flex flex-col gap-3.5">
              
              {/* Title & Category Badges */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-blue-100 text-primary text-[11px] font-bold uppercase tracking-wider">
                    <span className="material-symbols-outlined text-[13px]">hiking</span>
                    {event.category}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-bold uppercase tracking-wider">
                    <span className="material-symbols-outlined text-[13px]">landscape</span>
                    {event.subCategory || 'Sahyadri Range'}
                  </span>
                  {event.ratingSummary && event.ratingSummary.reviewCount > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[11px] font-bold uppercase tracking-wider">
                      <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                      {event.ratingSummary.averageRating} ({event.ratingSummary.reviewCount} review{event.ratingSummary.reviewCount === 1 ? '' : 's'})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                      No reviews yet
                    </span>
                  )}
                </div>

                <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0b1c30] tracking-tight mt-1">
                  {event.name}
                </h1>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  {event.tagline}
                </p>
              </div>

              {/* Verified Organizer Pill */}
              <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200/80 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                    <span className="material-symbols-outlined text-[20px]">explore</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-slate-900 text-sm">{event.organizer.name}</span>
                      <span className="material-symbols-outlined text-primary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                        verified
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium">{event.organizer.tagline}</p>
                  </div>
                </div>

                <Link
                  to={`/organizers/${event.organizer.slug}`}
                  className="text-primary hover:underline text-xs font-semibold flex items-center shrink-0"
                >
                  Profile <span className="material-symbols-outlined text-[15px]">chevron_right</span>
                </Link>
              </div>

              {/* Fast Stats Matrix */}
              <div className="grid grid-cols-2 gap-3 p-4 bg-white rounded-xl border border-slate-200/80 shadow-sm">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px] mt-0.5">calendar_month</span>
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Date</span>
                    <span className="text-xs sm:text-sm font-semibold text-slate-900">{event.date}</span>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px] mt-0.5">schedule</span>
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Time</span>
                    <span className="text-xs sm:text-sm font-semibold text-slate-900">{event.time}</span>
                  </div>
                </div>

                <div className="flex items-start gap-2 pt-1 border-t border-slate-100">
                  <span className="material-symbols-outlined text-primary text-[20px] mt-0.5">timer</span>
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Reporting Time</span>
                    <span className="text-xs sm:text-sm font-semibold text-slate-900">{event.gatherTime}</span>
                  </div>
                </div>

                <div className="flex items-start gap-2 pt-1 border-t border-slate-100">
                  <span className="material-symbols-outlined text-primary text-[20px] mt-0.5">distance</span>
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Difficulty</span>
                    <span className="text-xs sm:text-sm font-semibold text-slate-900">{event.difficulty || 'Moderate'}</span>
                  </div>
                </div>
              </div>

              {/* Quick Conversion Bar */}
              <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                    <span className="text-xs font-bold text-emerald-600">{event.availableSeats} seats available</span>
                  </div>
                  <div className="mt-0.5">
                    <span className="text-xs text-slate-500 font-medium">Starting from </span>
                    <span className="text-xl font-extrabold text-slate-900">{formatINR(event.ticketCategories[0]?.price || 499)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    document.getElementById('bookingCard')?.scrollIntoView({ behavior: 'smooth' });
                    showToast('Navigating to Ticket Selection');
                  }}
                  className="px-5 py-2.5 bg-primary hover:bg-primary-container text-white font-semibold text-xs sm:text-sm rounded-lg shadow-sm transition flex items-center gap-1 group active:scale-95"
                >
                  <span>Book Seats</span>
                  <span className="material-symbols-outlined text-[16px] transition-transform group-hover:translate-x-1">arrow_forward</span>
                </button>
              </div>

            </div>
          </div>

          {/* MAIN CONTENT & STICKY BOOKING SPLIT LAYOUT */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-8 items-start">
            
            {/* Left Content Column (8 Cols) */}
            <div className="lg:col-span-8 flex flex-col gap-6">
              
              {/* Interactive Segmented Navigation Tabs */}
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-1.5 flex items-center gap-1 overflow-x-auto">
                {[
                  { key: 'about', label: 'About' },
                  { key: 'details', label: 'Event Details' },
                  { key: 'gear', label: 'What to Bring' },
                  { key: 'location', label: 'Location & Map' },
                  { key: 'policy', label: 'Policy & FAQ' },
                ].map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveTab(t.key as typeof activeTab)}
                    className={`flex-1 min-w-[110px] py-2 px-3 text-center font-semibold text-xs sm:text-sm rounded-lg transition-all ${
                      activeTab === t.key
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* TAB 1: About Panel */}
              {activeTab === 'about' && (
                <div className="flex flex-col gap-6 animate-in fade-in duration-200">
                  {/* Overview Card */}
                  <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                    <h2 className="text-xl font-bold text-[#0b1c30] tracking-tight">About the Event</h2>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {event.about}
                    </p>
                    {event.aboutExtra && (
                      <p className="text-sm text-slate-600 leading-relaxed">
                        {event.aboutExtra}
                      </p>
                    )}
                  </div>

                  {/* What's Included Grid */}
                  <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                    <h3 className="text-lg font-bold text-[#0b1c30] tracking-tight">What's Included &amp; Excluded</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {event.included.map((inc, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs sm:text-sm text-slate-800 font-medium">
                          <span className="material-symbols-outlined text-emerald-600 text-[18px] shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>
                            check_circle
                          </span>
                          <span>{inc}</span>
                        </div>
                      ))}
                      {event.excluded.map((exc, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs sm:text-sm text-slate-400">
                          <span className="material-symbols-outlined text-red-500 text-[18px] shrink-0 mt-0.5">cancel</span>
                          <span>{exc}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Key Highlights Mosaic */}
                  <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                    <h3 className="text-lg font-bold text-[#0b1c30] tracking-tight">Key Highlights</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {event.highlights.map((h, i) => (
                        <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col gap-1">
                          <div className="w-8 h-8 rounded-lg bg-blue-100 text-primary flex items-center justify-center mb-1">
                            <span className="material-symbols-outlined text-[18px]">{h.icon}</span>
                          </div>
                          <span className="font-bold text-slate-900 text-xs sm:text-sm">{h.title}</span>
                          <p className="text-xs text-slate-500 leading-relaxed">{h.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Trek Leader Profile */}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center gap-4">
                    <img
                      src={event.leader.avatar}
                      alt={event.leader.name}
                      className="w-20 h-20 rounded-full object-cover shrink-0 shadow-sm"
                    />
                    <div className="flex-1 text-center sm:text-left">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
                        <span className="font-bold text-slate-900 text-sm sm:text-base">{event.leader.name}</span>
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-primary font-semibold text-[10px] uppercase w-fit mx-auto sm:mx-0">
                          {event.leader.role}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        {event.leader.bio}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: Event Details Panel */}
              {activeTab === 'details' && (
                <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-sm space-y-6 animate-in fade-in duration-200">
                  <h3 className="text-lg font-bold text-[#0b1c30] tracking-tight">Detailed Schedule &amp; Timeline</h3>
                  
                  <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                    {event.schedule.map((item, i) => (
                      <div key={i} className="relative">
                        <span className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-primary ring-4 ring-white" />
                        <span className="text-[11px] font-bold text-primary uppercase tracking-wider">{item.time}</span>
                        <h4 className="font-bold text-slate-900 text-sm mt-0.5">{item.title}</h4>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 3: What to Bring Panel */}
              {activeTab === 'gear' && (
                <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-sm space-y-4 animate-in fade-in duration-200">
                  <h3 className="text-lg font-bold text-[#0b1c30] tracking-tight">Mandatory Packing Checklist</h3>
                  <p className="text-xs text-slate-500">Please make sure your daypack does not exceed 4kg for comfortable trekking.</p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                    {event.packingList.map((item, i) => (
                      <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
                        <span className="material-symbols-outlined text-primary text-[20px]">{item.icon}</span>
                        <div>
                          <span className="font-bold text-slate-900 text-xs sm:text-sm block">{item.title}</span>
                          <span className="text-xs text-slate-500">{item.desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 4: Location & Map Panel */}
              {activeTab === 'location' && (
                <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-sm space-y-4 animate-in fade-in duration-200">
                  <h3 className="text-lg font-bold text-[#0b1c30] tracking-tight">Base Camp Venue &amp; Directions</h3>
                  
                  <div
                    className="w-full h-72 rounded-2xl bg-cover bg-center shadow-inner relative flex items-end p-4 border border-slate-200"
                    style={{
                      backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuBlCjpy_XOf1W8cmOTy9WjoU1Mf67Wg5FwACOQxKolwaQV2AFFWJXv0lhnnHFjNK8_6l_8X5fpEfPG6raIunhItrt7Fd369Oy47plf9l8bkjmzigYuDCcYnRncXKBt7iUAD9kNVegpqSQNtftozMMGOpv_ViuvLWrchsCG1Cwz2xzGLcF3qxKp1ZSdrcwLz0cXIqLOfYb5JwmRpAaC-kLoGZ0-0_rHLvJcXgz8U9iuX')`,
                    }}
                  >
                    <div className="bg-white/95 backdrop-blur-md p-3.5 rounded-xl shadow-md border border-slate-200">
                      <p className="font-bold text-slate-900 text-sm">{event.venue}</p>
                      <p className="text-xs text-slate-500 font-medium">{event.locationCoords || 'Coordinates: 18.2464° N, 73.6828° E • Ample vehicle parking available'}</p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 gap-3">
                    <div>
                      <span className="font-bold text-slate-900 text-xs sm:text-sm block">Driving from Pune / Mumbai?</span>
                      <span className="text-xs text-slate-500">{event.drivingInfo || 'Approx. 1h 45m via NH48 and Nasrapur - Velhe Road.'}</span>
                    </div>
                    <a
                      href={event.venueMapUrl || 'https://maps.google.com'}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 bg-white hover:bg-slate-100 text-primary font-semibold text-xs rounded-lg shadow-sm transition flex items-center gap-1 shrink-0 border border-slate-200"
                    >
                      <span className="material-symbols-outlined text-[16px]">directions</span>
                      <span>Get Driving Route</span>
                    </a>
                  </div>
                </div>
              )}

              {/* TAB 5: Policy & FAQ Panel */}
              {activeTab === 'policy' && (
                <div className="flex flex-col gap-6 animate-in fade-in duration-200">
                  <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                    <h3 className="text-lg font-bold text-[#0b1c30] tracking-tight">Cancellation &amp; Refund Policy</h3>
                    {event.allowSelfServiceCancellation ? (
                      <ul className="space-y-3 text-xs sm:text-sm text-slate-700">
                        <li className="flex items-start gap-2">
                          <span className="material-symbols-outlined text-emerald-600 text-[18px] shrink-0 mt-0.5">info</span>
                          <span>
                            <strong>{event.refundPercentage}% Refund:</strong> Cancel up to {event.refundCutoffDays} day{event.refundCutoffDays === 1 ? '' : 's'} before the event from your booking confirmation.
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="material-symbols-outlined text-red-500 text-[18px] shrink-0 mt-0.5">info</span>
                          <span><strong>No Refund:</strong> Cancellations after that window, or no-shows.</span>
                        </li>
                      </ul>
                    ) : (
                      <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-200">
                        <span className="material-symbols-outlined text-red-600 text-[20px] shrink-0 mt-0.5">block</span>
                        <div>
                          <p className="text-sm font-bold text-red-800">No Refund Policy</p>
                          <p className="text-xs sm:text-sm text-red-700 mt-0.5 leading-relaxed">
                            This event does not offer self-service cancellations or refunds once booked.
                          </p>
                        </div>
                      </div>
                    )}
                    {event.cancellationPolicyText && (
                      <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line pt-1 border-t border-slate-100">{event.cancellationPolicyText}</p>
                    )}
                  </div>

                  {event.faqItems && event.faqItems.length > 0 && (
                    <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                      <h3 className="text-lg font-bold text-[#0b1c30] tracking-tight">Frequently Asked Questions</h3>
                      <div className="divide-y divide-slate-100">
                        {event.faqItems.map((faq, i) => (
                          <details key={i} className="group py-3.5 first:pt-0 last:pb-0">
                            <summary className="flex items-center justify-between gap-3 cursor-pointer list-none font-bold text-slate-900 text-sm">
                              <span>{faq.question}</span>
                              <span className="material-symbols-outlined text-slate-400 text-[18px] shrink-0 transition-transform group-open:rotate-180">expand_more</span>
                            </summary>
                            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mt-2">{faq.answer}</p>
                          </details>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Customer Reviews Section — always visible, regardless of active tab */}
              <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <h3 className="text-lg font-bold text-[#0b1c30] tracking-tight">
                    Reviews {event.ratingSummary && event.ratingSummary.reviewCount > 0 ? `(${event.ratingSummary.reviewCount})` : ''}
                  </h3>
                  {event.isPast && (
                    <Link
                      to="/feedback"
                      className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[16px]">rate_review</span>
                      Rate this event
                    </Link>
                  )}
                </div>

                {reviews.length === 0 ? (
                  <p className="text-xs sm:text-sm text-slate-500">No reviews yet — be the first to share your experience.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {reviews.map((review) => (
                      <div key={review.id} className="py-3.5 first:pt-0 last:pb-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900 text-sm">{review.customerName}</span>
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <span
                                key={star}
                                className={`material-symbols-outlined text-[15px] ${star <= review.rating ? 'text-amber-400' : 'text-slate-200'}`}
                                style={star <= review.rating ? { fontVariationSettings: "'FILL' 1" } : undefined}
                              >
                                star
                              </span>
                            ))}
                          </div>
                        </div>
                        {review.reviewText && (
                          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mt-1.5">{review.reviewText}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Right Column: Sticky Booking Checkout Sidebar (4 Cols) */}
            <div className="lg:col-span-4 flex flex-col gap-6 sticky top-20">
              
              {/* Interactive Ticket Booking Card */}
              <div id="bookingCard" className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-md flex flex-col gap-4">
                
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Instant Confirmation</span>
                    <h2 className="text-lg font-extrabold text-[#0b1c30]">Ready to join?</h2>
                  </div>
                  <span className="w-9 h-9 rounded-full bg-blue-50 text-primary flex items-center justify-center">
                    <span className="material-symbols-outlined text-[18px]">confirmation_number</span>
                  </span>
                </div>

                {/* Price & Availability Block */}
                <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Per ticket from</span>
                    <span className="text-xl font-extrabold text-primary">{formatINR(event.ticketCategories[0]?.price || 499)}</span>
                  </div>
                  <div className="flex flex-col justify-center items-end text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Available Slots</span>
                    <span className="text-sm font-extrabold text-emerald-600">{event.availableSeats} Left</span>
                  </div>
                </div>

                {/* Direct Ticket Selector Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Select Tier</span>
                    <span className="text-[10px] text-slate-400 font-semibold">Max 10 per booking</span>
                  </div>

                  {event.ticketCategories.map((tier) => (
                    <div key={tier.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900 text-xs sm:text-sm">{tier.name}</span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-primary">
                            {tier.id === 'general' ? 'Standard' : 'Popular'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium">{tier.description}</p>
                      </div>

                      {/* Quantity Stepper */}
                      <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-sm shrink-0">
                        <button
                          type="button"
                          onClick={() => updateQty(tier.id, -1)}
                          disabled={(quantities[tier.id] ?? 0) === 0}
                          className="w-6 h-6 rounded flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40"
                        >
                          <span className="material-symbols-outlined text-[16px]">remove</span>
                        </button>
                        <span className="font-bold text-slate-900 text-xs sm:text-sm w-4 text-center">
                          {quantities[tier.id] ?? 0}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQty(tier.id, 1)}
                          className="w-6 h-6 rounded flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px]">add</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pricing Calculation Summary */}
                <div className="pt-2 border-t border-slate-100 flex flex-col gap-1 text-xs text-slate-600">
                  <div className="flex justify-between items-center">
                    <span>Total Tickets</span>
                    <span className="font-bold text-slate-900">{totalTickets}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Estimated Subtotal</span>
                    <span className="text-base font-extrabold text-slate-900">{formatINR(totalAmount)}</span>
                  </div>
                </div>

                {!event.allowSelfServiceCancellation && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700">
                    <span className="material-symbols-outlined text-[16px] shrink-0">block</span>
                    <span className="text-[11px] font-bold">No Refund Policy — this event does not offer cancellations or refunds.</span>
                  </div>
                )}

                {/* Primary Book CTA */}
                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={handleBookNow}
                    disabled={totalTickets === 0}
                    className={`w-full py-3 px-4 bg-primary hover:bg-primary-container text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 group active:scale-98 ${
                      totalTickets === 0 ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <span>BOOK NOW</span>
                    <span className="material-symbols-outlined text-[18px] transition-transform group-hover:translate-x-1">arrow_forward</span>
                  </button>

                  <div className="flex items-center justify-center gap-1 text-[10px] font-semibold text-slate-400">
                    <span className="material-symbols-outlined text-[14px] text-emerald-600" style={{ fontVariationSettings: "'FILL' 1" }}>
                      lock
                    </span>
                    <span>Encrypted 256-bit safe checkout</span>
                  </div>
                </div>

                <div className="bg-blue-50/60 p-2.5 rounded-xl flex items-center gap-2 border border-blue-100">
                  <span className="material-symbols-outlined text-primary text-[18px]">redeem</span>
                  <p className="text-[11px] text-slate-600 font-medium">Instant WhatsApp &amp; Email ticket delivery with QR pass.</p>
                </div>
              </div>

              {/* About Organizer Card */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">About the Organizer</h3>
                  <span className="material-symbols-outlined text-slate-400 text-[18px]">badge</span>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-primary text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
                    EA
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-slate-900 text-sm">{event.organizer.name}</span>
                      <span className="material-symbols-outlined text-primary text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                        verified
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium">{event.organizer.tagline}</p>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  Example Adventures creates curated outdoor experiences including treks, weekend camping trips, and heritage adventure expeditions across Western Ghats since 2018. Over 15,000 happy hikers guided.
                </p>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="bg-slate-50 p-2 rounded-lg text-center border border-slate-100">
                    <span className="font-extrabold text-primary text-sm block">{event.organizer.eventsHosted || 62}+</span>
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Events Hosted</span>
                  </div>
                  <div className="bg-slate-50 p-2 rounded-lg text-center border border-slate-100">
                    <span className="font-extrabold text-emerald-600 text-sm block">{event.organizer.rating || '99.2%'}</span>
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Positive Rating</span>
                  </div>
                </div>

                <Link
                  to={`/organizers/${event.organizer.slug}`}
                  className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 text-primary font-semibold text-xs rounded-xl border border-slate-200 shadow-sm transition flex items-center justify-center gap-1.5"
                >
                  <span>View Organizer Profile</span>
                  <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                </Link>
              </div>

            </div>
          </div>
        </div>

        {/* FLOATING PROTOTYPE NAVIGATOR */}
        <aside className="fixed bottom-6 right-6 z-40 flex items-center gap-3 bg-[#0b1c30]/90 text-white backdrop-blur-md px-4 py-2.5 rounded-full shadow-xl border border-slate-700 text-xs transition-all">
          <div className="flex items-center gap-2 pr-2 border-r border-slate-700">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-xs tracking-tight">
              Attendee Flow: Step 2 of 6 - Event Details
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Link
              to="/"
              className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-[11px] flex items-center gap-1 transition active:scale-95"
            >
              <span className="material-symbols-outlined text-xs">arrow_back</span> Prev: Step 1
            </Link>
            <button
              type="button"
              onClick={handleBookNow}
              className="px-3 py-1 rounded-full bg-primary hover:bg-primary-container text-white font-semibold text-[11px] flex items-center gap-1 transition shadow-sm active:scale-95"
            >
              Next: Step 3 <span className="material-symbols-outlined text-xs">arrow_forward</span>
            </button>
          </div>
        </aside>

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

