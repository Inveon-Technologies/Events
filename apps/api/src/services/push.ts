import jwt from 'jsonwebtoken';
import { WhereOptions } from 'sequelize';
import { MobileDevice, MobileNotification } from '../models';
import type { MobileApp } from '../models/MobileDevice';
import { integrationValue } from './platformSettings';
import { logger } from '../logger';

// Push notifications for the Flutter apps through Firebase Cloud
// Messaging's HTTP v1 API. Signed in with a service account (Settings →
// Integrations, or FIREBASE_* in .env) — no Firebase SDK needed: the
// OAuth token is a JWT exchanged at Google's token endpoint.
//
// Every message is stored in mobile_notifications first (the in-app
// inbox), then pushed. When Firebase isn't set up the inbox still fills.

export interface PushMessage {
  kind: string;
  title: string;
  body: string;
  // Read by the app to open the right screen (all values strings: FCM
  // data payloads only carry strings).
  data?: Record<string, string>;
}

export type PushAudience =
  | { app: 'customer'; customerEmail: string }
  | { app: 'organizer'; organizerId: string }
  // Every install of an app (e.g. "update available"), optionally only
  // those older than a version.
  | { app: MobileApp; broadcast: true; olderThan?: string };

interface FirebaseCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

function firebaseCredentials(): FirebaseCredentials | null {
  const projectId = integrationValue('FIREBASE_PROJECT_ID');
  const clientEmail = integrationValue('FIREBASE_CLIENT_EMAIL');
  // Pasted keys usually arrive with literal "\n" for line breaks.
  const privateKey = integrationValue('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

export function isPushConfigured(): boolean {
  return firebaseCredentials() !== null;
}

let cachedToken: { key: string; token: string; expiresAt: number } | null = null;

async function accessToken(creds: FirebaseCredentials): Promise<string> {
  const key = `${creds.clientEmail}:${creds.privateKey.length}`;
  if (cachedToken && cachedToken.key === key && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: creds.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    creds.privateKey,
    { algorithm: 'RS256' },
  );
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`Firebase sign-in failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { key, token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

// "1.10.2" vs "1.9.0" → positive. Missing parts count as 0; anything
// after a "+" or "-" (build number, pre-release) is ignored.
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v
      .split(/[+-]/)[0]
      .split('.')
      .map((p) => Number.parseInt(p, 10) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

async function devicesFor(audience: PushAudience): Promise<MobileDevice[]> {
  let where: WhereOptions<MobileDevice>;
  if ('broadcast' in audience) where = { app: audience.app };
  else if (audience.app === 'customer') where = { app: 'customer', customerEmail: audience.customerEmail.trim().toLowerCase() };
  else where = { app: 'organizer', organizerId: audience.organizerId };
  const devices = await MobileDevice.findAll({ where });
  if ('broadcast' in audience && audience.olderThan) {
    const latest = audience.olderThan;
    return devices.filter((d) => !d.appVersion || compareVersions(d.appVersion, latest) < 0);
  }
  return devices;
}

async function sendToDevice(creds: FirebaseCredentials, token: string, device: MobileDevice, message: PushMessage): Promise<boolean> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(creds.projectId)}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: device.fcmToken,
        notification: { title: message.title, body: message.body },
        data: { kind: message.kind, ...(message.data ?? {}) },
        android: { priority: 'HIGH', notification: { channel_id: 'inveon_default', sound: 'default' } },
        apns: { payload: { aps: { sound: 'default' } } },
      },
    }),
  });
  if (res.ok) return true;
  const text = await res.text();
  // The app was uninstalled or the token rotated: forget it.
  if (res.status === 404 || /UNREGISTERED|registration-token-not-registered/.test(text)) {
    await MobileDevice.destroy({ where: { id: device.id } });
    return false;
  }
  logger.warn({ status: res.status, body: text.slice(0, 500), deviceId: device.id }, 'Push send failed');
  return false;
}

export interface PushResult {
  stored: boolean;
  devices: number;
  sent: number;
}

// Stores the message in the in-app inbox (not for broadcasts — those are
// shown from the app's own update check) and pushes it to every device
// of the audience. Never throws for a single device failing.
export async function sendPush(audience: PushAudience, message: PushMessage): Promise<PushResult> {
  const result: PushResult = { stored: false, devices: 0, sent: 0 };
  if (!('broadcast' in audience)) {
    await MobileNotification.create({
      app: audience.app,
      customerEmail: audience.app === 'customer' ? audience.customerEmail.trim().toLowerCase() : null,
      organizerId: audience.app === 'organizer' ? audience.organizerId : null,
      kind: message.kind,
      title: message.title.slice(0, 200),
      body: message.body.slice(0, 1000),
      data: message.data ?? null,
      readAt: null,
    });
    result.stored = true;
  }

  const creds = firebaseCredentials();
  if (!creds) return result;
  const devices = await devicesFor(audience);
  result.devices = devices.length;
  if (devices.length === 0) return result;

  const token = await accessToken(creds);
  // Small batches: a broadcast to thousands of installs shouldn't open
  // thousands of connections at once.
  for (let i = 0; i < devices.length; i += 20) {
    const batch = devices.slice(i, i + 20);
    // eslint-disable-next-line no-await-in-loop
    const sent = await Promise.all(batch.map((d) => sendToDevice(creds, token, d, message).catch(() => false)));
    result.sent += sent.filter(Boolean).length;
  }
  return result;
}

// ---- device registration (routes/mobile.ts) ----

export interface RegisterDeviceInput {
  app: MobileApp;
  platform: 'android' | 'ios';
  fcmToken: string;
  appVersion: string | null;
  customerEmail?: string | null;
  userId?: string | null;
  organizerId?: string | null;
}

// Upsert by token. Signing in links the install to the person; a
// registration without a session (signed out) unlinks it, so a shared
// phone stops getting the previous person's notifications.
export async function registerDevice(input: RegisterDeviceInput): Promise<void> {
  const values = {
    app: input.app,
    platform: input.platform,
    fcmToken: input.fcmToken,
    appVersion: input.appVersion,
    customerEmail: input.customerEmail ? input.customerEmail.trim().toLowerCase() : null,
    userId: input.userId ?? null,
    organizerId: input.organizerId ?? null,
    lastSeenAt: new Date(),
  };
  const existing = await MobileDevice.findOne({ where: { fcmToken: input.fcmToken } });
  if (existing) await existing.update(values);
  else await MobileDevice.create(values);
}

export async function unregisterDevice(fcmToken: string): Promise<void> {
  await MobileDevice.update({ customerEmail: null, userId: null, organizerId: null }, { where: { fcmToken } });
}
