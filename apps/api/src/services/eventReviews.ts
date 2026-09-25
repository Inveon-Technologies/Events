import { Event, EventReview } from '../models';
import { findBookingByReference } from './customerAuth';

export class NotFoundError extends Error {}
export class ValidationError extends Error {}

export interface SubmitReviewParams {
  bookingReference: string;
  email: string;
  rating: number;
  reviewText?: string;
}

export interface SubmittedReview {
  id: string;
  rating: number;
  reviewText: string | null;
}

export async function submitReview(params: SubmitReviewParams): Promise<SubmittedReview> {
  // Booking reference + registered email — not a full OTP flow like a
  // real "manage my booking" action would need. Leaving a review is a
  // low-stakes action (nothing changes for the booking itself, nothing
  // financial), so this matches the bar most real review systems use
  // for "prove you were the customer" (an order number + the email it
  // was placed under), not the higher bar a cancellation or ticket
  // view would warrant.
  const booking = await findBookingByReference(params.bookingReference);
  if (!booking) throw new NotFoundError('Booking not found');

  if (booking.primaryContactEmail.toLowerCase() !== params.email.trim().toLowerCase()) {
    // Same message as "not found" — confirming a booking reference is
    // real but the email is wrong would let someone enumerate valid
    // references by trial and error.
    throw new NotFoundError('Booking not found');
  }

  if (booking.status !== 'confirmed') {
    throw new ValidationError('This booking is not eligible for feedback');
  }

  const event = await Event.findByPk(booking.eventId);
  if (!event) throw new NotFoundError('Booking not found');

  if (event.eventDate.getTime() > Date.now()) {
    throw new ValidationError('Feedback can only be left after the event has taken place');
  }

  const existing = await EventReview.findOne({ where: { bookingId: booking.id } });
  if (existing) {
    throw new ValidationError('Feedback has already been submitted for this booking');
  }

  if (!Number.isInteger(params.rating) || params.rating < 1 || params.rating > 5) {
    throw new ValidationError('Rating must be a whole number from 1 to 5');
  }

  const review = await EventReview.create({
    bookingId: booking.id,
    eventId: booking.eventId,
    organizerId: event.organizerId,
    rating: params.rating,
    reviewText: params.reviewText?.trim() || null,
    customerName: booking.primaryContactName,
  });

  return { id: review.id, rating: review.rating, reviewText: review.reviewText };
}

export interface PublicReview {
  id: string;
  rating: number;
  reviewText: string | null;
  customerName: string;
  createdAt: string;
}

export interface RatingSummary {
  averageRating: number | null;
  reviewCount: number;
}

export async function getEventReviews(eventId: string): Promise<PublicReview[]> {
  const reviews = await EventReview.findAll({ where: { eventId }, order: [['createdAt', 'DESC']] });
  return reviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    reviewText: r.reviewText,
    // First name + last-initial, not the full name — a public review
    // list is exactly the kind of place a customer's full real name
    // shouldn't appear against their honest opinion of an event without
    // them having agreed to that specifically.
    customerName: toDisplayName(r.customerName),
    createdAt: r.createdAt.toISOString(),
  }));
}

function toDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

export async function getEventRatingSummary(eventId: string): Promise<RatingSummary> {
  const reviews = await EventReview.findAll({ where: { eventId }, attributes: ['rating'] });
  if (reviews.length === 0) return { averageRating: null, reviewCount: 0 };
  const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
  return { averageRating: Math.round((sum / reviews.length) * 10) / 10, reviewCount: reviews.length };
}

export async function getOrganizerRatingSummary(organizerId: string): Promise<RatingSummary> {
  const reviews = await EventReview.findAll({ where: { organizerId }, attributes: ['rating'] });
  if (reviews.length === 0) return { averageRating: null, reviewCount: 0 };
  const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
  return { averageRating: Math.round((sum / reviews.length) * 10) / 10, reviewCount: reviews.length };
}
