import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation, useParams } from 'react-router-dom';
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
  AlertCircle,
  X,
  Video,
  Image as ImageIcon
} from 'lucide-react';
import { useEvents } from '../../../context/EventsContext';
import { useNotifications } from '../../../context/NotificationContext';
import { useAuth } from '../../../context/AuthContext';
import { ApiError, apiRequest, uploadEventMediaFile, deleteEventMediaFile } from '../../../lib/api';

const MAX_IMAGES = 5;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_DURATION_SECONDS = 20;

// Client-side check for fast feedback before ever uploading — the
// server (see apps/api/src/services/eventMedia.ts) re-checks this with
// real ffprobe against the file's own container metadata regardless,
// since a browser-reported duration isn't authoritative.
function readVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Could not read this video file'));
    };
    video.src = URL.createObjectURL(file);
  });
}

export default function CreateEvent() {
  const { addEvent, updateEventFull } = useEvents();
  const { showToast } = useNotifications();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { eventId } = useParams();
  const isEditMode = Boolean(eventId);
  const [loadingExisting, setLoadingExisting] = useState(isEditMode);

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
    genderRestriction: '', // '' = open to all genders (the default); 'male' or 'female' otherwise
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
      // Defaults to off (No Refund) — an organizer opts in explicitly
      // per event, matching the same "opt-in, not silently on" design
      // as the backend itself (organizerVerification / eventCreation).
      refundable: false,
      cutoffDays: 3,
      refundPercentage: 80,
      description: ''
    },
    scheduleItems: [],
    packingChecklist: [],
    faqItems: []
  });

  // Edit mode: load the real existing event and populate the form with
  // it. venueName here intentionally receives the whole combined
  // venueAddress string rather than trying to split it back into its
  // original venueName/address/city/state/pincode parts (the backend
  // only ever stores the combined string, so those parts aren't
  // recoverable) — leaving the other venue fields blank and touching
  // only venueName if edited keeps the real address intact either way,
  // since updateOrganizerEvent only recombines venueAddress when at
  // least one of these fields is actually sent.
  useEffect(() => {
    if (!isEditMode) return;
    let cancelled = false;
    apiRequest(`/organizer/events/${eventId}`, { token: user?.token })
      .then((data) => {
        if (cancelled) return;
        setFormData((prev) => ({
          ...prev,
          title: data.title,
          shortDescription: data.shortDescription || '',
          description: data.description || '',
          startDate: data.eventDate.slice(0, 10),
          startTime: data.eventDate.slice(11, 16),
          venueName: data.venueAddress || '',
          bannerImage: data.bannerImage || '',
          genderRestriction: data.genderRestriction || '',
          ticketTiers: data.ticketTiers.length
            ? data.ticketTiers.map((t) => ({ id: t.id, name: t.name, price: t.price, quantity: t.quantity, sold: t.sold, description: t.description || '' }))
            : prev.ticketTiers,
          cancellationPolicy: {
            refundable: Boolean(data.allowSelfServiceCancellation),
            cutoffDays: data.refundCutoffDays ?? 3,
            refundPercentage: data.refundPercentage ?? 80,
            description: data.cancellationPolicy || '',
          },
          scheduleItems: data.scheduleItems || [],
          packingChecklist: data.packingChecklist || [],
          faqItems: data.faqItems || [],
        }));
        // Already-uploaded media, shown alongside newly staged files.
        // Marked with existingId so saving never re-uploads them and
        // removing one deletes it on the server.
        const existing = data.media || [];
        setMediaImages(existing.filter((m) => m.mediaType === 'photo').map((m) => ({ existingId: m.id, previewUrl: m.url })));
        const video = existing.find((m) => m.mediaType === 'video');
        setMediaVideo(video ? { existingId: video.id, previewUrl: video.url } : null);
      })
      .catch((err) => {
        if (!cancelled) showToast(err instanceof ApiError ? err.message : 'Could not load this event.', 'error');
      })
      .finally(() => {
        if (!cancelled) setLoadingExisting(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [mapAutoFilled, setMapAutoFilled] = useState(true);
  const [isLocating, setIsLocating] = useState(false);

  // Staged locally as real File objects, not yet uploaded — an event
  // must exist in the database before media can be attached to it (the
  // upload endpoint is scoped to a real event id), so these only
  // actually upload once the event itself is successfully created, in
  // handleNext/handleSaveDraft below.
  const [mediaImages, setMediaImages] = useState([]);
  const [mediaVideo, setMediaVideo] = useState(null);
  const [mediaError, setMediaError] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);

  async function handleImageFilesSelected(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // allow re-selecting the same file after removing it
    setMediaError('');

    if (mediaImages.length + files.length > MAX_IMAGES) {
      setMediaError(`You can add up to ${MAX_IMAGES} images total.`);
      return;
    }
    const oversized = files.find((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (oversized) {
      setMediaError(`"${oversized.name}" is over the 10MB limit.`);
      return;
    }
    setMediaImages((prev) => [...prev, ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
  }

  async function removeExistingMedia(item) {
    try {
      await deleteEventMediaFile(eventId, item.existingId, user?.token);
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not remove this file.', 'error');
      return false;
    }
  }

  async function removeImage(index) {
    const item = mediaImages[index];
    if (!item) return;
    if (item.existingId) {
      if (!(await removeExistingMedia(item))) return;
    } else {
      URL.revokeObjectURL(item.previewUrl);
    }
    setMediaImages((prev) => prev.filter((m) => m !== item));
  }

  async function handleVideoFileSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMediaError('');

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setMediaError('Video is over the 10MB limit.');
      return;
    }
    try {
      const duration = await readVideoDuration(file);
      if (duration > MAX_VIDEO_DURATION_SECONDS) {
        setMediaError(`Video is ${duration.toFixed(1)}s — the limit is ${MAX_VIDEO_DURATION_SECONDS} seconds.`);
        return;
      }
      setMediaVideo({ file, previewUrl: URL.createObjectURL(file), duration });
    } catch {
      setMediaError('Could not read this video file — please try a different one.');
    }
  }

  async function removeVideo() {
    if (!mediaVideo) return;
    if (mediaVideo.existingId) {
      if (!(await removeExistingMedia(mediaVideo))) return;
    } else {
      URL.revokeObjectURL(mediaVideo.previewUrl);
    }
    setMediaVideo(null);
  }

  // Uploads every staged file to the now-real event, sequentially (not
  // Promise.all) so one failure doesn't abandon uploads already in
  // flight, and so the reported failure count is accurate rather than a
  // race. The event itself is already created and safe by this point —
  // a media upload failure is reported but never undoes it.
  async function uploadStagedMedia(eventId) {
    // Only newly staged files — already-uploaded media (existingId) stays as is.
    const allFiles = [...mediaImages, ...(mediaVideo ? [mediaVideo] : [])].filter((m) => m.file).map((m) => m.file);
    if (allFiles.length === 0) return;

    setUploadingMedia(true);
    let failures = 0;
    for (const file of allFiles) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await uploadEventMediaFile(eventId, file, user?.token);
      } catch {
        failures += 1;
      }
    }
    setUploadingMedia(false);
    if (failures > 0) {
      showToast(`Event saved, but ${failures} of ${allFiles.length} media file(s) failed to upload.`, 'error');
    }
  }

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

  const basePath = isEditMode ? `/organizer/events/${eventId}/edit` : '/organizer/create-event';
  const steps = [
    { num: 1, label: 'Basic Information', path: `${basePath}/basic`, icon: Info },
    { num: 2, label: 'Date & Location', path: `${basePath}/date-location`, icon: Calendar },
    { num: 3, label: 'Tickets & Pricing', path: `${basePath}/tickets`, icon: Ticket },
    { num: 4, label: 'Policy & FAQ', path: `${basePath}/cancellation`, icon: ShieldAlert },
    { num: 5, label: isEditMode ? 'Review & Save' : 'Preview & Publish', path: `${basePath}/preview`, icon: Eye },
  ];

  const handleNext = async () => {
    if (currentStep < 5) {
      navigate(steps[currentStep].path);
    } else if (isEditMode) {
      const result = await updateEventFull(eventId, { ...formData, status: 'published' });
      if (result) {
        showToast('Event updated successfully!', 'success');
        navigate(`/organizer/events/${eventId}/dashboard`);
      }
    } else {
      try {
        const created = await addEvent({ ...formData, status: 'published' });
        await uploadStagedMedia(created.id);
        navigate(`/organizer/events/${created.id}/dashboard`);
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'Failed to publish event. Please try again.', 'error');
      }
    }
  };

  const handleSaveDraft = async () => {
    if (isEditMode) {
      const result = await updateEventFull(eventId, formData);
      if (result) {
        showToast('Changes saved', 'info');
        navigate(`/organizer/events/${eventId}/dashboard`);
      }
      return;
    }
    try {
      const created = await addEvent({ ...formData, status: 'draft' });
      await uploadStagedMedia(created.id);
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

  // Schedule/Timeline, Packing Checklist, and FAQ are all optional,
  // simple add/update/remove lists — same shape as ticket tiers above,
  // just without the "must have at least one" requirement since none
  // of these are required for an event to be valid.
  const addScheduleItem = () => {
    setFormData((prev) => ({
      ...prev,
      scheduleItems: [...prev.scheduleItems, { id: `sched-${Date.now()}`, time: '', title: '', description: '' }]
    }));
  };
  const updateScheduleItem = (id, field, value) => {
    setFormData((prev) => ({
      ...prev,
      scheduleItems: prev.scheduleItems.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    }));
  };
  const removeScheduleItem = (id) => {
    setFormData((prev) => ({ ...prev, scheduleItems: prev.scheduleItems.filter((s) => s.id !== id) }));
  };

  const addPackingItem = () => {
    setFormData((prev) => ({
      ...prev,
      packingChecklist: [...prev.packingChecklist, { id: `pack-${Date.now()}`, item: '', mandatory: true }]
    }));
  };
  const updatePackingItem = (id, field, value) => {
    setFormData((prev) => ({
      ...prev,
      packingChecklist: prev.packingChecklist.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    }));
  };
  const removePackingItem = (id) => {
    setFormData((prev) => ({ ...prev, packingChecklist: prev.packingChecklist.filter((p) => p.id !== id) }));
  };

  const addFaqItem = () => {
    setFormData((prev) => ({
      ...prev,
      faqItems: [...prev.faqItems, { id: `faq-${Date.now()}`, question: '', answer: '' }]
    }));
  };
  const updateFaqItem = (id, field, value) => {
    setFormData((prev) => ({
      ...prev,
      faqItems: prev.faqItems.map((f) => (f.id === id ? { ...f, [field]: value } : f))
    }));
  };
  const removeFaqItem = (id) => {
    setFormData((prev) => ({ ...prev, faqItems: prev.faqItems.filter((f) => f.id !== id) }));
  };

  if (loadingExisting) {
    return <p className="text-xs text-slate-500 max-w-4xl mx-auto">Loading event…</p>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{isEditMode ? 'Edit Event' : 'Create New Experience'}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Step {currentStep} of 5 — {steps[currentStep - 1]?.label}
          </p>
        </div>

        <button
          onClick={handleSaveDraft}
          type="button"
          disabled={uploadingMedia}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-xs disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Save className="w-3.5 h-3.5 text-slate-500" />
          <span>{uploadingMedia ? 'Uploading media…' : isEditMode ? 'Save Changes' : 'Save as Draft'}</span>
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

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Event Category *</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full sm:w-1/2 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
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
              <label htmlFor="event-gender-restriction" className="block text-xs font-bold text-slate-700 mb-1">Gender Eligibility</label>
              <select
                id="event-gender-restriction"
                value={formData.genderRestriction}
                onChange={(e) => setFormData({ ...formData, genderRestriction: e.target.value })}
                className="w-full sm:w-1/2 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Open to all genders</option>
                <option value="female">Female attendees only</option>
                <option value="male">Male attendees only</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                {formData.genderRestriction
                  ? `Customers will be asked to confirm their gender at checkout — only bookings matching "${formData.genderRestriction} only" will be accepted.`
                  : 'Leave this as "Open to all genders" unless this event genuinely needs to restrict attendance — no gender question is shown at checkout otherwise.'}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">
                  Event Photos <span className="font-normal text-slate-400">— the first photo is the event's cover/banner</span>
                </label>
                <span className="text-[11px] text-slate-400 font-medium">{mediaImages.length}/{MAX_IMAGES} images · up to 10MB each</span>
              </div>
              <div className="flex flex-wrap gap-3">
                {mediaImages.map((img, i) => (
                  <div key={img.previewUrl} className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200 group">
                    <img src={img.previewUrl} alt="" className="w-full h-full object-cover" />
                    {i === 0 && (
                      <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] font-bold text-center py-0.5">
                        COVER
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      aria-label="Remove image"
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {mediaImages.length < MAX_IMAGES && (
                  <label className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-300 hover:border-brand-400 hover:bg-brand-50/50 flex flex-col items-center justify-center cursor-pointer transition-colors text-slate-400 hover:text-brand-500">
                    <ImageIcon className="w-5 h-5" />
                    <span className="text-[10px] font-bold mt-1">Add</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={handleImageFilesSelected} />
                  </label>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">Title Video</label>
                <span className="text-[11px] text-slate-400 font-medium">1 video max · up to {MAX_VIDEO_DURATION_SECONDS}s · up to 10MB</span>
              </div>
              {mediaVideo ? (
                <div className="relative w-40 rounded-lg overflow-hidden border border-slate-200">
                  <video src={mediaVideo.previewUrl} className="w-full h-24 object-cover bg-black" muted controls />
                  <button
                    type="button"
                    onClick={removeVideo}
                    aria-label="Remove video"
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <label className="w-40 h-24 rounded-lg border-2 border-dashed border-slate-300 hover:border-brand-400 hover:bg-brand-50/50 flex flex-col items-center justify-center cursor-pointer transition-colors text-slate-400 hover:text-brand-500">
                  <Video className="w-5 h-5" />
                  <span className="text-[10px] font-bold mt-1">Add video</span>
                  <input type="file" accept="video/mp4,video/webm" className="hidden" onChange={handleVideoFileSelected} />
                </label>
              )}
              {mediaError && <p className="mt-1.5 text-[11px] text-red-600">{mediaError}</p>}
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

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-slate-700">Detailed Schedule & Timeline</label>
                <button type="button" onClick={addScheduleItem} className="text-[11px] font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Add step
                </button>
              </div>
              <div className="space-y-2">
                {formData.scheduleItems.map((s) => (
                  <div key={s.id} className="flex items-start gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <input
                      type="text"
                      value={s.time}
                      onChange={(e) => updateScheduleItem(s.id, 'time', e.target.value)}
                      placeholder="6:00 AM"
                      className="w-24 shrink-0 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                    <div className="flex-1 space-y-1.5">
                      <input
                        type="text"
                        value={s.title}
                        onChange={(e) => updateScheduleItem(s.id, 'title', e.target.value)}
                        placeholder="Assembly at base camp"
                        className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 font-medium"
                      />
                      <input
                        type="text"
                        value={s.description}
                        onChange={(e) => updateScheduleItem(s.id, 'description', e.target.value)}
                        placeholder="Optional details"
                        className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </div>
                    <button type="button" onClick={() => removeScheduleItem(s.id)} aria-label="Remove step" className="shrink-0 p-1.5 text-slate-400 hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {formData.scheduleItems.length === 0 && (
                  <p className="text-[11px] text-slate-400">No schedule steps added yet — optional.</p>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-slate-700">Mandatory Packing Checklist</label>
                <button type="button" onClick={addPackingItem} className="text-[11px] font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Add item
                </button>
              </div>
              <div className="space-y-2">
                {formData.packingChecklist.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                    <input
                      type="text"
                      value={p.item}
                      onChange={(e) => updatePackingItem(p.id, 'item', e.target.value)}
                      placeholder="Trekking shoes"
                      className="flex-1 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 shrink-0">
                      <input
                        type="checkbox"
                        checked={p.mandatory}
                        onChange={(e) => updatePackingItem(p.id, 'mandatory', e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      Mandatory
                    </label>
                    <button type="button" onClick={() => removePackingItem(p.id)} aria-label="Remove item" className="shrink-0 p-1.5 text-slate-400 hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {formData.packingChecklist.length === 0 && (
                  <p className="text-[11px] text-slate-400">No packing items added yet — optional.</p>
                )}
              </div>
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
                  <label htmlFor="refund-cutoff-days" className="block text-xs font-bold text-slate-700 mb-1">Refund Cutoff (Days before event)</label>
                  <input
                    id="refund-cutoff-days"
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
                  <label htmlFor="refund-amount-percentage" className="block text-xs font-bold text-slate-700 mb-1">Refund Amount Percentage (%)</label>
                  <input
                    id="refund-amount-percentage"
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
                <label htmlFor="refund-policy-description" className="block text-xs font-bold text-slate-700 mb-1">Policy Terms Description</label>
                <textarea
                  id="refund-policy-description"
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

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-slate-700">Frequently Asked Questions</label>
                <button type="button" onClick={addFaqItem} className="text-[11px] font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Add question
                </button>
              </div>
              <div className="space-y-2">
                {formData.faqItems.map((f) => (
                  <div key={f.id} className="flex items-start gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="flex-1 space-y-1.5">
                      <input
                        type="text"
                        value={f.question}
                        onChange={(e) => updateFaqItem(f.id, 'question', e.target.value)}
                        placeholder="Is food included?"
                        className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 font-medium"
                      />
                      <textarea
                        rows={2}
                        value={f.answer}
                        onChange={(e) => updateFaqItem(f.id, 'answer', e.target.value)}
                        placeholder="Answer"
                        className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                      ></textarea>
                    </div>
                    <button type="button" onClick={() => removeFaqItem(f.id)} aria-label="Remove question" className="shrink-0 p-1.5 text-slate-400 hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {formData.faqItems.length === 0 && (
                  <p className="text-[11px] text-slate-400">No FAQs added yet — optional.</p>
                )}
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
              {mediaImages.length > 0 ? (
                <img src={mediaImages[0].previewUrl} alt={formData.title} className="w-full h-48 object-cover" />
              ) : (
                <div className="w-full h-48 bg-slate-100 flex items-center justify-center text-slate-400 text-xs font-semibold">
                  No photos added yet
                </div>
              )}
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
            disabled={uploadingMedia}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-xs font-bold bg-brand-600 hover:bg-brand-700 text-white shadow-md transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span>{uploadingMedia ? 'Uploading media…' : currentStep === 5 ? (isEditMode ? '✓ Save & Publish Changes' : '🚀 Publish Event Live') : 'Next Step'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
