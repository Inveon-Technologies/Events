import { Booking, Event, Ticket } from '../models';
import type { MobileApp, MobilePlatform } from '../models/MobileDevice';
import { getStoredSetting, saveSetting } from './platformSettings';
import { compareVersions, sendPush, PushResult } from './push';
import { logger } from '../logger';

// ---- version check: "a new version is available" ----
//
// Each app asks GET /api/mobile/app-config on launch and on resume. A
// release bumps latestVersion in the super admin portal (Mobile apps):
// older installs see a "new features" prompt they can dismiss, and
// anything below minVersion gets a blocking "update to continue".

export interface MobileAppRelease {
  latestVersion: string;
  minVersion: string;
  androidStoreUrl: string | null;
  iosStoreUrl: string | null;
  // "What's new" lines shown in the update prompt.
  releaseNotes: string[];
}

export type MobileAppsSettings = Record<MobileApp, MobileAppRelease>;

const DEFAULT_RELEASE: MobileAppRelease = {
  latestVersion: '1.0.0',
  minVersion: '1.0.0',
  androidStoreUrl: null,
  iosStoreUrl: null,
  releaseNotes: [],
};

export const MOBILE_APPS: readonly MobileApp[] = ['customer', 'organizer'];
const VERSION = /^\d+(\.\d+){0,3}$/;

export function getMobileAppsSettings(): MobileAppsSettings {
  const stored = (getStoredSetting('mobileApps') ?? {}) as Partial<Record<MobileApp, Partial<MobileAppRelease>>>;
  return {
    customer: { ...DEFAULT_RELEASE, ...(stored.customer ?? {}) },
    organizer: { ...DEFAULT_RELEASE, ...(stored.organizer ?? {}) },
  };
}

export class MobileAppsValidationError extends Error {}

