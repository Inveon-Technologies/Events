import { Op } from 'sequelize';
import { Organizer, Payment, Booking } from '../models';
import type { CollectionMode } from '../models/Payment';

export class SettlementError extends Error {}

// How an online payment for this organizer's paid tickets is collected.
//
// - A verified organizer (Cashfree vendor ACTIVE) gets a vendor split:
//   Cashfree pays their share straight to their bank account.
// - An organizer who hasn't finished verification (not started, or
//   still in Cashfree's review) is collected into the platform's own
//   Cashfree account instead, and the organizer's share is recorded as
//   owed to them (see getPendingSettlements). Nothing is paid out to
//   them until they're verified — markOrganizerSettled refuses.
// - A vendor Cashfree has BLOCKED gets neither: that's Cashfree flagging
//   the organizer, not an unfinished form, so taking money on their
//   behalf would route around it.
export function collectionModeFor(organizer: Pick<Organizer, 'cashfreeVendorStatus' | 'cashfreeVendorId'> | null): CollectionMode | null {
  if (!organizer) return null;
  if (organizer.cashfreeVendorStatus === 'active' && organizer.cashfreeVendorId) return 'split';
  if (organizer.cashfreeVendorStatus === 'blocked') return null;
  return 'platform';
}

// What the organizer is still owed for one platform-collected payment:
// their share, reduced in proportion to anything refunded to the
// customer (a refund comes out of the platform balance, so the
// organizer's share of that money is no longer owed).
function owedPaise(payment: Payment, booking: Booking | undefined): number {
  const share = payment.organizerSharePaise ?? 0;
  if (payment.amountPaise <= 0) return 0;
  const refunded = Math.min(booking?.refundAmountPaise ?? 0, payment.amountPaise);
  return Math.max(0, Math.round((share * (payment.amountPaise - refunded)) / payment.amountPaise));
}

async function unsettledPayments(organizerId?: string) {
  const payments = await Payment.findAll({
    where: {
      collectionMode: 'platform',
      settlementStatus: 'pending',
      status: { [Op.in]: ['paid', 'refunded'] },
      ...(organizerId ? { organizerId } : {}),
    },
    order: [['createdAt', 'ASC']],
  });
  const bookings = payments.length ? await Booking.findAll({ where: { id: payments.map((p) => p.bookingId) } }) : [];
  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  return payments.map((payment) => {
    const booking = bookingById.get(payment.bookingId);
    return { payment, booking, owedPaise: owedPaise(payment, booking) };
  });
}

export async function getOrganizerPendingSettlementPaise(organizerId: string): Promise<number> {
  const rows = await unsettledPayments(organizerId);
  return rows.reduce((sum, r) => sum + r.owedPaise, 0);
}

export interface PendingSettlementRow {
  organizerId: string;
  organizerName: string;
  verified: boolean;
  paymentCount: number;
  collectedPaise: number;
  owedPaise: number;
  oldestPaymentAt: string;
}

// Every organizer the platform is holding money for, with the amount
// owed — the list a platform admin works from when paying organizers.
export async function getPendingSettlements(): Promise<PendingSettlementRow[]> {
  const rows = await unsettledPayments();
  const byOrganizer = new Map<string, { count: number; collected: number; owed: number; oldest: Date }>();
  for (const { payment, owedPaise: owed } of rows) {
    if (!payment.organizerId) continue;
    const entry = byOrganizer.get(payment.organizerId) ?? { count: 0, collected: 0, owed: 0, oldest: payment.createdAt };
    entry.count += 1;
    entry.collected += payment.amountPaise;
    entry.owed += owed;
    if (payment.createdAt < entry.oldest) entry.oldest = payment.createdAt;
    byOrganizer.set(payment.organizerId, entry);
  }
  const organizers = byOrganizer.size ? await Organizer.findAll({ where: { id: [...byOrganizer.keys()] } }) : [];
  const orgById = new Map(organizers.map((o) => [o.id, o]));
  return [...byOrganizer.entries()]
    .map(([organizerId, e]) => {
      const org = orgById.get(organizerId);
      return {
        organizerId,
        organizerName: org?.name ?? 'Unknown organizer',
        verified: org?.cashfreeVendorStatus === 'active',
        paymentCount: e.count,
        collectedPaise: e.collected,
        owedPaise: e.owed,
        oldestPaymentAt: e.oldest.toISOString(),
      };
    })
    .sort((a, b) => b.owedPaise - a.owedPaise);
}

export interface SettlementResult {
  paymentCount: number;
  settledPaise: number;
}

// Records that the platform has paid an organizer what it was holding
// for them (the transfer itself happens outside this system, e.g. a
// bank transfer or Cashfree Payouts — `reference` is its UTR/transfer
// id). Payment verification is still required for any payout: an
// organizer who isn't a verified Cashfree vendor can't be marked paid.
export async function markOrganizerSettled(organizerId: string, reference: string): Promise<SettlementResult> {
  const ref = reference.trim();
  if (!ref) throw new SettlementError('A transfer reference (UTR or payout id) is required');
  const organizer = await Organizer.findByPk(organizerId);
  if (!organizer) throw new SettlementError('Organizer not found');
  if (organizer.cashfreeVendorStatus !== 'active') {
    throw new SettlementError('This organizer has not completed payment verification — pay out only once they are verified');
  }

  const rows = await unsettledPayments(organizerId);
  if (rows.length === 0) return { paymentCount: 0, settledPaise: 0 };

  const settledAt = new Date();
  await Payment.update(
    { settlementStatus: 'settled', settledAt, settlementReference: ref },
    { where: { id: rows.map((r) => r.payment.id), settlementStatus: 'pending' } },
  );
  return { paymentCount: rows.length, settledPaise: rows.reduce((sum, r) => sum + r.owedPaise, 0) };
}
