// The customer's "manage my booking" session (issued after the emailed
// one-time code — see VerificationLookupPage) and the form checks shared
// by every page that asks for a Booking ID + email or mobile number.
// The server runs the same checks (apps/api/src/services/customerAuth.ts);
// these only exist so the customer sees the problem before submitting.

import { useEffect, useState } from 'react';

const SESSION_KEY = 'inveon_customer_session';
// Fired on this tab when the session is saved or cleared, so the header
// switches between "Login" and "My Bookings" straight away (the browser's
// own storage event only reaches other tabs).
const SESSION_EVENT = 'inveon-customer-session';

function announce(): void {
  try {
    window.dispatchEvent(new Event(SESSION_EVENT));
  } catch {
    // No window (tests/SSR) — nothing is listening.
  }
}

export interface CustomerSession {
  token: string;
  email: string;
}

export function getCustomerSession(): CustomerSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed.token === 'string' && typeof parsed.email === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCustomerSession(session: CustomerSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Private mode / blocked storage — the login still works for this page.
  }
  announce();
}

export function clearCustomerSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to clear.
  }
  announce();
}

// The current customer session, kept up to date across logins/logouts
// in this tab and others.
export function useCustomerSession(): CustomerSession | null {
  const [session, setSession] = useState<CustomerSession | null>(() => getCustomerSession());
  useEffect(() => {
    const update = () => setSession(getCustomerSession());
    window.addEventListener(SESSION_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(SESSION_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);
  return session;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const BOOKING_REFERENCE_PATTERN = /^[A-Z0-9][A-Z0-9-]{3,39}$/;

export function normalizeBookingReference(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

// Returns an error message, or '' when the value is fine.
export function validateBookingReference(value: string): string {
  const reference = normalizeBookingReference(value);
  if (!reference) return 'Enter your Booking ID';
  if (!BOOKING_REFERENCE_PATTERN.test(reference)) {
    return 'Enter the Booking ID exactly as on your confirmation, e.g. INV-BKG-2026-AB12CD';
  }
  return '';
}

export function validateEmailOrPhone(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'Enter the email address or mobile number used for this booking';
  if (trimmed.includes('@')) return EMAIL_PATTERN.test(trimmed) ? '' : 'Enter a valid email address';
  const digits = trimmed.replace(/\D/g, '');
  if (/[^\d\s+()-]/.test(trimmed) || digits.length < 10 || digits.length > 12) {
    return 'Enter a valid 10-digit mobile number or an email address';
  }
  return '';
}
