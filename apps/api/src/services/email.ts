import nodemailer, { Transporter } from 'nodemailer';
import { getBranding, integrationValue, onSettingsChanged } from './platformSettings';
import { logNotification } from './notificationLog';
import { htmlToText } from '../emails/htmlToText';

// SMTP login comes from the super admin portal's Integrations page when
// set there, else from the same-named variables in the env.
const smtpUser = () => integrationValue('SMTP_USER');
const smtpPass = () => integrationValue('SMTP_PASS');
const smtpFromName = () => integrationValue('SMTP_FROM_NAME') ?? 'Inveon Events';
// Gmail when unset, so existing setups keep working. A transactional
// provider (ZeptoMail, Brevo, Amazon SES) on the platform's own domain
// is what keeps mail out of spam: see docs/email-deliverability.md.
const smtpHost = () => integrationValue('SMTP_HOST') ?? 'smtp.gmail.com';
const smtpPort = () => {
  const port = Number(integrationValue('SMTP_PORT'));
  return Number.isInteger(port) && port > 0 ? port : 465;
};
// Providers log in with an API user that is not a mailbox, so the From
// address is set on its own. Falls back to the login for Gmail.
const smtpFromEmail = () => integrationValue('SMTP_FROM_EMAIL') ?? smtpUser();

let transporter: Transporter | null = null;
let transporterKey: string | undefined;

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
  const key = `${smtpHost()}:${smtpPort()}:${user}`;
  if (transporter && transporterKey === key) return transporter;
  if (!user || !pass) {
    throw new Error('SMTP_USER / SMTP_PASS are not set (see apps/api/.env.example) — cannot send email');
  }
  const port = smtpPort();
  transporter = nodemailer.createTransport({
    host: smtpHost(),
    port,
    // 465 is TLS from the start; 587 and 2525 upgrade with STARTTLS,
    // which nodemailer requires here rather than falling back to plain.
    secure: port === 465,
    requireTLS: port !== 465,
    // Reuse one authenticated TLS connection instead of a fresh
    // handshake + login per message — noticeably faster for one-time
    // codes, and Gmail throttles bursts of new SMTP logins.
    pool: true,
    maxConnections: 3,
    auth: { user, pass },
  });
  transporterKey = key;
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
    const replyTo = getBranding().supportEmail;
    await t.sendMail({
      from: { name: smtpFromName(), address: smtpFromEmail() ?? '' },
      // Replies reach the support inbox even when mail goes out from a
      // no-reply address.
      replyTo: replyTo && replyTo !== smtpFromEmail() ? replyTo : undefined,
      to: params.to,
      subject: params.subject,
      html: params.html,
      // An HTML-only message is a common spam signal; every client that
      // can't or won't render HTML gets this instead.
      text: htmlToText(params.html),
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

// For the super admin config check: null when the SMTP login works,
// otherwise the error message.
export async function verifyEmailLogin(): Promise<string | null> {
  try {
    await getTransporter().verify();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
