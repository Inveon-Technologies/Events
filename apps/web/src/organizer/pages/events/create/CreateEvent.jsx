import React, { useState, useEffect, useRef } from 'react';
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
  Sparkles,
  MapPin,
  Building2,
  X,
  Video,
  Image as ImageIcon
} from 'lucide-react';
import { useEvents } from '../../../context/EventsContext';
import { useNotifications } from '../../../context/NotificationContext';
import { useAuth } from '../../../context/AuthContext';
import LocationPicker from '../../../components/LocationPicker';
import TicketDesignEditor from '../../../components/TicketDesignEditor';
import TicketPreview from '../../../components/TicketPreview';
import { istParts } from '../../../lib/istTime';
import { ApiError, apiRequest, uploadEventMediaFile, deleteEventMediaFile } from '../../../lib/api';
import UploadProgressOverlay from '../../../components/UploadProgressOverlay';

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
    // Real map pins (see LocationPicker): the venue, or group pickup
    // points in order, each with coordinates, optional time and note.
    locationPoints: [],
    bannerImage: '',
    // Ticket design (see TicketDesignEditor): title background image and
    // up to 10 Partners & Supporters, as uploaded image URLs.
    ticketBackgroundUrl: null,
    partners: [],
    // Participation certificates for checked-in attendees (designed in
    // the event's Certificate tab).
    certificateEnabled: false,
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
          startDate: istParts(data.eventDate).date,
          startTime: istParts(data.eventDate).time,
          venueName: data.venueAddress || '',
          bannerImage: data.bannerImage || '',
          ticketBackgroundUrl: data.ticketBackgroundUrl || null,
          certificateEnabled: Boolean(data.certificateEnabled),
          partners: (data.partners || []).map((p, i) => ({ id: `partner-${i}`, name: p.name || '', role: p.role || '', logoUrl: p.logoUrl || null })),
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
          locationPoints:
            data.locationPoints && data.locationPoints.length
              ? data.locationPoints
              : data.venueLatitude !== null && data.venueLatitude !== undefined
                ? [{
                    type: 'venue',
                    label: data.venueAddress || 'Venue',
                    address: data.venueAddress,
                    latitude: Number(data.venueLatitude),
                    longitude: Number(data.venueLongitude),
                    time: null,
                    note: null,
                  }]
                : [],
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


  // Staged locally as real File objects, not yet uploaded — an event
  // must exist in the database before media can be attached to it (the
  // upload endpoint is scoped to a real event id), so these only
  // actually upload once the event itself is successfully created, in
  // handleNext/handleSaveDraft below.
  const [mediaImages, setMediaImages] = useState([]);
  const [mediaVideo, setMediaVideo] = useState(null);
  const [mediaError, setMediaError] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);
  // Drives the full-screen progress overlay while saving + uploading.
  const [progress, setProgress] = useState(null);
  // Resolves the "some files failed" question in the progress overlay.
  const retryChoice = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const hasStagedMedia = () => mediaImages.some((m) => m.file) || Boolean(mediaVideo?.file);

  function addImageFiles(list) {
    setMediaError('');
    const problems = [];
    const images = list.filter((f) => {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
        problems.push(`"${f.name}" isn't a JPG, PNG or WebP photo`);
        return false;
      }
      if (f.size > MAX_FILE_SIZE_BYTES) {
        problems.push(`"${f.name}" is over the 10MB limit`);
        return false;
      }
      return true;
    });
    const room = MAX_IMAGES - mediaImages.length;
    if (images.length > room) problems.push(`only ${MAX_IMAGES} photos are allowed, so ${images.length - room} were left out`);
    const accepted = images.slice(0, Math.max(0, room));
    if (problems.length) setMediaError(`${problems.join('; ')}.`);
    if (accepted.length) {
      setMediaImages((prev) => [...prev, ...accepted.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
    }
  }

  async function handleImageFilesSelected(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // allow re-selecting the same file after removing it
    addImageFiles(files);
  }

  function handlePhotoDrop(e) {
    e.preventDefault();
    setDragOver(false);
    addImageFiles(Array.from(e.dataTransfer?.files || []));
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
    const staged = [...mediaImages.map((m) => ({ ...m, kind: 'photo' })), ...(mediaVideo ? [{ ...mediaVideo, kind: 'video' }] : [])].filter(
      (m) => m.file,
    );
    if (staged.length === 0) return;

    setUploadingMedia(true);
    const startedAt = Date.now();
    let files = staged.map((m) => ({
      name: m.file.name,
      size: m.file.size,
      previewUrl: m.previewUrl,
      kind: m.kind,
      status: 'waiting',
      loaded: 0,
    }));
    const show = (phase) => setProgress({ phase, files, startedAt });
    const patch = (i, changes) => {
      files = files.map((f, j) => (j === i ? { ...f, ...changes } : f));
      show('uploading');
    };

    // Upload whatever isn't done yet; on failures, let the organizer
    // retry just those or carry on.
    for (;;) {
      for (let i = 0; i < staged.length; i += 1) {
        if (files[i].status === 'done') continue;
        patch(i, { status: 'uploading', loaded: 0, error: undefined });
        try {
          // eslint-disable-next-line no-await-in-loop
          await uploadEventMediaFile(eventId, staged[i].file, user?.token, ({ loaded }) =>
            patch(i, { loaded: Math.min(loaded, staged[i].file.size) }),
          );
          patch(i, { status: 'done', loaded: staged[i].file.size });
        } catch (err) {
          patch(i, { status: 'failed', error: err instanceof ApiError ? err.message : 'Upload failed' });
        }
      }
      if (!files.some((f) => f.status === 'failed')) break;
      show('failed');
      // eslint-disable-next-line no-await-in-loop
      const choice = await new Promise((resolve) => {
        retryChoice.current = resolve;
      });
      if (choice !== 'retry') break;
    }

    const failed = files.filter((f) => f.status === 'failed').length;
    if (!failed) {
      show('done');
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    setUploadingMedia(false);
    // Uploaded files are now real media on the event, so a second save
    // must not upload them again.
    setMediaImages((prev) => prev.filter((m) => !m.file));
    setMediaVideo((prev) => (prev?.file ? null : prev));
    if (failed) showToast(`Event saved. ${failed} file(s) weren't uploaded — add them again from Edit.`, 'info');
  }

  // The map's "main" point fills the venue address fields below: the
  // point marked Venue, or the only point in single-location mode. Fields
  // stay editable; only a newly chosen main point overwrites them.
  function handleLocationPointsChange(points) {
    setFormData((prev) => {
      const next = { ...prev, locationPoints: points };
      const primary = points.find((p) => p.type === 'venue') ?? (points.length === 1 ? points[0] : null);
      const prevPrimary = prev.locationPoints.find((p) => p.type === 'venue') ?? (prev.locationPoints.length === 1 ? prev.locationPoints[0] : null);
      const moved = primary && (!prevPrimary || prevPrimary.latitude !== primary.latitude || prevPrimary.longitude !== primary.longitude);
      if (moved) {
        next.venueName = primary.label || prev.venueName;
        next.address = primary.address || prev.address;
        if (primary._city !== undefined) next.city = primary._city || '';
        if (primary._state !== undefined) next.state = primary._state || '';
        if (primary._pincode !== undefined) next.pincode = primary._pincode || '';
      }
      return next;
    });
  }

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
      if (hasStagedMedia()) setProgress({ phase: 'saving' });
      const result = await updateEventFull(eventId, { ...formData, status: 'published' });
      if (result) {
        await uploadStagedMedia(eventId);
        setProgress(null);
        showToast('Event updated successfully!', 'success');
        navigate(`/organizer/events/${eventId}/dashboard`);
      } else {
        setProgress(null);
      }
    } else {
      try {
        if (hasStagedMedia()) setProgress({ phase: 'saving' });
        const created = await addEvent({ ...formData, status: 'published' });
        await uploadStagedMedia(created.id);
        setProgress(null);
        navigate(`/organizer/events/${created.id}/dashboard`);
      } catch (err) {
        setProgress(null);
        showToast(err instanceof ApiError ? err.message : 'Failed to publish event. Please try again.', 'error');
      }
    }
  };

  const handleSaveDraft = async () => {
    if (isEditMode) {
      if (hasStagedMedia()) setProgress({ phase: 'saving' });
      const result = await updateEventFull(eventId, formData);
      if (result) {
        await uploadStagedMedia(eventId);
        setProgress(null);
        showToast('Changes saved', 'info');
        navigate(`/organizer/events/${eventId}/dashboard`);
      } else {
        setProgress(null);
      }
      return;
    }
    try {
      if (hasStagedMedia()) setProgress({ phase: 'saving' });
      const created = await addEvent({ ...formData, status: 'draft' });
      await uploadStagedMedia(created.id);
      setProgress(null);
      showToast('Saved as draft in My Events', 'info');
      navigate('/organizer/events?tab=draft');
    } catch (err) {
      setProgress(null);
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
      <UploadProgressOverlay
        progress={progress}
        onRetry={() => retryChoice.current?.('retry')}
        onContinue={() => retryChoice.current?.('continue')}
      />
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
              <div
                className={`flex flex-wrap gap-3 rounded-xl p-2 -m-2 transition-colors ${dragOver ? 'bg-brand-50 ring-2 ring-brand-300' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handlePhotoDrop}
              >
                {mediaImages.map((img, i) => (
                  <div key={img.previewUrl} className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200 group">
                    <img src={img.previewUrl} alt="" className="w-full h-full object-cover" />
                    {i === 0 ? (
                      <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] font-bold text-center py-0.5">
                        COVER
                      </span>
                    ) : (
                      img.file && (
                        <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[9px] text-center py-0.5">
                          {(img.file.size / (1024 * 1024)).toFixed(1)} MB
                        </span>
                      )
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
                    <span className="text-[9px] leading-tight text-center px-1">or drop here</span>
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
              <p className="mt-1.5 text-[11px] text-slate-400">
                Files upload when you save — you'll see the progress of each one.
              </p>
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

            {/* Real map: venue or group pickup points (OpenStreetMap, free) */}
            <div className="pt-4 border-t border-slate-100 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-rose-600" />
                  <span>Location on the map</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Attendees see these pins on the event page with directions. Choose one venue, or several pickup points for group travel.
                </p>
              </div>

              <LocationPicker points={formData.locationPoints} onChange={handleLocationPointsChange} token={user?.token} />

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
            <section className="p-4 border border-slate-200 rounded-xl space-y-4" aria-label="Ticket design">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Ticket design</h4>
                <p className="text-[11px] text-slate-500">Personalize the ticket attendees receive, then check it in the preview below before publishing.</p>
              </div>
              <TicketDesignEditor
                value={{ ticketBackgroundUrl: formData.ticketBackgroundUrl, partners: formData.partners }}
                onChange={(design) => setFormData((prev) => ({ ...prev, ...design }))}
              />
            </section>

            <section className="p-4 border border-slate-200 rounded-xl flex flex-wrap items-center gap-3" aria-label="Participation certificates">
              <div className="flex-1 min-w-[220px]">
                <h4 className="text-sm font-bold text-slate-900">Participation certificates</h4>
                <p className="text-[11px] text-slate-500">
                  Checked-in attendees get a certificate after the event — by email, WhatsApp and on their ticket page.{' '}
                  {isEditMode ? (
                    <NavLink to={`/organizer/events/${eventId}/certificate`} className="font-semibold text-brand-600 hover:underline">
                      Design the certificate →
                    </NavLink>
                  ) : (
                    'You can design it in the event\u2019s Certificate tab after saving.'
                  )}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={formData.certificateEnabled}
                aria-label="Send participation certificates"
                onClick={() => setFormData((prev) => ({ ...prev, certificateEnabled: !prev.certificateEnabled }))}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${formData.certificateEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${formData.certificateEnabled ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </section>

            <TicketPreview formData={formData} coverUrl={mediaImages[0]?.previewUrl || formData.bannerImage || null} />

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
