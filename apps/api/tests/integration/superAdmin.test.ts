import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { connectRedis, redis } from '../../src/db/redis';
import {
  Organizer,
  User,
  Event,
  TicketCategory,
  Booking,
  Payment,
  Ticket,
  PlatformAdmin,
  PlatformSetting,
  BlockedCustomer,
  NotificationLog,
  AdminAuditLog,
} from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';
import { sendEmail, isEmailConfigured } from '../../src/services/email';
import { createPlatformAdmin, adminPasswordProblems } from '../../src/services/adminAuth';
import { integrationValue, loadPlatformSettings, resetSettingsCacheForTests } from '../../src/services/platformSettings';

jest.mock('../../src/services/email', () => {
  const actual = jest.requireActual('../../src/services/email');
  return { ...actual, sendEmail: jest.fn().mockResolvedValue(undefined), isEmailConfigured: jest.fn().mockReturnValue(true) };
});
jest.mock('../../src/services/bookingEmails', () => {
  const actual = jest.requireActual('../../src/services/bookingEmails');
  return { ...actual, deliverBookingConfirmationEmail: jest.fn().mockResolvedValue(undefined) };
});

const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;
const mockIsEmailConfigured = isEmailConfigured as jest.MockedFunction<typeof isEmailConfigured>;

const SECRET_PATH = 'k7Qp2Vx9LmT4sRw8ZyA1';
const PASSWORD = 'Tr4il-Runner#Sahyadri9';

