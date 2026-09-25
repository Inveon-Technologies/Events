import { escapeHtml } from './templates';

// The booking confirmation email, laid out after the approved design:
// organizer's event banner, "Booking confirmed" + event details on the
// left, the entry ticket(s) with QR on the right, the organizer's
// partners, and a dark footer with the organizer and Inveon as
// technology / booking partner.
//
// Email-safe: tables and inline styles only; the two columns are
// inline-blocks that stack on narrow screens without media queries.
// Images are referenced by cid (attached inline by the sender), so they
// show even when the reader's mail app blocks remote images.

export interface TicketEmailTicket {
  attendeeName: string;
  tierName: string;
  ticketId: string;
  statusText: string;
  qrCid: string;
}

export interface TicketEmailPartner {
  name: string;
  role: string | null;
  logoCid: string | null;
}

export interface TicketConfirmationEmailView {
  headerCid: string | null;
  eventName: string;
  customerName: string;
  bookingReference: string;
  statusLine: string; // e.g. "Your payment has been successfully verified…"
  dateLabel: string; // "18 October 2026"
  weekday: string; // "Sunday"
  reportingTime: string | null; // "06:30 PM"
  eventTime: string; // "07:00 PM"
  venue: string;
  city: string;
  organizerName: string;
  organizerPhone: string | null;
  organizerLogoCid: string | null;
  inviteNote: string | null;
  tickets: TicketEmailTicket[];
  ticketPageUrl: string | null;
  ticketPdfUrl: string | null;
  partners: TicketEmailPartner[];
  amountLine: string | null; // "Amount paid: ₹1,500.00 · Invoice attached"
  supportEmail: string;
}

const FONT = "'Inter','Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const e = escapeHtml;

function detailRow(icon: string, main: string, sub: string | null): string {
  return `<tr>
    <td valign="top" width="26" style="padding:0 0 12px;font-size:15px;line-height:18px;">${icon}</td>
    <td valign="top" style="padding:0 0 12px;">
      <p style="margin:0;font-size:13px;font-weight:700;color:#111827;line-height:1.3;">${main}</p>
      ${sub ? `<p style="margin:2px 0 0;font-size:11px;color:#6b7280;">${sub}</p>` : ''}
    </td>
  </tr>`;
}

function ticketCard(t: TicketEmailTicket, bookingReference: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f1f5f9;">
    <tr>
      <td valign="top" style="padding:12px 8px 12px 0;">
        <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#111827;">&#128100; ${e(t.attendeeName)}</p>
        <p style="margin:0 0 10px;"><span style="display:inline-block;padding:2px 9px;border-radius:999px;background:#fef3c7;border:1px solid #fde68a;color:#d97706;font-size:10px;font-weight:700;letter-spacing:0.04em;">&#127915; ${e(t.tierName.toUpperCase())}</span></p>
        <p style="margin:0;font-size:10px;color:#6b7280;">Ticket ID:</p>
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#1f2937;font-family:Consolas,Menlo,monospace;word-break:break-all;">${e(t.ticketId)}</p>
        <p style="margin:0;font-size:10px;color:#6b7280;">Booking ID:</p>
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#1f2937;font-family:Consolas,Menlo,monospace;word-break:break-all;">${e(bookingReference)}</p>
        <p style="margin:0;font-size:10px;color:#6b7280;">Status:</p>
        <span style="display:inline-block;margin-top:2px;padding:2px 9px;border-radius:999px;background:#dcfce7;color:#15803d;font-size:10px;font-weight:700;">${e(t.statusText)}</span>
      </td>
      <td valign="middle" width="128" align="center" style="padding:12px 0 12px 8px;border-left:1px solid #f1f5f9;">
        <img src="cid:${t.qrCid}" width="116" height="116" alt="QR code for ${e(t.attendeeName)}" style="display:block;width:116px;height:116px;border:1px solid #d1d5db;border-radius:8px;padding:4px;background:#ffffff;" />
        <p style="margin:6px 0 0;font-size:10px;font-weight:700;color:#111827;letter-spacing:0.06em;">SCAN AT ENTRY</p>
        <p style="margin:0;font-size:9px;color:#6b7280;line-height:1.3;">Present your QR ticket<br />at the event entrance.</p>
      </td>
    </tr>
  </table>`;
}

function partnerCell(p: TicketEmailPartner): string {
  const logo = p.logoCid
    ? `<img src="cid:${p.logoCid}" alt="${e(p.name)}" height="36" style="display:block;margin:0 auto 6px;height:36px;max-width:110px;" />`
    : `<p style="margin:0 0 4px;font-size:18px;">&#11088;</p>`;
  return `<td align="center" valign="top" width="25%" style="padding:4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #f5e6cc;border-radius:6px;">
      <tr><td align="center" style="padding:10px 6px;">
        ${logo}
        <p style="margin:0;font-size:10px;font-weight:700;color:#374151;text-transform:uppercase;">${e(p.role || p.name)}</p>
        ${p.role ? `<p style="margin:2px 0 0;font-size:10px;color:#9ca3af;">${e(p.name)}</p>` : ''}
      </td></tr>
    </table>
  </td>`;
}

