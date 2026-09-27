import { emailShell, escapeHtml } from '../emails/templates';
import { getStoredSetting } from './platformSettings';

// Customer emails designed in the super admin portal (Settings → Email
// templates) by dragging blocks — heading, text, button, image, divider,
// spacer — and the email's own built-in sections (tickets with QR codes,
// refund details, venue and directions, …) into order. Text, links and
// the subject can use dynamic values like {customerName} or {eventName},
// filled in per recipient. A template only replaces the built-in email
// once it's switched on; until then (or if the saved one is unusable)
// every email goes out exactly as before.

export const EMAIL_TEMPLATES_SETTING = 'emailTemplates';
export const MAX_EMAIL_BLOCKS = 40;

export type EmailTemplateKey = 'bookingConfirmation' | 'eventReminder' | 'bookingCancellation' | 'postEventThankYou' | 'otp';

export interface EmailTemplateDef {
  name: string;
  description: string;
  defaultSubject: string;
  variables: Record<string, string>;
  // Built-in sections the email can place: key → label.
  sections: Record<string, string>;
  sample: Record<string, string>;
}

const COMMON_VARS = { platformName: 'Platform name', supportEmail: 'Support email' };
const COMMON_SAMPLE = { platformName: 'Inveon Events', supportEmail: 'office.inveontech@gmail.com' };

export const EMAIL_TEMPLATE_DEFS: Record<EmailTemplateKey, EmailTemplateDef> = {
  bookingConfirmation: {
    name: 'Booking confirmation',
    description: 'Sent with the tickets (QR codes) and invoice when a booking is confirmed.',
    defaultSubject: 'Booking confirmed: {eventName} ({bookingReference})',
    variables: {
      customerName: 'Customer name',
      eventName: 'Event name',
      eventDate: 'Event date',
      eventTime: 'Event time',
      venue: 'Venue',
      city: 'City',
      organizerName: 'Organizer name',
      organizerPhone: 'Organizer phone',
      bookingReference: 'Booking ID',
      ticketCount: 'Number of tickets',
      amount: 'Amount',
      ticketPageUrl: 'Ticket page link',
      ...COMMON_VARS,
    },
    sections: {
      banner: 'Event banner',
      confirmation: 'Booking confirmed box',
      eventDetails: 'Event details',
      tickets: 'Tickets with QR codes',
      partners: 'Event partners',
      organizer: 'Organizer & Inveon band',
    },
    sample: {
      customerName: 'Rahul Sharma',
      eventName: 'Rajgad Sunrise Trek',
      eventDate: 'Sat, 15 Nov 2026',
      eventTime: '5:00 AM',
      venue: 'Gunjavane Village',
      city: 'Pune',
      organizerName: 'Sahyadri Trekkers',
      organizerPhone: '98765 43210',
      bookingReference: 'INV-BKG-2026-AB12CD',
      ticketCount: '2',
      amount: '₹2,998',
      ticketPageUrl: 'https://events.inveontechnologies.in/t/sample',
      ...COMMON_SAMPLE,
    },
  },
  eventReminder: {
    name: 'Event reminder',
    description: 'Sent about 3 hours before the event starts.',
    defaultSubject: '{eventName} starts in 3 hours',
    variables: {
      customerName: 'Attendee name(s)',
      eventName: 'Event name',
      eventTime: 'Event date & time',
      venue: 'Venue address',
      mapUrl: 'Google Maps link',
      bookingReference: 'Booking ID',
      ...COMMON_VARS,
    },
    sections: { venue: 'Venue & directions', bookingNote: 'Booking reference note' },
    sample: {
      customerName: 'Rahul Sharma',
      eventName: 'Rajgad Sunrise Trek',
      eventTime: 'Sat, 15 Nov 2026, 5:00 AM',
      venue: 'Gunjavane Village, Velhe, Pune, Maharashtra 412213',
      mapUrl: 'https://maps.google.com/?q=Rajgad',
      bookingReference: 'INV-BKG-2026-AB12CD',
      ...COMMON_SAMPLE,
    },
  },
  bookingCancellation: {
    name: 'Booking cancelled',
    description: 'Sent when a booking is cancelled (by the customer, the organizer, or because the event was cancelled).',
    defaultSubject: 'Booking cancelled: {eventName} ({bookingReference})',
    variables: {
      customerName: 'Customer name',
      eventName: 'Event name',
      eventDate: 'Event date',
      bookingReference: 'Booking ID',
      reason: 'Cancellation reason',
      refundAmount: 'Refund amount',
      refundStatus: 'Refund status',
      ...COMMON_VARS,
    },
    sections: { details: 'Booking details', refund: 'Refund details' },
    sample: {
      customerName: 'Rahul Sharma',
      eventName: 'Rajgad Sunrise Trek',
      eventDate: 'Sat, 15 Nov 2026, 5:00 AM',
      bookingReference: 'INV-BKG-2026-AB12CD',
      reason: 'Change of plans',
      refundAmount: '₹1,199',
      refundStatus: 'Processing',
      noRefund: '',
      ...COMMON_SAMPLE,
    },
  },
  postEventThankYou: {
    name: 'Thank you (after the event)',
    description: 'Sent after the event, with certificates, photos and a feedback link when available.',
    defaultSubject: 'Thanks for joining {eventName}',
    variables: {
      customerName: 'Attendee name(s)',
      eventName: 'Event name',
      organizerName: 'Organizer name',
      bookingReference: 'Booking ID',
      galleryUrl: 'Photos link',
      feedbackUrl: 'Feedback link',
      ...COMMON_VARS,
    },
    sections: { certificate: 'Certificate attached note', gallery: 'Photos & videos', actions: 'Rate event / My bookings buttons' },
    sample: {
      customerName: 'Rahul Sharma',
      eventName: 'Rajgad Sunrise Trek',
      organizerName: 'Sahyadri Trekkers',
      bookingReference: 'INV-BKG-2026-AB12CD',
      galleryUrl: 'https://photos.example.com/rajgad',
      galleryNote: '',
      feedbackUrl: 'https://events.inveontechnologies.in/bookings/INV-BKG-2026-AB12CD/feedback',
      bookingsUrl: 'https://events.inveontechnologies.in/bookings/my',
      certificateCount: '1',
      ...COMMON_SAMPLE,
    },
  },
  otp: {
    name: 'Verification code (OTP)',
    description: 'Sign-in and verification codes for customers and organizers.',
    defaultSubject: 'Your verification code is {otpCode}',
    variables: { customerName: 'Recipient name', otpCode: 'The code', expiresInMinutes: 'Minutes until it expires', ...COMMON_VARS },
    sections: { code: 'Code box' },
    sample: { customerName: 'Rahul Sharma', otpCode: '482913', expiresInMinutes: '10', ...COMMON_SAMPLE },
  },
};

