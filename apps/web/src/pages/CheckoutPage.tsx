import { useMemo, useState, useEffect } from 'react';
import { useLocation, useParams, Link } from 'react-router-dom';
import { load as loadCashfree } from '@cashfreepayments/cashfree-js';
import { fetchEventData, EventDetails } from '../mockData/rajgadTrek';
import { formatINR } from '../lib/format';
import { apiRequest, ApiError } from '../organizer/lib/api';

interface Attendee {
  name: string;
  email: string;
  phone: string;
  emergencyName: string;
  emergencyPhone: string;
  tier: string;
  tierId: string;
}

export function CheckoutPage() {
  const { eventId } = useParams();
  const [event, setEvent] = useState<EventDetails | null>(null);
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    fetchEventData(eventId).then((data) => {
      if (!cancelled) setEvent(data);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  // Initial quantities from navigation state or defaults (General: 2, VIP: 1, Premium: 0 as in mockup)
  const initialQuantities: Record<string, number> = useMemo(() => {
    const passed = (location.state as { quantities?: Record<string, number> } | null)?.quantities;
    if (passed && Object.values(passed).some((q) => q > 0)) {
      return {
        general: passed.general ?? 0,
        vip: passed.vip ?? 0,
        premium: passed.premium ?? 0,
        ...passed,
      };
    }
    return {
      general: 2,
      vip: 1,
      premium: 0,
    };
  }, [location.state]);

  const [quantities, setQuantities] = useState<Record<string, number>>(initialQuantities);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [selectedModalAttendee, setSelectedModalAttendee] = useState<Attendee | null>(null);
  const [isDigitalPassOpen, setIsDigitalPassOpen] = useState(false);
  const [isEventInfoOpen, setIsEventInfoOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Default sample attendees
  const sampleAttendees: Attendee[] = useMemo(
    () => [
      {
        name: 'Rohit Deshmukh',
        email: 'rohit@example.com',
        phone: '9876543210',
        emergencyName: 'Sneha Deshmukh',
        emergencyPhone: '9876509876',
        tier: 'General Ticket',
        tierId: 'general',
      },
      {
        name: 'Priya Patil',
        email: 'priya@example.com',
        phone: '8765432109',
        emergencyName: 'Amit Patil',
        emergencyPhone: '9765401234',
        tier: 'General Ticket',
        tierId: 'general',
      },
      {
        name: 'Karan Sharma',
        email: 'karan@example.com',
        phone: '7654321098',
        emergencyName: 'Neha Sharma',
        emergencyPhone: '7654309876',
        tier: 'VIP Ticket',
        tierId: 'vip',
      },
    ],
    [],
  );

  // Sync attendee list with selected ticket quantities
  useEffect(() => {
    const totalCount = Object.values(quantities).reduce((a, b) => a + b, 0);
    const assignedList: Attendee[] = [];

    let gCount = quantities.general ?? 0;
    let vCount = quantities.vip ?? 0;
    let pCount = quantities.premium ?? 0;

    for (let i = 0; i < totalCount; i++) {
      let assignedTier = 'General Ticket';
      let assignedTierId = 'general';

      if (gCount > 0) {
        assignedTier = 'General Ticket';
        assignedTierId = 'general';
        gCount--;
      } else if (vCount > 0) {
        assignedTier = 'VIP Ticket';
        assignedTierId = 'vip';
        vCount--;
      } else {
        assignedTier = 'Premium Summit Pass';
        assignedTierId = 'premium';
        pCount--;
      }

      const existing = attendees[i] || sampleAttendees[i];
      if (existing) {
        assignedList.push({
          name: existing.name || '',
          email: existing.email || '',
          phone: existing.phone || '',
          emergencyName: existing.emergencyName || '',
          emergencyPhone: existing.emergencyPhone || '',
          tier: assignedTier,
          tierId: assignedTierId,
        });
      } else {
        assignedList.push({
          name: '',
          email: '',
          phone: '',
          emergencyName: '',
          emergencyPhone: '',
          tier: assignedTier,
          tierId: assignedTierId,
        });
      }
    }

    setAttendees(assignedList);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantities]);

  const totalTickets = Object.values(quantities).reduce((a, b) => a + b, 0);

  const totalAmount = useMemo(() => {
    if (!event) return 0;
    return event.ticketCategories.reduce(
      (sum, t) => sum + t.price * (quantities[t.id] ?? 0),
      0,
    );
  }, [quantities, event]);

  const [bookingId, setBookingId] = useState('INV-BKG-1001');
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

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

  function updateQty(tierKey: string, delta: number) {
    const currentQty = quantities[tierKey] ?? 0;
    if (delta > 0 && totalTickets >= 10) {
      showToast('Maximum limit is 10 tickets per order.');
      return;
    }
    const newQty = Math.max(0, currentQty + delta);
    setQuantities((prev) => ({ ...prev, [tierKey]: newQty }));
  }

  function updateAttendeeField(index: number, field: keyof Attendee, val: string) {
    setAttendees((prev) =>
      prev.map((att, i) => (i === index ? { ...att, [field]: val } : att)),
    );
  }

  function goToStep(step: 1 | 2 | 3) {
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

    const primaryTier = event!.ticketCategories[0];
    if (!primaryTier) {
      showToast('This event has no ticket categories available.');
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
            ticketCategoryId: primaryTier.id,
            quantity: totalTickets,
            primaryContactName: lead.name,
            primaryContactWhatsapp: lead.phone,
            primaryContactEmail: lead.email,
            paymentMethod: 'online',
            attendeeNames: attendees.map((a) => a.name || lead.name),
          },
        },
      );

      setBookingId(result.bookingReference);

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

      // No payment session — a genuinely free ticket, confirmed
      // immediately with nothing to pay.
      showToast('Booking confirmed!');
      setTimeout(() => goToStep(3), 350);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong creating your booking. Please try again.';
      setBookingError(message);
      showToast(message);
    } finally {
      setIsSubmittingBooking(false);
    }
  }

  function copyBookingId() {
    navigator.clipboard?.writeText(bookingId).then(() => {
      showToast(`Booking ID copied to clipboard: ${bookingId}`);
    });
  }

  function openPassModal(att?: Attendee) {
    setSelectedModalAttendee(att || attendees[0] || sampleAttendees[0]);
    setIsDigitalPassOpen(true);
  }

  const leadAttendee = attendees[0] || sampleAttendees[0];

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
                onClick={() => totalTickets > 0 && goToStep(3)}
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
                      <img
                        className="w-full h-full object-cover"
                        alt="High-resolution dramatic sunrise over Rajgad Fort peaks in Maharashtra"
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuDb3kLEyre--DvykOTt1Z23K1GJIONOJXU56YD8x50r33WBhBT58rgeyQWDT32BFwKXAUxQkZweqycw2vUZNRyyGXOk94zpZwzMivFrdaJt6BpV_T7K-XR5h2-Sjcj7zqLiWovK3nOGq0iScQD5fCRJWdCDImXt5KmfZIbwGHkVC_0XS8cllxOLC97r4ePSKxwiBY3K5nVZNQEu4k3IztMPuWSMrXz-O5d8en0GRQ9e"
                      />
                      <span className="absolute top-2 left-2 bg-inverse-surface/80 backdrop-blur-md text-inverse-on-surface font-label-badge uppercase px-2 py-0.5 rounded-full">
                        Featured Trek
                      </span>
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
                          <span>20 September 2026</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-primary text-headline-sm">schedule</span>
                          <span>5:30 AM – 11:30 AM IST</span>
                        </div>
                        <div className="flex items-center gap-1.5 sm:col-span-2">
                          <span className="material-symbols-outlined text-primary text-headline-sm">location_on</span>
                          <span className="truncate">Rajgad Fort Foothills, Pune, Maharashtra</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t-0">
                        <div className="w-6 h-6 rounded-full bg-secondary-container flex items-center justify-center text-on-secondary-container font-headline-sm text-xs font-bold">
                          EA
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
                        <span className="font-label-sm text-on-surface-variant bg-surface-container px-3 py-1 rounded-full">
                          Max 10 tickets per order
                        </span>
                      </div>
                      <p className="text-body-md text-on-surface-variant mb-space-md">
                        Choose your desired category and passenger quantity for this adventure.
                      </p>

                      {/* TICKET TIER LIST */}
                      <div className="space-y-space-sm">
                        {/* Tier 1: General */}
                        <div className="p-space-md rounded-xl bg-surface-container-low transition-all duration-200 hover:bg-surface-container">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-start space-x-space-sm">
                              <div className="w-12 h-12 rounded-xl bg-primary-container text-on-primary-container flex items-center justify-center shrink-0 shadow-sm">
                                <span className="material-symbols-outlined text-headline-lg">confirmation_number</span>
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="font-headline-md text-on-surface">General</h3>
                                  <span className="font-label-badge text-tertiary-container bg-on-tertiary-container px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-tertiary-container animate-pulse" /> 42 seats available
                                  </span>
                                </div>
                                <div className="font-headline-md text-primary mt-0.5">
                                  ₹499 <span className="text-body-sm font-normal text-on-surface-variant">/ person</span>
                                </div>
                                <p className="text-body-sm text-on-surface-variant mt-1">
                                  Standard mountain trek pass with basecamp breakfast and basic first-aid guide support.
                                </p>
                              </div>
                            </div>

                            {/* Stepper */}
                            <div className="flex items-center justify-end space-x-3 bg-surface-container-lowest px-3 py-1.5 rounded-lg shadow-sm w-fit self-end sm:self-center">
                              <button
                                aria-label="Decrease General Tickets"
                                className="w-8 h-8 rounded bg-surface-container hover:bg-surface-variant text-on-surface flex items-center justify-center transition active:scale-95 disabled:opacity-40"
                                onClick={() => updateQty('general', -1)}
                                disabled={(quantities.general ?? 0) === 0}
                                type="button"
                              >
                                <span className="material-symbols-outlined text-headline-sm">remove</span>
                              </button>
                              <span className="font-headline-md w-6 text-center text-on-surface">
                                {quantities.general ?? 0}
                              </span>
                              <button
                                aria-label="Increase General Tickets"
                                className="w-8 h-8 rounded bg-primary hover:bg-primary-fixed text-on-primary flex items-center justify-center transition active:scale-95 disabled:opacity-40"
                                onClick={() => updateQty('general', 1)}
                                disabled={totalTickets >= 10}
                                type="button"
                              >
                                <span className="material-symbols-outlined text-headline-sm">add</span>
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Tier 2: VIP */}
                        <div className="p-space-md rounded-xl bg-surface-container-low transition-all duration-200 hover:bg-surface-container">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-start space-x-space-sm">
                              <div className="w-12 h-12 rounded-xl bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0 shadow-sm">
                                <span className="material-symbols-outlined text-headline-lg">workspace_premium</span>
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="font-headline-md text-on-surface">VIP Experience</h3>
                                  <span className="font-label-badge text-tertiary-container bg-on-tertiary-container px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-tertiary-container" /> 15 seats available
                                  </span>
                                </div>
                                <div className="font-headline-md text-primary mt-0.5">
                                  ₹999 <span className="text-body-sm font-normal text-on-surface-variant">/ person</span>
                                </div>
                                <p className="text-body-sm text-on-surface-variant mt-1">
                                  Priority ascent briefing, complimentary sunrise drone photography package, and energy snack kit.
                                </p>
                              </div>
                            </div>

                            {/* Stepper */}
                            <div className="flex items-center justify-end space-x-3 bg-surface-container-lowest px-3 py-1.5 rounded-lg shadow-sm w-fit self-end sm:self-center">
                              <button
                                aria-label="Decrease VIP Tickets"
                                className="w-8 h-8 rounded bg-surface-container hover:bg-surface-variant text-on-surface flex items-center justify-center transition active:scale-95 disabled:opacity-40"
                                onClick={() => updateQty('vip', -1)}
                                disabled={(quantities.vip ?? 0) === 0}
                                type="button"
                              >
                                <span className="material-symbols-outlined text-headline-sm">remove</span>
                              </button>
                              <span className="font-headline-md w-6 text-center text-on-surface">
                                {quantities.vip ?? 0}
                              </span>
                              <button
                                aria-label="Increase VIP Tickets"
                                className="w-8 h-8 rounded bg-primary hover:bg-primary-fixed text-on-primary flex items-center justify-center transition active:scale-95 disabled:opacity-40"
                                onClick={() => updateQty('vip', 1)}
                                disabled={totalTickets >= 10}
                                type="button"
                              >
                                <span className="material-symbols-outlined text-headline-sm">add</span>
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Tier 3: Premium Summit */}
                        <div className="p-space-md rounded-xl bg-surface-container-low transition-all duration-200 hover:bg-surface-container">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-start space-x-space-sm">
                              <div className="w-12 h-12 rounded-xl bg-surface-variant text-on-surface-variant flex items-center justify-center shrink-0 shadow-sm">
                                <span className="material-symbols-outlined text-headline-lg">star</span>
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="font-headline-md text-on-surface">Premium Summit Explorer</h3>
                                  <span className="font-label-badge text-tertiary-container bg-on-tertiary-container px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-tertiary-container" /> 8 seats left
                                  </span>
                                </div>
                                <div className="font-headline-md text-primary mt-0.5">
                                  ₹1,499 <span className="text-body-sm font-normal text-on-surface-variant">/ person</span>
                                </div>
                                <p className="text-body-sm text-on-surface-variant mt-1">
                                  1-on-1 certified mountaineer guide, premium trail pack, professional souvenir badge, and Pune pickup.
                                </p>
                              </div>
                            </div>

                            {/* Stepper */}
                            <div className="flex items-center justify-end space-x-3 bg-surface-container-lowest px-3 py-1.5 rounded-lg shadow-sm w-fit self-end sm:self-center">
                              <button
                                aria-label="Decrease Premium Tickets"
                                className="w-8 h-8 rounded bg-surface-container hover:bg-surface-variant text-on-surface flex items-center justify-center transition active:scale-95 disabled:opacity-40"
                                onClick={() => updateQty('premium', -1)}
                                disabled={(quantities.premium ?? 0) === 0}
                                type="button"
                              >
                                <span className="material-symbols-outlined text-headline-sm">remove</span>
                              </button>
                              <span className="font-headline-md w-6 text-center text-on-surface">
                                {quantities.premium ?? 0}
                              </span>
                              <button
                                aria-label="Increase Premium Tickets"
                                className="w-8 h-8 rounded bg-primary hover:bg-primary-fixed text-on-primary flex items-center justify-center transition active:scale-95 disabled:opacity-40"
                                onClick={() => updateQty('premium', 1)}
                                disabled={totalTickets >= 10}
                                type="button"
                              >
                                <span className="material-symbols-outlined text-headline-sm">add</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Motivational Banner Inside Step */}
                      <div className="mt-space-lg p-space-md rounded-xl bg-surface-container flex items-center justify-between gap-4 overflow-hidden relative">
                        <div className="flex items-center space-x-3 z-10">
                          <div className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-headline-md">landscape</span>
                          </div>
                          <div>
                            <p className="font-headline-sm text-on-surface">You're one step closer to an amazing experience!</p>
                            <p className="text-body-sm text-on-surface-variant">Lock your sunrise slot before early-bird batches fill up.</p>
                          </div>
                        </div>
                        <div className="hidden sm:block text-right z-10">
                          <span className="font-headline-sm italic text-primary-container block">Good Experiences</span>
                          <span className="font-label-badge text-on-surface-variant tracking-wider uppercase">Go Further</span>
                        </div>
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
                        Please provide attendee identification for trek manifest and state safety permits.
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
                      <img
                        className="w-full h-full object-cover"
                        alt="Trek silhouette with sunrise over mountain fortress"
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuDutYI2Noglgo5BQ-weWqGyNHpHoMEAjvGN8KryzDwOabqTZzvyxW1eDXVntozFkq6cXhoYwNXXzkNVaHyi6z6WZb1hnuQhL4Hhm-mB3LAI3s6E7LcOxjLIF2BWi_B-E5ggtByifO-0KIeFuyOQaCy-j5BE2i5H7j4Ywc8A7p6gU4QnFVVuY-cOOIR6i4MPJZhRW0KzDWQTIGWkjVe0INEshmqbCZA9DBhxKgsWi_ES"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="font-headline-sm text-on-surface truncate">{event.name}</p>
                      <p className="text-body-sm text-on-surface-variant flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">calendar_today</span> 20 Sep 2026
                      </p>
                    </div>
                  </div>

                  {/* LINE ITEMS */}
                  <div className="space-y-3 pt-2 text-body-sm">
                    {(quantities.general ?? 0) > 0 && (
                      <div className="flex justify-between items-start font-body-md">
                        <div>
                          <div className="font-headline-sm text-on-surface">General</div>
                          <div className="text-body-sm text-on-surface-variant">₹499 × {quantities.general}</div>
                        </div>
                        <div className="font-headline-sm text-on-surface">
                          {formatINR(499 * (quantities.general ?? 0))}
                        </div>
                      </div>
                    )}

                    {(quantities.vip ?? 0) > 0 && (
                      <div className="flex justify-between items-start font-body-md">
                        <div>
                          <div className="font-headline-sm text-on-surface">VIP</div>
                          <div className="text-body-sm text-on-surface-variant">₹999 × {quantities.vip}</div>
                        </div>
                        <div className="font-headline-sm text-on-surface">
                          {formatINR(999 * (quantities.vip ?? 0))}
                        </div>
                      </div>
                    )}

                    {(quantities.premium ?? 0) > 0 && (
                      <div className="flex justify-between items-start font-body-md">
                        <div>
                          <div className="font-headline-sm text-on-surface">Premium Summit</div>
                          <div className="text-body-sm text-on-surface-variant">₹1,499 × {quantities.premium}</div>
                        </div>
                        <div className="font-headline-sm text-on-surface">
                          {formatINR(1499 * (quantities.premium ?? 0))}
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
                    <div className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-tertiary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                        check_circle
                      </span>
                      <span>Free cancellation up to 48 hours prior</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-tertiary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                        check_circle
                      </span>
                      <span>SMS and WhatsApp ticket dispatched on payment</span>
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

          {/* STEP 3 / CONFIRMATION SUCCESS VIEW */}
          {currentStep === 3 && (
            <section className="flex flex-col space-y-space-md mb-space-2xl animate-in fade-in duration-300">
              {/* CONGRATS HERO */}
              <div className="bg-surface-container-lowest rounded-2xl p-space-lg text-center shadow-md max-w-4xl mx-auto w-full relative overflow-hidden">
                <div className="w-16 h-16 rounded-full bg-tertiary text-on-tertiary flex items-center justify-center mx-auto mb-space-sm shadow-md animate-bounce">
                  <span className="material-symbols-outlined text-headline-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                    check
                  </span>
                </div>
                <h2 className="font-headline-xl text-on-surface tracking-tight">Booking Confirmed!</h2>
                <p className="text-body-lg text-on-surface-variant mt-1">
                  Your booking for <strong className="text-on-surface">{event.name}</strong> has been successfully processed.
                </p>
                <p className="text-body-sm text-on-surface-variant">
                  Your transaction was verified via Cashfree and digital passes are issued below.
                </p>

                {/* BOOKING METRIC STRIP */}
                <div className="mt-space-md p-space-md bg-surface-container rounded-xl flex flex-wrap items-center justify-between gap-4 text-left">
                  <div>
                    <span className="font-label-badge uppercase tracking-wider text-on-surface-variant block">Booking Reference</span>
                    <div className="flex items-center gap-2">
                      <span className="font-headline-md text-on-surface font-mono">{bookingId}</span>
                      <button
                        className="text-primary hover:text-primary-container p-1 rounded hover:bg-surface transition"
                        onClick={copyBookingId}
                        title="Copy ID"
                        type="button"
                      >
                        <span className="material-symbols-outlined text-sm">content_copy</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="font-label-badge uppercase tracking-wider text-on-surface-variant block">Payment Status</span>
                    <span className="inline-flex items-center gap-1 font-label-badge text-on-tertiary-container bg-tertiary-container px-2.5 py-1 rounded-full uppercase font-bold">
                      <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>
                        verified
                      </span>{' '}
                      {formatINR(totalAmount)} Paid
                    </span>
                  </div>

                  <div>
                    <span className="font-label-badge uppercase tracking-wider text-on-surface-variant block">Date &amp; Reporting</span>
                    <span className="font-headline-sm text-on-surface">20 Sep 2026, 05:30 AM</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      className="px-4 py-2 bg-surface-container-lowest text-on-surface font-label-md rounded-lg hover:bg-surface transition shadow-sm flex items-center gap-1.5"
                      onClick={() => window.print()}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-sm">print</span> Print
                    </button>
                    <button
                      className="px-4 py-2 bg-primary text-on-primary font-label-md rounded-lg hover:bg-primary-container transition shadow-sm flex items-center gap-1.5"
                      onClick={() => openPassModal(leadAttendee)}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-sm">qr_code_2</span> View QR Pass
                    </button>
                  </div>
                </div>
              </div>

              {/* ISSUED PASSES LIST */}
              <div className="max-w-4xl mx-auto w-full bg-surface-container-lowest rounded-2xl p-space-md shadow-sm">
                <div className="flex items-center justify-between mb-space-sm">
                  <h3 className="font-headline-md text-on-surface">Issued Attendee Tickets</h3>
                  <span className="text-body-sm text-on-surface-variant">Show this QR code at the basecamp entrance</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
                  {attendees.map((att, i) => (
                    <div
                      key={i}
                      className="p-space-md rounded-xl bg-surface-container-low flex flex-col justify-between hover:bg-surface-container transition"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-label-badge bg-primary-container text-on-primary-container px-2 py-0.5 rounded font-mono font-bold">
                            INV-TKT-100{i + 1}
                          </span>
                          <span className="text-tertiary text-xs flex items-center gap-1 font-label-sm font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-tertiary" /> Valid
                          </span>
                        </div>
                        <h4 className="font-headline-sm text-on-surface">{att.name || `Participant ${i + 1}`}</h4>
                        <p className="text-body-sm text-on-surface-variant">{att.tier}</p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-outline-variant/20 flex items-center justify-between">
                        <span className="font-label-sm text-primary font-medium">Entry Pass QR</span>
                        <button
                          onClick={() => openPassModal(att)}
                          className="px-2.5 py-1 rounded bg-surface-container hover:bg-surface text-on-surface text-body-sm flex items-center gap-1 transition"
                          type="button"
                        >
                          <span className="material-symbols-outlined text-xs">visibility</span> View
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* POST-BOOKING CHECKLIST & INFO */}
              <div className="max-w-4xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-space-md">
                <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm">
                  <div className="flex items-center space-x-2 text-primary font-headline-sm mb-2">
                    <span className="material-symbols-outlined">forward_to_inbox</span>
                    <span>Delivery Confirmation</span>
                  </div>
                  <p className="text-body-sm text-on-surface-variant mb-3">
                    Confirmation email sent to <strong className="text-on-surface">{leadAttendee.email || 'rohit@example.com'}</strong> and
                    WhatsApp voucher dispatched to registered numbers.
                  </p>
                  <div className="p-2.5 bg-surface-container-low rounded-lg text-body-sm flex items-center justify-between">
                    <span className="text-on-surface-variant">SMS Status:</span>
                    <span className="text-tertiary font-label-sm flex items-center gap-1 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-tertiary" /> Delivered
                    </span>
                  </div>
                </div>

                <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm">
                  <div className="flex items-center space-x-2 text-on-surface font-headline-sm mb-2">
                    <span className="material-symbols-outlined text-primary">checklist</span>
                    <span>Before You Attend</span>
                  </div>
                  <ul className="text-body-sm text-on-surface-variant space-y-1.5 list-disc list-inside">
                    <li>Carry an original Government photo ID proof per participant.</li>
                    <li>Wear sturdy trekking footwear with deep ankle grip.</li>
                    <li>Arrive at Gunjavane base village strictly by 05:15 AM.</li>
                  </ul>
                </div>
              </div>

              {/* RESTART OR RETURN ACTIONS */}
              <div className="max-w-4xl mx-auto w-full flex justify-between items-center py-space-sm">
                <button
                  className="px-5 py-2.5 rounded-lg bg-surface-container text-on-surface font-label-md hover:bg-surface-container-high transition"
                  onClick={() => goToStep(1)}
                  type="button"
                >
                  ← Book Another Event
                </button>
                <Link
                  to={`/bookings/${bookingId}/manage`}
                  className="px-6 py-2.5 rounded-lg bg-secondary-container text-on-secondary-container font-label-md hover:bg-surface-container-highest transition flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm">settings</span> Manage Reservation
                </Link>
              </div>
            </section>
          )}

          {/* DIGITAL TICKET MODAL */}
          {isDigitalPassOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/50 backdrop-blur-sm p-4">
              <div className="bg-surface-container-lowest w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Modal Header */}
                <div className="bg-primary p-space-md text-on-primary flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="material-symbols-outlined">confirmation_number</span>
                    <span className="font-headline-sm">Official Trek E-Pass</span>
                  </div>
                  <button
                    className="text-on-primary hover:text-on-primary-container p-1 rounded-full bg-transparent border-0 cursor-pointer"
                    onClick={() => setIsDigitalPassOpen(false)}
                    type="button"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>

                {/* Ticket Body styled like boarding pass */}
                <div className="p-space-md space-y-space-md">
                  <div className="text-center">
                    <span className="font-label-badge uppercase tracking-wider text-on-surface-variant">Event</span>
                    <h4 className="font-headline-lg text-on-surface">{event.name}</h4>
                    <p className="text-body-sm text-on-surface-variant">Sunday, 20 September 2026 • 5:30 AM</p>
                  </div>

                  {/* QR Code Display Box */}
                  <div className="bg-surface-container-low p-space-md rounded-xl flex flex-col items-center justify-center">
                    <div className="w-44 h-44 bg-surface-container-lowest p-2 rounded-lg shadow-sm flex items-center justify-center">
                      <svg className="w-full h-full text-on-surface" fill="currentColor" viewBox="0 0 100 100">
                        {/* Corner Markers */}
                        <rect fill="none" height="25" rx="3" stroke="currentColor" strokeWidth="4" width="25" x="5" y="5" />
                        <rect fill="currentColor" height="11" width="11" x="12" y="12" />
                        <rect fill="none" height="25" rx="3" stroke="currentColor" strokeWidth="4" width="25" x="70" y="5" />
                        <rect fill="currentColor" height="11" width="11" x="77" y="12" />
                        <rect fill="none" height="25" rx="3" stroke="currentColor" strokeWidth="4" width="25" x="5" y="70" />
                        <rect fill="currentColor" height="11" width="11" x="12" y="77" />
                        {/* Data Pixels Pattern */}
                        <rect height="5" width="5" x="35" y="10" />
                        <rect height="5" width="5" x="45" y="10" />
                        <rect height="5" width="10" x="55" y="10" />
                        <rect height="5" width="10" x="35" y="20" />
                        <rect height="5" width="5" x="50" y="20" />
                        <rect height="15" width="5" x="40" y="30" />
                        <rect height="5" width="15" x="55" y="30" />
                        <rect height="5" width="10" x="10" y="40" />
                        <rect height="10" width="5" x="25" y="40" />
                        <rect height="5" width="15" x="75" y="40" />
                        <rect height="5" width="5" x="35" y="50" />
                        <rect height="5" width="15" x="45" y="50" />
                        <rect height="10" width="5" x="70" y="50" />
                        <rect height="5" width="10" x="80" y="50" />
                        <rect height="5" width="10" x="35" y="60" />
                        <rect height="10" width="5" x="50" y="60" />
                        <rect height="5" width="10" x="60" y="60" />
                        <rect height="15" width="5" x="80" y="65" />
                        <rect height="10" width="5" x="35" y="75" />
                        <rect height="5" width="10" x="45" y="75" />
                        <rect height="5" width="5" x="60" y="75" />
                        <rect height="10" width="5" x="70" y="80" />
                        <rect height="5" width="15" x="40" y="85" />
                        <rect height="5" width="5" x="60" y="85" />
                      </svg>
                    </div>
                    <p className="font-headline-sm font-mono mt-2 tracking-widest text-primary font-bold">INV-TKT-1001-A</p>
                    <span className="font-label-badge text-tertiary-container bg-on-tertiary-container px-2 py-0.5 rounded-full mt-1 font-bold">
                      VERIFIED ACTIVE
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-body-sm border-t border-dashed border-outline-variant/40 pt-3">
                    <div>
                      <span className="text-on-surface-variant font-label-badge uppercase block">Lead Attendee</span>
                      <span className="font-headline-sm text-on-surface font-semibold">
                        {selectedModalAttendee?.name || 'Rohit Deshmukh'}
                      </span>
                    </div>
                    <div>
                      <span className="text-on-surface-variant font-label-badge uppercase block">Tier Category</span>
                      <span className="font-headline-sm text-on-surface font-semibold">
                        {selectedModalAttendee?.tier || 'General Pass'}
                      </span>
                    </div>
                    <div>
                      <span className="text-on-surface-variant font-label-badge uppercase block">Reporting Point</span>
                      <span className="text-on-surface">Gunjavane Base Fort Gate</span>
                    </div>
                    <div>
                      <span className="text-on-surface-variant font-label-badge uppercase block">Emergency SOS</span>
                      <span className="text-on-surface">+91 9876543210</span>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      className="flex-1 py-2.5 bg-primary text-on-primary font-label-md rounded-lg flex items-center justify-center gap-1 hover:bg-primary-container transition"
                      onClick={() => showToast('Digital pass PDF saved to downloads!')}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-sm">download</span> Save to Phone
                    </button>
                    <button
                      className="px-4 py-2.5 bg-surface-container text-on-surface font-label-md rounded-lg hover:bg-surface-container-high transition"
                      onClick={() => setIsDigitalPassOpen(false)}
                      type="button"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* EVENT DETAILS QUICK INFO MODAL */}
          {isEventInfoOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/50 backdrop-blur-sm p-4">
              <div className="bg-surface-container-lowest w-full max-w-lg rounded-2xl p-space-md shadow-xl animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between pb-2 border-b border-outline-variant/30">
                  <h3 className="font-headline-lg text-on-surface">About Rajgad Trek</h3>
                  <button
                    className="text-on-surface-variant hover:text-on-surface p-1 rounded-full bg-transparent border-0 cursor-pointer"
                    onClick={() => setIsEventInfoOpen(false)}
                    type="button"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>

                <div className="py-space-md space-y-3 text-body-sm text-on-surface-variant">
                  <p>
                    Rajgad (Ruling Fort) was the capital of the Maratha Empire under Chhatrapati Shivaji Maharaj for over 26 years.
                    Situated at 4,514 feet, this sunrise excursion offers breathtaking 360-degree panoramic views of Sahyadri ranges.
                  </p>
                  <div className="p-3 bg-surface-container rounded-lg space-y-1">
                    <p>
                      <strong className="text-on-surface font-semibold">Difficulty Grade:</strong> Moderate (approx 2.5 hours gradual climb).
                    </p>
                    <p>
                      <strong className="text-on-surface font-semibold">Base Village:</strong> Gunjavane (approx 60km south from Pune).
                    </p>
                    <p>
                      <strong className="text-on-surface font-semibold">Included:</strong> Forest entry fees, professional trek leaders, safety harness for Balekilla peak segment, and breakfast.
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

          {/* FLOATING PROTOTYPE NAVIGATOR BAR */}
          <aside className="fixed bottom-6 right-6 z-40 flex items-center gap-3 bg-inverse-surface/85 text-inverse-on-surface backdrop-blur-md px-4 py-2.5 rounded-full shadow-xl border border-outline-variant/30 text-body-sm transition-all">
            <div className="flex items-center gap-2 pr-2 border-r border-outline-variant/30">
              <span className="w-2 h-2 rounded-full bg-tertiary-fixed animate-pulse" />
              <span className="font-label-md text-xs sm:text-sm tracking-tight text-surface-container-lowest">
                Attendee Flow: Step {currentStep === 1 ? '3 of 6 - Ticket Selection' : currentStep === 2 ? '4 of 6 - Participant Details' : '5 of 6 - Booking Confirmed'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={() => goToStep((currentStep - 1) as 1 | 2)}
                  className="px-2.5 py-1 rounded-full bg-surface-container/20 hover:bg-surface-container/40 text-inverse-on-surface font-label-sm text-xs flex items-center gap-1 transition active:scale-95"
                >
                  <span className="material-symbols-outlined text-xs">arrow_back</span> Prev
                </button>
              )}
              {currentStep < 3 && (
                <button
                  type="button"
                  onClick={handlePrimaryAction}
                  className="px-3 py-1 rounded-full bg-primary hover:bg-primary-container text-on-primary font-label-sm text-xs flex items-center gap-1 transition shadow-sm active:scale-95"
                >
                  Next <span className="material-symbols-outlined text-xs">arrow_forward</span>
                </button>
              )}
            </div>
          </aside>

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
              <button onClick={() => showToast('Terms: Passes non-transferable on day of event.')} className="hover:text-primary transition bg-transparent border-0 cursor-pointer text-body-sm text-on-surface-variant">
                Terms of Service
              </button>
              <button onClick={() => showToast('Privacy: Phone numbers are shared solely with trek commanders.')} className="hover:text-primary transition bg-transparent border-0 cursor-pointer text-body-sm text-on-surface-variant">
                Privacy Policy
              </button>
              <button onClick={() => showToast('Cancellation: 100% refund up to 48 hours prior.')} className="hover:text-primary transition bg-transparent border-0 cursor-pointer text-body-sm text-on-surface-variant">
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