describe('super admin portal (real DB)', () => {
  const app = createApp();
  const suffix = Date.now();
  const base = `/api/sa/${SECRET_PATH}`;
  const adminEmail = `sa-${suffix}@inveon.example`;
  let token: string;
  let organizerId: string;
  let ownerEmail: string;
  let ownerToken: string;
  let eventId: string;
  let tierId: string;
  let opsDir: string;
  let backupDir: string;

  async function signIn(email = adminEmail, password = PASSWORD): Promise<string> {
    mockSendEmail.mockClear();
    const start = await request(app).post(`${base}/auth/login`).send({ email, password });
    expect(start.status).toBe(200);
    const html = mockSendEmail.mock.calls[0][0].html;
    const code = html.match(/>(\d{6})</)![1];
    const done = await request(app).post(`${base}/auth/verify`).send({ email, code });
    expect(done.status).toBe(200);
    return done.body.token;
  }

  beforeAll(async () => {
    process.env.SUPERADMIN_PATH = SECRET_PATH;
    opsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-ops-'));
    backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-backups-'));
    process.env.OPS_DIR = opsDir;
    process.env.ADMIN_BACKUP_DIR = backupDir;
    await connectRedis();
    mockIsEmailConfigured.mockReturnValue(true);
    await createPlatformAdmin({ email: adminEmail, name: 'Ops Lead', password: PASSWORD });

    const organizer = await Organizer.create({ name: `SA Org ${suffix}`, slug: `sa-org-${suffix}`, cashfreeVendorStatus: 'active' });
    organizerId = organizer.id;
    ownerEmail = `sa-owner-${suffix}@example.com`;
    const owner = await User.create({
      organizerId,
      email: ownerEmail,
      passwordHash: await hashPassword('OwnerPass123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    ownerToken = signAccessToken({ sub: owner.id, role: owner.role, organizerId });
    const created = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: `SA Event ${suffix}`,
        startDate: '2030-01-20',
        startTime: '09:00',
        venueName: 'Hall',
        city: 'Pune',
        ticketTiers: [{ name: 'General', price: 0, quantity: 50 }],
        status: 'published',
      });
    eventId = created.body.id;
    tierId = (await TicketCategory.findOne({ where: { eventId } }))!.id;
  });

  afterAll(async () => {
    delete process.env.SUPERADMIN_PATH;
    const bookings = await Booking.findAll({ where: { eventId } });
    for (const b of bookings) {
      await Payment.destroy({ where: { bookingId: b.id } });
      await Ticket.destroy({ where: { bookingId: b.id } });
    }
    await Booking.destroy({ where: { eventId } });
    await TicketCategory.destroy({ where: { eventId } });
    await Event.destroy({ where: { organizerId } });
    await User.destroy({ where: { organizerId } });
    await Organizer.destroy({ where: { id: organizerId } });
    await PlatformAdmin.destroy({ where: {} });
    await PlatformSetting.destroy({ where: {} });
    await BlockedCustomer.destroy({ where: {} });
    resetSettingsCacheForTests();
    fs.rmSync(opsDir, { recursive: true, force: true });
    fs.rmSync(backupDir, { recursive: true, force: true });
    await redis.quit();
    await sequelize.close();
  });

  it('hides behind the secret path: any other path looks like a missing route', async () => {
    expect((await request(app).get('/api/sa/wrong-path-123456789/ping')).status).toBe(404);
    expect((await request(app).post('/api/sa/nope/auth/login').send({ email: adminEmail, password: PASSWORD })).status).toBe(404);
    const ok = await request(app).get(`${base}/ping`);
    expect(ok.status).toBe(200);
    expect(ok.headers['x-robots-tag']).toContain('noindex');
    // Nothing without a session.
    expect((await request(app).get(`${base}/dashboard`)).status).toBe(401);
  });

  it('insists on a strong password', () => {
    expect(adminPasswordProblems('short')).not.toEqual([]);
    expect(adminPasswordProblems('alllowercaseletters1!')).toContain('an upper-case letter');
    expect(adminPasswordProblems('Password123456!')).not.toEqual([]);
    expect(adminPasswordProblems(PASSWORD)).toEqual([]);
  });

  it('signs in with password + emailed code, never with an organizer token', async () => {
    const wrong = await request(app).post(`${base}/auth/login`).send({ email: adminEmail, password: 'Wrong-Password-123' });
    expect(wrong.status).toBe(401);

    token = await signIn();
    const me = await request(app).get(`${base}/auth/me`).set('Authorization', `Bearer ${token}`);
    expect(me.body.email).toBe(adminEmail);

    const asOrganizer = await request(app).get(`${base}/dashboard`).set('Authorization', `Bearer ${ownerToken}`);
    expect(asOrganizer.status).toBe(401);
    const adminAsOrganizer = await request(app).get('/api/organizer/events').set('Authorization', `Bearer ${token}`);
    expect(adminAsOrganizer.status).toBe(401);

    const otpLog = await NotificationLog.findAll({ where: { channel: 'otp', recipient: adminEmail } });
    expect(otpLog.map((l) => l.status)).toEqual(expect.arrayContaining(['issued', 'verified']));
  });

  it('locks the account after 5 wrong passwords', async () => {
    const email = `sa-lock-${suffix}@inveon.example`;
    await createPlatformAdmin({ email, name: 'Lock Test', password: PASSWORD });
    for (let i = 0; i < 5; i += 1) {
      await request(app).post(`${base}/auth/login`).send({ email, password: 'Wrong-Password-123' });
    }
    const locked = await request(app).post(`${base}/auth/login`).send({ email, password: PASSWORD });
    expect(locked.status).toBe(423);
  });

  it('shows the dashboard and platform-wide lists', async () => {
    await request(app)
      .post(`/api/events/${eventId}/bookings`)
      .send({
        ticketCategoryId: tierId,
        quantity: 1,
        primaryContactName: 'Asha',
        primaryContactWhatsapp: '9876543210',
        primaryContactEmail: `asha-${suffix}@example.com`,
        paymentMethod: 'cash',
      });
    const auth = { Authorization: `Bearer ${token}` };
    const dash = await request(app).get(`${base}/dashboard`).set(auth);
    expect(dash.status).toBe(200);
    expect(dash.body.totals.organizers).toBeGreaterThanOrEqual(1);
    expect(dash.body.daily).toHaveLength(30);

    const orgs = await request(app).get(`${base}/organizers?q=SA Org ${suffix}`).set(auth);
    expect(orgs.body.organizers[0]).toMatchObject({ id: organizerId, events: 1 });
    const customers = await request(app).get(`${base}/customers?q=asha-${suffix}`).set(auth);
    expect(customers.body.customers[0]).toMatchObject({ email: `asha-${suffix}@example.com`, bookings: 1 });
    expect((await request(app).get(`${base}/bookings?q=asha-${suffix}`).set(auth)).body.total).toBe(1);
    expect((await request(app).get(`${base}/payments?q=asha-${suffix}`).set(auth)).status).toBe(200);
    expect((await request(app).get(`${base}/events?q=SA Event ${suffix}`).set(auth)).body.events[0].id).toBe(eventId);
    expect((await request(app).get(`${base}/system`).set(auth)).body.database.ok).toBe(true);
    expect((await request(app).get(`${base}/queue`).set(auth)).status).toBe(200);
  });

  it('blocks an organizer (login, open sessions and their public events) and unblocks them', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    expect((await request(app).post(`${base}/organizers/${organizerId}/block`).set(auth).send({ reason: 'KYC fraud' })).status).toBe(200);

    const login = await request(app).post('/api/auth/login').send({ email: ownerEmail, password: 'OwnerPass123' });
    expect(login.status).toBe(403);
    expect(login.body.suspended).toBe(true);
    expect((await request(app).get('/api/organizer/events').set('Authorization', `Bearer ${ownerToken}`)).status).toBe(403);
    expect((await request(app).get(`/api/events/${eventId}`)).status).toBe(404);

    await request(app).post(`${base}/organizers/${organizerId}/unblock`).set(auth);
    expect((await request(app).post('/api/auth/login').send({ email: ownerEmail, password: 'OwnerPass123' })).status).toBe(200);
    expect((await request(app).get(`/api/events/${eventId}`)).status).toBe(200);
  });

  it('blocks a customer email from booking', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const email = `blocked-${suffix}@example.com`;
    await request(app).post(`${base}/customers/block`).set(auth).send({ email: email.toUpperCase(), reason: 'chargebacks' });
    const booking = await request(app).post(`/api/events/${eventId}/bookings`).send({
      ticketCategoryId: tierId,
      quantity: 1,
      primaryContactName: 'Blocked',
      primaryContactWhatsapp: '9876543211',
      primaryContactEmail: email,
      paymentMethod: 'cash',
    });
    expect(booking.status).toBe(400);
    expect(booking.body.error).toMatch(/not allowed/);
    await request(app).post(`${base}/customers/unblock`).set(auth).send({ email });
    expect(await BlockedCustomer.count({ where: { email } })).toBe(0);
  });

  it('saves branding (public everywhere) and integration secrets (encrypted, masked)', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const bad = await request(app).put(`${base}/settings/branding`).set(auth).send({ primaryColor: 'blue' });
    expect(bad.status).toBe(400);
    const saved = await request(app)
      .put(`${base}/settings/branding`)
      .set(auth)
      .send({ platformName: 'Inveon Events Pro', logoUrl: '/api/uploads/platform/logo.png', primaryColor: '#112233' });
    expect(saved.status).toBe(200);
    const pub = await request(app).get('/api/platform/branding');
    expect(pub.body).toMatchObject({
      platformName: 'Inveon Events Pro',
      logoUrl: '/api/uploads/platform/logo.png',
      primaryColor: '#112233',
    });

    const footer = await request(app)
      .put(`${base}/settings/certificate-footer`)
      .set(auth)
      .send({ bookingPartnerLabel: 'TICKETING PARTNER' });
    expect(footer.body.bookingPartnerLabel).toBe('TICKETING PARTNER');
    expect(pub.body.certificateFooter).toBeDefined();

    const integ = await request(app)
      .put(`${base}/settings/integrations`)
      .set(auth)
      .send({ AISENSY_API_KEY: 'aisensy-secret-key-9876', WHATSAPP_PROVIDER: 'aisensy' });
    expect(integ.body.changed).toEqual(['AISENSY_API_KEY', 'WHATSAPP_PROVIDER']);
    const field = integ.body.integrations.whatsapp.find((f: { key: string }) => f.key === 'AISENSY_API_KEY');
    expect(field).toMatchObject({ source: 'portal', value: '••••••9876', secret: true });
    const stored = await PlatformSetting.findByPk('integrations');
    expect(JSON.stringify(stored!.value)).not.toContain('aisensy-secret-key');
    await loadPlatformSettings();
    expect(integrationValue('AISENSY_API_KEY')).toBe('aisensy-secret-key-9876');

    const audit = await AdminAuditLog.findOne({ where: { action: 'settings.integrations' } });
    expect(JSON.stringify(audit!.details)).not.toContain('aisensy-secret-key');
  });

  it('makes a downloadable .zip backup of the database', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const created = await request(app).post(`${base}/backups`).set(auth);
    expect(created.status).toBe(201);
    expect(created.body.name).toMatch(/^inveon-backup-.*\.zip$/);
    const zip = fs.readFileSync(path.join(backupDir, created.body.name));
    expect(zip.subarray(0, 2).toString()).toBe('PK');
    expect(zip.includes(Buffer.from('database/events.dump'))).toBe(true);
    expect(zip.includes(Buffer.from('MANIFEST.json'))).toBe(true);

    const list = await request(app).get(`${base}/backups`).set(auth);
    expect(list.body.backups.map((b: { name: string }) => b.name)).toContain(created.body.name);
    const download = await request(app).get(`${base}/backups/${created.body.name}`).set(auth).buffer(true);
    expect(download.status).toBe(200);
    expect((await request(app).get(`${base}/backups/..%2F..%2Fetc%2Fpasswd`).set(auth)).status).toBe(400);
    expect((await request(app).delete(`${base}/backups/${created.body.name}`).set(auth)).status).toBe(200);
  }, 60000);

  it('talks to the server helper through the ops folder, with a fixed set of actions', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const noHelper = await request(app).post(`${base}/server/actions`).set(auth).send({ action: 'prune_images' });
    expect(noHelper.status).toBe(400);

    fs.mkdirSync(path.join(opsDir, 'requests'));
    fs.mkdirSync(path.join(opsDir, 'logs'));
    fs.writeFileSync(
      path.join(opsDir, 'status.json'),
      JSON.stringify({ generatedAt: new Date().toISOString(), containers: [{ name: 'events_api', state: 'running' }] }),
    );
    fs.writeFileSync(path.join(opsDir, 'logs', 'events_api.log'), 'line one\nline two\n');

    const status = await request(app).get(`${base}/server`).set(auth);
    expect(status.body).toMatchObject({ connected: true, stale: false, logs: ['events_api'] });
    const log = await request(app).get(`${base}/server/logs/events_api`).set(auth);
    expect(log.text).toContain('line two');
    expect((await request(app).get(`${base}/server/logs/..%2Fstatus`).set(auth)).status).toBe(400);

    expect((await request(app).post(`${base}/server/actions`).set(auth).send({ action: 'rm -rf /' })).status).toBe(400);
    expect(
      (await request(app).post(`${base}/server/actions`).set(auth).send({ action: 'restart_container', target: 'x; reboot' })).status,
    ).toBe(400);
    const ok = await request(app)
      .post(`${base}/server/actions`)
      .set(auth)
      .send({ action: 'truncate_container_logs', target: 'events_api' });
    expect(ok.status).toBe(202);
    const requestFile = JSON.parse(fs.readFileSync(path.join(opsDir, 'requests', `${ok.body.id}.json`), 'utf8'));
    expect(requestFile).toMatchObject({ action: 'truncate_container_logs', target: 'events_api', requestedBy: adminEmail });
  });

  it('records every admin action in the audit log', async () => {
    const res = await request(app).get(`${base}/audit`).set('Authorization', `Bearer ${token}`);
    const actions = res.body.logs.map((l: { action: string }) => l.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'login.success',
        'organizer.blocked',
        'customer.blocked',
        'backup.created',
        'server.truncate_container_logs',
      ]),
    );
  });

  it('ends the session when the password changes', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const weak = await request(app).post(`${base}/auth/change-password`).set(auth).send({ currentPassword: PASSWORD, newPassword: 'weak' });
    expect(weak.status).toBe(400);
    const changed = await request(app)
      .post(`${base}/auth/change-password`)
      .set(auth)
      .send({ currentPassword: PASSWORD, newPassword: 'Monsoon-Fort#Rajgad42' });
    expect(changed.status).toBe(200);
    expect((await request(app).get(`${base}/auth/me`).set(auth)).status).toBe(401);
    expect((await request(app).get(`${base}/auth/me`).set('Authorization', `Bearer ${changed.body.token}`)).status).toBe(200);
  });
});