export const EMAIL_TEMPLATE_KEYS = Object.keys(EMAIL_TEMPLATE_DEFS) as EmailTemplateKey[];

export type EmailBlockType = 'heading' | 'text' | 'button' | 'image' | 'divider' | 'spacer' | 'section';

export interface EmailBlock {
  id: string;
  type: EmailBlockType;
  text?: string; // heading / text / button label
  url?: string; // button link / image link
  imageUrl?: string; // image
  align?: 'left' | 'center' | 'right';
  color?: string; // text colour
  background?: string; // button / block background
  fontSize?: number;
  width?: number; // image width, px
  height?: number; // spacer height, px
  section?: string; // built-in section key
}

export interface EmailTemplate {
  enabled: boolean;
  subject: string;
  preheader: string;
  blocks: EmailBlock[];
}

export class EmailTemplateError extends Error {}

// A starting point close to the built-in email, for the designer.
export function defaultEmailTemplate(key: EmailTemplateKey): EmailTemplate {
  const def = EMAIL_TEMPLATE_DEFS[key];
  const heading = (text: string): EmailBlock => ({ id: 'heading', type: 'heading', text, align: 'left', color: '#0f172a', fontSize: 20 });
  const para = (id: string, text: string): EmailBlock => ({ id, type: 'text', text, align: 'left', color: '#475569', fontSize: 14 });
  const section = (s: string): EmailBlock => ({ id: `section-${s}`, type: 'section', section: s });
  const blocks: Record<EmailTemplateKey, EmailBlock[]> = {
    bookingConfirmation: [
      section('banner'),
      heading('Your tickets for {eventName} are ready!'),
      para('intro', 'Hi {customerName}, your booking {bookingReference} is confirmed. Show the QR code below at the entrance.'),
      section('eventDetails'),
      section('tickets'),
      section('partners'),
      section('organizer'),
    ],
    eventReminder: [
      heading('{eventName} starts soon'),
      para('intro', 'Hi {customerName}, this is a reminder that your event starts soon — {eventTime}.'),
      section('venue'),
      section('bookingNote'),
    ],
    bookingCancellation: [
      heading('Your booking has been cancelled'),
      para('intro', 'Hi {customerName}, your booking for {eventName} has been cancelled.'),
      section('details'),
      section('refund'),
      para('help', 'Questions about this cancellation or refund? Email {supportEmail}.'),
    ],
    postEventThankYou: [
      heading('Thanks for joining {eventName}!'),
      para('intro', 'Hi {customerName}, we hope you had a great time. Thank you for coming along with {organizerName}.'),
      section('certificate'),
      section('gallery'),
      section('actions'),
    ],
    otp: [
      heading('Verify your identity'),
      para('intro', "Hi {customerName}, use the code below to verify it's really you. This code expires in {expiresInMinutes} minutes."),
      section('code'),
      para('ignore', "If you didn't request this code, you can safely ignore this email."),
    ],
  };
  return { enabled: false, subject: def.defaultSubject, preheader: '', blocks: blocks[key] };
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const SAFE_URL = /^(https?:\/\/|mailto:|tel:|\{\w+\}$)/i;
const IMAGE_URL = /^(\/api\/uploads\/[A-Za-z0-9/_.-]+|https:\/\/[^\s"'<>]+)$/;

function num(n: unknown, min: number, max: number, fallback: number): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
}

export function sanitizeEmailTemplate(key: EmailTemplateKey, input: unknown): EmailTemplate {
  const def = EMAIL_TEMPLATE_DEFS[key];
  if (!input || typeof input !== 'object') throw new EmailTemplateError('Template is missing');
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.blocks)) throw new EmailTemplateError('Template blocks are missing');
  if (raw.blocks.length > MAX_EMAIL_BLOCKS) throw new EmailTemplateError(`A template can have at most ${MAX_EMAIL_BLOCKS} blocks`);
  const subject = typeof raw.subject === 'string' && raw.subject.trim() ? raw.subject.trim().slice(0, 200) : def.defaultSubject;
  const seen = new Set<string>();
  const blocks = raw.blocks.map((b, i): EmailBlock => {
    const r = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
    const type = r.type as EmailBlockType;
    if (!['heading', 'text', 'button', 'image', 'divider', 'spacer', 'section'].includes(type))
      throw new EmailTemplateError('Unknown block');
    let id = typeof r.id === 'string' && /^[\w-]{1,40}$/.test(r.id) ? r.id : `${type}${i + 1}`;
    while (seen.has(id)) id = `${id}x`;
    seen.add(id);
    const block: EmailBlock = { id, type };
    const align = r.align === 'center' || r.align === 'right' ? r.align : 'left';
    const color = typeof r.color === 'string' && HEX.test(r.color) ? r.color : undefined;
    const background = typeof r.background === 'string' && HEX.test(r.background) ? r.background : undefined;
    if (type === 'heading' || type === 'text' || type === 'button') {
      block.text = typeof r.text === 'string' ? r.text.slice(0, 3000) : '';
      block.align = type === 'button' && r.align === undefined ? 'center' : align;
      if (color) block.color = color;
      block.fontSize = num(r.fontSize, 10, 40, type === 'heading' ? 20 : 14);
    }
    if (type === 'button') {
      const url = typeof r.url === 'string' ? r.url.trim() : '';
      if (url && !SAFE_URL.test(url))
        throw new EmailTemplateError('Button links must start with https://, mailto: or be a dynamic value like {ticketPageUrl}');
      block.url = url;
      if (background) block.background = background;
    }
    if (type === 'image') {
      const src = typeof r.imageUrl === 'string' ? r.imageUrl.trim() : '';
      if (src && !IMAGE_URL.test(src)) throw new EmailTemplateError('Upload the image again');
      block.imageUrl = src;
      const url = typeof r.url === 'string' ? r.url.trim() : '';
      if (url && !SAFE_URL.test(url)) throw new EmailTemplateError('Image links must start with https://');
      block.url = url;
      block.width = num(r.width, 40, 600, 600);
      block.align = r.align === 'left' || r.align === 'right' ? r.align : 'center';
    }
    if (type === 'spacer') block.height = num(r.height, 4, 120, 24);
    if (type === 'divider' && color) block.color = color;
    if (type === 'section') {
      if (typeof r.section !== 'string' || !(r.section in def.sections)) throw new EmailTemplateError('Unknown built-in section');
      block.section = r.section;
    }
    return block;
  });
  return {
    enabled: raw.enabled === true,
    subject,
    preheader: typeof raw.preheader === 'string' ? raw.preheader.trim().slice(0, 200) : '',
    blocks,
  };
}

