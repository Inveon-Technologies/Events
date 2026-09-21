import request from 'supertest';
import { createApp } from '../../src/app';
import { signAccessToken } from '../../src/auth/jwt';
import { Organizer, User } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { sequelize } from '../../src/db/connection';
import { cashfreeCreateVendor, cashfreeGetVendor, CashfreeApiError, CashfreeVendorResponse, CashfreeNotConfiguredError } from '../../src/services/cashfreeClient';
import { submitOrganizerVerification, refreshOrganizerVerificationStatus, ValidationError, NotFoundError } from '../../src/services/organizerVerification';

jest.mock('../../src/services/cashfreeClient', () => {
  const actual = jest.requireActual('../../src/services/cashfreeClient');
  return {
    ...actual,
    cashfreeCreateVendor: jest.fn(),
    cashfreeGetVendor: jest.fn(),
  };
});

const mockCreateVendor = cashfreeCreateVendor as jest.MockedFunction<typeof cashfreeCreateVendor>;
const mockGetVendor = cashfreeGetVendor as jest.MockedFunction<typeof cashfreeGetVendor>;

function fakeVendorResponse(overrides: Partial<CashfreeVendorResponse> = {}, organizerId = ''): CashfreeVendorResponse {
  return {
    vendor_id: `org_${organizerId.replace(/-/g, '')}`,
    status: 'IN_BENE_CREATION',
    name: 'Test Org',
    email: 'owner@example.com',
    phone: '+919000000001',
    bank: null,
    ...overrides,
  };
}

