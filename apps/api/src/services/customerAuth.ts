import { fn, col, where as sqlWhere } from 'sequelize';
import { Booking, Event, Ticket } from '../models';
import { issueOtp, verifyOtp, OTP_EXPIRY_MINUTES } from './otp';
import { sendEmail, isEmailConfigured } from './email';
import { otpEmail } from '../emails/templates';
import { signCustomerSessionToken } from '../auth/jwt';

export class NotFoundError extends Error {}
export class InvalidOtpError extends Error {
  constructor() {
    super('Invalid or expired verification code');
  }
}

// Same enumeration-safe "not found" whether the booking reference is
// wrong or the email just doesn't match it — matches every other
// customer-facing verification in this codebase (feedback,
// cancellation, ticket viewing).
export async function initiateCustomerLogin(bookingReference: string, contactEmail: string): Promise<void> {
  const booking = await Booking.findOne({ where: { bookingReference: bookingReference.trim() } });
  if (!booking || booking.primaryContactEmail.toLowerCase() !== contactEmail.trim().toLowerCase()) {
    throw new NotFoundError('Booking not found');
  }

  const code = await issueOtp('customer_login', contactEmail.trim().toLowerCase());

  if (isEmailConfigured()) {
    const html = otpEmail({ recipientName: booking.primaryContactName, otpCode: code, expiresInMinutes: OTP_EXPIRY_MINUTES });
    await sendEmail({ to: booking.primaryContactEmail, subject: `Your Inveon Events login code: ${code}`, html });
  }
}

export interface CustomerLoginResult {
  token: string;
}

// A real OTP match proves the person requesting access actually
// controls this email address — a real step up from the earlier
// booking-reference-plus-email check alone, which anyone who'd seen a
// forwarded confirmation email could satisfy. The issued session
// token is scoped to this email only (see signCustomerSessionToken)
// and is what every following "my bookings" request is verified
// against, not a client-supplied email on each call.
export async function verifyCustomerLoginOtp(contactEmail: string, code: string): Promise<CustomerLoginResult> {
  const email = contactEmail.trim().toLowerCase();
  const valid = await verifyOtp('customer_login', email, code.trim());
  if (!valid) throw new InvalidOtpError();
  return { token: signCustomerSessionToken(email) };
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
    include: [{ model: Event, attributes: ['id', 'name', 'eventDate', 'bannerUrl'] }],
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
    };
  });
}
