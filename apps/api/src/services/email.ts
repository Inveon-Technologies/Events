import nodemailer, { Transporter } from 'nodemailer';
import { integrationValue, onSettingsChanged } from './platformSettings';
import { logNotification } from './notificationLog';

// SMTP login comes from the super admin portal's Integrations page when
// set there, else from SMTP_USER / SMTP_PASS / SMTP_FROM_NAME in the env.
const smtpUser = () => integrationValue('SMTP_USER');
const smtpPass = () => integrationValue('SMTP_PASS');
const smtpFromName = () => integrationValue('SMTP_FROM_NAME') ?? 'Inveon Events';

let transporter: Transporter | null = null;
let transporterUser: string | undefined;

// A new login saved in the portal takes effect on the next email.
onSettingsChanged(() => {
  transporter?.close();
  transporter = null;
});

// Lazy, like the DB connection — this module is imported by anything
// that might send an email, including in environments (CI, local dev
// without a configured inbox) that never set SMTP_USER/SMTP_PASS. Don't
// throw at import time; fail loudly and specifically only when an actual
// send is attempted with no configuration.
function getTransporter(): Transporter {
  const user = smtpUser();
  const pass = smtpPass();
  if (transporter && transporterUser === user) return transporter;
  if (!user || !pass) {
    throw new Error('SMTP_USER / SMTP_PASS are not set (see apps/api/.env.example) — cannot send email');
  }
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    // Reuse one authenticated TLS connection instead of a fresh
    // handshake + login per message — noticeably faster for one-time
    // codes, and Gmail throttles bursts of new SMTP logins.
    pool: true,
    maxConnections: 3,
    auth: { user, pass },
  });
  transporterUser = user;
  return transporter;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
  // Referenced from the HTML body via <img src="cid:...">, for QR codes
  // embedded inline rather than shown as a separate file to download.
  cid?: string;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
  // For the super admin portal's email log, e.g. 'booking_confirmation'.
  kind?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  try {
    const t = getTransporter();
    await t.sendMail({
      from: `"${smtpFromName()}" <${smtpUser()}>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
      attachments: params.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
        cid: a.cid,
      })),
    });
  } catch (err) {
    logNotification({
      channel: 'email',
      kind: params.kind,
      recipient: params.to,
      subject: params.subject,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  logNotification({ channel: 'email', kind: params.kind, recipient: params.to, subject: params.subject, status: 'sent' });
}

// Whether sending is even configured — callers that treat email as
// best-effort (e.g. booking confirmation, which must never fail the
// booking itself) check this before attempting a send, so a missing
// SMTP config logs one clear warning instead of a throw on every booking.
export function isEmailConfigured(): boolean {
  return Boolean(smtpUser() && smtpPass());
}
