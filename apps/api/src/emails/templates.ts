// Table-based layout throughout these templates, not flexbox/grid — a
// well-established constraint for HTML email, since many mail clients
// (Outlook desktop in particular) have poor or no support for modern CSS
// layout. Every style is inline for the same reason: external/embedded
// stylesheets are stripped or ignored by a large share of clients.

// Real support inbox — same account the app actually sends transactional
// email from (see SMTP_USER in email.ts), so "reply to this email" and
// this address are never different destinations.
const SUPPORT_EMAIL = 'office.inveontech@gmail.com';

export function emailShell(bodyHtml: string, preheader = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Inveon Events</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:28px 32px;">
              <span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Inveon Events</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background-color:#f8fafc;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">
                Inveon Events &middot; Need help? Email us at <a href="mailto:${SUPPORT_EMAIL}" style="color:#2563eb;text-decoration:none;">${SUPPORT_EMAIL}</a> or reach out to your event organizer.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function otpEmail(params: { recipientName: string; otpCode: string; expiresInMinutes: number }): string {
  const body = `
    <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a;font-weight:700;">Verify your identity</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">
      Hi ${params.recipientName}, use the code below to verify it's really you. This code expires in ${params.expiresInMinutes} minutes.
    </p>
    <div style="text-align:center;margin:0 0 24px;">
      <span style="display:inline-block;padding:16px 32px;background-color:#eff6ff;border:1px dashed #93c5fd;border-radius:12px;font-size:32px;font-weight:700;letter-spacing:0.3em;color:#1d4ed8;">
        ${params.otpCode}
      </span>
    </div>
    <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">
      If you didn't request this code, you can safely ignore this email — no changes will be made to your account.
    </p>
  `;
  return emailShell(body, `Your verification code is ${params.otpCode}`);
}

export function registrationSuccessEmail(params: { recipientName: string; orgName: string; dashboardUrl: string }): string {
  const body = `
    <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a;font-weight:700;">Welcome to Inveon Events, ${params.recipientName}! &#127881;</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">
      Your organizer account for <strong>${params.orgName}</strong> is ready. You can now create events, manage bookings, and track check-ins — all from one dashboard.
    </p>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${params.dashboardUrl}" style="display:inline-block;padding:12px 28px;background-color:#2563eb;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;">
        Go to your dashboard
      </a>
    </div>
    <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">
      Questions about getting started? Just reply to this email — a real person will get back to you.
    </p>
  `;
  return emailShell(body, `${params.orgName} is ready to go on Inveon Events`);
}

export interface BookingConfirmationLineItem {
  tierName: string;
  quantity: number;
  unitPricePaise: number;
}

export function bookingConfirmationEmail(params: {
  customerName: string;
  eventName: string;
  eventDateLabel: string;
  venueAddress: string | null;
  organizerName: string;
  bookingReference: string;
  lineItems: BookingConfirmationLineItem[];
  totalPaise: number;
  ticketCount: number;
}): string {
  const formatINR = (paise: number) => `\u20b9${(paise / 100).toLocaleString('en-IN')}`;

  const rows = params.lineItems
    .map(
      (li) => `
      <tr>
        <td style="padding:10px 0;font-size:13px;color:#334155;border-bottom:1px solid #f1f5f9;">${li.tierName} &times; ${li.quantity}</td>
        <td style="padding:10px 0;font-size:13px;color:#0f172a;text-align:right;border-bottom:1px solid #f1f5f9;">${formatINR(li.unitPricePaise * li.quantity)}</td>
      </tr>`,
    )
    .join('');

  const body = `
    <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a;font-weight:700;">You're going! Booking confirmed &#9989;</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">
      Hi ${params.customerName}, your booking for <strong>${params.eventName}</strong> is confirmed. Your ${params.ticketCount > 1 ? 'tickets are' : 'ticket is'} attached below — bring the QR code${params.ticketCount > 1 ? 's' : ''} for entry.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:12px;margin:0 0 24px;">
      <tr>
        <td style="padding:20px 24px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.05em;color:#94a3b8;text-transform:uppercase;">Booking Reference</p>
          <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#2563eb;font-family:monospace;">${params.bookingReference}</p>

          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.05em;color:#94a3b8;text-transform:uppercase;">When &amp; Where</p>
          <p style="margin:0 0 2px;font-size:14px;color:#0f172a;">${params.eventDateLabel}</p>
          <p style="margin:0 0 16px;font-size:14px;color:#0f172a;">${params.venueAddress ?? 'Venue details to follow'}</p>

          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.05em;color:#94a3b8;text-transform:uppercase;">Organized by</p>
          <p style="margin:0;font-size:14px;color:#0f172a;">${params.organizerName}</p>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
      ${rows}
      <tr>
        <td style="padding:14px 0 0;font-size:14px;font-weight:700;color:#0f172a;">Total Paid</td>
        <td style="padding:14px 0 0;font-size:16px;font-weight:700;color:#2563eb;text-align:right;">${formatINR(params.totalPaise)}</td>
      </tr>
    </table>

    <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;line-height:1.6;">
      A detailed invoice and your ticket QR code${params.ticketCount > 1 ? 's are' : ' is'} attached to this email. See you there!
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border-radius:12px;margin:20px 0 0;">
      <tr>
        <td style="padding:14px 18px;font-size:12px;color:#1e3a8a;line-height:1.6;">
          Need help or want to change something about your booking? Email <a href="mailto:${SUPPORT_EMAIL}" style="color:#2563eb;font-weight:600;text-decoration:none;">${SUPPORT_EMAIL}</a>.
        </td>
      </tr>
    </table>
  `;
  return emailShell(body, `Your booking for ${params.eventName} is confirmed`);
}

export function bookingCancellationEmail(params: {
  customerName: string;
  eventName: string;
  eventDateLabel: string;
  bookingReference: string;
  reason: string;
  cancelledByEventCancellation: boolean; // true when the whole event was cancelled by the organizer, not just this one booking
  cancelledByOrganizer: boolean; // true for any organizer-initiated cancellation (event or single booking), false for the customer's own self-service cancellation
  totalPaise: number;
  refundAmountPaise: number;
  refundStatus: string | null;
}): string {
  const formatINR = (paise: number) => `\u20b9${(paise / 100).toLocaleString('en-IN')}`;
  const isNoRefund = params.refundAmountPaise === 0;

  const headline = params.cancelledByEventCancellation
    ? 'This event has been cancelled'
    : params.cancelledByOrganizer
      ? 'Your booking has been cancelled by the organizer'
      : 'Your booking has been cancelled';

  const intro = params.cancelledByEventCancellation
    ? `Hi ${params.customerName}, we're sorry to let you know that <strong>${params.eventName}</strong> has been cancelled by the organizer. Your booking has been cancelled as a result.`
    : params.cancelledByOrganizer
      ? `Hi ${params.customerName}, the organizer has cancelled your booking for <strong>${params.eventName}</strong>.`
      : `Hi ${params.customerName}, this confirms your booking for <strong>${params.eventName}</strong> has been cancelled, as you requested.`;

  const refundBlock = isNoRefund
    ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:12px;margin:0 0 24px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 2px;font-size:12px;font-weight:700;letter-spacing:0.05em;color:#b91c1c;text-transform:uppercase;">No Refund</p>
          <p style="margin:0;font-size:13px;color:#7f1d1d;line-height:1.6;">This booking is not eligible for a refund under this event's cancellation policy.</p>
        </td>
      </tr>
    </table>`
    : `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin:0 0 24px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 2px;font-size:12px;font-weight:700;letter-spacing:0.05em;color:#15803d;text-transform:uppercase;">Refund ${params.refundAmountPaise >= params.totalPaise ? '(Full)' : '(Partial)'}</p>
          <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#0f172a;">${formatINR(params.refundAmountPaise)}</p>
          <p style="margin:0;font-size:12px;color:#166534;line-height:1.6;">
            Status: ${params.refundStatus ?? 'Processing'} — refunds typically appear on your original payment method within a few business days.
          </p>
        </td>
      </tr>
    </table>`;

  const body = `
    <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a;font-weight:700;">${headline}</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">${intro}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:12px;margin:0 0 24px;">
      <tr>
        <td style="padding:20px 24px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.05em;color:#94a3b8;text-transform:uppercase;">Booking Reference</p>
          <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#2563eb;font-family:monospace;">${params.bookingReference}</p>

          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.05em;color:#94a3b8;text-transform:uppercase;">Event</p>
          <p style="margin:0 0 2px;font-size:14px;color:#0f172a;">${params.eventName}</p>
          <p style="margin:0 0 16px;font-size:14px;color:#0f172a;">${params.eventDateLabel}</p>

          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.05em;color:#94a3b8;text-transform:uppercase;">Reason</p>
          <p style="margin:0;font-size:14px;color:#0f172a;line-height:1.5;">${params.reason}</p>
        </td>
      </tr>
    </table>

    ${refundBlock}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border-radius:12px;">
      <tr>
        <td style="padding:14px 18px;font-size:12px;color:#1e3a8a;line-height:1.6;">
          Questions about this cancellation${isNoRefund ? ' or its refund policy' : ' or refund'}? Email <a href="mailto:${SUPPORT_EMAIL}" style="color:#2563eb;font-weight:600;text-decoration:none;">${SUPPORT_EMAIL}</a>.
        </td>
      </tr>
    </table>
  `;
  return emailShell(body, `${headline}: ${params.eventName}`);
}

export function eventCancelledOrganizerSummaryEmail(params: {
  organizerContactName: string;
  eventName: string;
  eventDateLabel: string;
  reason: string;
  cancelledBookingsCount: number;
  totalRefundedPaise: number;
}): string {
  const formatINR = (paise: number) => `\u20b9${(paise / 100).toLocaleString('en-IN')}`;

  const body = `
    <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a;font-weight:700;">Event cancelled: ${params.eventName}</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">
      Hi ${params.organizerContactName}, this confirms you cancelled <strong>${params.eventName}</strong> (${params.eventDateLabel}). Every confirmed booking for this event has been cancelled and refunded in full, and every attendee has been emailed directly.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:12px;margin:0 0 24px;">
      <tr>
        <td style="padding:20px 24px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.05em;color:#94a3b8;text-transform:uppercase;">Bookings Cancelled</p>
          <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#0f172a;">${params.cancelledBookingsCount}</p>

          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.05em;color:#94a3b8;text-transform:uppercase;">Total Refunded</p>
          <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#0f172a;">${formatINR(params.totalRefundedPaise)}</p>

          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.05em;color:#94a3b8;text-transform:uppercase;">Reason You Gave</p>
          <p style="margin:0;font-size:14px;color:#0f172a;line-height:1.5;">${params.reason}</p>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">
      Refund settlement to attendees' original payment methods may take a few business days depending on their bank. If anything looks off, email <a href="mailto:${SUPPORT_EMAIL}" style="color:#2563eb;text-decoration:none;">${SUPPORT_EMAIL}</a>.
    </p>
  `;
  return emailShell(body, `You cancelled ${params.eventName}`);
}

export function eventReminderEmail(params: {
  attendeeName: string;
  eventName: string;
  bookingReference: string;
  eventTimeLabel: string;
  venueAddress: string | null;
  mapUrl: string | null;
}): string {
  const locationBlock = params.venueAddress
    ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:12px;margin:0 0 24px;">
      <tr>
        <td style="padding:20px 24px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.05em;color:#94a3b8;text-transform:uppercase;">Venue</p>
          <p style="margin:0 0 16px;font-size:14px;color:#0f172a;line-height:1.5;">${params.venueAddress}</p>
          ${
            params.mapUrl
              ? `<a href="${params.mapUrl}" style="display:inline-block;padding:10px 20px;background-color:#2563eb;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;border-radius:8px;">Get Directions on Google Maps</a>`
              : ''
          }
        </td>
      </tr>
    </table>`
    : '';

  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffbeb;border:1px solid #fde68a;border-radius:12px;margin:0 0 24px;">
      <tr>
        <td style="padding:14px 20px;text-align:center;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.08em;color:#b45309;text-transform:uppercase;">Starting in 3 Hours</p>
        </td>
      </tr>
    </table>

    <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a;font-weight:700;">${params.eventName}</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">
      Hi ${params.attendeeName}, this is a reminder that your event starts soon — ${params.eventTimeLabel}.
    </p>

    ${locationBlock}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border-radius:12px;">
      <tr>
        <td style="padding:14px 18px;font-size:12px;color:#1e3a8a;line-height:1.6;">
          Booking reference <strong>${params.bookingReference}</strong> — bring your QR pass (attached to your original confirmation email) for check-in.
        </td>
      </tr>
    </table>
  `;
  return emailShell(body, `${params.eventName} starts in 3 hours`);
}
