import { integrationValue, cashfreeMode } from './platformSettings';
// Cashfree's actual documented API contract (verified live against
// cashfree.com/docs before writing this, given this handles real money
// and training data can be stale): base URLs, auth headers, and the
// order/vendor payload shapes below all match their current (2026-01-01)
// API reference. Not something to guess from memory.

const CASHFREE_API_VERSION = process.env.CASHFREE_API_VERSION || '2023-08-01';

function baseUrl(): string {
  // Sandbox is the default specifically so a missing/misconfigured env
  // var fails toward "nothing happens in a real account" rather than
  // toward "silently starts hitting production."
  return cashfreeMode() === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
}

function authHeaders(): Record<string, string> {
  const appId = integrationValue('CASHFREE_APP_ID');
  const secretKey = integrationValue('CASHFREE_SECRET_KEY');
  if (!appId || !secretKey) {
    throw new CashfreeNotConfiguredError();
  }
  return {
    'x-client-id': appId,
    'x-client-secret': secretKey,
    'x-api-version': CASHFREE_API_VERSION,
    'Content-Type': 'application/json',
  };
}

// Distinct from CashfreeApiError (a real, reachable Cashfree API
// rejecting a request) — this is a configuration problem on our own
// side that happens before any request is even sent. Callers need to
// tell the two apart: an unconfigured server should tell the person
// "this isn't set up yet, contact support," never a validation-shaped
// message that reads as if something they entered was wrong.
export class CashfreeNotConfiguredError extends Error {
  constructor() {
    super('Payment verification is not available right now. Please try again later or contact support.');
  }
}

export class CashfreeApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
  }
}

async function cashfreeRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as { message?: string })?.message || `Cashfree API error (${res.status})`;
    throw new CashfreeApiError(message, res.status, data);
  }
  return data as T;
}

// ---- Easy Split (vendor) ----

// The exact, fixed enum Cashfree validates kyc_details.business_type
// against — confirmed directly from a real 400 response ("Invalid
// business type. Please choose from the accepted business types:
// [...]"), not documented anywhere in their API reference pages. Any
// other string is rejected outright, so both the individual default
// below and the business-account dropdown this list feeds on the
// frontend have to stay within it exactly.
export const CASHFREE_BUSINESS_TYPES = [
  'Grocery',
  'Jewellery',
  'Miscellaneous',
  'Web host/Domain seller',
  'E-commerce',
  'Online Gaming',
  'Society/Trust/Club/Association',
  'Mutual funds/Broking',
  'B2B',
  'Real Estate',
  'Housing',
  'Rentals',
  'Utilities',
  'Travel and Hospitality',
  'Education',
  'Food and Beverages',
  'NBFCs/Organizations into Lending',
  'Chit Funds',
  'Non Profit/NGO',
  'Financial Services',
  'Government',
  'Readymade',
  'SaaS',
  'Professional Services (Doctors, Lawyers, Architects, CAs, and other Professionals)',
  'Open and Semi Open Wallet',
  'Social Media and Entertainment',
  'Pan shop',
  'Telecom',
  'Digital Goods',
  'Insurance',
  'Pharmacy',
  'Healthcare',
  'Retail and Shopping',
  'Gaming',
  'Logistics',
] as const;

export type CashfreeBusinessType = (typeof CASHFREE_BUSINESS_TYPES)[number];

export interface CreateVendorParams {
  vendorId: string;
  name: string;
  email: string;
  phone: string;
  accountHolder: string;
  accountNumber: string;
  ifsc: string;
  accountType: 'INDIVIDUAL' | 'BUSINESS';
  pan: string;
  // Cashfree requires this for every vendor regardless of account_type
  // — confirmed against their real API, not assumed: their own
  // documented examples pair account_type "Individual" with a
  // business_type value too, and a real request missing it is rejected
  // outright ("kyc_details.business_type is missing in the request").
  businessType: CashfreeBusinessType;
}

