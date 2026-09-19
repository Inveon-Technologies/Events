import React, { createContext, useContext, useState, useEffect } from 'react';
import { INITIAL_EVENTS } from '../data/mockEvents';
import { INITIAL_BOOKINGS } from '../data/mockBookings';
import { INITIAL_PARTICIPANTS } from '../data/mockParticipants';
import { INITIAL_PAYMENTS } from '../data/mockPayments';
import { INITIAL_SETTINGS } from '../data/mockSettings';
import { useNotifications } from './NotificationContext';
import { useAuth } from './AuthContext';
import { apiRequest } from '../lib/api';

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
  const addEvent = (newEvent) => {
    const eventWithId = {
      ...newEvent,
      id: newEvent.id || `event-${Date.now()}`,
      ticketsSold: 0,
      checkedInCount: 0,
      grossRevenue: 0,
      status: newEvent.status || 'published'
    };
    setEvents((prev) => [eventWithId, ...prev]);
    showToast(`Event "${eventWithId.title}" created successfully!`, 'success');
    return eventWithId;
  };

  const updateEvent = (id, updatedFields) => {
    setEvents((prev) =>
      prev.map((evt) => (evt.id === id ? { ...evt, ...updatedFields } : evt))
    );
    showToast('Event updated successfully!', 'success');
  };

  const duplicateEvent = (id) => {
    const original = events.find((e) => e.id === id);
    if (!original) return;
    const duplicated = {
      ...original,
      id: `${original.id}-copy-${Date.now()}`,
      title: `${original.title} (Copy)`,
      status: 'draft',
      ticketsSold: 0,
      checkedInCount: 0,
      grossRevenue: 0
    };
    setEvents((prev) => [duplicated, ...prev]);
    showToast(`Duplicated "${original.title}" as a draft`, 'info');
  };

  const deleteEvent = (id) => {
    const event = events.find((e) => e.id === id);
    setEvents((prev) => prev.filter((e) => e.id !== id));
    showToast(`Event "${event?.title || id}" deleted`, 'info');
  };

  const toggleEventStatus = (id, newStatus) => {
    setEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: newStatus } : e))
    );
    showToast(`Event status updated to ${newStatus}`, 'success');
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

  const processRefund = (bookingId, amount) => {
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) return;

    updateBookingStatus(bookingId, 'cancelled', 'refunded');

    // Mark participants cancelled
    setParticipants((prev) =>
      prev.map((p) =>
        p.bookingId === bookingId ? { ...p, checkInStatus: 'cancelled' } : p
      )
    );

    // Add refund transaction
    const newTxn = {
      id: `TXN-${Date.now().toString().slice(-6)}`,
      date: new Date().toLocaleString(),
      bookingId: bookingId,
      customerName: booking.customerName,
      eventName: booking.eventName,
      amount: -Math.abs(amount || booking.amount),
      gatewayFee: 0,
      platformFee: 0,
      netAmount: -Math.abs(amount || booking.amount),
      paymentMethod: 'Refund to Source',
      status: 'refunded'
    };

    setPayments((prev) => ({
      ...prev,
      transactions: [newTxn, ...prev.transactions],
      summary: {
        ...prev.summary,
        refundedAmount: prev.summary.refundedAmount + Math.abs(amount || booking.amount)
      }
    }));

    showToast(`Refund of ₹${amount || booking.amount} processed for ${booking.customerName}`, 'success');
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
        checkInParticipant,
        undoCheckIn,
        updateBookingStatus,
        processRefund,
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