export function getEmailTemplates(): Partial<Record<EmailTemplateKey, EmailTemplate>> {
  const stored = getStoredSetting(EMAIL_TEMPLATES_SETTING);
  const out: Partial<Record<EmailTemplateKey, EmailTemplate>> = {};
  if (!stored || typeof stored !== 'object') return out;
  for (const key of EMAIL_TEMPLATE_KEYS) {
    const t = (stored as Record<string, unknown>)[key];
    if (!t) continue;
    try {
      out[key] = sanitizeEmailTemplate(key, t);
    } catch {
      // Ignored: the built-in email is used instead.
    }
  }
  return out;
}

export function fillEmailText(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? values[k] : m));
}

// Built-in sections for the emails whose content is simple enough to
// rebuild from the values (the booking confirmation passes its own, see
// ticketConfirmationParts).
function standardSections(key: EmailTemplateKey, v: Record<string, string>): Record<string, string> {
  const e = escapeHtml;
  const card = (bg: string, border: string, inner: string) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${bg};${border ? `border:1px solid ${border};` : ''}border-radius:12px;margin:0 0 24px;"><tr><td style="padding:16px 20px;">${inner}</td></tr></table>`;
  const label = (t: string) =>
    `<p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.05em;color:#94a3b8;text-transform:uppercase;">${t}</p>`;
  const btn = (href: string, text: string, primary: boolean) =>
    `<a href="${e(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 20px;background-color:${primary ? '#2563eb' : '#ffffff'};color:${primary ? '#ffffff' : '#2563eb'};border:1px solid #2563eb;font-size:13px;font-weight:600;text-decoration:none;border-radius:8px;">${text}</a>`;
  switch (key) {
    case 'otp':
      return {
        code: `<div style="text-align:center;margin:0 0 24px;"><span style="display:inline-block;padding:16px 32px;background-color:#eff6ff;border:1px dashed #93c5fd;border-radius:12px;font-size:32px;font-weight:700;letter-spacing:0.3em;color:#1d4ed8;">${e(v.otpCode ?? '')}</span></div>`,
      };
    case 'eventReminder':
      return {
        venue: v.venue
          ? card(
              '#f8fafc',
              '',
              `${label('Venue')}<p style="margin:0 0 16px;font-size:14px;color:#0f172a;line-height:1.5;">${e(v.venue)}</p>${
                v.mapUrl ? btn(v.mapUrl, 'Get Directions on Google Maps', true) : ''
              }`,
            )
          : '',
        bookingNote: card(
          '#eff6ff',
          '',
          `<p style="margin:0;font-size:12px;color:#1e3a8a;line-height:1.6;">Booking reference <strong>${e(v.bookingReference ?? '')}</strong> — bring your QR pass (attached to your original confirmation email) for check-in.</p>`,
        ),
      };
    case 'bookingCancellation':
      return {
        details: card(
          '#f8fafc',
          '',
          `${label('Booking Reference')}<p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#2563eb;font-family:monospace;">${e(v.bookingReference ?? '')}</p>${label('Event')}<p style="margin:0 0 16px;font-size:14px;color:#0f172a;">${e(v.eventName ?? '')}<br />${e(v.eventDate ?? '')}</p>${
            v.reason ? `${label('Reason')}<p style="margin:0;font-size:14px;color:#0f172a;line-height:1.5;">${e(v.reason)}</p>` : ''
          }`,
        ),
        refund: v.noRefund
          ? card(
              '#fef2f2',
              '#fecaca',
              `<p style="margin:0 0 2px;font-size:12px;font-weight:700;letter-spacing:0.05em;color:#b91c1c;text-transform:uppercase;">No Refund</p><p style="margin:0;font-size:13px;color:#7f1d1d;line-height:1.6;">This booking is not eligible for a refund under this event's cancellation policy.</p>`,
            )
          : card(
              '#f0fdf4',
              '#bbf7d0',
              `<p style="margin:0 0 2px;font-size:12px;font-weight:700;letter-spacing:0.05em;color:#15803d;text-transform:uppercase;">Refund</p><p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#0f172a;">${e(v.refundAmount ?? '')}</p><p style="margin:0;font-size:12px;color:#166534;line-height:1.6;">Status: ${e(v.refundStatus || 'Processing')} — refunds typically appear on your original payment method within a few business days.</p>`,
            ),
      };
    case 'postEventThankYou': {
      const count = Number(v.certificateCount || 0);
      return {
        certificate: count
          ? card(
              '#fffbeb',
              '#fde68a',
              `<p style="margin:0;font-size:14px;color:#78350f;line-height:1.5;">&#127891; <strong>Your certificate${count > 1 ? 's' : ''} of participation ${count > 1 ? 'are' : 'is'} attached</strong> to this email.</p>`,
            )
          : '',
        gallery: v.galleryUrl
          ? card(
              '#f8fafc',
              '',
              `${label('Photos &amp; videos')}<p style="margin:0 0 16px;font-size:14px;color:#0f172a;line-height:1.5;">${e(v.galleryNote || `${v.organizerName ?? 'The organizer'} has shared the photos and videos from the event.`)}</p>${btn(v.galleryUrl, 'View photos &amp; videos', true)}`,
            )
          : '',
        actions:
          v.feedbackUrl || v.bookingsUrl
            ? `<div style="margin:0 0 24px;">${v.feedbackUrl ? btn(v.feedbackUrl, 'Rate this event', !v.galleryUrl) : ''}${v.bookingsUrl ? btn(v.bookingsUrl, 'My bookings', false) : ''}</div>`
            : '',
      };
    }
    default:
      return {};
  }
}