describe('organizer verification (real DB, Cashfree API mocked)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let token: string;

  const validParams = () => ({
    organizerId,
    panNumber: 'ABCDE1234F',
    accountType: 'individual' as const,
    contactPhone: '+919000000001',
    bankAccountHolderName: 'Test Owner',
    bankAccountNumber: '123456789012',
    bankIfsc: 'HDFC0001234',
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const organizer = await Organizer.create({
      name: `Verification Test Org ${suffix}-${Math.random()}`,
      slug: `verification-test-org-${suffix}-${Math.random().toString(36).slice(2)}`,
    });
    organizerId = organizer.id;
    const owner = await User.create({
      organizerId,
      email: `verification-owner-${suffix}-${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    token = signAccessToken({ sub: owner.id, role: owner.role, organizerId });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it('rejects an invalid PAN format without ever calling Cashfree', async () => {
    await expect(submitOrganizerVerification({ ...validParams(), panNumber: 'not-a-pan' })).rejects.toThrow(ValidationError);
    expect(mockCreateVendor).not.toHaveBeenCalled();
  });

  it('a business account sends the entered business type to Cashfree, not the individual default', async () => {
    mockCreateVendor.mockResolvedValue(fakeVendorResponse({}, organizerId));
    await submitOrganizerVerification({ ...validParams(), accountType: 'business', businessType: 'Trekking & Outdoor Adventure' });
    const callArgs = mockCreateVendor.mock.calls[0][0];
    expect(callArgs.businessType).toBe('Trekking & Outdoor Adventure');
    expect(callArgs.accountType).toBe('BUSINESS');
  });

  it('rejects a business account with no business type entered, before ever calling Cashfree', async () => {
    await expect(
      submitOrganizerVerification({ ...validParams(), accountType: 'business', businessType: '' }),
    ).rejects.toThrow(/business type is required/i);
    expect(mockCreateVendor).not.toHaveBeenCalled();
  });

  it('rejects an invalid IFSC format', async () => {
    await expect(submitOrganizerVerification({ ...validParams(), bankIfsc: 'bad-ifsc' })).rejects.toThrow(ValidationError);
    expect(mockCreateVendor).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric bank account number', async () => {
    await expect(submitOrganizerVerification({ ...validParams(), bankAccountNumber: 'abc123' })).rejects.toThrow(ValidationError);
  });

  it('creates a real Cashfree vendor with a valid, hyphen-free vendor_id, and stores only the last 4 digits of the account number', async () => {
    mockCreateVendor.mockResolvedValue(fakeVendorResponse({}, organizerId));

    const result = await submitOrganizerVerification(validParams());

    expect(result.cashfreeVendorStatus).toBe('in_bene_creation');
    expect(mockCreateVendor).toHaveBeenCalledTimes(1);
    const callArgs = mockCreateVendor.mock.calls[0][0];
    expect(callArgs.vendorId).not.toMatch(/-/); // no hyphens — Cashfree rejects them
    expect(callArgs.accountNumber).toBe('123456789012');
    expect(callArgs.accountType).toBe('INDIVIDUAL');
    // Cashfree rejects a request with no business_type at all (real bug
    // caught testing against the real sandbox API) — an individual
    // account gets the fixed platform default rather than sending
    // nothing.
    expect(callArgs.businessType).toBe('Events & Entertainment');

    const organizer = await Organizer.findByPk(organizerId);
    expect(organizer!.bankAccountNumberLast4).toBe('9012');
    expect(organizer!.cashfreeVendorStatus).toBe('in_bene_creation');
    expect(organizer!.cashfreeVendorId).toBe(callArgs.vendorId);
  });

  it('maps every real Cashfree vendor status onto the correct local status', async () => {
    const cases: [CashfreeVendorResponse['status'], string][] = [
      ['ACTIVE', 'active'],
      ['IN_BENE_CREATION', 'in_bene_creation'],
      ['BLOCKED', 'blocked'],
      ['DELETED', 'deleted'],
    ];
    for (const [cashfreeStatus, expectedLocal] of cases) {
      mockCreateVendor.mockResolvedValue(fakeVendorResponse({ status: cashfreeStatus }, organizerId));
      // eslint-disable-next-line no-await-in-loop
      const result = await submitOrganizerVerification(validParams());
      expect(result.cashfreeVendorStatus).toBe(expectedLocal);
    }
  });

  it('a Cashfree API error surfaces as a real, readable ValidationError, not a raw crash', async () => {
    mockCreateVendor.mockRejectedValue(new CashfreeApiError('Invalid IFSC provided', 400, {}));
    await expect(submitOrganizerVerification(validParams())).rejects.toThrow('Invalid IFSC provided');
  });

  it('refreshing status for an organizer with no vendor submitted yet is rejected', async () => {
    await expect(refreshOrganizerVerificationStatus(organizerId)).rejects.toThrow(ValidationError);
  });

  it('refreshing status for a nonexistent organizer is a clean NotFoundError', async () => {
    await expect(refreshOrganizerVerificationStatus('00000000-0000-0000-0000-000000000000')).rejects.toThrow(NotFoundError);
  });

  it('refresh calls the real Get Vendor API and updates the stored status', async () => {
    mockCreateVendor.mockResolvedValue(fakeVendorResponse({}, organizerId));
    await submitOrganizerVerification(validParams());

    mockGetVendor.mockResolvedValue(fakeVendorResponse({ status: 'ACTIVE' }, organizerId));
    const refreshed = await refreshOrganizerVerificationStatus(organizerId);
    expect(refreshed.cashfreeVendorStatus).toBe('active');

    const organizer = await Organizer.findByPk(organizerId);
    expect(organizer!.cashfreeVendorStatus).toBe('active');
  });

  it('POST /organizer/verification and GET /organizer/verification work end to end over real HTTP, with a real auth token', async () => {
    mockCreateVendor.mockResolvedValue(fakeVendorResponse({}, organizerId));

    const submitRes = await request(app)
      .post('/api/organizer/verification')
      .set('Authorization', `Bearer ${token}`)
      .send(validParams());
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.cashfreeVendorStatus).toBe('in_bene_creation');

    const getRes = await request(app).get('/api/organizer/verification').set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.cashfreeVendorStatus).toBe('in_bene_creation');
    expect(getRes.body.bankAccountNumberLast4).toBe('9012');
    expect(getRes.body.panNumber).toBe('ABCDE1234F');
  });

  it('POST /organizer/verification rejects an invalid PAN over real HTTP with 400, and never calls Cashfree', async () => {
    const res = await request(app)
      .post('/api/organizer/verification')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validParams(), panNumber: 'nope' });
    expect(res.status).toBe(400);
    expect(mockCreateVendor).not.toHaveBeenCalled();
  });

  it('the verification endpoints reject requests with no auth token', async () => {
    const res = await request(app).get('/api/organizer/verification');
    expect(res.status).toBe(401);
  });

  it('POST /organizer/verification/refresh works end to end over real HTTP', async () => {
    mockCreateVendor.mockResolvedValue(fakeVendorResponse({}, organizerId));
    await request(app).post('/api/organizer/verification').set('Authorization', `Bearer ${token}`).send(validParams());

    mockGetVendor.mockResolvedValue(fakeVendorResponse({ status: 'ACTIVE' }, organizerId));
    const refreshRes = await request(app).post('/api/organizer/verification/refresh').set('Authorization', `Bearer ${token}`);
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.cashfreeVendorStatus).toBe('active');
  });

  it('a missing Cashfree configuration surfaces as a clear 503, not a generic 500 "something went wrong"', async () => {
    mockCreateVendor.mockRejectedValue(new CashfreeNotConfiguredError());
    const res = await request(app)
      .post('/api/organizer/verification')
      .set('Authorization', `Bearer ${token}`)
      .send(validParams());
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not available right now/i);
    expect(res.body.error).not.toMatch(/something went wrong/i);
  });
});
