import { fn, col, where as sqlWhere } from 'sequelize';
import { Booking, Event, Ticket } from '../models';
import {
  issueOtp,
  checkOtp,
  otpResendWaitSeconds,
  clearOtpResendCooldown,
  OTP_EXPIRY_MINUTES,
  OTP_RESEND_COOLDOWN_SECONDS,
} from './otp';
import { sendEmail, isEmailConfigured } from './email';
import { otpMessage } from '../emails/templates';
import { signCustomerSessionToken } from '../auth/jwt';
import { logger, logOtpForDevelopment } from '../logger';
import { ticketLinkToken } from './ticketLinks';
import { isCustomerBlocked } from './accountBlocks';
import { isWhatsAppConfigured, sendWhatsAppTemplate } from './whatsapp/client';

export class NotFoundError extends Error {}
// The booking exists, but the email / phone given isn't the one it was
// booked with.
export class ContactMismatchError extends Error {}
export class LoginValidationError extends Error {}
export class OtpCooldownError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(`Please wait ${retryAfterSeconds} seconds before requesting another code`);
  }
}
// Email isn't configured (production) or the send itself failed.
export class OtpDeliveryError extends Error {}
export class InvalidOtpError extends Error {
  constructor(message = 'Invalid or expired verification code') {
    super(message);
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Booking references look like INV-BKG-XXXXXX (see bookingCreation.ts);
// kept loose so older formats still work.
const BOOKING_REFERENCE_PATTERN = /^[A-Z0-9][A-Z0-9-]{3,39}$/;

// Also accepts a Ticket ID (INV-TKT-2026-XXXXXX-01, printed on the
// ticket itself — see ticketDisplayReference) and maps it back to its
// booking, since customers type whichever ID they have in front of them.
export function normalizeBookingReference(value: string): string {
  const reference = value.trim().toUpperCase().replace(/\s+/g, '');
  const ticketMatch = /^(.+)-TKT-(.+)-\d{2}$/.exec(reference);
  return ticketMatch ? `${ticketMatch[1]}-BKG-${ticketMatch[2]}` : reference;
}

export function phoneDigits(value: string): string {
  return value.replace(/\D/g, '').slice(-10);
}

export type LoginContact = { kind: 'email'; value: string } | { kind: 'phone'; value: string };

// "Email or phone" arrives in one field — an @ means email, otherwise
// it has to be a 10-digit Indian mobile (with or without +91 / 0).
export function parseLoginContact(raw: string): LoginContact {
  const value = raw.trim();
  if (!value) throw new LoginValidationError('Enter the email address or mobile number used for this booking');
  if (value.includes('@')) {
    if (!EMAIL_PATTERN.test(value)) throw new LoginValidationError('Enter a valid email address');
    return { kind: 'email', value: value.toLowerCase() };
  }
  const digits = value.replace(/\D/g, '');
  if (/[^\d\s+()-]/.test(value) || digits.length < 10 || digits.length > 12) {
    throw new LoginValidationError('Enter a valid 10-digit mobile number or an email address');
  }
  return { kind: 'phone', value: digits.slice(-10) };
}

export function validateBookingReference(raw: string): string {
  const reference = normalizeBookingReference(raw);
  if (!reference) throw new LoginValidationError('Enter your Booking ID');
  if (!BOOKING_REFERENCE_PATTERN.test(reference)) {
    throw new LoginValidationError('That doesn\'t look like a Booking ID — it\'s on your confirmation email, e.g. INV-BKG-2026-AB12CD');
  }
  return reference;
}

export function contactMatchesBooking(booking: Booking, contact: LoginContact): boolean {
  if (contact.kind === 'email') return booking.primaryContactEmail.trim().toLowerCase() === contact.value;
  return phoneDigits(booking.primaryContactWhatsapp ?? '') === contact.value;
}

// Booking IDs are shown upper-case everywhere, but people type them in
// whatever case — match case-insensitively.
export async function findBookingByReference(reference: string): Promise<Booking | null> {
  return Booking.findOne({ where: sqlWhere(fn('upper', col('booking_reference')), normalizeBookingReference(reference)) });
}

// Latest booking made with this email / mobile, for customers who log in
// with just their contact and no Booking ID. The OTP still goes to that
// booking's email (and WhatsApp), and the session that follows covers
// every booking made with that email.
export async function findLatestBookingByContact(contact: LoginContact): Promise<Booking | null> {
  if (contact.kind === 'email') {
    return Booking.findOne({
      where: sqlWhere(fn('lower', fn('trim', col('primary_contact_email'))), contact.value),
      order: [['createdAt', 'DESC']],
    });
  }
  return Booking.findOne({
    where: sqlWhere(fn('right', fn('regexp_replace', col('primary_contact_whatsapp'), '\\D', '', 'g'), 10), contact.value),
    order: [['createdAt', 'DESC']],
  });
}

export type LoginIdentifier = LoginContact | { kind: 'booking'; value: string };

// The login form's one field: an email, a mobile number, or a Booking /
// Ticket ID — whichever the customer has to hand.
export function parseLoginIdentifier(raw: string): LoginIdentifier {
  const value = raw.trim();
  if (!value) throw new LoginValidationError('Enter your Booking ID, mobile number or email');
  if (value.includes('@')) return parseLoginContact(value);
  if (/^[\d\s+()-]+$/.test(value)) return parseLoginContact(value);
  return { kind: 'booking', value: validateBookingReference(value) };
}

async function findBookingForIdentifier(identifier: LoginIdentifier): Promise<Booking | null> {
  return identifier.kind === 'booking' ? findBookingByReference(identifier.value) : findLatestBookingByContact(identifier);
}

// "••••3210" — the WhatsApp number the code went to.
export function maskPhone(phone: string): string {
  return `••••${phoneDigits(phone).slice(-4)}`;
}

// "a***n@gmail.com" — enough for the customer to recognize the inbox
// without echoing a full address to whoever typed a phone number.
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.length <= 2 ? local[0] : `${local[0]}${'*'.repeat(Math.min(local.length - 2, 5))}${local[local.length - 1]}`;
  return `${visible}@${domain}`;
}

export interface CustomerLoginInitiateResult {
  // Masked email the code was emailed to (empty when only WhatsApp worked).
  sentTo: string;
  // Masked WhatsApp number the code was sent to, when it was.
  sentToWhatsapp?: string;
  expiresInMinutes: number;
  resendAfterSeconds: number;
}

// Tells the customer exactly what went wrong (unknown Booking ID vs
// contact that doesn't match it) — the earlier "always 200" response
// left people waiting for a code that was never going to arrive. The
// send / verify rate limits in the routes keep guessing slow, and a
// matched contact still has to prove the inbox with the emailed code.
export async function initiateCustomerLogin(bookingReference: string, contactRaw: string): Promise<CustomerLoginInitiateResult> {
  const reference = validateBookingReference(bookingReference);
  const contact = parseLoginContact(contactRaw);

  const booking = await findBookingByReference(reference);
  if (!booking) {
    throw new NotFoundError(`We couldn't find a booking with ID ${reference}. Please check the Booking ID on your confirmation email or WhatsApp message.`);
  }
  if (!contactMatchesBooking(booking, contact)) {
    throw new ContactMismatchError(
      contact.kind === 'email'
        ? 'This email address doesn\'t match the one used for this booking. Please recheck it, or try the mobile number instead.'
        : 'This mobile number doesn\'t match the one used for this booking. Please recheck it, or try the email address instead.',
    );
  }
  return sendCustomerLoginCode(booking);
}

// One-field login: a Booking ID, mobile number or email on its own. The
// code goes to the booking's own email and WhatsApp, so only the person
// who made the booking can finish logging in.
export async function initiateCustomerLoginByIdentifier(raw: string): Promise<CustomerLoginInitiateResult> {
  const identifier = parseLoginIdentifier(raw);
  const booking = await findBookingForIdentifier(identifier);
  if (!booking) {
    throw new NotFoundError(
      identifier.kind === 'booking'
        ? `We couldn't find a booking with ID ${identifier.value}. Please check the Booking ID on your confirmation email or WhatsApp message.`
        : identifier.kind === 'email'
          ? 'We couldn\'t find a booking made with this email address. Please recheck it, or try your mobile number or Booking ID.'
          : 'We couldn\'t find a booking made with this mobile number. Please recheck it, or try your email or Booking ID.',
    );
  }
  return sendCustomerLoginCode(booking);
}

// Sends the code by email and WhatsApp together; either one arriving is
// enough. WhatsApp is best-effort (template not approved yet, number not
// on WhatsApp), and email failing alone isn't fatal when WhatsApp worked.
async function sendCustomerLoginCode(booking: Booking): Promise<CustomerLoginInitiateResult> {
  const email = booking.primaryContactEmail.trim().toLowerCase();
  if (await isCustomerBlocked(email)) {
    throw new ContactMismatchError('This account has been suspended. Please contact support.');
  }
  const wait = await otpResendWaitSeconds('customer_login', email);
  if (wait > 0) throw new OtpCooldownError(wait);

  const code = await issueOtp('customer_login', email);
  const base = { expiresInMinutes: OTP_EXPIRY_MINUTES, resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS };
  const whatsapp = booking.primaryContactWhatsapp?.trim();
  const useWhatsApp = Boolean(whatsapp) && isWhatsAppConfigured();

  if (!isEmailConfigured() && !useWhatsApp) {
    logOtpForDevelopment('customer_login', email, code);
    if (process.env.NODE_ENV === 'production') {
      await clearOtpResendCooldown('customer_login', email);
      throw new OtpDeliveryError('We couldn\'t send the login code right now. Please try again in a few minutes.');
    }
    return { sentTo: maskEmail(email), ...base };
  }

  const [emailSent, whatsAppSent] = await Promise.all([
    (async () => {
      if (!isEmailConfigured()) return false;
      try {
        const message = otpMessage(
          { recipientName: booking.primaryContactName, otpCode: code, expiresInMinutes: OTP_EXPIRY_MINUTES },
          `${code} is your Inveon Events login code`,
        );
        await sendEmail({ to: booking.primaryContactEmail, ...message });
        return true;
      } catch (err) {
        logger.error({ err, bookingReference: booking.bookingReference }, 'Customer login code email failed');
        return false;
      }
    })(),
    (async () => {
      if (!useWhatsApp || !whatsapp) return false;
      try {
        // Authentication template: "{{1}} is your verification code." with
        // a copy-code button, whose value is the code again.
        await sendWhatsAppTemplate({
          message: 'loginCode',
          to: whatsapp,
          recipientName: booking.primaryContactName,
          params: [code],
          urlButtons: [code],
        });
        return true;
      } catch (err) {
        logger.warn({ err, bookingReference: booking.bookingReference }, 'Customer login code WhatsApp failed');
        return false;
      }
    })(),
  ]);

  if (!emailSent && !whatsAppSent) {
    await clearOtpResendCooldown('customer_login', email);
    throw new OtpDeliveryError('We couldn\'t send the login code. Please try again in a moment.');
  }
  return {
    sentTo: emailSent ? maskEmail(email) : '',
    ...(whatsAppSent && whatsapp ? { sentToWhatsapp: maskPhone(whatsapp) } : {}),
    ...base,
  };
}

export interface CustomerLoginResult {
  token: string;
  email: string;
}

// A real OTP match proves the person requesting access actually
// controls this email address — a real step up from the earlier
// booking-reference-plus-email check alone, which anyone who'd seen a
// forwarded confirmation email could satisfy. The issued session
// token is scoped to this email only (see signCustomerSessionToken)
// and is what every following "my bookings" request is verified
// against, not a client-supplied email on each call.
//
// The code was sent to the booking's email, so the booking reference
// (or, for older clients, that email itself) identifies which code to
// check — a customer who logged in with a phone number never has to
// type the email.
export async function verifyCustomerLoginOtp(
  params: { bookingReference?: string; email?: string; identifier?: string },
  code: string,
): Promise<CustomerLoginResult> {
  const trimmedCode = code.trim();
  if (!/^\d{6}$/.test(trimmedCode)) throw new LoginValidationError('Enter the 6-digit code from the email or WhatsApp');

  let email: string;
  if (params.identifier) {
    const booking = await findBookingForIdentifier(parseLoginIdentifier(params.identifier));
    if (!booking) throw new InvalidOtpError('This code has expired. Please request a new one.');
    email = booking.primaryContactEmail.trim().toLowerCase();
  } else if (params.bookingReference) {
    const booking = await findBookingByReference(params.bookingReference);
    if (!booking) throw new InvalidOtpError('This code has expired. Please request a new one.');
    email = booking.primaryContactEmail.trim().toLowerCase();
  } else if (params.email) {
    email = params.email.trim().toLowerCase();
  } else {
    throw new LoginValidationError('Booking ID is required');
  }

  const result = await checkOtp('customer_login', email, trimmedCode);
  if (!result.ok) {
    if (result.reason === 'wrong') {
      throw new InvalidOtpError(
        `That code is incorrect. ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? '' : 's'} left.`,
      );
    }
    if (result.reason === 'locked') throw new InvalidOtpError('Too many incorrect attempts. Please request a new code.');
    throw new InvalidOtpError('This code has expired or was already used. Please request a new one.');
  }
  return { token: signCustomerSessionToken(email), email };
}

export interface CustomerBookingSummary {
  bookingReference: string;
  bookingStatus: 'pending' | 'confirmed' | 'cancelled';
  eventId: string;
  eventName: string;
  eventDate: string;
  bannerUrl: string | null;
  totalAmountPaise: number;
  ticketCount: number;
  // True once the organizer has shared the post-event photos & videos
  // link (only for confirmed bookings — see customerTickets.ts).
  galleryAvailable: boolean;
  // Relative path of the signed ticket page (/t/<token>) for this
  // booking, so "My Bookings" can open the ticket directly.
  ticketPagePath: string;
}

// Every real booking tied to this verified email, across every event
// and every organizer — not scoped to the one booking reference used
// to log in. That's the actual point of this session: once an email
// is proven, every booking made with it becomes visible, the way a
// real account would work, without this codebase needing to build a
// full password-based account system to get there.
export async function getCustomerBookings(email: string): Promise<CustomerBookingSummary[]> {
  const bookings = await Booking.findAll({
    // Case-insensitive: bookings are stored lowercased now (see
    // bookingCreation.ts), but older rows kept whatever casing the
    // customer typed, and the session email is always lowercased.
    where: sqlWhere(fn('lower', col('Booking.primary_contact_email')), email.trim().toLowerCase()),
    include: [{ model: Event, attributes: ['id', 'name', 'eventDate', 'bannerUrl', 'galleryUrl'] }],
    order: [['createdAt', 'DESC']],
  });

  const ticketCounts = await Promise.all(bookings.map((b) => Ticket.count({ where: { bookingId: b.id } })));

  return bookings.map((booking, i) => {
    const event = (booking as unknown as { Event: Event }).Event;
    return {
      bookingReference: booking.bookingReference,
      bookingStatus: booking.status,
      eventId: event?.id ?? '',
      eventName: event?.name ?? 'Unknown event',
      eventDate: event?.eventDate?.toISOString() ?? '',
      bannerUrl: event?.bannerUrl ?? null,
      totalAmountPaise: booking.totalAmountPaise,
      ticketCount: ticketCounts[i],
      galleryAvailable: booking.status === 'confirmed' && Boolean(event?.galleryUrl),
      ticketPagePath: `/t/${ticketLinkToken(booking.bookingReference)}`,
    };
  });
}