function partnersSection(partners: TicketEmailPartner[]): string {
  if (partners.length === 0) return '';
  const rows: string[] = [];
  for (let i = 0; i < partners.length; i += 4) {
    const chunk = partners.slice(i, i + 4);
    const cells = chunk.map(partnerCell).join('') + '<td width="25%"></td>'.repeat(4 - chunk.length);
    rows.push(`<tr>${cells}</tr>`);
  }
  return `<tr><td style="padding:0 20px 20px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffdf7;border:1px solid #f3e8ce;border-radius:8px;">
      <tr><td align="center" style="padding:14px 10px 6px;font-size:12px;font-weight:800;letter-spacing:0.08em;color:#1f2937;">&#129309; OUR EVENT PARTNERS</td></tr>
      <tr><td style="padding:0 8px 10px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join('')}</table></td></tr>
    </table>
  </td></tr>`;
}

function button(href: string, label: string, primary: boolean): string {
  return `<a href="${e(href)}" style="display:block;margin:0 0 8px;padding:11px 16px;border-radius:6px;text-align:center;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:0.04em;${
    primary ? 'background:#0d6efd;color:#ffffff;border:1px solid #0d6efd;' : 'background:#ffffff;color:#0d6efd;border:1px solid #cbd5e1;'
  }">${label}</a>`;
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?'
  );
}