function blockHtml(b: EmailBlock, values: Record<string, string>, sections: Record<string, string>): string {
  const fillEsc = (t: string) => escapeHtml(fillEmailText(t, values)).replace(/\n/g, '<br />');
  const fillUrl = (t: string) => fillEmailText(t, values).trim();
  const align = b.align ?? 'left';
  switch (b.type) {
    case 'heading':
      return `<h1 style="margin:0 0 12px;font-size:${b.fontSize ?? 20}px;line-height:1.3;color:${b.color ?? '#0f172a'};font-weight:700;text-align:${align};">${fillEsc(b.text ?? '')}</h1>`;
    case 'text':
      return `<p style="margin:0 0 20px;font-size:${b.fontSize ?? 14}px;line-height:1.6;color:${b.color ?? '#475569'};text-align:${align};">${fillEsc(b.text ?? '')}</p>`;
    case 'button': {
      const href = fillUrl(b.url ?? '');
      if (!/^(https?:\/\/|mailto:|tel:)/i.test(href)) return '';
      return `<div style="text-align:${align};margin:0 0 24px;"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 28px;background-color:${b.background ?? '#2563eb'};color:${b.color ?? '#ffffff'};font-size:${b.fontSize ?? 14}px;font-weight:600;text-decoration:none;border-radius:10px;">${fillEsc(b.text || 'Open')}</a></div>`;
    }
    case 'image': {
      if (!b.imageUrl) return '';
      const base = (process.env.WEB_PUBLIC_URL || process.env.API_PUBLIC_URL || '').replace(/\/+$/, '');
      const src = b.imageUrl.startsWith('/') ? (base ? `${base}${b.imageUrl}` : b.imageUrl) : b.imageUrl;
      const img = `<img src="${escapeHtml(src)}" width="${b.width ?? 600}" alt="" style="display:inline-block;width:100%;max-width:${b.width ?? 600}px;height:auto;border:0;border-radius:8px;" />`;
      const href = fillUrl(b.url ?? '');
      return `<div style="text-align:${align};margin:0 0 20px;">${/^https?:\/\//i.test(href) ? `<a href="${escapeHtml(href)}">${img}</a>` : img}</div>`;
    }
    case 'divider':
      return `<hr style="border:0;border-top:1px solid ${b.color ?? '#e2e8f0'};margin:0 0 20px;" />`;
    case 'spacer':
      return `<div style="height:${b.height ?? 24}px;line-height:${b.height ?? 24}px;font-size:1px;">&nbsp;</div>`;
    case 'section':
      return sections[b.section ?? ''] ?? '';
    default:
      return '';
  }
}

export function renderEmailFromTemplate(
  key: EmailTemplateKey,
  template: EmailTemplate,
  values: Record<string, string>,
  sections: Record<string, string> = {},
): { subject: string; html: string } {
  const all = { ...standardSections(key, values), ...sections };
  const body = template.blocks.map((b) => blockHtml(b, values, all)).join('\n');
  const subject = fillEmailText(template.subject, values)
    .replace(/[\r\n]+/g, ' ')
    .trim();
  return { subject, html: emailShell(body, escapeHtml(fillEmailText(template.preheader, values))) };
}

// The custom version of an email, when one is saved and switched on.
export function renderCustomEmail(
  key: EmailTemplateKey,
  values: Record<string, string>,
  sections: Record<string, string> = {},
): { subject: string; html: string } | null {
  const template = getEmailTemplates()[key];
  if (!template?.enabled) return null;
  return renderEmailFromTemplate(key, template, values, sections);
}
