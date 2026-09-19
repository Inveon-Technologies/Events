import nodemailer, { Transporter } from 'nodemailer';

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME ?? 'Inveon Events';

let transporter: Transporter | null = null;

// Lazy, like the DB connection — this module is imported by anything
// that might send an email, including in environments (CI, local dev
// without a configured inbox) that never set SMTP_USER/SMTP_PASS. Don't
// throw at import time; fail loudly and specifically only when an actual
// send is attempted with no configuration.
function getTransporter(): Transporter {
  if (transporter) return transporter;
  if (!SMTP_USER || !SMTP_PASS) {
    throw new Error('SMTP_USER / SMTP_PASS are not set (see apps/api/.env.example) — cannot send email');
  }
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
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
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const t = getTransporter();
  await t.sendMail({
    from: `"${SMTP_FROM_NAME}" <${SMTP_USER}>`,
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
}

// Whether sending is even configured — callers that treat email as
// best-effort (e.g. booking confirmation, which must never fail the
// booking itself) check this before attempting a send, so a missing
// SMTP config logs one clear warning instead of a throw on every booking.
export function isEmailConfigured(): boolean {
  return Boolean(SMTP_USER && SMTP_PASS);
}