export interface CashfreeVendorResponse {
  vendor_id: string;
  status: 'ACTIVE' | 'IN_BENE_CREATION' | 'BLOCKED' | 'DELETED';
  name: string;
  email: string;
  phone: string;
  bank: { account_number: string; account_holder: string; ifsc: string } | null;
}

export async function cashfreeCreateVendor(params: CreateVendorParams): Promise<CashfreeVendorResponse> {
  return cashfreeRequest<CashfreeVendorResponse>('POST', '/easy-split/vendors', {
    vendor_id: params.vendorId,
    status: 'ACTIVE',
    name: params.name,
    email: params.email,
    phone: params.phone,
    // Tells Cashfree to run bank-account verification as part of
    // onboarding — this is the actual "bank verified" step, not
    // something this codebase does itself. The vendor starts in
    // IN_BENE_CREATION regardless and Cashfree moves it to ACTIVE
    // asynchronously once verification completes.
    verify_account: true,
    dashboard_access: false,
    schedule_option: 1,
    bank: {
      account_number: params.accountNumber,
      account_holder: params.accountHolder,
      ifsc: params.ifsc,
    },
    kyc_details: {
      account_type: params.accountType,
      business_type: params.businessType,
      pan: params.pan,
    },
  });
}

export async function cashfreeGetVendor(vendorId: string): Promise<CashfreeVendorResponse> {
  return cashfreeRequest<CashfreeVendorResponse>('GET', `/easy-split/vendors/${encodeURIComponent(vendorId)}`);
}

// Cashfree's vendor-level status (ACTIVE/IN_BENE_CREATION/BLOCKED/
// DELETED) has no dedicated "rejected" or "failed" value at all — a
// verification that fails penny-drop or KYC review simply never
// leaves IN_BENE_CREATION, indistinguishable at that level from one
// that's still genuinely in progress. This per-document endpoint is
// the real signal: each submitted KYC item (PAN, bank account, etc.)
// carries its own review status and, when something's actually wrong,
// a real remarks string explaining what.
export interface CashfreeVendorDocStatus {
  vendor_id: string;
  doc_type: string;
  doc_value: string;
  status: string;
  remarks: string | null;
}

export async function cashfreeGetVendorDocs(vendorId: string): Promise<CashfreeVendorDocStatus[]> {
  const response = await cashfreeRequest<{ related_docs: CashfreeVendorDocStatus[] }>(
    'GET',
    `/easy-split/vendor-docs/${encodeURIComponent(vendorId)}`,
  );
  return response.related_docs;
}

// Corrects an existing vendor's details (a real resubmission after a
// stalled or failed verification) — Cashfree's create endpoint is for
// a vendor_id that doesn't exist yet and would reject a duplicate, so
// fixing a typo'd IFSC or account number after the fact has to go
// through this real PATCH endpoint instead.
export async function cashfreeUpdateVendor(vendorId: string, params: CreateVendorParams): Promise<CashfreeVendorResponse> {
  return cashfreeRequest<CashfreeVendorResponse>('PATCH', `/easy-split/vendors/${encodeURIComponent(vendorId)}`, {
    status: 'ACTIVE',
    name: params.name,
    email: params.email,
    phone: params.phone,
    verify_account: true,
    dashboard_access: false,
    schedule_option: 1,
    bank: {
      account_number: params.accountNumber,
      account_holder: params.accountHolder,
      ifsc: params.ifsc,
    },
    kyc_details: {
      account_type: params.accountType,
      business_type: params.businessType,
      pan: params.pan,
    },
  });
}

// ---- Orders ----

export interface CreateOrderParams {
  orderId: string;
  orderAmountRupees: number;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  vendorSplit?: { vendorId: string; amountRupees: number };
  returnUrl: string;
  notifyUrl: string;
  // When the payment session stops accepting payment. Without it
  // Cashfree defaults to 30 days — far longer than this platform holds
  // a pending booking's reserved tickets (see pendingBookingExpiry.ts).
  expiresAt?: Date;
  // Free-form key/value tags stored on the Cashfree order and shown in
  // the Cashfree dashboard — used to record which organizer and customer
  // a platform-collected payment belongs to, for settling later.
  orderTags?: Record<string, string>;
  orderNote?: string;
}

