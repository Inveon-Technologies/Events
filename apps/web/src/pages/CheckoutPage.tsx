import { useMemo, useState, useEffect, useRef } from 'react';
import { useLocation, useParams, useNavigate, Link } from 'react-router-dom';
import { load as loadCashfree } from '@cashfreepayments/cashfree-js';
import { fetchEventData, EventDetails, EventNotFoundError, useLiveAvailability } from '../lib/eventDetails';
import { EventUnavailablePage } from './EventUnavailablePage';
import { formatINR } from '../lib/format';
import { apiRequest, ApiError } from '../organizer/lib/api';
import { useBranding } from '../lib/branding';
import { INVEON_EVENTS_LOGO_URL } from '../lib/brand';

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
  const branding = useBranding();
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
  useLiveAvailability(event?.id, setEvent);

  // One ticket type per booking — that's what the backend books (a
  // booking belongs to exactly one ticket category). Quantities are
  // keyed by the event's real tier ids, starting from whatever the
  // event page passed in (clamped to what that tier actually allows),
  // or 1 of the first tier with seats left.
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const quantitiesRef = useRef(quantities);
  quantitiesRef.current = quantities;
  useEffect(() => {
    if (!event) return;
    // A live seat-count refresh keeps what the customer already picked,
    // only trimming it if fewer seats are left now.
    const prev = quantitiesRef.current;
    const pickedId = Object.keys(prev).find((id) => prev[id] > 0);
    const picked = pickedId ? event.ticketCategories.find((t) => t.id === pickedId) : undefined;
    if (picked) {
      const qty = Math.min(prev[picked.id], picked.maxPerBooking, picked.available);
      if (qty !== prev[picked.id]) setQuantities({ [picked.id]: qty });
      return;
    }
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
  // The step being animated out, and which way: going forward the
  // tickets panel slides off to the left while participants slides in
  // from the right; going back does the reverse.
  const [leavingStep, setLeavingStep] = useState<{ step: 1 | 2; dir: 'forward' | 'back' } | null>(null);
  const leaveTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);
  const stepsTopRef = useRef<HTMLDivElement>(null);
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
  // Gender-restricted events: one confirmation dialog before payment
  // (replaces the per-attendee checkbox) that also states the
  // no-refund consequence of booking someone the event doesn't admit.
  const [genderDialogOpen, setGenderDialogOpen] = useState(false);

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
    if (step === currentStep) return;
    const from = currentStep as 1 | 2;
    window.clearTimeout(leaveTimer.current);
    setLeavingStep({ step: from, dir: step > from ? 'forward' : 'back' });
    setCurrentStep(step);
    leaveTimer.current = window.setTimeout(() => setLeavingStep(null), 420);
    // Bring the stepper back into view if the customer scrolled past it
    // (on phones the event banner sits above it).
    const top = stepsTopRef.current?.getBoundingClientRect().top;
    if (top !== undefined && top < 0) {
      stepsTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function handlePrimaryAction() {
    if (currentStep === 1) {
      if (totalTickets === 0) {
        showToast('Please select at least 1 ticket.');
        return;
      }
      goToStep(2);
    } else if (currentStep === 2) {
      void validateAndConfirm();
    }
  }

  async function validateAndConfirm(genderConfirmed = false) {
    if (isSubmittingBooking) return;

    const lead = attendees[0];
    if (!lead || !lead.name.trim() || !lead.email.trim() || !lead.phone.trim()) {
      showToast('Please fill in the lead attendee\u2019s name, email, and phone.');
      return;
    }

    if (!selectedTier) {
      showToast('Please select at least 1 ticket.');
      return;
    }

    // Asked last, so a confirmed dialog always goes straight to payment.
    if (event?.genderRestriction && !genderConfirmed) {
      setGenderDialogOpen(true);
      return;
    }

    setIsSubmittingBooking(true);
    setBookingError(null);

    try {
      const result = await apiRequest<{ bookingId: string; bookingReference: string; paymentSessionId?: string; cashfreeMode?: 'sandbox' | 'production' }>(
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
            attendeeGenders: event?.genderRestriction ? attendees.map(() => event.genderRestriction!) : undefined,
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
          // The server says which Cashfree environment created the session
          // (Settings → Integrations in the super admin portal); a session
          // opened in the other one fails with Cashfree's "Something went wrong".
          mode: result.cashfreeMode || (import.meta.env.VITE_CASHFREE_MODE as 'sandbox' | 'production') || 'sandbox',
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

  const heroImage = event.galleryImages[0];
  const maxPerBooking = selectedTier
    ? selectedTier.maxPerBooking
    : Math.max(0, ...event.ticketCategories.map((t) => t.maxPerBooking));
  const eventDay = (() => {
    const parsed = new Date(event.date);
    return Number.isNaN(parsed.getTime())
      ? ''
      : parsed.toLocaleDateString('en-IN', { weekday: 'long' });
  })();
  const organizerInitials = event.organizer.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  const primaryLabel = currentStep === 1 ? 'CONTINUE TO PARTICIPANTS' : 'PROCEED TO SECURE PAYMENT';
  const primaryDisabled = totalTickets === 0 || isSubmittingBooking;

  const STEPS = [
    { n: 1, label: 'Tickets' },
    { n: 2, label: 'Participants' },
    { n: 3, label: 'Confirmation' },
  ] as const;

  const renderTicketsStep = () => {
    return (
      <section aria-labelledby="checkout-tickets-title">
        <p className="text-[11px] font-bold tracking-[0.2em] text-[#82a9df]">RESERVE YOUR PLACE</p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="checkout-tickets-title" className="text-[26px] sm:text-[32px] font-extrabold tracking-tight text-[#101f49] leading-tight">
              Choose Your Tickets
            </h2>
            <p className="mt-1.5 text-sm text-[#7887a0]">Select your ticket type and number of attendees.</p>
          </div>
          {maxPerBooking > 0 && (
            <div className="flex items-center gap-2.5 text-[11px] font-semibold text-[#44536d] shrink-0">
              <span className="w-9 h-9 rounded-full bg-[#edf3fb] text-[#5e769d] flex items-center justify-center">
                <span className="material-symbols-outlined text-lg">group</span>
              </span>
              <span className="leading-tight">
                Max {maxPerBooking} ticket{maxPerBooking === 1 ? '' : 's'}
                <br />
                per booking
              </span>
            </div>
          )}
        </div>

        {event.genderRestriction && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
            <span className="material-symbols-outlined text-base text-amber-600" aria-hidden="true">info</span>
            <span>
              This event admits <strong className="capitalize">{event.genderRestriction}</strong> attendees only. You&apos;ll be
              asked to confirm before payment.
            </span>
          </div>
        )}

        <div className="mt-5 border-t border-[#e8edf5]">
          {event.ticketCategories.length === 0 && (
            <p className="py-6 text-sm text-[#71809b]">No tickets are on sale for this event.</p>
          )}
          {event.ticketCategories.map((tier, i) => {
            const qty = quantities[tier.id] ?? 0;
            const limit = Math.min(tier.maxPerBooking, tier.available);
            const selected = qty > 0;
            const soldOut = tier.available <= 0;
            const tone = TIER_TONES[i % TIER_TONES.length];
            return (
              <div
                key={tier.id}
                className={`grid grid-cols-[40px_minmax(0,1fr)_auto] sm:grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-x-3 sm:gap-x-4 px-3 sm:px-4 py-4 sm:py-5 border-b border-[#e8edf5] transition-colors ${
                  selected ? 'bg-gradient-to-r from-[#f0f7ff] to-[#f7fbff] border-l-4 border-l-[#1d68eb]' : 'border-l-4 border-l-transparent'
                } ${soldOut ? 'opacity-60' : ''}`}
              >
                <div className={`self-start w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center ${tone}`}>
                  <span className="material-symbols-outlined text-2xl" aria-hidden="true">{tierIcon(tier.name)}</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-[15px] font-bold text-[#101f49]">{tier.name}</h3>
                    {selected && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-[#1260e8] px-2 py-0.5 text-[10px] font-bold text-white">
                        <span className="material-symbols-outlined text-[12px]" aria-hidden="true">check</span> SELECTED
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-lg font-medium text-[#1768e9]">
                    {formatINR(tier.price)} <span className="text-xs text-[#65748d]">/ person</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-[#6d7c93]">
                    <span className={`inline-block w-2 h-2 rounded-full ${soldOut ? 'bg-red-500' : 'bg-[#16a765]'}`} />
                    {soldOut ? 'Sold out' : `${tier.available} seats available`}
                  </div>
                  {tier.description && <p className="mt-1.5 text-xs text-[#71809b]">{tier.description}</p>}
                </div>
                <div className="flex justify-end">
                  <div className="flex items-stretch rounded-lg border border-[#dce3ee] bg-white overflow-hidden">
                    <button
                      aria-label={`Remove one ${tier.name} ticket`}
                      className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-[#687890] hover:bg-[#f4f7fb] disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={() => updateQty(tier.id, -1)}
                      disabled={qty === 0}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-xl">remove</span>
                    </button>
                    <span className="w-8 h-9 sm:w-10 sm:h-10 flex items-center justify-center border-x border-[#dce3ee] text-sm font-semibold text-[#40506a]" aria-live="polite">
                      {qty}
                    </span>
                    <button
                      aria-label={`Add one ${tier.name} ticket`}
                      className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-[#1260e8] hover:bg-[#f4f7fb] disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={() => updateQty(tier.id, 1)}
                      disabled={limit === 0}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-xl">add</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {event.ticketCategories.length > 1 && (
          <p className="mt-3 text-xs text-[#71809b]">
            One ticket type per booking. Choosing another type replaces your current selection.
          </p>
        )}
      </section>
    );
  };

  const inputClass =
    'w-full bg-white px-3 py-2.5 rounded-lg border border-[#dce3ee] text-sm text-[#101f49] outline-none focus:border-[#1260e8] focus:ring-2 focus:ring-[#1260e8]/20';

  const renderParticipantsStep = () => {
    return (
      <section aria-labelledby="checkout-participants-title">
        <p className="text-[11px] font-bold tracking-[0.2em] text-[#82a9df]">WHO&apos;S COMING</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="checkout-participants-title" className="text-[26px] sm:text-[32px] font-extrabold tracking-tight text-[#101f49] leading-tight">
              Participant Details
            </h2>
            <p className="mt-1.5 text-sm text-[#7887a0]">Please enter details for each attendee.</p>
          </div>
          <button
            className="self-start text-[13px] font-semibold text-[#1260e8] hover:underline flex items-center gap-1 bg-transparent border-0 cursor-pointer"
            onClick={() => goToStep(1)}
            type="button"
          >
            <span className="material-symbols-outlined text-base">edit</span> Change Ticket Counts
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {attendees.map((attendee, index) => (
            <div key={index} className="rounded-xl border border-[#e8edf5] bg-[#f7faff] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-[#e8edf5]">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-[#1260e8] text-white flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </span>
                  <h3 className="text-[15px] font-bold text-[#101f49]">Participant {index + 1}</h3>
                  <span className="text-[10px] font-bold uppercase tracking-wide bg-white border border-[#dce3ee] px-2 py-0.5 rounded-full text-[#1260e8]">
                    {attendee.tier}
                  </span>
                </div>
                {index === 0 && (
                  <span className="text-[11px] text-[#71809b] flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">person</span> Lead contact
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#44536d] mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={attendee.name}
                    onChange={(e) => updateAttendeeField(index, 'name', e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    autoComplete={index === 0 ? 'name' : 'off'}
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#44536d] mb-1">Email Address *</label>
                  <input
                    type="email"
                    value={attendee.email}
                    onChange={(e) => updateAttendeeField(index, 'email', e.target.value)}
                    placeholder="name@example.com"
                    autoComplete={index === 0 ? 'email' : 'off'}
                    inputMode="email"
                    className={inputClass}
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#44536d] mb-1">Phone Number *</label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-[#dce3ee] bg-[#eef2f8] text-[#63708a] text-sm font-medium">
                      +91
                    </span>
                    <input
                      type="tel"
                      value={attendee.phone}
                      onChange={(e) => updateAttendeeField(index, 'phone', e.target.value)}
                      placeholder="9876543210"
                      autoComplete={index === 0 ? 'tel-national' : 'off'}
                      inputMode="numeric"
                      className={`${inputClass} rounded-l-none`}
                      required
                    />
                  </div>
                  {index === 0 && (
                    <p className="mt-1 text-[11px] text-[#71809b]">
                      We&apos;ll send your tickets and event updates to this number on WhatsApp.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-semibold text-[#44536d] mb-1">Emergency Contact Person</label>
                  <input
                    type="text"
                    value={attendee.emergencyName}
                    onChange={(e) => updateAttendeeField(index, 'emergencyName', e.target.value)}
                    placeholder="Parent / Spouse / Friend"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#44536d] mb-1">Emergency SOS Contact Number</label>
                  <input
                    type="tel"
                    value={attendee.emergencyPhone}
                    onChange={(e) => updateAttendeeField(index, 'emergencyPhone', e.target.value)}
                    placeholder="Mobile number"
                    inputMode="numeric"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="text-[13px] text-[#71809b] mt-4 flex items-start gap-1.5">
          <span className="material-symbols-outlined text-base text-[#18a765]">timer</span>
          Your seats are held for 2 minutes while you pay. If the payment isn&apos;t finished by then they go back on sale.
        </p>
        {bookingError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 mt-4" role="alert">
            {bookingError}
          </div>
        )}
        <div className="hidden xl:flex items-center justify-between pt-5">
          <button
            className="px-5 py-2.5 rounded-lg border border-[#dce3ee] bg-white hover:bg-[#f4f7fb] text-[#101f49] text-sm font-semibold flex items-center gap-2 transition"
            onClick={() => goToStep(1)}
            type="button"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span> Back to Tickets
          </button>
        </div>
        <p className="pt-3 text-[11px] text-[#71809b]">
          By continuing you agree to our{' '}
          <Link to="/terms" target="_blank" className="underline hover:text-[#1260e8]">
            Terms &amp; Conditions
          </Link>{' '}
          and{' '}
          <Link to="/refund-policy" target="_blank" className="underline hover:text-[#1260e8]">
            Refunds &amp; Cancellations policy
          </Link>
          .
        </p>
      </section>
    );
  };

  function renderStep(step: 1 | 2) {
    return step === 1 ? renderTicketsStep() : renderParticipantsStep();
  }

  const activeStep = currentStep === 3 ? 2 : currentStep;

  return (
    <div className="min-h-screen bg-white font-sans text-[#101f49] antialiased lg:grid lg:grid-cols-[minmax(0,38%)_minmax(0,1fr)]">
      {/* LEFT: EVENT HERO (a banner on top on phones) */}
      <section className="relative overflow-hidden bg-[#11131e] text-white min-h-[360px] sm:min-h-[440px] lg:sticky lg:top-0 lg:h-screen lg:min-h-0">
        {heroImage && (
          <img src={heroImage.src} alt={heroImage.alt} className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[#050c23]/40 via-[#11131e]/55 to-[#10131f]" aria-hidden="true" />

        <div className="relative z-10 flex h-full min-h-[inherit] flex-col justify-between p-5 sm:p-8 lg:p-10 xl:px-12">
          <div className="flex items-center justify-between gap-3">
            <Link to="/" aria-label={`${branding?.platformName || 'Inveon Events'} Home`} className="inline-flex items-center rounded-xl bg-white/95 px-3 py-1.5 shadow-sm">
              <img src={branding?.logoUrl || INVEON_EVENTS_LOGO_URL} alt={branding?.platformName || 'Inveon Events'} className="h-7 sm:h-8 w-auto object-contain" />
            </Link>
            <Link
              to={`/events/${eventId}`}
              className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold backdrop-blur hover:bg-white/25"
            >
              <span className="material-symbols-outlined text-sm" aria-hidden="true">arrow_back</span> Back to event
            </Link>
          </div>

          <div className="mt-10">
            <div className="flex flex-wrap gap-2">
              {event.category && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide backdrop-blur">
                  <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">star</span>
                  {event.category}
                </span>
              )}
              {event.genderRestriction && (
                <span className="inline-flex items-center rounded-full bg-pink-500/80 px-3 py-1.5 text-[11px] font-semibold capitalize">
                  {event.genderRestriction} only
                </span>
              )}
            </div>
            <h1 className="mt-3 text-[34px] sm:text-[44px] xl:text-[54px] font-extrabold leading-[1.05] tracking-tight break-words">
              {event.name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-base sm:text-lg font-medium">
              <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-[11px] font-bold">{organizerInitials}</span>
              <span>{event.organizer.name}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#dff8e9] px-2 py-0.5 text-[10px] font-bold text-[#158353]">
                <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">verified</span>
                Verified Organizer
              </span>
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-y-4 sm:gap-x-0 border-t border-white/25 pt-4">
              <div className="flex gap-2.5 sm:pr-3">
                <span className="material-symbols-outlined text-xl text-[#2d82ff]" aria-hidden="true">calendar_month</span>
                <div>
                  <div className="text-[13px] font-semibold">{event.date}</div>
                  {eventDay && <div className="mt-0.5 text-[11px] text-white/70">{eventDay}</div>}
                </div>
              </div>
              <div className="flex gap-2.5 sm:border-l sm:border-white/25 sm:px-4">
                <span className="material-symbols-outlined text-xl text-[#2d82ff]" aria-hidden="true">schedule</span>
                <div>
                  <div className="text-[13px] font-semibold">{event.time} IST</div>
                  <div className="mt-0.5 text-[11px] text-white/70">Event starts</div>
                </div>
              </div>
              <div className="flex gap-2.5 min-w-0 sm:col-span-2">
                <span className="material-symbols-outlined text-xl text-[#2d82ff]" aria-hidden="true">location_on</span>
                <div className="min-w-0 text-[13px] font-semibold break-words">{event.venue || 'Venue to be announced'}</div>
              </div>
            </div>

            <button
              className="mt-5 inline-flex items-center gap-1 border-b border-[#2f86ff] pb-1 text-[13px] font-semibold text-[#2f86ff] bg-transparent cursor-pointer"
              onClick={() => setIsEventInfoOpen(true)}
              type="button"
            >
              View Event Details <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </section>

      {/* RIGHT: CHECKOUT */}
      <main className="min-w-0 bg-white pb-28 xl:pb-0">
        {/* STEPPER */}
        <div ref={stepsTopRef} className="scroll-mt-0 border-b border-[#e9edf4] px-4 sm:px-8 lg:px-10 py-4 sm:py-6 flex items-center justify-between gap-3">
          <nav aria-label="Checkout Steps" className="flex items-center gap-2 sm:gap-3 min-w-0">
            {STEPS.map((s, i) => {
              const done = currentStep > s.n;
              const active = currentStep === s.n;
              return (
                <div key={s.n} className="flex items-center gap-2 sm:gap-3 min-w-0">
                  {i > 0 && (
                    <span className={`h-0.5 w-4 sm:w-10 xl:w-16 rounded-full ${currentStep >= s.n ? 'bg-[#1260e8]' : 'bg-[#d9e0eb]'}`} aria-hidden="true" />
                  )}
                  <button
                    type="button"
                    onClick={() => s.n !== 3 && goToStep(s.n)}
                    disabled={s.n === 3}
                    aria-current={active ? 'step' : undefined}
                    className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide bg-transparent ${
                      active ? 'text-[#1260e8]' : done ? 'text-[#18a765]' : 'text-[#8793aa]'
                    }`}
                  >
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors ${
                        active ? 'bg-[#1260e8] text-white' : done ? 'bg-[#18a765] text-white' : 'bg-[#eef2f8] text-[#63708a]'
                      }`}
                    >
                      {done ? <span className="material-symbols-outlined text-base">check</span> : `0${s.n}`}
                    </span>
                    <span className={active ? 'hidden sm:inline' : 'hidden md:inline'}>{s.label}</span>
                  </button>
                </div>
              );
            })}
          </nav>
          <div className="flex items-center gap-2 rounded-xl bg-[#f4f7fb] px-3 py-2 shrink-0">
            <span className="material-symbols-outlined text-lg text-[#118a68]" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">lock</span>
            <div className="text-[11px] font-semibold text-[#3d4d68] leading-tight">
              Secure Checkout
              <span className="hidden sm:block text-[10px] font-medium text-[#7e8ba1]">Powered by Cashfree</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-8 xl:gap-0 px-4 sm:px-8 lg:px-10 py-6 sm:py-8">
          {/* STEP PANELS: the current one slides in, the previous one slides out */}
          <div className="relative min-w-0 overflow-hidden xl:pr-8">
            {leavingStep && (
              <div
                aria-hidden="true"
                className={`absolute inset-x-0 top-0 pointer-events-none xl:pr-8 ${
                  leavingStep.dir === 'forward' ? 'checkout-step-exit-forward' : 'checkout-step-exit-back'
                }`}
              >
                {renderStep(leavingStep.step)}
              </div>
            )}
            <div
              key={activeStep}
              className={leavingStep ? (leavingStep.dir === 'forward' ? 'checkout-step-enter-forward' : 'checkout-step-enter-back') : undefined}
            >
              {renderStep(activeStep)}
            </div>
          </div>

          {/* RESERVATION SUMMARY */}
          <aside className="border-t border-[#dbe3ee] pt-6 xl:border-t-0 xl:pt-0 xl:border-l xl:pl-7 relative">
            <span className="hidden xl:block absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-[#1e73eb]" aria-hidden="true" />
            <div className="xl:sticky xl:top-6">
              <h2 className="text-sm font-extrabold tracking-[0.06em] mb-5">YOUR RESERVATION</h2>

              <div className="flex gap-3.5 pb-5 border-b border-dashed border-[#dbe2ec]">
                <div className="w-20 h-14 rounded-lg overflow-hidden bg-[#eef2f8] shrink-0">
                  {heroImage && <img className="w-full h-full object-cover" alt="" src={heroImage.src} />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{event.name}</p>
                  <p className="mt-1.5 text-[11px] text-[#68778e] flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px]" aria-hidden="true">calendar_month</span> {event.date}
                  </p>
                  <p className="mt-1 text-[11px] text-[#68778e] flex items-center gap-1 min-w-0">
                    <span className="material-symbols-outlined text-[13px]" aria-hidden="true">location_on</span>
                    <span className="truncate">{event.venue || 'Venue to be announced'}</span>
                  </p>
                </div>
              </div>

              <div className="py-4 border-b border-dashed border-[#dbe2ec] space-y-2.5 text-[12px] text-[#68778e]">
                {selectedTier ? (
                  <div className="flex justify-between gap-3">
                    <span>
                      {selectedTier.name}
                      <br />
                      {formatINR(selectedTier.price)} × {quantities[selectedTier.id]}
                    </span>
                    <strong className="text-[#253553]">{formatINR(selectedTier.price * (quantities[selectedTier.id] ?? 0))}</strong>
                  </div>
                ) : (
                  <p className="text-center py-1">No tickets selected yet.</p>
                )}
                <div className="flex justify-between">
                  <span>Total Tickets</span>
                  <strong className="text-[#253553]">{totalTickets}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <strong className="text-[#253553]">{formatINR(totalAmount)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Booking &amp; Gateway Fee</span>
                  <strong className="text-[#238b68]">FREE</strong>
                </div>
                <div className="rounded-md bg-[#eff6ff] px-3.5 py-3 mt-3">
                  <div className="text-[11px] text-[#65758f]">TOTAL PAYABLE</div>
                  <div className="text-[28px] font-extrabold text-[#1664e8] leading-tight">{formatINR(totalAmount)}</div>
                </div>
              </div>

              <button
                className="hidden xl:flex w-full h-12 mt-4 mb-3 rounded-md bg-[#1160e8] hover:bg-[#0d52c9] text-white text-[13px] font-bold items-center justify-center gap-2 shadow-[0_6px_14px_rgba(18,96,232,.22)] transition active:scale-[.98] disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={primaryDisabled}
                onClick={handlePrimaryAction}
                type="button"
              >
                <span>{isSubmittingBooking ? 'Processing…' : primaryLabel}</span>
                <span className="material-symbols-outlined text-lg" aria-hidden="true">arrow_forward</span>
              </button>

              <div className="pb-2 border-b border-[#e2e7ef] space-y-2.5 pt-2 text-[12px] text-[#64738b]">
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-lg text-[#1670e8]" aria-hidden="true">bolt</span>
                  Instant booking confirmation
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-lg text-[#1670e8]" aria-hidden="true">qr_code_2</span>
                  Digital ticket with QR code
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-lg text-[#1670e8]" aria-hidden="true">mail</span>
                  Ticket delivered after successful payment
                </div>
              </div>

              <div className="py-3.5 border-b border-[#e2e7ef]">
                <p className="text-[12px] font-bold mb-2">Cancellation Policy</p>
                <div className="flex items-center justify-between gap-3 text-[12px]">
                  {event.allowSelfServiceCancellation ? (
                    <span className="flex items-center gap-1.5 text-[#18a765]">
                      <span className="material-symbols-outlined text-sm" aria-hidden="true">check_circle</span>
                      {event.refundPercentage}% refund up to {event.refundCutoffDays} day{event.refundCutoffDays === 1 ? '' : 's'} before the event
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-[#ee4f4f] font-semibold">
                      <span className="material-symbols-outlined text-sm" aria-hidden="true">block</span>
                      No Refund Policy — this booking cannot be cancelled
                    </span>
                  )}
                  <Link to="/refund-policy" target="_blank" className="shrink-0 text-[#2d71e5] hover:underline">
                    View policy →
                  </Link>
                </div>
              </div>

              <div className="pt-3.5">
                <p className="text-[12px] font-bold mb-1">Need help?</p>
                <p className="text-[11px] text-[#7b899f]">Our support team is available to assist you.</p>
                <a className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-[#1768e9] hover:underline" href="tel:+917030411076">
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">call</span> +91 70304 11076
                </a>
              </div>
            </div>
          </aside>
        </div>

        <footer className="mx-4 sm:mx-8 lg:mx-10 mt-4 py-5 text-[12px] text-[#71809b] border-t border-[#e8edf5] flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>© {new Date().getFullYear()} Inveon Technologies. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <Link to="/refund-policy" target="_blank" className="hover:text-[#1260e8]">Refund Policy</Link>
            <Link to="/terms" target="_blank" className="hover:text-[#1260e8]">Terms</Link>
            <Link to="/contact" target="_blank" className="hover:text-[#1260e8]">Contact Support</Link>
          </div>
        </footer>
      </main>

      {/* MOBILE / TABLET STICKY ACTION BAR (under the checkout column) */}
      <div className="xl:hidden fixed inset-x-0 lg:left-[38%] bottom-0 z-40 border-t border-[#e2e7ef] bg-white/95 backdrop-blur px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(25,54,100,.08)]">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          {currentStep === 2 && (
            <button
              type="button"
              onClick={() => goToStep(1)}
              aria-label="Back to Tickets"
              className="w-11 h-11 shrink-0 rounded-lg border border-[#dce3ee] flex items-center justify-center text-[#44536d]"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
          )}
          <div className="min-w-0">
            <div className="text-[10px] font-semibold text-[#65758f]">
              {totalTickets} ticket{totalTickets === 1 ? '' : 's'} · TOTAL
            </div>
            <div className="text-lg font-extrabold text-[#1664e8] leading-tight">{formatINR(totalAmount)}</div>
          </div>
          <button
            className="ml-auto h-11 flex-1 max-w-xs rounded-lg bg-[#1160e8] text-white text-[12px] font-bold flex items-center justify-center gap-1.5 shadow-[0_6px_14px_rgba(18,96,232,.22)] active:scale-[.98] disabled:opacity-50"
            disabled={primaryDisabled}
            onClick={handlePrimaryAction}
            type="button"
          >
            <span>{isSubmittingBooking ? 'Processing…' : currentStep === 1 ? 'CONTINUE' : 'PAY SECURELY'}</span>
            <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_forward</span>
          </button>
        </div>
      </div>

      {/* EVENT DETAILS QUICK INFO MODAL */}
      {isEventInfoOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
          <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-5 shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-[#e8edf5]">
              <h3 className="text-lg font-bold">About {event.name}</h3>
              <button
                className="text-[#71809b] hover:text-[#101f49] p-1 rounded-full bg-transparent border-0 cursor-pointer"
                onClick={() => setIsEventInfoOpen(false)}
                aria-label="Close"
                type="button"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="py-4 space-y-3 text-sm text-[#44536d]">
              <p>{event.about || 'The organizer hasn\'t added a description for this event yet.'}</p>
              <div className="p-3 bg-[#f4f7fb] rounded-lg space-y-1">
                <p>
                  <strong className="text-[#101f49] font-semibold">When:</strong> {event.date}, {event.time} IST
                </p>
                <p>
                  <strong className="text-[#101f49] font-semibold">Where:</strong> {event.venue || 'Venue to be announced'}
                </p>
                <p>
                  <strong className="text-[#101f49] font-semibold">Organizer:</strong> {event.organizer.name}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Link to={`/events/${eventId}`} className="px-4 py-2 text-sm font-semibold text-[#1260e8] rounded-lg hover:bg-[#f4f7fb]">
                Full event page
              </Link>
              <button
                className="px-5 py-2 bg-[#1260e8] text-white text-sm font-semibold rounded-lg hover:bg-[#0d52c9] transition"
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
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-[#101f49] text-white px-4 py-2.5 rounded-full shadow-xl text-[13px] font-medium max-w-[calc(100vw-2rem)]" role="status">
          <span className="material-symbols-outlined text-[#5ee0a0] text-sm" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
            info
          </span>
          <span>{toastMessage}</span>
        </div>
      )}

      {genderDialogOpen && event?.genderRestriction && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gender-dialog-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-amber-600 text-3xl" aria-hidden="true">
                info
              </span>
              <h2 id="gender-dialog-title" className="text-lg font-bold text-slate-900">
                <span className="capitalize">{event.genderRestriction}</span> attendees only
              </h2>
            </div>
            <p className="mt-3 text-sm text-slate-700">
              This event admits {event.genderRestriction} attendees only. Please confirm that every attendee in this
              booking is {event.genderRestriction}.
            </p>
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <strong>No refund:</strong> if an attendee does not meet this requirement, they can be refused entry
              at the venue and the booking will not be refunded.
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setGenderDialogOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={() => {
                  setGenderDialogOpen(false);
                  void validateAndConfirm(true);
                }}
                className="rounded-lg bg-[#1260e8] px-4 py-2 text-sm font-bold text-white hover:opacity-90"
              >
                Yes, I confirm and continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Icon backgrounds cycle through the mockup's blue / amber / pink / green.
const TIER_TONES = [
  'bg-[#eef4fd] text-[#286ad7]',
  'bg-[#fff6e8] text-[#ee8c18]',
  'bg-[#fff0f2] text-[#ef6174]',
  'bg-[#e9fbf3] text-[#209463]',
];

// A Material Symbols icon that fits the ticket name, for scanning a long list.
function tierIcon(name: string): string {
  const n = name.toLowerCase();
  if (/\b(female|women|woman|ladies|girls?)\b/.test(n)) return 'woman';
  if (/\b(male|men|man|gents|boys?)\b/.test(n)) return 'man';
  if (/couple|pair|duo/.test(n)) return 'favorite';
  if (/vip|premium|gold|platinum|backstage/.test(n)) return 'workspace_premium';
  if (/student/.test(n)) return 'school';
  if (/child|kid/.test(n)) return 'child_care';
  if (/group|family/.test(n)) return 'groups';
  return 'confirmation_number';
}
