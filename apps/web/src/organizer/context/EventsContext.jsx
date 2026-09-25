import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNotifications } from './NotificationContext';
import { useAuth } from './AuthContext';
import { istParts } from '../lib/istTime';
import { apiRequest, ApiError } from '../lib/api';

const EventsContext = createContext();

// Neutral placeholder for an event with no photos yet — never a stock
// photo, which made it look like the organizer's image hadn't saved.
const PLACEHOLDER_BANNER =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 600'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%23dbeafe'/><stop offset='1' stop-color='%23e2e8f0'/></linearGradient></defs><rect width='1200' height='600' fill='url(%23g)'/><text x='600' y='315' font-family='sans-serif' font-size='40' fill='%2394a3b8' text-anchor='middle'>No cover photo yet</text></svg>";

// Maps GET /api/organizer/events (see apps/api/src/services/organizerEvents.ts)
// onto the shape every page in this portal expects. This backend doesn't
// track everything that shape has room for yet (category, short/long description, venue city/state/
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
    startDate: istParts(d).date,
    startTime: istParts(d).time,
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
    checkedInCount: e.checkedInCount ?? 0,
    grossRevenue: Math.round(e.revenuePaise / 100),
  };
}

// Maps GET /api/organizer/bookings?eventId=all onto the shape every page
// reading `bookings` expects. ticketIds
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
    bookingDate: `${istParts(d).date} ${istParts(d).time}`,
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

// Map pins as the API expects them (without the geocoding helper fields
// LocationPicker keeps for filling the address form), plus the main
// venue's coordinates — the venue point, or the only point.
// Title background + Partners & Supporters (see TicketDesignEditor).
// Rows with neither a name nor a logo are left out.
function ticketDesignPayload(data) {
  return {
    ticketBackgroundUrl: data.ticketBackgroundUrl || null,
    partners: (data.partners || [])
      .filter((p) => (p.name || '').trim() || p.logoUrl)
      .map((p) => ({ name: (p.name || '').trim(), role: (p.role || '').trim() || null, logoUrl: p.logoUrl || null })),
  };
}

function locationPayload(points) {
  const cleaned = (points || []).map((p) => ({
    type: p.type,
    label: p.label,
    address: p.address || null,
    latitude: p.latitude,
    longitude: p.longitude,
    time: p.time || null,
    note: p.note || null,
  }));
  const primary = cleaned.find((p) => p.type === 'venue') ?? (cleaned.length === 1 ? cleaned[0] : null);
  return {
    locationPoints: cleaned,
    ...(primary ? { venueLatitude: primary.latitude, venueLongitude: primary.longitude } : {}),
  };
}

// The bookings endpoint caps pageSize at 100 — a single request (the
// previous behavior) silently showed organizers with more bookings than
// that an incomplete list. Pages through until every booking is loaded.
const BOOKINGS_PAGE_SIZE = 100;
async function fetchAllOrganizerBookings(token) {
  const all = [];
  for (let page = 1; ; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const data = await apiRequest(`/organizer/bookings?eventId=all&pageSize=${BOOKINGS_PAGE_SIZE}&page=${page}`, { token });
    all.push(...data.bookings);
    const total = data.pagination?.total ?? all.length;
    if (data.bookings.length < BOOKINGS_PAGE_SIZE || all.length >= total) return all;
  }
}

export function EventsProvider({ children }) {
  const { showToast } = useNotifications();
  const { user } = useAuth();

  // Events and bookings are real, per-organizer data: they always come
  // from the API for whoever is logged in, start empty, and are never
  // cached in localStorage — a cache there outlived logout, so the next
  // person on the same browser saw the previous organizer's events and
  // customer bookings (and everyone briefly saw mock events before the
  // real ones loaded).
  const [events, setEvents] = useState([]);
  const [bookings, setBookings] = useState([]);

  const [eventsLoadError, setEventsLoadError] = useState(null);
  // False until the first events request for this session settles —
  // lets pages tell "still loading" apart from "no such event".
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [bookingsLoadError, setBookingsLoadError] = useState(null);

  // Real data: events and bookings (across every event this organizer
  // owns). Attendees, payments and settings are loaded by their own pages
  // straight from the API; nothing here is mock data any more.
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

  // Logging out (or a session expiring) drops the previous organizer's
  // data from memory immediately, not just from storage.
  useEffect(() => {
    if (user?.isLoggedIn) return;
    setEvents([]);
    setBookings([]);
    setEventsLoaded(false);
    setEventsLoadError(null);
    setBookingsLoadError(null);
  }, [user?.isLoggedIn]);

  useEffect(() => {
    if (!user?.isLoggedIn || !user?.token) return;
    let cancelled = false;

    apiRequest('/organizer/events', { token: user.token })
      .then((data) => {
        if (cancelled) return;
        setEvents(data.events.map(apiEventToMockShape));
        setEventsLoadError(null);
        setEventsLoaded(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setEventsLoadError(err.message ?? 'Failed to load events');
        setEventsLoaded(true);
      });

    fetchAllOrganizerBookings(user.token)
      .then((allBookings) => {
        if (cancelled) return;
        setBookings(allBookings.map(apiBookingToMockShape));
        setBookingsLoadError(null);
      })
      .catch((err) => {
        if (!cancelled) setBookingsLoadError(err.message ?? 'Failed to load bookings');
      });

    return () => {
      cancelled = true;
    };
  }, [user?.isLoggedIn, user?.token]);

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
        ...locationPayload(newEvent.locationPoints),
        bannerImage: newEvent.bannerImage,
        ...ticketDesignPayload(newEvent),
        genderRestriction: newEvent.genderRestriction || null,
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
          ...locationPayload(formData.locationPoints),
          bannerImage: formData.bannerImage,
          ...ticketDesignPayload(formData),
          genderRestriction: formData.genderRestriction || null,
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

  return (
    <EventsContext.Provider
      value={{
        events,
        eventsLoaded,
        eventsLoadError,
        bookingsLoadError,
        bookings,
        addEvent,
        updateEvent,
        duplicateEvent,
        deleteEvent,
        toggleEventStatus,
        cancelEvent,
        updateEventFull,
        cancelBooking,
      }}
    >
      {children}
    </EventsContext.Provider>
  );
}

export function useEvents() {
  return useContext(EventsContext);
}