export interface CashfreeOrderResponse {
  cf_order_id: string;
  order_id: string;
  order_status: string;
  payment_session_id: string;
  order_expiry_time: string;
}

export async function cashfreeCreateOrder(params: CreateOrderParams): Promise<CashfreeOrderResponse> {
  return cashfreeRequest<CashfreeOrderResponse>('POST', '/orders', {
    order_id: params.orderId,
    order_amount: Math.round(params.orderAmountRupees * 100) / 100,
    order_currency: 'INR',
    customer_details: {
      customer_id: params.customerId,
      customer_name: params.customerName,
      customer_email: params.customerEmail,
      customer_phone: params.customerPhone,
    },
    order_meta: {
      return_url: params.returnUrl,
      notify_url: params.notifyUrl,
    },
    ...(params.expiresAt ? { order_expiry_time: params.expiresAt.toISOString() } : {}),
    ...(params.orderTags ? { order_tags: params.orderTags } : {}),
    ...(params.orderNote ? { order_note: params.orderNote } : {}),
    ...(params.vendorSplit
      ? {
          order_splits: [
            { vendor_id: params.vendorSplit.vendorId, amount: Math.round(params.vendorSplit.amountRupees * 100) / 100 },
          ],
        }
      : {}),
  });
}

// Order status as Cashfree currently sees it — ACTIVE (awaiting
// payment), PAID, EXPIRED, or TERMINATED. Used to double-check a
// pending booking before releasing its tickets, in case the payment
// webhook was delayed or lost.
export async function cashfreeGetOrder(orderId: string): Promise<CashfreeOrderResponse> {
  return cashfreeRequest<CashfreeOrderResponse>('GET', `/orders/${encodeURIComponent(orderId)}`);
}

// Payment attempts on an order. A PENDING one means the customer is
// paying right now (e.g. approving a UPI request) — its seats must not
// be released under them.
export interface CashfreeOrderPayment {
  cf_payment_id: string | number;
  payment_status: 'SUCCESS' | 'NOT_ATTEMPTED' | 'FAILED' | 'USER_DROPPED' | 'VOID' | 'CANCELLED' | 'PENDING';
}

export async function cashfreeGetOrderPayments(orderId: string): Promise<CashfreeOrderPayment[]> {
  return cashfreeRequest<CashfreeOrderPayment[]>('GET', `/orders/${encodeURIComponent(orderId)}/payments`);
}

// ---- Refunds ----

export interface CreateRefundParams {
  orderId: string; // the same order_id used at order creation — this codebase always sets it to the booking reference
  refundId: string; // must be unique — reusing one for a second refund attempt on the same order is rejected
  refundAmountRupees: number;
  refundNote: string;
}

export interface CashfreeRefundResponse {
  cf_refund_id: string;
  refund_id: string;
  order_id: string;
  refund_amount: number;
  refund_status: 'SUCCESS' | 'PENDING' | 'FAILED' | 'ONHOLD' | 'CANCELLED';
  status_description?: string;
}

// No explicit refund_splits — left to Cashfree's own default behavior
// (reversing the vendor's portion proportionally to the original
// order_splits), rather than this codebase re-deriving what should
// already be the correct reversal from data Cashfree already has.
export async function cashfreeCreateRefund(params: CreateRefundParams): Promise<CashfreeRefundResponse> {
  return cashfreeRequest<CashfreeRefundResponse>('POST', `/orders/${encodeURIComponent(params.orderId)}/refunds`, {
    refund_amount: Math.round(params.refundAmountRupees * 100) / 100,
    refund_id: params.refundId,
    refund_note: params.refundNote,
    refund_speed: 'STANDARD',
  });
}
