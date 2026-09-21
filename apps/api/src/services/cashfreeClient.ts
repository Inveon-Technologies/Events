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
  return process.env.CASHFREE_ENV === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
}

function authHeaders(): Record<string, string> {
  const appId = process.env.CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY;
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
      pan: params.pan,
    },
  });
}

export async function cashfreeGetVendor(vendorId: string): Promise<CashfreeVendorResponse> {
  return cashfreeRequest<CashfreeVendorResponse>('GET', `/easy-split/vendors/${encodeURIComponent(vendorId)}`);
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
    ...(params.vendorSplit
      ? {
          order_splits: [
            { vendor_id: params.vendorSplit.vendorId, amount: Math.round(params.vendorSplit.amountRupees * 100) / 100 },
          ],
        }
      : {}),
  });
}
