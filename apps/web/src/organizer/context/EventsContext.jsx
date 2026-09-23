import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { INITIAL_EVENTS } from '../data/mockEvents';
import { INITIAL_BOOKINGS } from '../data/mockBookings';
import { INITIAL_PARTICIPANTS } from '../data/mockParticipants';
import { INITIAL_PAYMENTS } from '../data/mockPayments';
import { INITIAL_SETTINGS } from '../data/mockSettings';
import { useNotifications } from './NotificationContext';
import { useAuth } from './AuthContext';
import { apiRequest, ApiError } from '../lib/api';

const EventsContext = createContext();

const PLACEHOLDER_BANNER =
  'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80';

// Maps GET /api/organizer/events (see apps/api/src/services/organizerEvents.ts)
// onto the richer shape every page in this portal already expects (see
// data/mockEvents.js). This backend doesn't track everything the mock shape
// has room for yet (category, short/long description, venue city/state/
// pincode, timezone) — those come through blank rather than fabricated.
// displayStatus's values (draft/published/completed/cancelled) already match
// the shape's `status` field exactly, so that one's a straight passthrough.
function apiEventToMockShape(e) {
  const d = new Date(e.eventDate);
  return {
    id: e.id,
    title: e.name,
    category: '',
    status: e.displayStatus,
    shortDescription: '',
    description: '',
    startDate: d.toISOString().slice(0, 10),
    startTime: d.toISOString().slice(11, 16),
    endDate: '',
    endTime: '',
    timezone: 'IST (UTC+5:30)',
    venueType: 'physical',
    venueName: e.venueAddress || '',
    address: e.venueAddress || '',
    city: '',
    state: '',
    pincode: '',
    bannerImage: e.bannerUrl || PLACEHOLDER_BANNER,
    totalCapacity: e.capacity,
    ticketsSold: e.ticketsSold,
    checkedInCount: 0,
    grossRevenue: Math.round(e.revenuePaise / 100),
  };
}

// Maps GET /api/organizer/bookings?eventId=all onto the shape every page
// reading `bookings` already expects (see data/mockBookings.js). ticketIds
// and notes aren't tracked by this backend — they come through empty
// rather than fabricated.
function apiBookingToMockShape(b) {
  const d = new Date(b.createdAt);
  return {
    id: b.bookingReference,
    // The real booking UUID, kept separately from the display-facing
    // `id` above (which every existing page already treats as the
    // human-readable reference) — real mutation endpoints (cancel,
    // etc.) need the actual primary key, not the reference string.
    bookingId: b.id,
    bookingDate: `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`,
    eventId: b.eventId,
    eventName: b.eventName,
    customerName: b.customerName,
    customerEmail: b.customerEmail,
    customerPhone: b.customerPhone,
    ticketsCount: b.ticketCount,
    tierName: b.ticketTierNames,
    amount: Math.round(b.totalAmountPaise / 100),
    paymentStatus: b.paymentStatus || 'pending',
    bookingStatus: b.displayStatus,
    ticketIds: [],
    notes: '',
  };
}

