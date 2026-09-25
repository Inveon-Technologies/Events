import { NotificationLog } from '../models';
import type { NotificationChannel, NotificationStatus } from '../models/NotificationLog';
import { logger } from '../logger';

export interface NotificationLogEntry {
  channel: NotificationChannel;
  kind?: string | null;
  recipient: string;
  subject?: string | null;
  status: NotificationStatus;
  error?: string | null;
  reference?: string | null;
}

// Best-effort record of an email / WhatsApp message / one-time code for
// the super admin portal. Never throws and never delays the caller: a
// logging failure must not fail a booking or a login.
export function logNotification(entry: NotificationLogEntry): void {
  if (!process.env.DATABASE_URL) return;
  NotificationLog.create({
    channel: entry.channel,
    kind: entry.kind?.slice(0, 60) ?? null,
    recipient: entry.recipient.slice(0, 255),
    subject: entry.subject?.slice(0, 255) ?? null,
    status: entry.status,
    error: entry.error?.slice(0, 2000) ?? null,
    reference: entry.reference?.slice(0, 255) ?? null,
  }).catch((err) => logger.warn({ err }, 'Could not record notification log'));
}
