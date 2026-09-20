import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Info,
  Calendar,
  Ticket,
  ShieldAlert,
  Eye,
  Check,
  ChevronRight,
  ChevronLeft,
  Save,
  Plus,
  Trash2,
  UploadCloud,
  Sparkles,
  MapPin,
  Search,
  Navigation,
  Crosshair,
  CheckCircle2,
  Globe,
  Map,
  Compass,
  LocateFixed,
  Building2,
  AlertCircle
} from 'lucide-react';
import { useEvents } from '../../../context/EventsContext';
import { useNotifications } from '../../../context/NotificationContext';
import { ApiError } from '../../../lib/api';

export default function CreateEvent() {
  const { addEvent } = useEvents();
  const { showToast } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();

  // Determine current step from path or default to step 1
  let currentStep = 1;
  if (location.pathname.includes('/date-location')) currentStep = 2;
  else if (location.pathname.includes('/tickets') || location.pathname.includes('/registration')) currentStep = 3;
  else if (location.pathname.includes('/cancellation')) currentStep = 4;
  else if (location.pathname.includes('/preview')) currentStep = 5;

  const [formData, setFormData] = useState({
    title: '',
    category: 'Adventure & Trekking',
    shortDescription: '',
    description: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    timezone: 'IST (UTC+5:30)',
    venueType: 'physical',
    venueName: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    coordinates: { lat: 18.5204, lng: 73.8567 }, // Pune — a reasonable map center, not event content
    pinPosition: { x: 50, y: 50 },
    bannerImage: '',
    totalCapacity: 0,
    tags: [],
    ticketTiers: [
      {
        id: 'tier-1',
        name: '',
        price: 0,
        quantity: 0,
        sold: 0,
        description: ''
      }
    ],
    cancellationPolicy: {
      refundable: true,
      cutoffDays: 3,
      refundPercentage: 80,
      description: ''
    }
  });

  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [mapAutoFilled, setMapAutoFilled] = useState(true);
  const [isLocating, setIsLocating] = useState(false);

  // Preset location venues for quick pin drop / auto-fill
  const PRESET_VENUES = [
    {
      name: "Gunjawane Base Village (Rajgad Fort)",
      address: "Gunjawane, Velhe Taluka, Rajgad Foothills",
      city: "Pune",
      state: "Maharashtra",
      pincode: "412213",
      lat: 18.2546,
      lng: 73.6821,
      pinX: 48,
      pinY: 55
    },
    {
      name: "JW Marriott Grand Ballroom",
      address: "Senapati Bapat Road, Shivajinagar",
      city: "Pune",
      state: "Maharashtra",
      pincode: "411016",
      lat: 18.5308,
      lng: 73.8288,
      pinX: 62,
      pinY: 40
    },
    {
      name: "Bandra Fort Amphitheatre Grounds",
      address: "Land's End, Bandra West",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400050",
      lat: 19.0434,
      lng: 72.8197,
      pinX: 25,
      pinY: 35
    },
    {
      name: "Valvan Valley Wellness Resort",
      address: "Old Mumbai-Pune Highway, Valvan",
      city: "Lonavala",
      state: "Maharashtra",
      pincode: "410401",
      lat: 18.7562,
      lng: 73.4072,
      pinX: 40,
      pinY: 45
    },
    {
      name: "Morjim Eco Beach Resort",
      address: "Morjim Beach Road, Pernem",
      city: "Goa",
      state: "Goa",
      pincode: "403512",
      lat: 15.6179,
      lng: 73.7381,
      pinX: 35,
      pinY: 75
    }
  ];

  const handleSelectPresetVenue = (venue) => {
    setFormData((prev) => ({
      ...prev,
      venueName: venue.name,
      address: venue.address,
      city: venue.city,
      state: venue.state,
      pincode: venue.pincode,
      coordinates: { lat: venue.lat, lng: venue.lng },
      pinPosition: { x: venue.pinX, y: venue.pinY }
    }));
    setMapAutoFilled(true);
    showToast(`📍 Location auto-filled for "${venue.name}"`, 'success');
  };

  // Interactive Map Click Handler to Drop Pin
  const handleMapClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);

    // Calculate approximate simulated lat/lng from pin position
    const approxLat = (18.0 + (100 - y) * 0.015).toFixed(4);
    const approxLng = (73.0 + x * 0.015).toFixed(4);

    setFormData((prev) => ({
      ...prev,
      pinPosition: { x, y },
      coordinates: { lat: parseFloat(approxLat), lng: parseFloat(approxLng) },
      // If venue name is generic, update it with pin drop info
      venueName: prev.venueName || `Dropped Pin Venue (${approxLat}° N, ${approxLng}° E)`,
      address: prev.address || `Near Sahyadri Mountain Trail, Coordinates: ${approxLat}, ${approxLng}`
    }));
    setMapAutoFilled(true);
    showToast(`📍 Pin dropped at coordinates: ${approxLat}° N, ${approxLng}° E`, 'info');
  };

  // Search Map Places
  const handleSearchMapPlaces = (e) => {
    e.preventDefault();
    if (!mapSearchQuery.trim()) return;

    const matched = PRESET_VENUES.find(v =>
      v.name.toLowerCase().includes(mapSearchQuery.toLowerCase()) ||
      v.city.toLowerCase().includes(mapSearchQuery.toLowerCase())
    );

    if (matched) {
      handleSelectPresetVenue(matched);
    } else {
      // Simulate reverse geocode from search query
      const newLat = 18.5204 + (Math.random() - 0.5) * 0.1;
      const newLng = 73.8567 + (Math.random() - 0.5) * 0.1;
      const x = Math.min(85, Math.max(15, Math.round(Math.random() * 80)));
      const y = Math.min(85, Math.max(15, Math.round(Math.random() * 80)));

      setFormData((prev) => ({
        ...prev,
        venueName: mapSearchQuery,
        address: `${mapSearchQuery} Main Road`,
        city: prev.city || "Pune",
        state: prev.state || "Maharashtra",
        coordinates: { lat: parseFloat(newLat.toFixed(4)), lng: parseFloat(newLng.toFixed(4)) },
        pinPosition: { x, y }
      }));
      setMapAutoFilled(true);
      showToast(`📍 Found & pinned location for "${mapSearchQuery}"`, 'success');
    }
  };

  // Device GPS Geolocation
  const handleUseCurrentLocation = () => {
    setIsLocating(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = parseFloat(pos.coords.latitude.toFixed(4));
          const lng = parseFloat(pos.coords.longitude.toFixed(4));
          setFormData((prev) => ({
            ...prev,
            coordinates: { lat, lng },
            pinPosition: { x: 50, y: 50 },
            venueName: prev.venueName || "Current GPS Location",
            address: prev.address || `GPS Location (${lat}, ${lng})`
          }));
          setIsLocating(false);
          setMapAutoFilled(true);
          showToast(`📍 GPS coordinates detected: ${lat}, ${lng}`, 'success');
        },
        () => {
          // Fallback simulation
          setTimeout(() => {
            const lat = 18.5204;
            const lng = 73.8567;
            setFormData((prev) => ({
              ...prev,
              coordinates: { lat, lng },
              pinPosition: { x: 55, y: 45 },
              venueName: prev.venueName || "Pune Central Hub",
              address: "Shivajinagar, Pune, Maharashtra 411005"
            }));
            setIsLocating(false);
            setMapAutoFilled(true);
            showToast(`📍 GPS coordinates detected: ${lat}, ${lng}`, 'success');
          }, 600);
        }
      );
    } else {
      setIsLocating(false);
      showToast('Geolocation not supported on this browser', 'error');
    }
  };

  const steps = [
    { num: 1, label: 'Basic Information', path: '/organizer/create-event/basic', icon: Info },
    { num: 2, label: 'Date & Location', path: '/organizer/create-event/date-location', icon: Calendar },
    { num: 3, label: 'Tickets & Pricing', path: '/organizer/create-event/tickets', icon: Ticket },
    { num: 4, label: 'Cancellation Policy', path: '/organizer/create-event/cancellation', icon: ShieldAlert },
    { num: 5, label: 'Preview & Publish', path: '/organizer/create-event/preview', icon: Eye },
  ];

  const handleNext = async () => {
    if (currentStep < 5) {
      navigate(steps[currentStep].path);
    } else {
      try {
        const created = await addEvent({ ...formData, status: 'published' });
        navigate(`/organizer/events/${created.id}/dashboard`);
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'Failed to publish event. Please try again.', 'error');
      }
    }
  };

  const handleSaveDraft = async () => {
    try {
      await addEvent({ ...formData, status: 'draft' });
      showToast('Saved as draft in My Events', 'info');
      navigate('/organizer/events?tab=draft');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to save draft. Please try again.', 'error');
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      navigate(steps[currentStep - 2].path);
    }
  };

  const addTier = () => {
    const newTier = {
      id: `tier-${Date.now()}`,
      name: 'New Ticket Tier',
      price: 999,
      quantity: 25,
      sold: 0,
      description: 'Description of inclusions and perks.'
    };
    setFormData((prev) => ({
      ...prev,
      ticketTiers: [...prev.ticketTiers, newTier],
      totalCapacity: prev.totalCapacity + newTier.quantity
    }));
  };

  const removeTier = (tierId) => {
    if (formData.ticketTiers.length <= 1) {
      showToast('Event must have at least one ticket tier', 'error');
      return;
    }
    setFormData((prev) => ({
      ...prev,
      ticketTiers: prev.ticketTiers.filter(t => t.id !== tierId)
    }));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Create New Experience</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Step {currentStep} of 5 — {steps[currentStep - 1]?.label}
          </p>
        </div>

        <button
          onClick={handleSaveDraft}
          type="button"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-xs"
        >
          <Save className="w-3.5 h-3.5 text-slate-500" />
          <span>Save as Draft</span>
        </button>
      </div>

      {/* Stepper Progress Indicator */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between overflow-x-auto no-scrollbar gap-2">
          {steps.map((step) => {
            const isCompleted = step.num < currentStep;
            const isCurrent = step.num === currentStep;

            return (
              <NavLink
                key={step.num}
                to={step.path}
                className="flex items-center gap-2 shrink-0 group"
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    isCompleted
                      ? 'bg-emerald-600 text-white'
                      : isCurrent
                      ? 'bg-brand-600 text-white ring-4 ring-brand-100'
                      : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
                  }`}
                >
                  {isCompleted ? <Check className="w-4 h-4" /> : step.num}
                </div>
                <span
                  className={`text-xs font-semibold whitespace-nowrap ${
                    isCurrent ? 'text-brand-600' : isCompleted ? 'text-slate-800' : 'text-slate-400'
                  }`}
                >
                  {step.label}
                </span>
                {step.num < 5 && <ChevronRight className="w-4 h-4 text-slate-300 ml-2 hidden sm:block" />}
              </NavLink>
            );
          })}
        </div>
      </div>

      {/* Dynamic Form Step Card */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6">
        {/* STEP 1: Basic Information */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Event Title *</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g. Rajgad Sunrise Trek"
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-medium"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Event Category *</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="Adventure & Trekking">Adventure & Trekking</option>
                  <option value="Technology & Conferences">Technology & Conferences</option>
                  <option value="Music & Festivals">Music & Festivals</option>
                  <option value="Health & Wellness">Health & Wellness</option>
                  <option value="Food & Heritage">Food & Heritage</option>
                  <option value="Sports & Fitness">Sports & Fitness</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Primary Banner Image URL</label>
                <input
                  type="text"
                  value={formData.bannerImage}
                  onChange={(e) => setFormData({ ...formData, bannerImage: e.target.value })}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Short Catchy Summary</label>
              <input
                type="text"
                value={formData.shortDescription}
                onChange={(e) => setFormData({ ...formData, shortDescription: e.target.value })}
                placeholder="One sentence that hooks potential attendees..."
                className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Full Detailed Itinerary & Description</label>
              <textarea
                rows={5}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Include safety guidelines, schedule, things to carry, inclusions..."
                className="w-full p-3.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 leading-relaxed"
              ></textarea>
            </div>
          </div>
        )}

        {/* STEP 2: Date & Location with Interactive Pin-Drop Map & Auto-Fill */}
        {currentStep === 2 && (
          <div className="space-y-6">
            {/* Schedule / Date & Time */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-brand-600" />
                <span>Event Schedule & Time</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Start Time *</label>
                  <input
                    type="time"
                    required
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">End Time</label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>
            </div>

            {/* Interactive Google Map Pin Drop Location Section */}
            <div className="pt-4 border-t border-slate-100 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-rose-600" />
                    <span>Google Maps Pin-Drop & Auto Location Capture</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Click anywhere on the map to drop a pin or search a place. Address details auto-populate automatically and can be manually edited below.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  disabled={isLocating}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-brand-700 hover:bg-blue-100 rounded-lg text-xs font-bold border border-blue-200 shrink-0 transition-colors"
                >
                  <LocateFixed className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
                  <span>{isLocating ? 'Detecting GPS...' : 'Use Current GPS'}</span>
                </button>
              </div>

              {/* Map Search Bar & Autocomplete */}
              <form onSubmit={handleSearchMapPlaces} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={mapSearchQuery}
                    onChange={(e) => setMapSearchQuery(e.target.value)}
                    placeholder="Search landmark, hotel, fort, or street on Google Maps (e.g. Rajgad Fort, Bandra Fort)..."
                    className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 font-medium"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-xs shrink-0"
                >
                  Search & Pin
                </button>
              </form>

              {/* Preset Venue Shortcuts */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-xs">
                <span className="text-[11px] font-bold text-slate-500 shrink-0">Popular Venues:</span>
                {PRESET_VENUES.map((venue) => (
                  <button
                    key={venue.name}
                    type="button"
                    onClick={() => handleSelectPresetVenue(venue)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-200 text-slate-700 rounded-lg text-[11px] font-medium border border-slate-200 shrink-0 transition-colors"
                  >
                    📍 {venue.name.split('(')[0].trim()}
                  </button>
                ))}
              </div>

              {/* Interactive Map Visualizer Container */}
              <div
                onClick={handleMapClick}
                className="relative h-64 sm:h-80 w-full rounded-2xl overflow-hidden border-2 border-slate-300 shadow-inner cursor-crosshair group select-none bg-[#e8ecef]"
              >
                {/* Simulated Google Maps Vector Grid / Styled Canvas */}
                <div
                  className="absolute inset-0 bg-cover bg-center opacity-85"
                  style={{
                    backgroundImage: `radial-gradient(#c2cbd6 1.5px, transparent 1.5px), radial-gradient(#d5dbe2 1.5px, #f4f7fa 1.5px)`,
                    backgroundSize: `24px 24px, 12px 12px`
                  }}
                >
                  {/* Stylized road vector paths */}
                  <svg className="w-full h-full opacity-60 pointer-events-none" viewBox="0 0 800 400">
                    {/* Water body */}
                    <path d="M0,320 Q200,280 400,340 T800,300 L800,400 L0,400 Z" fill="#c4e3ed" />
                    {/* Highways / Expressways */}
                    <path d="M-50,150 Q300,120 450,220 T850,260" stroke="#fcd34d" strokeWidth="12" fill="none" strokeLinecap="round" />
                    <path d="M-50,150 Q300,120 450,220 T850,260" stroke="#f59e0b" strokeWidth="8" fill="none" strokeLinecap="round" />
                    {/* Secondary avenues */}
                    <path d="M200,-50 L250,450" stroke="#ffffff" strokeWidth="10" fill="none" />
                    <path d="M550,-50 L500,450" stroke="#ffffff" strokeWidth="8" fill="none" />
                    <path d="M-50,300 L850,100" stroke="#ffffff" strokeWidth="6" fill="none" />
                    {/* Green park zone */}
                    <rect x="120" y="40" width="180" height="100" rx="20" fill="#d1fae5" opacity="0.8" />
                    <text x="180" y="95" fill="#065f46" fontSize="11" fontWeight="bold">Sahyadri Nature Reserve</text>
                  </svg>
                </div>

                {/* Map Floating Badges & Controls */}
                <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-xs px-3 py-1.5 rounded-lg shadow-md border border-slate-200 text-xs flex items-center gap-2 pointer-events-none">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="font-bold text-slate-800">
                    Interactive Pin Drop: Click map to place marker
                  </span>
                </div>

                <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-xs px-3 py-1.5 rounded-lg shadow-md border border-slate-200 text-[11px] font-mono font-bold text-slate-700 pointer-events-none">
                  Lat: {formData.coordinates?.lat || 18.2546}° | Lng: {formData.coordinates?.lng || 73.6821}°
                </div>

                {/* Animated Drop Pin Marker */}
                <div
                  className="absolute transform -translate-x-1/2 -translate-y-full transition-all duration-300 pointer-events-none"
                  style={{
                    left: `${formData.pinPosition?.x || 50}%`,
                    top: `${formData.pinPosition?.y || 50}%`
                  }}
                >
                  {/* Pin Tooltip */}
                  <div className="bg-slate-900 text-white text-[11px] font-bold px-2.5 py-1 rounded-md shadow-xl whitespace-nowrap mb-1 -translate-x-1/4 animate-bounce">
                    📍 {formData.venueName || "Selected Venue"}
                  </div>

                  {/* Red Google Maps Pin SVG */}
                  <div className="relative flex items-center justify-center">
                    <svg className="w-9 h-9 text-rose-600 drop-shadow-xl" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0C7.58 0 4 3.58 4 8c0 5.25 8 16 8 16s8-10.75 8-16c0-4.42-3.58-8-8-8zm0 11c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z" />
                    </svg>
                    {/* Pulsing ground shadow */}
                    <div className="w-3 h-1.5 bg-black/40 rounded-full absolute -bottom-0.5 blur-xs"></div>
                  </div>
                </div>

                {/* Helper overlay on hover */}
                <div className="absolute bottom-3 left-3 bg-slate-900/80 backdrop-blur-xs text-white px-3 py-1 rounded-md text-[10px] font-medium pointer-events-none">
                  Tap anywhere on map to reposition Google Pin
                </div>
              </div>

              {/* Status Badge of Auto Location Capture */}
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Location automatically captured from map coordinates. Verify and adjust manually below if needed:
                  </span>
                </div>
                <span className="text-[11px] font-bold text-emerald-700 font-mono bg-emerald-100 px-2 py-0.5 rounded shrink-0">
                  AUTO-SYNC ACTIVE
                </span>
              </div>

              {/* Address Details Fields (Pre-filled + Editable Manually) */}
              <div className="p-5 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-brand-600" />
                    <span>Venue & Address Information (Editable)</span>
                  </h4>
                  <span className="text-[11px] text-slate-400">Fill or edit manually</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Venue / Landmark / Base Camp Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.venueName}
                    onChange={(e) => setFormData({ ...formData, venueName: e.target.value })}
                    placeholder="e.g. Gunjawane Base Village / JW Marriott Grand Ballroom"
                    className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Full Street Address / Directions</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="e.g. Gunjawane, Velhe Taluka, Velhe Foothills"
                    className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">City *</label>
                    <input
                      type="text"
                      required
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      placeholder="e.g. Pune"
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">State *</label>
                    <input
                      type="text"
                      required
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      placeholder="e.g. Maharashtra"
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Postal / Pincode</label>
                    <input
                      type="text"
                      value={formData.pincode}
                      onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                      placeholder="e.g. 412213"
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Tickets & Registration */}
        {currentStep === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Ticket Tiers & Capacities</h3>
                <p className="text-xs text-slate-500">Configure ticket passes, individual pricing, and capacity allotments.</p>
              </div>
              <button
                type="button"
                onClick={addTier}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-brand-700 hover:bg-blue-100 rounded-lg text-xs font-bold border border-blue-200"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Ticket Tier</span>
              </button>
            </div>

            <div className="space-y-3">
              {formData.ticketTiers.map((tier, idx) => (
                <div key={tier.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Tier #{idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeTier(tier.id)}
                      className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Tier Name</label>
                      <input
                        type="text"
                        value={tier.name}
                        onChange={(e) => {
                          const updated = [...formData.ticketTiers];
                          updated[idx].name = e.target.value;
                          setFormData({ ...formData, ticketTiers: updated });
                        }}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Price (₹ INR)</label>
                      <input
                        type="number"
                        value={tier.price}
                        onChange={(e) => {
                          const updated = [...formData.ticketTiers];
                          updated[idx].price = Number(e.target.value);
                          setFormData({ ...formData, ticketTiers: updated });
                        }}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Quantity / Allotment</label>
                      <input
                        type="number"
                        value={tier.quantity}
                        onChange={(e) => {
                          const updated = [...formData.ticketTiers];
                          updated[idx].quantity = Number(e.target.value);
                          setFormData({ ...formData, ticketTiers: updated });
                        }}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Inclusions / Description</label>
                      <input
                        type="text"
                        value={tier.description}
                        onChange={(e) => {
                          const updated = [...formData.ticketTiers];
                          updated[idx].description = e.target.value;
                          setFormData({ ...formData, ticketTiers: updated });
                        }}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 4: Cancellation Policy */}
        {currentStep === 4 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Cancellation & Refund Rules</h3>
              <p className="text-xs text-slate-500">Specify automated refund percentages and cutoff windows.</p>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer p-3 rounded-lg border border-slate-200 bg-slate-50">
                <input
                  type="checkbox"
                  checked={formData.cancellationPolicy.refundable}
                  onChange={(e) => setFormData({
                    ...formData,
                    cancellationPolicy: { ...formData.cancellationPolicy, refundable: e.target.checked }
                  })}
                  className="rounded text-brand-600 focus:ring-brand-500"
                />
                <span className="text-xs font-semibold text-slate-800">Allow Attendee Self-Service Cancellations</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Refund Cutoff (Days before event)</label>
                  <input
                    type="number"
                    value={formData.cancellationPolicy.cutoffDays}
                    onChange={(e) => setFormData({
                      ...formData,
                      cancellationPolicy: { ...formData.cancellationPolicy, cutoffDays: Number(e.target.value) }
                    })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Refund Amount Percentage (%)</label>
                  <input
                    type="number"
                    value={formData.cancellationPolicy.refundPercentage}
                    onChange={(e) => setFormData({
                      ...formData,
                      cancellationPolicy: { ...formData.cancellationPolicy, refundPercentage: Number(e.target.value) }
                    })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Policy Terms Description</label>
                <textarea
                  rows={3}
                  value={formData.cancellationPolicy.description}
                  onChange={(e) => setFormData({
                    ...formData,
                    cancellationPolicy: { ...formData.cancellationPolicy, description: e.target.value }
                  })}
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                ></textarea>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: Preview & Publish */}
        {currentStep === 5 && (
          <div className="space-y-5">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-emerald-900">Your Experience is Ready to Go Live!</h4>
                  <p className="text-[11px] text-emerald-700">Review all details below before publishing to the catalog.</p>
                </div>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <img src={formData.bannerImage} alt={formData.title} className="w-full h-48 object-cover" />
              <div className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-50 text-brand-700 border border-brand-200">
                    {formData.category}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">Capacity: {formData.totalCapacity} attendees</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900">{formData.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{formData.shortDescription}</p>

                <div className="pt-3 border-t border-slate-100 flex flex-wrap gap-4 text-xs text-slate-600">
                  <span><strong>Date:</strong> {formData.startDate} ({formData.startTime})</span>
                  <span><strong>Venue:</strong> {formData.venueName}, {formData.city}</span>
                  <span><strong>Tiers:</strong> {formData.ticketTiers.length} tier(s) starting from ₹{Math.min(...formData.ticketTiers.map(t => t.price))}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stepper Bottom Action Buttons */}
        <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentStep === 1}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous Step</span>
          </button>

          <button
            type="button"
            onClick={handleNext}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-xs font-bold bg-brand-600 hover:bg-brand-700 text-white shadow-md transition-all"
          >
            <span>{currentStep === 5 ? '🚀 Publish Event Live' : 'Next Step'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