export function EventsProvider({ children }) {
  const { showToast } = useNotifications();
  const { user } = useAuth();

  // Load state from localStorage or use defaults
  const [events, setEvents] = useState(() => {
    const saved = localStorage.getItem('inveon_events');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore corrupted localStorage, fall back to default */ }
    }
    return INITIAL_EVENTS;
  });

  const [bookings, setBookings] = useState(() => {
    const saved = localStorage.getItem('inveon_bookings');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore corrupted localStorage, fall back to default */ }
    }
    return INITIAL_BOOKINGS;
  });

  const [participants, setParticipants] = useState(() => {
    const saved = localStorage.getItem('inveon_participants');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore corrupted localStorage, fall back to default */ }
    }
    return INITIAL_PARTICIPANTS;
  });

  const [payments, setPayments] = useState(() => {
    const saved = localStorage.getItem('inveon_payments');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore corrupted localStorage, fall back to default */ }
    }
    return INITIAL_PAYMENTS;
  });

  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('inveon_settings');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore corrupted localStorage, fall back to default */ }
    }
    return INITIAL_SETTINGS;
  });

  const [eventsLoadError, setEventsLoadError] = useState(null);
  const [bookingsLoadError, setBookingsLoadError] = useState(null);

  // Real data: events and bookings (across every event this organizer
  // owns). Participants/payments/settings stay on the mock/localStorage
  // layer above — those need their own backend domains this project
  // doesn't have yet.
  const refreshEvents = useCallback(() => {
    if (!user?.isLoggedIn || !user?.token) return Promise.resolve();
    return apiRequest('/organizer/events', { token: user.token })
      .then((data) => {
        setEvents(data.events.map(apiEventToMockShape));
        setEventsLoadError(null);
      })
      .catch((err) => {
        setEventsLoadError(err.message ?? 'Failed to load events');
      });
  }, [user?.isLoggedIn, user?.token]);

  useEffect(() => {
    if (!user?.isLoggedIn || !user?.token) return;
    let cancelled = false;

    apiRequest('/organizer/events', { token: user.token })
      .then((data) => {
        if (cancelled) return;
        setEvents(data.events.map(apiEventToMockShape));
        setEventsLoadError(null);
      })
      .catch((err) => {
        if (!cancelled) setEventsLoadError(err.message ?? 'Failed to load events');
      });

    apiRequest('/organizer/bookings?eventId=all&pageSize=100', { token: user.token })
      .then((data) => {
        if (cancelled) return;
        setBookings(data.bookings.map(apiBookingToMockShape));
        setBookingsLoadError(null);
      })
      .catch((err) => {
        if (!cancelled) setBookingsLoadError(err.message ?? 'Failed to load bookings');
      });

    return () => {
      cancelled = true;
    };
  }, [user?.isLoggedIn, user?.token]);

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('inveon_events', JSON.stringify(events));
  }, [events]);

  useEffect(() => {
    localStorage.setItem('inveon_bookings', JSON.stringify(bookings));
  }, [bookings]);

  useEffect(() => {
    localStorage.setItem('inveon_participants', JSON.stringify(participants));
  }, [participants]);

  useEffect(() => {
    localStorage.setItem('inveon_payments', JSON.stringify(payments));
  }, [payments]);

  useEffect(() => {
    localStorage.setItem('inveon_settings', JSON.stringify(settings));
  }, [settings]);

  // Event actions
  const addEvent = async (newEvent) => {
    const result = await apiRequest('/organizer/events', {
      method: 'POST',
      token: user?.token,
      body: {
        title: newEvent.title,
        shortDescription: newEvent.shortDescription,
        description: newEvent.description,
        startDate: newEvent.startDate,
        startTime: newEvent.startTime,
        venueName: newEvent.venueName,
        address: newEvent.address,
        city: newEvent.city,
        state: newEvent.state,
        pincode: newEvent.pincode,
        bannerImage: newEvent.bannerImage,
        cancellationPolicy: newEvent.cancellationPolicy?.description || undefined,
        allowSelfServiceCancellation: Boolean(newEvent.cancellationPolicy?.refundable),
        refundCutoffDays: newEvent.cancellationPolicy?.cutoffDays,
        refundPercentage: newEvent.cancellationPolicy?.refundPercentage,
        ticketTiers: (newEvent.ticketTiers || []).map((tier) => ({
          name: tier.name,
          description: tier.description,
          price: tier.price,
          quantity: tier.quantity,
        })),
        scheduleItems: (newEvent.scheduleItems || []).map((s) => ({
          time: s.time,
          title: s.title,
          description: s.description,
        })),
        packingChecklist: (newEvent.packingChecklist || []).map((p) => ({
          item: p.item,
          mandatory: p.mandatory,
        })),
        faqItems: (newEvent.faqItems || []).map((f) => ({
          question: f.question,
          answer: f.answer,
        })),
        status: newEvent.status || 'published',
      },
    });

    // Real id/slug from the database, not a client-guessed one — the
    // rest of the fields are kept as entered so the page can render
    // immediately without a full re-fetch.
    const eventWithId = {
      ...newEvent,
      id: result.id,
      slug: result.slug,
      ticketsSold: 0,
      checkedInCount: 0,
      grossRevenue: 0,
      status: newEvent.status || 'published'
    };
    setEvents((prev) => [eventWithId, ...prev]);
    showToast(`Event "${eventWithId.title}" created successfully!`, 'success');
    return eventWithId;
  };

  const updateEvent = async (id, updatedFields) => {
    try {
      await apiRequest(`/organizer/events/${id}`, { method: 'PATCH', token: user?.token, body: updatedFields });
      showToast('Event updated successfully!', 'success');
      await refreshEvents();
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not update this event.', 'error');
      return false;
    }
  };

  // Same shape addEvent sends, but as a real PATCH to an existing
  // event — including each tier's real id, so an edited tier is
  // actually updated in place rather than read as a brand new one
  // (see UpdateEventTicketTier: an id present means "this tier",
  // absent means "add a new tier").
  const updateEventFull = async (id, formData) => {
    try {
      const result = await apiRequest(`/organizer/events/${id}`, {
        method: 'PATCH',
        token: user?.token,
        body: {
          title: formData.title,
          shortDescription: formData.shortDescription,
          description: formData.description,
          startDate: formData.startDate,
          startTime: formData.startTime,
          venueName: formData.venueName,
          address: formData.address,
          city: formData.city,
          state: formData.state,
          pincode: formData.pincode,
          bannerImage: formData.bannerImage,
          cancellationPolicy: formData.cancellationPolicy?.description || undefined,
          allowSelfServiceCancellation: Boolean(formData.cancellationPolicy?.refundable),
          refundCutoffDays: formData.cancellationPolicy?.cutoffDays,
          refundPercentage: formData.cancellationPolicy?.refundPercentage,
          ticketTiers: (formData.ticketTiers || []).map((tier) => ({
            id: typeof tier.id === 'string' && !tier.id.startsWith('tier-') ? tier.id : undefined,
            name: tier.name,
            description: tier.description,
            price: tier.price,
            quantity: tier.quantity,
          })),
          scheduleItems: (formData.scheduleItems || []).map((s) => ({ time: s.time, title: s.title, description: s.description })),
          packingChecklist: (formData.packingChecklist || []).map((p) => ({ item: p.item, mandatory: p.mandatory })),
          faqItems: (formData.faqItems || []).map((f) => ({ question: f.question, answer: f.answer })),
          status: formData.status,
        },
      });
      await refreshEvents();
      return result;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not save changes to this event.', 'error');
      return null;
    }
  };

  const duplicateEvent = async (id) => {
    try {
      const created = await apiRequest(`/organizer/events/${id}/duplicate`, { method: 'POST', token: user?.token });
      showToast('Duplicated as a draft — including its images, video, and policy', 'info');
      await refreshEvents();
      return created;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not duplicate this event.', 'error');
      return null;
    }
  };

  const deleteEvent = async (id) => {
    const event = events.find((e) => e.id === id);
    try {
      await apiRequest(`/organizer/events/${id}`, { method: 'DELETE', token: user?.token });
      showToast(`Event "${event?.title || id}" deleted`, 'info');
      await refreshEvents();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not delete this event.', 'error');
    }
  };

  const toggleEventStatus = async (id, newStatus) => {
    try {
      await apiRequest(`/organizer/events/${id}`, { method: 'PATCH', token: user?.token, body: { status: newStatus } });
      showToast(`Event status updated to ${newStatus}`, 'success');
      await refreshEvents();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not update this event\u2019s status.', 'error');
    }
  };

  const cancelEvent = async (id, reason) => {
    try {
      const result = await apiRequest(`/organizer/events/${id}/cancel`, { method: 'POST', token: user?.token, body: { reason } });
      showToast(`Event cancelled — ${result.cancelledBookings.length} booking(s) refunded`, 'info');
      await refreshEvents();
      return result;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not cancel this event.', 'error');
      return null;
    }
  };

  // Participant actions & Real-time Check-In with Unpaid / Cancelled Validation
  const checkInParticipant = (ticketCodeOrId) => {
    const query = (ticketCodeOrId || '').trim().toLowerCase();
    const target = participants.find(
      (p) =>
        p.id.toLowerCase() === query ||
        p.ticketCode.toLowerCase() === query ||
        p.fullName.toLowerCase() === query
    );

    if (!target) {
      showToast(`❌ REJECTED: Ticket not found for "${ticketCodeOrId}"`, 'error');
      return {
        success: false,
        reason: 'NOT_FOUND',
        title: '⛔ SCAN REJECTED — TICKET NOT FOUND',
        message: `No active ticket or reservation found matching "${ticketCodeOrId}". Please verify ticket code.`
      };
    }

    const booking = bookings.find((b) => b.id === target.bookingId);

    // 1. Cancelled / Refunded validation check
    if (
      target.checkInStatus === 'cancelled' ||
      booking?.bookingStatus === 'cancelled' ||
      booking?.paymentStatus === 'refunded'
    ) {
      showToast(`⛔ REJECTED: Ticket for ${target.fullName} is CANCELLED`, 'error');
      return {
        success: false,
        reason: 'CANCELLED',
        title: '⛔ SCAN REJECTED — TICKET CANCELLED',
        message: `Ticket pass for ${target.fullName} has been CANCELLED / REFUNDED (Order #${target.bookingId}). Entry strictly denied.`,
        participant: target,
        booking: booking
      };
    }

    // 2. Unpaid / Pending Payment validation check
    if (
      target.checkInStatus === 'pending' ||
      booking?.paymentStatus === 'pending' ||
      booking?.paymentStatus === 'failed' ||
      booking?.paymentStatus === 'unpaid' ||
      booking?.bookingStatus === 'pending'
    ) {
      showToast(`⚠️ REJECTED: Ticket is UNPAID (Order #${target.bookingId})`, 'error');
      return {
        success: false,
        reason: 'UNPAID',
        title: '⚠️ SCAN REJECTED — PAYMENT UNPAID / PENDING',
        message: `Ticket for ${target.fullName} has NOT been paid (Order #${target.bookingId} - ₹${booking?.amount || target.tierPrice}). Payment status is "${booking?.paymentStatus || 'pending'}". Direct attendee to Helpdesk for payment settlement.`,
        participant: target,
        booking: booking
      };
    }

    // 3. Already Checked-In validation check
    if (target.checkInStatus === 'checked_in') {
      showToast(`⚠️ REJECTED: ${target.fullName} is already checked in`, 'info');
      return {
        success: false,
        reason: 'ALREADY_CHECKED_IN',
        title: '⚠️ SCAN REJECTED — ALREADY CHECKED IN',
        message: `Ticket pass for ${target.fullName} was ALREADY scanned & admitted at ${target.checkInTime || 'earlier'}. Duplicate admission blocked!`,
        participant: target,
        booking: booking
      };
    }

    // 4. Approved & Admitted
    const nowStr = new Date().toLocaleString();
    const updated = {
      ...target,
      checkInStatus: 'checked_in',
      checkInTime: nowStr
    };

    setParticipants((prev) =>
      prev.map((p) => (p.id === target.id ? updated : p))
    );

    // Update event checked-in count
    setEvents((prev) =>
      prev.map((evt) =>
        evt.id === target.eventId
          ? { ...evt, checkedInCount: (evt.checkedInCount || 0) + 1 }
          : evt
      )
    );

    showToast(`✓ SCAN APPROVED: ${target.fullName} admitted (${target.tierName})`, 'success');
    return {
      success: true,
      reason: 'APPROVED',
      title: '✓ SCAN APPROVED & ADMITTED',
      message: `Welcome, ${target.fullName}! Validated for ${target.tierName} (Order #${target.bookingId}).`,
      participant: updated,
      booking: booking
    };
  };

  const undoCheckIn = (participantId) => {
    const target = participants.find((p) => p.id === participantId);
    if (!target || target.checkInStatus !== 'checked_in') return;

    setParticipants((prev) =>
      prev.map((p) =>
        p.id === participantId
          ? { ...p, checkInStatus: 'confirmed', checkInTime: null }
          : p
      )
    );

    setEvents((prev) =>
      prev.map((evt) =>
        evt.id === target.eventId
          ? { ...evt, checkedInCount: Math.max(0, (evt.checkedInCount || 1) - 1) }
          : evt
      )
    );

    showToast(`Check-in undone for ${target.fullName}`, 'info');
  };

  // Booking actions
  const updateBookingStatus = (bookingId, newStatus, newPaymentStatus) => {
    setBookings((prev) =>
      prev.map((b) =>
        b.id === bookingId
          ? {
              ...b,
              bookingStatus: newStatus,
              paymentStatus: newPaymentStatus || b.paymentStatus
            }
          : b
      )
    );
    showToast(`Booking ${bookingId} updated to ${newStatus}`, 'success');
  };

  const cancelBooking = async (bookingId, reason) => {
    try {
      const result = await apiRequest(`/organizer/bookings/${bookingId}/cancel`, {
        method: 'POST',
        token: user?.token,
        body: { reason },
      });
      showToast(`Booking cancelled — ₹${Math.round(result.refundAmountPaise / 100)} refund ${result.refundStatus ? `(${result.refundStatus})` : 'processed'}`, 'success');
      await refreshEvents();
      return result;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not cancel this booking.', 'error');
      return null;
    }
  };

  // Settings actions
  const updateAccountSettings = (newAcc) => {
    setSettings((prev) => ({ ...prev, account: { ...prev.account, ...newAcc } }));
    showToast('Account details saved successfully!', 'success');
  };

  const updateOrgSettings = (newOrg) => {
    setSettings((prev) => ({ ...prev, organization: { ...prev.organization, ...newOrg } }));
    showToast('Organization settings updated!', 'success');
  };

  const updateSecuritySettings = (newSec) => {
    setSettings((prev) => ({ ...prev, security: { ...prev.security, ...newSec } }));
    showToast('Security preferences updated!', 'success');
  };

  const updateNotificationSettings = (newNotif) => {
    setSettings((prev) => ({ ...prev, notifications: { ...prev.notifications, ...newNotif } }));
    showToast('Notification channels updated!', 'success');
  };

  return (
    <EventsContext.Provider
      value={{
        events,
        eventsLoadError,
        bookingsLoadError,
        bookings,
        participants,
        payments,
        settings,
        addEvent,
        updateEvent,
        duplicateEvent,
        deleteEvent,
        toggleEventStatus,
        cancelEvent,
        updateEventFull,
        checkInParticipant,
        undoCheckIn,
        updateBookingStatus,
        cancelBooking,
        updateAccountSettings,
        updateOrgSettings,
        updateSecuritySettings,
        updateNotificationSettings
      }}
    >
      {children}
    </EventsContext.Provider>
  );
}

export function useEvents() {
  return useContext(EventsContext);
}
