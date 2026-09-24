import { useMemo, useState, useEffect } from 'react';
import { useLocation, useParams, useNavigate, Link } from 'react-router-dom';
import { load as loadCashfree } from '@cashfreepayments/cashfree-js';
import { fetchEventData, EventDetails, EventNotFoundError } from '../lib/eventDetails';
import { EventUnavailablePage } from './EventUnavailablePage';
import { formatINR } from '../lib/format';
import { apiRequest, ApiError } from '../organizer/lib/api';

interface Attendee {
  name: string;
  email: string;
  phone: string;
  gender: string;
  emergencyName: string;
  emergencyPhone: string;
  tier: string;
  tierId: string;
}

export function CheckoutPage() {
  const { eventId } = useParams();
  const [event, setEvent] = useState<EventDetails | null>(null);
  const location = useLocation();

  const navigate = useNavigate();
  const [loadError, setLoadError] = useState<'not_found' | 'failed' | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEventData(eventId)
      .then((data) => {
        if (!cancelled) setEvent(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof EventNotFoundError ? 'not_found' : 'failed');
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  // One ticket type per booking — that's what the backend books (a
  // booking belongs to exactly one ticket category). Quantities are
  // keyed by the event's real tier ids, starting from whatever the
  // event page passed in (clamped to what that tier actually allows),
  // or 1 of the first tier with seats left.
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!event) return;
    const passed = (location.state as { quantities?: Record<string, number> } | null)?.quantities ?? {};
    const requested = event.ticketCategories.find((t) => (passed[t.id] ?? 0) > 0);
    const tier = requested ?? event.ticketCategories.find((t) => t.available > 0);
    if (!tier) {
      setQuantities({});
      return;
    }
    const limit = Math.min(tier.maxPerBooking, tier.available);
    const qty = Math.max(0, Math.min(requested ? passed[tier.id] : 1, limit));
    setQuantities({ [tier.id]: qty });
  }, [event, location.state]);

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [isEventInfoOpen, setIsEventInfoOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync attendee list with the selected ticket quantity — existing
  // entries are kept as the count changes, new rows start empty.
  useEffect(() => {
    const tier = event?.ticketCategories.find((t) => (quantities[t.id] ?? 0) > 0);
    const count = tier ? quantities[tier.id] : 0;
    setAttendees((prev) =>
      Array.from({ length: count }, (_, i) => ({
        name: prev[i]?.name ?? '',
        email: prev[i]?.email ?? '',
        phone: prev[i]?.phone ?? '',
        gender: prev[i]?.gender ?? '',
        emergencyName: prev[i]?.emergencyName ?? '',
        emergencyPhone: prev[i]?.emergencyPhone ?? '',
        tier: tier?.name ?? '',
        tierId: tier?.id ?? '',
      })),
    );
  }, [quantities, event]);

  const totalTickets = Object.values(quantities).reduce((a, b) => a + b, 0);

  const totalAmount = useMemo(() => {
    if (!event) return 0;
    return event.ticketCategories.reduce(
      (sum, t) => sum + t.price * (quantities[t.id] ?? 0),
      0,
    );
  }, [quantities, event]);

  const selectedTier = event?.ticketCategories.find((t) => (quantities[t.id] ?? 0) > 0) ?? null;
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  if (loadError === 'not_found') {
    return <EventUnavailablePage reference={eventId ?? '404'} />;
  }

  if (loadError === 'failed') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="font-semibold text-on-surface">We couldn't load this event right now.</p>
        <button type="button" className="px-4 py-2 bg-primary text-on-primary rounded-lg" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 2800);
  }

  function updateQty(tierId: string, delta: number) {
    const tier = event!.ticketCategories.find((t) => t.id === tierId);
    if (!tier) return;
    const limit = Math.min(tier.maxPerBooking, tier.available);
    const currentQty = quantities[tierId] ?? 0;
    if (delta > 0 && currentQty >= limit) {
      showToast(
        tier.available <= currentQty
          ? `Only ${tier.available} ${tier.name} ticket${tier.available === 1 ? '' : 's'} left.`
          : `You can book at most ${tier.maxPerBooking} ${tier.name} tickets per booking.`,
      );
      return;
    }
    const newQty = Math.max(0, currentQty + delta);
    // Choosing a different ticket type replaces the current selection.
    setQuantities({ [tierId]: newQty });
  }

  function updateAttendeeField(index: number, field: keyof Attendee, val: string) {
    setAttendees((prev) =>
      prev.map((att, i) => (i === index ? { ...att, [field]: val } : att)),
    );
  }

  function goToStep(step: 1 | 2) {
    if (step > 1 && totalTickets === 0) {
      showToast('Please select at least 1 ticket to proceed.');
      return;
    }
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handlePrimaryAction() {
    if (currentStep === 1) {
      if (totalTickets === 0) {
        showToast('Please select at least 1 ticket.');
        return;
      }
      showToast('Proceeding to: Participant Details (Step 2)');
      setTimeout(() => goToStep(2), 200);
    } else if (currentStep === 2) {
      void validateAndConfirm();
    }
  }

  async function validateAndConfirm() {
    if (isSubmittingBooking) return;

    const lead = attendees[0];
    if (!lead || !lead.name.trim() || !lead.email.trim() || !lead.phone.trim()) {
      showToast('Please fill in the lead attendee\u2019s name, email, and phone.');
      return;
    }

    if (event?.genderRestriction && attendees.some((a) => a.gender !== event.genderRestriction)) {
      showToast(`Please confirm every attendee is ${event.genderRestriction} — this event is ${event.genderRestriction} attendees only.`);
      return;
    }

    if (!selectedTier) {
      showToast('Please select at least 1 ticket.');
      return;
    }

    setIsSubmittingBooking(true);
    setBookingError(null);

    try {
      const result = await apiRequest<{ bookingId: string; bookingReference: string; paymentSessionId?: string }>(
        `/events/${event!.id}/bookings`,
        {
          method: 'POST',
          body: {
            ticketCategoryId: selectedTier.id,
            quantity: totalTickets,
            primaryContactName: lead.name,
            primaryContactWhatsapp: lead.phone,
            primaryContactEmail: lead.email,
            paymentMethod: 'online',
            attendeeNames: attendees.map((a) => a.name || lead.name),
            attendeeGenders: event?.genderRestriction ? attendees.map((a) => a.gender) : undefined,
          },
        },
      );

      if (result.paymentSessionId) {
        // A real paid booking: hand off to Cashfree's own hosted checkout
        // page for the actual payment. This is a full-page redirect —
        // control leaves this app here, and the browser only comes back
        // once Cashfree sends it to the return_url the backend already
        // configured (see cashfreeOrders.ts), landing on
        // BookingConfirmedPage, which checks the booking's real status
        // rather than assuming success. Nothing past this point in this
        // function runs in the normal case.
        const cashfree = await loadCashfree({
          mode: (import.meta.env.VITE_CASHFREE_MODE as 'sandbox' | 'production') || 'sandbox',
        });
        const checkoutResult = await cashfree?.checkout({
          paymentSessionId: result.paymentSessionId,
          redirectTarget: '_self',
        });
        if (checkoutResult?.error) {
          setBookingError(checkoutResult.error.message || 'Payment could not be started. Please try again.');
          showToast(checkoutResult.error.message || 'Payment could not be started. Please try again.');
        }
        return;
      }

      // No payment session — a free ticket (confirmed immediately) or a
      // cash booking. The real confirmation page shows whichever status
      // the server actually recorded, rather than this page claiming
      // success on its own.
      navigate(`/bookings/${result.bookingId}/confirmed`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong creating your booking. Please try again.';
      setBookingError(message);
      showToast(message);
    } finally {
      setIsSubmittingBooking(false);
    }
  }

  return (
    <div className="bg-background font-body-md text-on-surface antialiased min-h-screen flex flex-col justify-between">
      <main className="w-full flex-1 p-space-md">
        <div className="flex flex-col w-full max-w-7xl mx-auto px-space-xs sm:px-space-md lg:px-margin text-on-surface">
          
          {/* TOP HEADER & BRAND BAR */}
          <header className="flex items-center justify-between py-space-md mb-space-sm">
            <Link to="/" className="flex items-center space-x-space-xs cursor-pointer group">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-on-primary font-headline-lg shadow-sm group-hover:bg-primary-container transition">
                <span className="material-symbols-outlined text-headline-md">confirmation_number</span>
              </div>
              <div>
                <div className="font-headline-lg text-primary leading-none tracking-tight flex items-center gap-1">
                  INVEON<span className="font-headline-sm text-on-surface font-normal">EVENTS</span>
                </div>
                <p className="font-label-badge text-on-surface-variant uppercase tracking-wider">by Inveon Technologies</p>
              </div>
            </Link>
            <div className="flex items-center space-x-2 bg-surface-container px-3 py-1.5 rounded-full text-on-surface-variant text-body-sm shadow-sm">
              <span className="material-symbols-outlined text-tertiary text-headline-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                lock
              </span>
              <span className="font-label-sm">Secure Booking • 256-bit SSL</span>
            </div>
          </header>

          {/* STEP PROGRESS BREADCRUMB */}
          <nav aria-label="Checkout Steps" className="mb-space-lg flex justify-center w-full">
            <div className="flex items-center space-x-2 sm:space-x-4 bg-surface-container-lowest px-4 sm:px-8 py-3 rounded-full shadow-sm max-w-2xl w-full justify-between overflow-x-auto">
              
              {/* Step 1 Indicator */}
              <button
                className={`flex items-center space-x-2 font-headline-sm transition-all focus:outline-none ${
                  currentStep === 1 ? 'text-primary' : currentStep > 1 ? 'text-tertiary' : 'text-on-surface-variant'
                }`}
                onClick={() => goToStep(1)}
                type="button"
              >
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center font-label-md transition-colors ${
                    currentStep === 1
                      ? 'bg-primary text-on-primary'
                      : currentStep > 1
                      ? 'bg-tertiary text-on-tertiary'
                      : 'bg-surface-container text-on-surface-variant'
                  }`}
                >
                  {currentStep > 1 ? (
                    <span className="material-symbols-outlined text-xs">check</span>
                  ) : (
                    '01'
                  )}
                </span>
                <span className="font-label-md whitespace-nowrap">Tickets</span>
              </button>

              <span
                className={`h-0.5 w-6 sm:w-12 transition-colors ${
                  currentStep > 1 ? 'bg-tertiary' : currentStep === 1 ? 'bg-primary-fixed-dim' : 'bg-surface-container-high'
                }`}
              />

              {/* Step 2 Indicator */}
              <button
                className={`flex items-center space-x-2 font-label-md transition-all focus:outline-none ${
                  currentStep === 2 ? 'text-primary' : currentStep > 2 ? 'text-tertiary' : 'text-on-surface-variant'
                }`}
                onClick={() => goToStep(2)}
                type="button"
              >
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center font-label-md transition-colors ${
                    currentStep === 2
                      ? 'bg-primary text-on-primary'
                      : currentStep > 2
                      ? 'bg-tertiary text-on-tertiary'
                      : 'bg-surface-container text-on-surface-variant'
                  }`}
                >
                  {currentStep > 2 ? (
                    <span className="material-symbols-outlined text-xs">check</span>
                  ) : (
                    '02'
                  )}
                </span>
                <span className="whitespace-nowrap">Participants</span>
              </button>

              <span
                className={`h-0.5 w-6 sm:w-12 transition-colors ${
                  currentStep > 2 ? 'bg-tertiary' : 'bg-surface-container-high'
                }`}
              />

              {/* Step 3 Indicator */}
              <button
                className={`flex items-center space-x-2 font-label-md transition-all focus:outline-none ${
                  currentStep === 3 ? 'text-tertiary font-bold' : 'text-on-surface-variant'
                }`}
                disabled
                type="button"
              >
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center font-label-md transition-colors ${
                    currentStep === 3
                      ? 'bg-tertiary text-on-tertiary'
                      : 'bg-surface-container text-on-surface-variant'
                  }`}
                >
                  {currentStep === 3 ? (
                    <span className="material-symbols-outlined text-xs">check</span>
                  ) : (
                    '03'
                  )}
                </span>
                <span className="whitespace-nowrap">Confirmation</span>
              </button>
            </div>
          </nav>

          {/* MAIN DUAL-COLUMN WORKSPACE (Steps 1 & 2) */}
          {currentStep !== 3 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg mb-space-xl">
              
              {/* LEFT MAIN COLUMN (Col 8) */}
              <div className="lg:col-span-8 flex flex-col space-y-space-md">
                
                {/* EVENT OVERVIEW SUMMARY CARD */}
                <article className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm transition-all hover:shadow-md">
                  <div className="flex flex-col sm:flex-row gap-space-md items-start sm:items-center">
                    <div className="relative w-full sm:w-48 h-32 rounded-lg overflow-hidden shrink-0 bg-surface-container">
                      {event.galleryImages[0] ? (
                        <img className="w-full h-full object-cover" alt={event.galleryImages[0].alt} src={event.galleryImages[0].src} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="material-symbols-outlined text-on-surface-variant text-headline-xl">event</span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h1 className="font-headline-lg text-on-surface tracking-tight truncate">
                          {event.name}
                        </h1>
                        <button
                          className="font-label-sm text-primary hover:underline flex items-center gap-1 shrink-0 bg-transparent border-0 cursor-pointer"
                          onClick={() => setIsEventInfoOpen(true)}
                          type="button"
                        >
                          View Event Details <span className="material-symbols-outlined text-sm">arrow_outward</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 my-2 text-body-sm text-on-surface-variant">
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-primary text-headline-sm">calendar_month</span>
                          <span>{event.date}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-primary text-headline-sm">schedule</span>
                          <span>{event.time} IST</span>
                        </div>
                        <div className="flex items-center gap-1.5 sm:col-span-2">
                          <span className="material-symbols-outlined text-primary text-headline-sm">location_on</span>
                          <span className="truncate">{event.venue || 'Venue to be announced'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t-0">
                        <div className="w-6 h-6 rounded-full bg-secondary-container flex items-center justify-center text-on-secondary-container font-headline-sm text-xs font-bold">
                          {event.organizer.name
                            .split(/\s+/)
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((w) => w[0]?.toUpperCase())
                            .join('')}
                        </div>
                        <span className="font-label-sm text-on-surface font-medium">{event.organizer.name}</span>
                        <span className="bg-tertiary-container text-on-tertiary-container px-2 py-0.5 rounded-full font-label-badge flex items-center gap-0.5">
                          <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>
                            verified
                          </span>{' '}
                          Verified Organizer
                        </span>
                      </div>
                    </div>
                  </div>
                </article>

                {/* STEP 1 VIEW: TICKET SELECTION */}
                {currentStep === 1 && (
                  <section className="flex flex-col space-y-space-md">
                    <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <h2 className="font-headline-lg text-on-surface">Select Your Tickets</h2>
                        {selectedTier && (
                          <span className="font-label-sm text-on-surface-variant bg-surface-container px-3 py-1 rounded-full">
                            Max {selectedTier.maxPerBooking} per booking
                          </span>
                        )}
                      </div>
                      <p className="text-body-md text-on-surface-variant mb-space-md">
                        Choose your ticket type and how many people are coming.
                      </p>

                      {/* TICKET TIER LIST — the event's real tiers */}
                      <div className="space-y-space-sm">
                        {event.ticketCategories.length === 0 && (
                          <p className="text-body-md text-on-surface-variant">No tickets are on sale for this event.</p>
                        )}
                        {event.ticketCategories.map((tier) => {
                          const qty = quantities[tier.id] ?? 0;
                          const limit = Math.min(tier.maxPerBooking, tier.available);
                          return (
                            <div key={tier.id} className="p-space-md rounded-xl bg-surface-container-low transition-all duration-200 hover:bg-surface-container">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-start space-x-space-sm">
                                  <div className="w-12 h-12 rounded-xl bg-primary-container text-on-primary-container flex items-center justify-center shrink-0 shadow-sm">
                                    <span className="material-symbols-outlined text-headline-lg">confirmation_number</span>
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h3 className="font-headline-md text-on-surface">{tier.name}</h3>
                                      <span className="font-label-badge text-tertiary-container bg-on-tertiary-container px-2 py-0.5 rounded-full">
                                        {tier.available > 0 ? `${tier.available} seats available` : 'Sold out'}
                                      </span>
                                    </div>
                                    <div className="font-headline-md text-primary mt-0.5">
                                      {formatINR(tier.price)} <span className="text-body-sm font-normal text-on-surface-variant">/ person</span>
                                    </div>
                                    <p className="text-body-sm text-on-surface-variant mt-1">{tier.description}</p>
                                  </div>
                                </div>

                                <div className="flex items-center justify-end space-x-3 bg-surface-container-lowest px-3 py-1.5 rounded-lg shadow-sm w-fit self-end sm:self-center">
                                  <button
                                    aria-label={`Remove one ${tier.name} ticket`}
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container disabled:opacity-40"
                                    onClick={() => updateQty(tier.id, -1)}
                                    disabled={qty === 0}
                                    type="button"
                                  >
                                    <span className="material-symbols-outlined text-headline-sm">remove</span>
                                  </button>
                                  <span className="font-headline-md text-on-surface w-6 text-center">{qty}</span>
                                  <button
                                    aria-label={`Add one ${tier.name} ticket`}
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-primary hover:bg-surface-container disabled:opacity-40"
                                    onClick={() => updateQty(tier.id, 1)}
                                    disabled={limit === 0}
                                    type="button"
                                  >
                                    <span className="material-symbols-outlined text-headline-sm">add</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {event.ticketCategories.length > 1 && (
                          <p className="text-body-sm text-on-surface-variant">One ticket type per booking — choosing another type replaces your current selection.</p>
                        )}
                      </div>
                    </div>
                  </section>
                )}

                {/* STEP 2 VIEW: PARTICIPANT DETAILS */}
                {currentStep === 2 && (
                  <section className="flex flex-col space-y-space-md">
                    <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <h2 className="font-headline-lg text-on-surface">Participant Details</h2>
                        <button
                          className="font-label-sm text-primary hover:underline flex items-center gap-1 bg-transparent border-0 cursor-pointer"
                          onClick={() => goToStep(1)}
                          type="button"
                        >
                          <span className="material-symbols-outlined text-sm">edit</span> Change Ticket Counts
                        </button>
                      </div>
                      <p className="text-body-md text-on-surface-variant mb-space-md">
                        Please enter details for each attendee.
                      </p>

                      {/* DYNAMIC ATTENDEE FORMS CONTAINER */}
                      <div className="space-y-space-md">
                        {attendees.map((attendee, index) => (
                          <div key={index} className="p-space-md rounded-xl bg-surface-container-low border-0 relative">
                            <div className="flex items-center justify-between mb-3 pb-2 border-b border-outline-variant/20">
                              <div className="flex items-center space-x-2">
                                <span className="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center font-label-badge">
                                  {index + 1}
                                </span>
                                <h3 className="font-headline-sm text-on-surface">Participant {index + 1}</h3>
                                <span className="font-label-badge bg-surface-container px-2 py-0.5 rounded text-primary font-semibold">
                                  {attendee.tier}
                                </span>
                              </div>
                              <span className="text-body-sm text-on-surface-variant flex items-center gap-1">
                                <span className="material-symbols-outlined text-xs">person</span> Holder Details
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block font-label-sm text-on-surface-variant mb-1">Full Name *</label>
                                <input
                                  type="text"
                                  value={attendee.name}
                                  onChange={(e) => updateAttendeeField(index, 'name', e.target.value)}
                                  placeholder="e.g. Rahul Sharma"
                                  className="w-full bg-surface-container-lowest px-3 py-2 rounded-lg font-body-sm text-on-surface outline-none focus:ring-2 focus:ring-primary shadow-sm"
                                  required
                                />
                              </div>
                              <div>
                                <label className="block font-label-sm text-on-surface-variant mb-1">Email Address *</label>
                                <input
                                  type="email"
                                  value={attendee.email}
                                  onChange={(e) => updateAttendeeField(index, 'email', e.target.value)}
                                  placeholder="name@example.com"
                                  className="w-full bg-surface-container-lowest px-3 py-2 rounded-lg font-body-sm text-on-surface outline-none focus:ring-2 focus:ring-primary shadow-sm"
                                  required
                                />
                              </div>
                              <div>
                                <label className="block font-label-sm text-on-surface-variant mb-1">Phone Number *</label>
                                <div className="flex">
                                  <span className="inline-flex items-center px-2.5 rounded-l-lg bg-surface-container text-on-surface-variant text-body-sm font-medium">
                                    +91
                                  </span>
                                  <input
                                    type="tel"
                                    value={attendee.phone}
                                    onChange={(e) => updateAttendeeField(index, 'phone', e.target.value)}
                                    placeholder="9876543210"
                                    className="w-full bg-surface-container-lowest px-3 py-2 rounded-r-lg font-body-sm text-on-surface outline-none focus:ring-2 focus:ring-primary shadow-sm"
                                    required
                                  />
                                </div>
                              </div>
                            </div>

                            {event?.genderRestriction && (
                              <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={attendee.gender === event.genderRestriction}
                                    onChange={(e) => updateAttendeeField(index, 'gender', e.target.checked ? event.genderRestriction! : '')}
                                    className="w-4 h-4 accent-primary"
                                    required
                                  />
                                  <span className="text-body-sm text-amber-900 font-medium capitalize">
                                    Yes, I confirm this attendee is {event.genderRestriction} — this event is {event.genderRestriction} attendees only.
                                  </span>
                                </label>
                              </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                              <div>
                                <label className="block font-label-sm text-on-surface-variant mb-1">Emergency Contact Person</label>
                                <input
                                  type="text"
                                  value={attendee.emergencyName}
                                  onChange={(e) => updateAttendeeField(index, 'emergencyName', e.target.value)}
                                  placeholder="Parent / Spouse / Friend"
                                  className="w-full bg-surface-container-lowest px-3 py-2 rounded-lg font-body-sm text-on-surface outline-none focus:ring-2 focus:ring-primary shadow-sm"
                                />
                              </div>
                              <div>
                                <label className="block font-label-sm text-on-surface-variant mb-1">Emergency SOS Contact Number</label>
                                <input
                                  type="tel"
                                  value={attendee.emergencyPhone}
                                  onChange={(e) => updateAttendeeField(index, 'emergencyPhone', e.target.value)}
                                  placeholder="Mobile number"
                                  className="w-full bg-surface-container-lowest px-3 py-2 rounded-lg font-body-sm text-on-surface outline-none focus:ring-2 focus:ring-primary shadow-sm"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {bookingError && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 mt-space-md" role="alert">
                          {bookingError}
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-space-md">
                        <button
                          className="px-5 py-2.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md flex items-center gap-2 transition"
                          onClick={() => goToStep(1)}
                          type="button"
                        >
                          <span className="material-symbols-outlined text-base">arrow_back</span> Back to Tickets
                        </button>
                        <button
                          className="px-6 py-2.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md flex items-center gap-2 shadow-sm transition active:scale-98 disabled:opacity-60 disabled:cursor-not-allowed"
                          disabled={isSubmittingBooking}
                          onClick={() => void validateAndConfirm()}
                          type="button"
                        >
                          {isSubmittingBooking ? 'Processing…' : 'Proceed to Secure Payment'} <span className="material-symbols-outlined text-base">arrow_forward</span>
                        </button>
                      </div>
                    </div>
                  </section>
                )}
              </div>

              {/* RIGHT SUMMARY SIDEBAR (Col 4) */}
              <aside className="lg:col-span-4 flex flex-col space-y-space-md">
                <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm sticky top-6">
                  <h2 className="font-headline-lg text-on-surface mb-space-sm pb-2">Your Booking</h2>
                  
                  {/* Sidebar mini trek thumbnail */}
                  <div className="flex items-center space-x-3 p-2 bg-surface-container-low rounded-lg mb-space-sm">
                    <div className="w-14 h-14 rounded-md overflow-hidden bg-surface-container shrink-0">
                      {event.galleryImages[0] && (
                        <img className="w-full h-full object-cover" alt={event.galleryImages[0].alt} src={event.galleryImages[0].src} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-headline-sm text-on-surface truncate">{event.name}</p>
                      <p className="text-body-sm text-on-surface-variant flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">calendar_today</span> {event.date}
                      </p>
                    </div>
                  </div>

                  {/* LINE ITEMS */}
                  <div className="space-y-3 pt-2 text-body-sm">
                    {selectedTier && (
                      <div className="flex justify-between items-start font-body-md">
                        <div>
                          <div className="font-headline-sm text-on-surface">{selectedTier.name}</div>
                          <div className="text-body-sm text-on-surface-variant">{formatINR(selectedTier.price)} × {quantities[selectedTier.id]}</div>
                        </div>
                        <div className="font-headline-sm text-on-surface">
                          {formatINR(selectedTier.price * (quantities[selectedTier.id] ?? 0))}
                        </div>
                      </div>
                    )}

                    {totalTickets === 0 && (
                      <p className="text-on-surface-variant text-center py-2">No tickets selected yet.</p>
                    )}

                    <div className="pt-3 border-t border-dashed border-outline-variant/30 flex justify-between text-body-sm text-on-surface-variant">
                      <span>Total Tickets</span>
                      <span className="font-headline-sm text-on-surface">{totalTickets}</span>
                    </div>

                    <div className="flex justify-between text-body-sm text-on-surface-variant">
                      <span>Subtotal</span>
                      <span className="text-on-surface">{formatINR(totalAmount)}</span>
                    </div>

                    <div className="flex justify-between text-body-sm text-on-surface-variant">
                      <span>Booking &amp; Gateway Fee</span>
                      <span className="text-tertiary font-label-sm font-semibold">FREE</span>
                    </div>
                  </div>

                  {/* TOTAL HERO BLOCK */}
                  <div className="mt-space-md p-space-sm bg-surface-container rounded-lg flex items-center justify-between">
                    <div>
                      <span className="font-label-badge uppercase tracking-wider text-on-surface-variant block">Total Payable</span>
                      <span className="font-headline-xl text-primary font-bold tracking-tight">
                        {formatINR(totalAmount)}
                      </span>
                    </div>
                    <span className="material-symbols-outlined text-headline-xl text-primary-container">payments</span>
                  </div>

                  {/* PRIMARY CTA BUTTON */}
                  <div className="mt-space-md">
                    <button
                      className={`w-full py-3.5 px-4 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-headline-sm font-semibold tracking-wide flex items-center justify-center space-x-2 shadow-md transition-transform duration-150 active:scale-98 ${
                        totalTickets === 0 ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      disabled={totalTickets === 0}
                      onClick={handlePrimaryAction}
                      type="button"
                    >
                      <span>{currentStep === 1 ? 'CONTINUE TO PARTICIPANTS' : 'PROCEED TO SECURE PAYMENT'}</span>
                      <span className="material-symbols-outlined text-headline-sm">arrow_forward</span>
                    </button>
                  </div>

                  <p className="text-center text-body-sm text-on-surface-variant mt-2 flex items-center justify-center gap-1">
                    <span className="material-symbols-outlined text-xs text-tertiary">lock</span> Secure 128-bit Cashfree Checkout
                  </p>

                  {/* SECURITY TRUST CARDS */}
                  <div className="mt-space-md space-y-2 pt-space-xs text-body-sm text-on-surface-variant">
                    <div className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-tertiary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                        check_circle
                      </span>
                      <span>Instant confirmation with dynamic QR code</span>
                    </div>
                    {event?.allowSelfServiceCancellation ? (
                      <div className="flex items-center space-x-2">
                        <span className="material-symbols-outlined text-tertiary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                          check_circle
                        </span>
                        <span>{event.refundPercentage}% refund up to {event.refundCutoffDays} day{event.refundCutoffDays === 1 ? '' : 's'} before the event</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2 text-red-600">
                        <span className="material-symbols-outlined text-red-600 text-sm">block</span>
                        <span className="font-semibold">No Refund Policy — this booking cannot be cancelled</span>
                      </div>
                    )}
                    <div className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-tertiary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                        check_circle
                      </span>
                      <span>Ticket &amp; QR code emailed on payment</span>
                    </div>
                  </div>

                  {/* HELP DESK BOX */}
                  <div className="mt-space-md p-3 bg-surface-container-low rounded-lg flex items-start space-x-3">
                    <span className="material-symbols-outlined text-primary text-headline-md">support_agent</span>
                    <div className="text-body-sm">
                      <p className="font-headline-sm text-on-surface">Need help booking?</p>
                      <p className="text-on-surface-variant">
                        Call our team at{' '}
                        <a className="text-primary hover:underline font-label-sm font-semibold" href="tel:+917030411076">
                          +91 7030411076
                        </a>{' '}
                        for instant assistance.
                      </p>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          )}

          {/* EVENT DETAILS QUICK INFO MODAL */}
          {isEventInfoOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/50 backdrop-blur-sm p-4">
              <div className="bg-surface-container-lowest w-full max-w-lg rounded-2xl p-space-md shadow-xl animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between pb-2 border-b border-outline-variant/30">
                  <h3 className="font-headline-lg text-on-surface">About {event.name}</h3>
                  <button
                    className="text-on-surface-variant hover:text-on-surface p-1 rounded-full bg-transparent border-0 cursor-pointer"
                    onClick={() => setIsEventInfoOpen(false)}
                    type="button"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>

                <div className="py-space-md space-y-3 text-body-sm text-on-surface-variant">
                  <p>{event.about || 'The organizer hasn\'t added a description for this event yet.'}</p>
                  <div className="p-3 bg-surface-container rounded-lg space-y-1">
                    <p>
                      <strong className="text-on-surface font-semibold">When:</strong> {event.date}, {event.time} IST
                    </p>
                    <p>
                      <strong className="text-on-surface font-semibold">Where:</strong> {event.venue || 'Venue to be announced'}
                    </p>
                    <p>
                      <strong className="text-on-surface font-semibold">Organizer:</strong> {event.organizer.name}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <button
                    className="px-5 py-2 bg-primary text-on-primary font-label-md rounded-lg hover:bg-primary-container transition"
                    onClick={() => setIsEventInfoOpen(false)}
                    type="button"
                  >
                    Got It
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* FLOATING TOAST NOTIFICATION */}
          {toastMessage && (
            <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-inverse-surface text-inverse-on-surface px-4 py-2.5 rounded-full shadow-xl border border-outline-variant/30 text-label-md transition-all duration-200 animate-in fade-in slide-in-from-top-4">
              <span className="material-symbols-outlined text-tertiary-fixed text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
              <span>{toastMessage}</span>
            </div>
          )}

          {/* BOTTOM FOOTER */}
          <footer className="mt-space-xl pt-space-lg pb-space-md text-body-sm text-on-surface-variant border-t border-outline-variant/20 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-2">
              <div className="w-5 h-5 rounded bg-primary text-on-primary flex items-center justify-center font-bold text-xs">
                I
              </div>
              <span>© 2026 Inveon Technologies. All rights reserved.</span>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() =>
                  showToast(
                    event.allowSelfServiceCancellation
                      ? `Refund policy: ${event.refundPercentage}% refund up to ${event.refundCutoffDays} day(s) before the event.`
                      : 'Refund policy: this event does not offer self-service cancellation or refunds — contact the organizer.',
                  )
                }
                className="hover:text-primary transition bg-transparent border-0 cursor-pointer text-body-sm text-on-surface-variant"
              >
                Refund Policy
              </button>
              <a href="mailto:support@inveontechnologies.in" className="hover:text-primary transition text-body-sm text-on-surface-variant">
                Contact Support
              </a>
            </div>
          </footer>

        </div>
      </main>
    </div>
  );
}