function cleanRelease(current: MobileAppRelease, input: unknown): MobileAppRelease {
  const body = (input ?? {}) as Record<string, unknown>;
  const next = { ...current };
  for (const key of ['latestVersion', 'minVersion'] as const) {
    if (body[key] === undefined) continue;
    const v = String(body[key]).trim();
    if (!VERSION.test(v)) throw new MobileAppsValidationError(`${key} must look like 1.2.0`);
    next[key] = v;
  }
  for (const key of ['androidStoreUrl', 'iosStoreUrl'] as const) {
    if (body[key] === undefined) continue;
    const v = body[key] === null ? '' : String(body[key]).trim();
    if (v && !/^https:\/\/[^\s"'<>]+$/.test(v)) throw new MobileAppsValidationError(`${key} must be an https link`);
    next[key] = v || null;
  }
  if (body.releaseNotes !== undefined) {
    const notes = Array.isArray(body.releaseNotes) ? body.releaseNotes : String(body.releaseNotes).split('\n');
    next.releaseNotes = notes
      .map((n) => String(n).trim().slice(0, 200))
      .filter(Boolean)
      .slice(0, 10);
  }
  if (compareVersions(next.minVersion, next.latestVersion) > 0) {
    throw new MobileAppsValidationError('The minimum version cannot be newer than the latest version');
  }
  return next;
}

export async function saveMobileAppRelease(app: MobileApp, input: unknown, updatedBy: string): Promise<MobileAppsSettings> {
  const settings = getMobileAppsSettings();
  settings[app] = cleanRelease(settings[app], input);
  await saveSetting('mobileApps', settings, updatedBy);
  return getMobileAppsSettings();
}

export interface MobileAppConfig {
  app: MobileApp;
  latestVersion: string;
  minVersion: string;
  // The running version is older than latestVersion.
  updateAvailable: boolean;
  // Older than minVersion: the app must be updated to keep working.
  updateRequired: boolean;
  storeUrl: string | null;
  releaseNotes: string[];
}

export function getMobileAppConfig(app: MobileApp, platform: MobilePlatform, version: string | null): MobileAppConfig {
  const release = getMobileAppsSettings()[app];
  return {
    app,
    latestVersion: release.latestVersion,
    minVersion: release.minVersion,
    updateAvailable: version ? compareVersions(version, release.latestVersion) < 0 : false,
    updateRequired: version ? compareVersions(version, release.minVersion) < 0 : false,
    storeUrl: platform === 'ios' ? release.iosStoreUrl : release.androidStoreUrl,
    releaseNotes: release.releaseNotes,
  };
}

// Pushes "update available" to every install of the app still on an
// older version (super admin → Mobile apps → Notify users).
export async function announceMobileAppUpdate(app: MobileApp): Promise<PushResult> {
  const release = getMobileAppsSettings()[app];
  const notes = release.releaseNotes.slice(0, 2).join(' · ');
  return sendPush(
    { app, broadcast: true, olderThan: release.latestVersion },
    {
      kind: 'app_update',
      title: `Update available: version ${release.latestVersion}`,
      body: notes || 'New features and improvements are ready. Update the app to get them.',
      data: { latestVersion: release.latestVersion },
    },
  );
}

// ---- booking pushes (queue job 'push', see queue/jobs.ts) ----

export type BookingPushEvent = 'booking-confirmed' | 'booking-cancelled' | 'event-cancelled' | 'event-reminder';

function inr(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

// The customer hears about their own booking; the organizer's app hears
// about new bookings and cancellations on their events.
export async function sendBookingPushes(eventName: BookingPushEvent, bookingId: string): Promise<void> {
  const booking = await Booking.findByPk(bookingId, { include: [{ model: Event }] });
  if (!booking) return;
  const event = (booking as unknown as { Event: Event | null }).Event;
  if (!event) return;
  const ticketCount = await Ticket.count({ where: { bookingId } });
  const data = { bookingReference: booking.bookingReference, eventId: event.id };
  const customer = { app: 'customer' as const, customerEmail: booking.primaryContactEmail };
  const organizer = { app: 'organizer' as const, organizerId: event.organizerId };
  const tickets = `${ticketCount} ticket${ticketCount === 1 ? '' : 's'}`;

  const sends: Promise<unknown>[] = [];
  switch (eventName) {
    case 'booking-confirmed':
      sends.push(
        sendPush(customer, {
          kind: 'booking_confirmed',
          title: 'Booking confirmed 🎉',
          body: `Your ${tickets} for ${event.name} are ready. Tap to view your QR pass.`,
          data,
        }),
        sendPush(organizer, {
          kind: 'new_booking',
          title: `New booking · ${inr(booking.totalAmountPaise)}`,
          body: `${booking.primaryContactName} booked ${tickets} for ${event.name}.`,
          data,
        }),
      );
      break;
    case 'booking-cancelled':
      sends.push(
        sendPush(customer, {
          kind: 'booking_cancelled',
          title: 'Booking cancelled',
          body: `Your booking ${booking.bookingReference} for ${event.name} was cancelled.${booking.refundAmountPaise ? ` Refund: ${inr(booking.refundAmountPaise)}.` : ''}`,
          data,
        }),
        sendPush(organizer, {
          kind: 'booking_cancelled',
          title: 'Booking cancelled',
          body: `${booking.primaryContactName} · ${booking.bookingReference} · ${event.name}`,
          data,
        }),
      );
      break;
    case 'event-cancelled':
      sends.push(
        sendPush(customer, {
          kind: 'event_cancelled',
          title: `${event.name} is cancelled`,
          body: `The organizer cancelled this event.${booking.refundAmountPaise ? ` Your refund of ${inr(booking.refundAmountPaise)} is on its way.` : ''}`,
          data,
        }),
      );
      break;
    case 'event-reminder':
      sends.push(
        sendPush(customer, {
          kind: 'event_reminder',
          title: `${event.name} starts soon`,
          body: 'Keep your QR pass ready at the gate. Tap to open it.',
          data,
        }),
      );
      break;
    default:
      break;
  }
  const results = await Promise.allSettled(sends);
  for (const r of results) if (r.status === 'rejected') logger.warn({ err: r.reason, bookingId, eventName }, 'Booking push failed');
}