export function ticketConfirmationEmail(v: TicketConfirmationEmailView): string {
  const plural = v.tickets.length > 1;
  const header = v.headerCid
    ? `<tr><td style="padding:0;line-height:0;"><img src="cid:${v.headerCid}" width="680" alt="${e(v.eventName)}" style="display:block;width:100%;max-width:680px;height:auto;border:0;" /></td></tr>`
    : `<tr><td align="center" style="padding:28px 20px;background:#170414;color:#fcd34d;font-size:26px;font-weight:800;">${e(v.eventName)}</td></tr>`;

  const actions = [
    v.ticketPageUrl ? button(v.ticketPageUrl, `VIEW MY ${plural ? 'TICKETS' : 'TICKET'} &rarr;`, true) : '',
    v.ticketPdfUrl ? button(v.ticketPdfUrl, '&#11015; DOWNLOAD TICKET PDF', false) : '',
  ].join('');

  const orgBadge = v.organizerLogoCid
    ? `<img src="cid:${v.organizerLogoCid}" width="52" height="52" alt="${e(v.organizerName)}" style="display:block;width:52px;height:52px;border-radius:26px;border:1px solid #d4af37;" />`
    : `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" valign="middle" width="52" height="52" style="width:52px;height:52px;border-radius:26px;background:#18091c;border:1px solid #d4af37;color:#fbbf24;font-size:14px;font-weight:800;">${e(initials(v.organizerName))}</td></tr></table>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<title>${e(v.eventName)} — Booking Confirmed</title>
</head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your ${plural ? 'tickets' : 'ticket'} for ${e(v.eventName)} ${plural ? 'are' : 'is'} ready — Booking ID ${e(v.bookingReference)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;">
<tr><td align="center" style="padding:20px 10px;">
<table role="presentation" width="680" cellpadding="0" cellspacing="0" style="width:100%;max-width:680px;background:#fcfdfe;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
  ${header}
  <tr><td style="padding:20px 14px 8px;font-size:0;" align="center">
    <!-- Left column: confirmation + event details -->
    <div style="display:inline-block;width:100%;max-width:320px;vertical-align:top;font-size:14px;text-align:left;">
      <div style="margin:0 6px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef8f1;border:1px solid #c5e8ce;border-radius:8px;">
          <tr>
            <td valign="top" width="36" style="padding:14px 0 14px 14px;"><div style="width:28px;height:28px;border-radius:14px;background:#16a34a;color:#ffffff;font-size:16px;line-height:28px;text-align:center;font-weight:700;">&#10003;</div></td>
            <td style="padding:14px;">
              <p style="margin:0;font-size:12px;font-weight:800;letter-spacing:0.06em;color:#14532d;">BOOKING CONFIRMED</p>
              <p style="margin:2px 0 0;font-size:15px;font-weight:700;color:#166534;">Your ${plural ? 'tickets are' : 'ticket is'} ready!</p>
              <p style="margin:4px 0 0;font-size:12px;color:#2f523a;line-height:1.5;">Hi ${e(v.customerName)}, ${e(v.statusLine)} for <strong style="color:#111827;">${e(v.eventName)}</strong>.</p>
              ${v.amountLine ? `<p style="margin:6px 0 0;font-size:11px;color:#2f523a;">${e(v.amountLine)}</p>` : ''}
            </td>
          </tr>
        </table>
      </div>
      <div style="margin:0 6px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e9ecef;border-radius:8px;">
          <tr><td style="padding:12px 14px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;font-weight:800;letter-spacing:0.08em;color:#1f2937;">&#128197; EVENT DETAILS</td></tr>
          <tr><td style="padding:12px 14px 2px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${detailRow('&#128197;', e(v.dateLabel), e(v.weekday))}
              ${v.reportingTime ? detailRow('&#9200;', e(v.reportingTime), 'Reporting Time') : ''}
              ${detailRow('&#128339;', `${e(v.eventTime)} onwards`, 'Event Time')}
              ${detailRow('&#128205;', e(v.venue), v.city ? e(v.city) : null)}
            </table>
          </td></tr>
          <tr><td style="padding:10px 14px 12px;border-top:1px dashed #e5e7eb;">
            <p style="margin:0;font-size:10px;color:#9ca3af;text-transform:uppercase;">Organized by</p>
            <p style="margin:0;font-size:13px;font-weight:700;color:#1f2937;">${e(v.organizerName)}</p>
            ${v.organizerPhone ? `<p style="margin:4px 0 0;font-size:12px;font-weight:600;color:#1f2937;">&#128222; <a href="tel:${e(v.organizerPhone.replace(/\s/g, ''))}" style="color:#1f2937;text-decoration:none;">${e(v.organizerPhone)}</a></p>` : ''}
            ${v.inviteNote ? `<p style="margin:8px 0 0;font-size:11px;color:#4b5563;line-height:1.5;">${e(v.inviteNote)}</p>` : ''}
          </td></tr>
        </table>
      </div>
    </div>
    <!-- Right column: entry ticket(s) -->
    <div style="display:inline-block;width:100%;max-width:320px;vertical-align:top;font-size:14px;text-align:left;">
      <div style="margin:0 6px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
          <tr><td style="padding:12px 14px 8px;font-size:12px;font-weight:800;letter-spacing:0.08em;color:#1f2937;">&#127903; YOUR ENTRY ${plural ? `TICKETS (${v.tickets.length})` : 'TICKET'}</td></tr>
          <tr><td style="padding:0 14px 4px;">${v.tickets.map((t) => ticketCard(t, v.bookingReference)).join('')}</td></tr>
          ${actions ? `<tr><td style="padding:6px 14px 10px;">${actions}</td></tr>` : ''}
        </table>
      </div>
    </div>
  </td></tr>
  ${partnersSection(v.partners)}
  <tr><td align="center" style="background:#170514;padding:14px 10px;font-size:0;">
    <div style="display:inline-block;width:100%;max-width:220px;vertical-align:middle;font-size:14px;">
      <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:6px auto;"><tr>
        <td valign="middle" style="padding-right:12px;">${orgBadge}</td>
        <td valign="middle" style="text-align:left;">
          <p style="margin:0;font-size:11px;color:#d8cbce;">Organized by</p>
          <p style="margin:2px 0 0;font-size:15px;font-weight:600;color:#ffffff;">${e(v.organizerName)}</p>
          ${v.organizerPhone ? `<p style="margin:2px 0 0;font-size:12px;color:#e8e4e6;letter-spacing:0.04em;">${e(v.organizerPhone)}</p>` : ''}
        </td>
      </tr></table>
    </div>
    <div style="display:inline-block;width:100%;max-width:220px;vertical-align:middle;font-size:14px;text-align:center;">
      <div style="margin:6px 0;">
        <p style="margin:0 0 4px;font-size:10px;font-weight:600;letter-spacing:0.18em;color:#d6a858;">TECHNOLOGY PARTNER</p>
        <p style="margin:0;font-size:17px;font-weight:900;letter-spacing:0.14em;color:#ffffff;"><span style="color:#0066ff;">&#9660;</span> INVEON</p>
        <p style="margin:0;font-size:8px;font-weight:600;letter-spacing:0.24em;color:#e5e7eb;">TECHNOLOGIES</p>
        <p style="margin:4px 0 0;font-size:10px;color:#baa6ad;">Digital Booking &bull; Secure Payments &bull; QR Ticketing</p>
      </div>
    </div>
    <div style="display:inline-block;width:100%;max-width:200px;vertical-align:middle;font-size:14px;text-align:center;">
      <div style="margin:6px 0;">
        <p style="margin:0 0 4px;font-size:10px;font-weight:600;letter-spacing:0.18em;color:#d6a858;">EVENT BOOKING PARTNER</p>
        <p style="margin:0;font-size:17px;font-weight:900;letter-spacing:0.12em;color:#ffffff;">INVEON</p>
        <p style="margin:0;font-size:9px;font-weight:700;letter-spacing:0.24em;color:#ffffff;">EVENTS</p>
        <p style="margin:2px 0 0;font-size:9px;color:#9ca3af;">by Inveon Technologies</p>
      </div>
    </div>
  </td></tr>
  <tr><td align="center" style="padding:12px 20px;background:#0f030d;font-size:11px;color:#9ca3af;line-height:1.6;">
    Your invoice is attached. Questions about the event? Contact ${e(v.organizerName)}${v.organizerPhone ? ` on ${e(v.organizerPhone)}` : ''}.
    Booking help: <a href="mailto:${e(v.supportEmail)}" style="color:#d6a858;text-decoration:none;">${e(v.supportEmail)}</a>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
