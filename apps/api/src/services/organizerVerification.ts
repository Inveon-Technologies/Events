import { Organizer, User } from '../models';
import { cashfreeCreateVendor, cashfreeGetVendor, CashfreeVendorResponse, CashfreeApiError } from './cashfreeClient';
import type { CashfreeVendorStatus, KycAccountType } from '../models/Organizer';

export class ValidationError extends Error {}
export class NotFoundError extends Error {}

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

// Cashfree requires a business_type value for every vendor regardless
// of account type (confirmed against their real API — see
// cashfreeClient.ts). For an individual organizer there's no
// meaningful business category to ask them for, and this platform is
// specifically event ticketing, so that's the sensible fixed default
// rather than a confusing extra question on the KYC form.
const DEFAULT_INDIVIDUAL_BUSINESS_TYPE = 'Events & Entertainment';

function mapCashfreeStatus(status: CashfreeVendorResponse['status']): CashfreeVendorStatus {
  switch (status) {
    case 'ACTIVE':
      return 'active';
    case 'BLOCKED':
      return 'blocked';
    case 'DELETED':
      return 'deleted';
    default:
      return 'in_bene_creation';
  }
}

// A UUID contains hyphens, which Cashfree's vendor_id does not allow
// (alphanumeric and underscore only per their docs) — strips them
// rather than generating a separate id to track, so the vendor id
// stays deterministically derivable from the organizer id.
function vendorIdForOrganizer(organizerId: string): string {
  return `org_${organizerId.replace(/-/g, '')}`;
}

export interface SubmitVerificationParams {
  organizerId: string;
  panNumber: string;
  accountType: KycAccountType;
  businessType?: string;
  contactPhone: string;
  bankAccountHolderName: string;
  bankAccountNumber: string;
  bankIfsc: string;
}

export interface VerificationResult {
  cashfreeVendorStatus: CashfreeVendorStatus;
}

export async function submitOrganizerVerification(params: SubmitVerificationParams): Promise<VerificationResult> {
  const organizer = await Organizer.findByPk(params.organizerId);
  if (!organizer) throw new NotFoundError('Organizer not found');

  const pan = params.panNumber.trim().toUpperCase();
  if (!PAN_PATTERN.test(pan)) {
    throw new ValidationError('Enter a valid PAN number (format: AAAAA9999A)');
  }
  const ifsc = params.bankIfsc.trim().toUpperCase();
  if (!IFSC_PATTERN.test(ifsc)) {
    throw new ValidationError('Enter a valid bank IFSC code');
  }
  const accountNumber = params.bankAccountNumber.trim();
  if (!/^\d{6,20}$/.test(accountNumber)) {
    throw new ValidationError('Enter a valid bank account number');
  }
  if (!params.bankAccountHolderName.trim()) {
    throw new ValidationError('Bank account holder name is required');
  }
  if (!params.contactPhone.trim()) {
    throw new ValidationError('Contact phone is required');
  }
  if (params.accountType === 'business' && !params.businessType?.trim()) {
    throw new ValidationError('Business type is required for a business account');
  }
  // Cashfree requires business_type for every vendor, individual or
  // business — an individual gets the fixed platform-category default
  // above; a business account uses what they actually entered (just
  // validated above as present).
  const businessTypeForCashfree = params.accountType === 'business' ? params.businessType!.trim() : DEFAULT_INDIVIDUAL_BUSINESS_TYPE;

  // The organizer's own owner account's real login email — a Cashfree
  // vendor record needs a real contact email, and Organizer.contactEmail
  // is an optional field that's frequently unset (nothing has required
  // it until now).
  const owner = await User.findOne({ where: { organizerId: organizer.id, role: 'organizer_owner' } });
  if (!owner) throw new ValidationError('This organizer has no owner account to register as a vendor');

  const vendorId = organizer.cashfreeVendorId || vendorIdForOrganizer(organizer.id);

  let vendorResponse: CashfreeVendorResponse;
  try {
    vendorResponse = await cashfreeCreateVendor({
      vendorId,
      name: organizer.name,
      email: owner.email,
      phone: params.contactPhone.trim(),
      accountHolder: params.bankAccountHolderName.trim(),
      accountNumber,
      ifsc,
      accountType: params.accountType === 'business' ? 'BUSINESS' : 'INDIVIDUAL',
      pan,
      businessType: businessTypeForCashfree,
    });
  } catch (err) {
    if (err instanceof CashfreeApiError) {
      throw new ValidationError(err.message);
    }
    // Deliberately not wrapped into ValidationError — that would read to
    // the organizer as "something you entered was wrong," when this is
    // actually the server having no working Cashfree credentials at
    // all. Left to propagate as-is so the route can return it with its
    // own distinct status.
    throw err;
  }

  await organizer.update({
    panNumber: pan,
    kycAccountType: params.accountType,
    businessType: params.accountType === 'business' ? params.businessType?.trim() || null : null,
    contactPhone: params.contactPhone.trim(),
    bankAccountHolderName: params.bankAccountHolderName.trim(),
    bankAccountNumberLast4: accountNumber.slice(-4),
    bankIfsc: ifsc,
    cashfreeVendorId: vendorResponse.vendor_id,
    cashfreeVendorStatus: mapCashfreeStatus(vendorResponse.status),
  });

  return { cashfreeVendorStatus: organizer.cashfreeVendorStatus };
}

export async function refreshOrganizerVerificationStatus(organizerId: string): Promise<VerificationResult> {
  const organizer = await Organizer.findByPk(organizerId);
  if (!organizer) throw new NotFoundError('Organizer not found');
  if (!organizer.cashfreeVendorId) {
    throw new ValidationError('Verification has not been submitted yet');
  }

  const vendorResponse = await cashfreeGetVendor(organizer.cashfreeVendorId);
  await organizer.update({ cashfreeVendorStatus: mapCashfreeStatus(vendorResponse.status) });

  return { cashfreeVendorStatus: organizer.cashfreeVendorStatus };
}
