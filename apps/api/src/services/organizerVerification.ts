import { Organizer, User } from '../models';
import {
  cashfreeCreateVendor,
  cashfreeUpdateVendor,
  cashfreeGetVendor,
  cashfreeGetVendorDocs,
  CashfreeVendorResponse,
  CashfreeVendorDocStatus,
  CashfreeApiError,
  CASHFREE_BUSINESS_TYPES,
  CashfreeBusinessType,
} from './cashfreeClient';
import type { CashfreeVendorStatus, KycAccountType } from '../models/Organizer';

// Cashfree's own vendor-level status has no "rejected"/"failed" value
// — a verification that never completes just sits in
// IN_BENE_CREATION forever, identical to one still genuinely being
// processed. Real penny-drop/KYC review normally resolves within
// minutes to a couple of days; well past that with no change is the
// real signal something needs the organizer's attention, not Cashfree
// simply being slow.
const STALLED_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export class ValidationError extends Error {}
export class NotFoundError extends Error {}

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

// Cashfree requires a business_type value for every vendor regardless
// of account type (confirmed against their real API — see
// cashfreeClient.ts), and only from their fixed enum — any other
// string is rejected outright ("Invalid business type"). For an
// individual organizer there's no meaningful category to ask them to
// pick from that list, so this platform picks the closest fit itself:
// "Social Media and Entertainment" is the exact value Cashfree's own
// documented example pairs with an individual account for this kind
// of activity.
const DEFAULT_INDIVIDUAL_BUSINESS_TYPE: CashfreeBusinessType = 'Social Media and Entertainment';

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
  if (params.accountType === 'business' && !CASHFREE_BUSINESS_TYPES.includes(params.businessType!.trim() as CashfreeBusinessType)) {
    throw new ValidationError(`Business type must be one of Cashfree's accepted categories`);
  }
  // Cashfree requires business_type for every vendor, individual or
  // business — an individual gets the fixed platform-category default
  // above; a business account uses what they actually entered (just
  // validated above as present and one of Cashfree's accepted values).
  const businessTypeForCashfree: CashfreeBusinessType =
    params.accountType === 'business' ? (params.businessType!.trim() as CashfreeBusinessType) : DEFAULT_INDIVIDUAL_BUSINESS_TYPE;

  // The organizer's own owner account's real login email — a Cashfree
  // vendor record needs a real contact email, and Organizer.contactEmail
  // is an optional field that's frequently unset (nothing has required
  // it until now).
  const owner = await User.findOne({ where: { organizerId: organizer.id, role: 'organizer_owner' } });
  if (!owner) throw new ValidationError('This organizer has no owner account to register as a vendor');

  const vendorId = organizer.cashfreeVendorId || vendorIdForOrganizer(organizer.id);
  // A vendor_id that already exists (a resubmission after a stalled
  // or failed verification) has to go through Cashfree's real update
  // endpoint — their create endpoint is for a vendor that doesn't
  // exist yet and rejects a duplicate id outright.
  const isResubmission = Boolean(organizer.cashfreeVendorId);

  let vendorResponse: CashfreeVendorResponse;
  try {
    const vendorParams = {
      vendorId,
      name: organizer.name,
      email: owner.email,
      phone: params.contactPhone.trim(),
      accountHolder: params.bankAccountHolderName.trim(),
      accountNumber,
      ifsc,
      accountType: (params.accountType === 'business' ? 'BUSINESS' : 'INDIVIDUAL') as 'BUSINESS' | 'INDIVIDUAL',
      pan,
      businessType: businessTypeForCashfree,
    };
    vendorResponse = isResubmission ? await cashfreeUpdateVendor(vendorId, vendorParams) : await cashfreeCreateVendor(vendorParams);
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
    kycSubmittedAt: new Date(),
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

export interface OrganizerVerificationDetail {
  cashfreeVendorStatus: CashfreeVendorStatus;
  panNumber: string | null;
  kycAccountType: KycAccountType | null;
  businessType: string | null;
  bankAccountHolderName: string | null;
  bankAccountNumberLast4: string | null;
  bankIfsc: string | null;
  contactPhone: string | null;
  kycSubmittedAt: string | null;
  // Real elapsed time since submission past a generous threshold —
  // not a guess at an undocumented "rejected" status Cashfree's API
  // doesn't actually expose. This is the honest signal: verification
  // is taking far longer than penny-drop/KYC review normally does,
  // so something likely needs the organizer's attention rather than
  // just more waiting.
  likelyStalled: boolean;
  // Raw per-document review status and remarks, exactly as Cashfree
  // reports them — surfaced as-is rather than reinterpreted, since
  // Cashfree's own docs don't enumerate every status string this can
  // return and guessing at which ones mean "failed" risks hiding a
  // real rejection behind a made-up "still fine" label.
  documents: { docType: string; status: string; remarks: string | null }[] | null;
}

export async function getOrganizerVerificationDetail(organizerId: string): Promise<OrganizerVerificationDetail> {
  const organizer = await Organizer.findByPk(organizerId);
  if (!organizer) throw new NotFoundError('Organizer not found');

  let documents: CashfreeVendorDocStatus[] | null = null;
  // No point calling Cashfree for document review detail once fully
  // verified, or before anything's even been submitted — this is only
  // useful while genuinely waiting on a real, in-progress or possibly
  // stalled verification.
  if (organizer.cashfreeVendorId && organizer.cashfreeVendorStatus === 'in_bene_creation') {
    try {
      documents = await cashfreeGetVendorDocs(organizer.cashfreeVendorId);
    } catch {
      // Best-effort — the core status fields below are still real and
      // useful even if this particular Cashfree call fails.
      documents = null;
    }
  }

  const likelyStalled =
    organizer.cashfreeVendorStatus === 'in_bene_creation' &&
    organizer.kycSubmittedAt !== null &&
    Date.now() - organizer.kycSubmittedAt.getTime() > STALLED_THRESHOLD_MS;

  return {
    cashfreeVendorStatus: organizer.cashfreeVendorStatus,
    panNumber: organizer.panNumber,
    kycAccountType: organizer.kycAccountType,
    businessType: organizer.businessType,
    bankAccountHolderName: organizer.bankAccountHolderName,
    bankAccountNumberLast4: organizer.bankAccountNumberLast4,
    bankIfsc: organizer.bankIfsc,
    contactPhone: organizer.contactPhone,
    kycSubmittedAt: organizer.kycSubmittedAt?.toISOString() ?? null,
    likelyStalled,
    documents: documents?.map((d) => ({ docType: d.doc_type, status: d.status, remarks: d.remarks })) ?? null,
  };
}
