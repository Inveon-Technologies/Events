import path from 'node:path';
import { createCanvas, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import { coverImage, fitText, FONT_DIR, registerFonts } from './canvasKit';
import PDFDocument from 'pdfkit';
import { Op } from 'sequelize';
import { Booking, Event, Organizer, Ticket, TicketCategory } from '../models';
import { generateTicketQrPng } from './qrCode';
import { loadStoredImage } from './designAssets';
import { emailSafePng, renderEventHeaderPng } from './eventHeaderImage';
import { istDateLabel, istTimeLabel, istWeekday, venueParts } from './bookingDocuments';
import type { EventPartner } from '../models/Event';
import { getEventTicketDesign } from './ticketDesign';
import { ticketDisplayReference } from './ticketLinks';

// The ticket as a picture and as a PDF, from the same data:
//   - renderTicketCardPng: a 16:9 card (event photo, details, QR) used as
//     the WhatsApp confirmation's header image and on the ticket page;
//   - renderTicketPdf: one A4 page per participant, each with its QR.

const IST: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata' };

export interface TicketArtworkTicket {
  reference: string;
  attendeeName: string;
  tierName: string;
  status: 'valid' | 'checked_in' | 'cancelled';
  qrPng: Buffer;
}

export interface TicketArtworkData {
  bookingReference: string;
  bookingStatus: 'pending' | 'confirmed' | 'cancelled';
  eventName: string;
  organizerName: string;
  organizerPhone: string | null;
  dateLabel: string; // "Saturday, 18 October 2026"
  timeLabel: string; // "5:30 am"
  timeCaption: string; // "Reporting time" | "Starts at"
  locationLabel: string; // "Pune → Rajgad"
  banner: Buffer | null;
  tickets: TicketArtworkTicket[]; // active tickets only
  // For the PDF, which follows the full ticket design.
  tagline: string | null;
  eventDate: Date;
  gateOpenTime: Date | null;
  venueAddress: string | null;
  organizerLogoUrl: string | null;
  backgroundUrl: string | null;
  partners: EventPartner[];
}

export { ticketDisplayReference };

function shortPlace(text: string | null | undefined): string {
  if (!text) return '';
  return text.split(',')[0].trim();
}

function locationLabel(event: Event): string {
  const venue = shortPlace(event.venueAddress);
  const pickup = event.locationPoints?.find((p) => p.type === 'pickup' || p.type === 'meeting');
  if (pickup && venue && shortPlace(pickup.label) !== venue) return `${shortPlace(pickup.label)} → ${venue}`;
  return venue || shortPlace(pickup?.label) || 'See event page';
}

export async function loadTicketArtworkData(booking: Booking): Promise<TicketArtworkData> {
  const event = await Event.findByPk(booking.eventId);
  if (!event) throw new Error('Event not found for booking');
  const organizer = await Organizer.findByPk(event.organizerId, { attributes: ['name', 'contactPhone', 'logoUrl'] });
  const design = await getEventTicketDesign(event);
  const allTickets = await Ticket.findAll({ where: { bookingId: booking.id }, order: [['createdAt', 'ASC']] });
  const tiers = await TicketCategory.findAll({ where: { id: { [Op.in]: allTickets.map((t) => t.ticketCategoryId) } } });
  const tierName = new Map(tiers.map((t) => [t.id, t.name]));

  const reporting = event.gateOpenTime ?? event.eventDate;
  const tickets: TicketArtworkTicket[] = [];
  for (const [i, t] of allTickets.entries()) {
    if (t.status === 'cancelled') continue;
    // eslint-disable-next-line no-await-in-loop
    const qrPng = await generateTicketQrPng(t.qrToken);
    tickets.push({
      reference: ticketDisplayReference(booking.bookingReference, i),
      attendeeName: t.attendeeName,
      tierName: tierName.get(t.ticketCategoryId) ?? 'General',
      status: t.status,
      qrPng,
    });
  }

  return {
    bookingReference: booking.bookingReference,
    bookingStatus: booking.status,
    eventName: event.name,
    organizerName: organizer?.name ?? 'Event Organizer',
    organizerPhone: organizer?.contactPhone ?? null,
    dateLabel: event.eventDate.toLocaleDateString('en-IN', { ...IST, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    timeLabel: reporting.toLocaleTimeString('en-IN', { ...IST, hour: 'numeric', minute: '2-digit' }),
    timeCaption: event.gateOpenTime ? 'Reporting time' : 'Starts at',
    locationLabel: locationLabel(event),
    banner: await loadStoredImage(design.backgroundUrl),
    tickets,
    tagline: event.tagline,
    eventDate: event.eventDate,
    gateOpenTime: event.gateOpenTime,
    venueAddress: event.venueAddress,
    organizerLogoUrl: organizer?.logoUrl ?? null,
    backgroundUrl: design.backgroundUrl,
    partners: design.partners,
  };
}

function statusBadge(data: TicketArtworkData): { text: string; bg: string; fg: string } {
  if (data.bookingStatus === 'confirmed') return { text: 'CONFIRMED', bg: '#dcfce7', fg: '#15803d' };
  if (data.bookingStatus === 'pending') return { text: 'PAYMENT PENDING', bg: '#fef3c7', fg: '#b45309' };
  return { text: 'CANCELLED', bg: '#fee2e2', fg: '#b91c1c' };
}

// ---------------------------------------------------------------- PNG card

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const W = 1600;
const H = 900;

export async function renderTicketCardPng(data: TicketArtworkData): Promise<Buffer> {
  registerFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#eef2f7';
  ctx.fillRect(0, 0, W, H);
  roundRect(ctx, 40, 40, W - 80, H - 80, 36);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Left: event photo with the name over it
  const photo = { x: 40, y: 40, w: 560, h: H - 80 };
  ctx.save();
  roundRect(ctx, photo.x, photo.y, photo.w, photo.h, 36);
  ctx.clip();
  let drewBanner = false;
  if (data.banner) {
    try {
      coverImage(ctx, await loadImage(data.banner), photo.x, photo.y, photo.w, photo.h);
      drewBanner = true;
    } catch {
      // Unreadable image — fall through to the gradient.
    }
  }
  if (!drewBanner) {
    const g = ctx.createLinearGradient(photo.x, photo.y, photo.x + photo.w, photo.y + photo.h);
    g.addColorStop(0, '#1d4ed8');
    g.addColorStop(1, '#0f172a');
    ctx.fillStyle = g;
    ctx.fillRect(photo.x, photo.y, photo.w, photo.h);
  }
  const shade = ctx.createLinearGradient(0, photo.y + photo.h * 0.35, 0, photo.y + photo.h);
  shade.addColorStop(0, 'rgba(15,23,42,0)');
  shade.addColorStop(1, 'rgba(15,23,42,0.88)');
  ctx.fillStyle = shade;
  ctx.fillRect(photo.x, photo.y, photo.w, photo.h);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '26px "Inter"';
  ctx.fillText(data.organizerName, photo.x + 40, photo.y + photo.h - 190, photo.w - 80);
  const photoTitle = fitText(ctx, data.eventName, 'Inter Bold', 46, 30, photo.w - 80, 2);
  ctx.fillStyle = '#ffffff';
  photoTitle.lines.forEach((l, i) => ctx.fillText(l, photo.x + 40, photo.y + photo.h - 140 + i * (photoTitle.size + 8)));
  ctx.restore();

  // Middle: details
  const mx = 650;
  const mw = 520;
  ctx.fillStyle = '#475569';
  ctx.font = '26px "Inter"';
  ctx.fillText(data.organizerName, mx, 120, mw);
  const title = fitText(ctx, data.eventName, 'Inter Bold', 50, 32, mw, 2);
  ctx.fillStyle = '#0f172a';
  title.lines.forEach((l, i) => ctx.fillText(l, mx, 180 + i * (title.size + 10)));
  let y = 180 + title.lines.length * (title.size + 10) + 30;

  const field = (label: string, value: string, x: number, fy: number, width: number) => {
    ctx.fillStyle = '#64748b';
    ctx.font = '20px "Inter SemiBold"';
    ctx.fillText(label.toUpperCase(), x, fy, width);
    ctx.fillStyle = '#0f172a';
    const v = fitText(ctx, value, 'Inter SemiBold', 30, 20, width, 1);
    ctx.fillText(v.lines[0], x, fy + 38);
  };
  field('Date', data.dateLabel, mx, y, mw);
  y += 92;
  field(data.timeCaption, data.timeLabel, mx, y, 240);
  field('Location', data.locationLabel, mx + 260, y, mw - 260);
  y += 92;

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(mx, y - 10);
  ctx.lineTo(mx + mw, y - 10);
  ctx.stroke();
  y += 30;

  const lead = data.tickets[0];
  const more = data.tickets.length - 1;
  field('Participant', lead ? `${lead.attendeeName}${more > 0 ? ` +${more} more` : ''}` : '-', mx, y, mw);
  y += 92;
  field('Ticket type', lead?.tierName ?? '-', mx, y, 170);
  field('Ticket ID', lead?.reference ?? '-', mx + 190, y, mw - 190);

  // Right: QR panel with a dashed "tear" line
  const px = 1210;
  const pw = W - 40 - px - 40;
  ctx.setLineDash([12, 10]);
  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(px - 20, 80);
  ctx.lineTo(px - 20, H - 80);
  ctx.stroke();
  ctx.setLineDash([]);
  roundRect(ctx, px, 80, pw, H - 160, 28);
  ctx.fillStyle = '#f1f5f9';
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.font = '26px "Inter Bold"';
  const scanText = 'SCAN AT ENTRY';
  ctx.fillText(scanText, px + (pw - ctx.measureText(scanText).width) / 2, 145);
  if (lead) {
    const qr = await loadImage(lead.qrPng);
    const size = pw - 60;
    roundRect(ctx, px + 20, 180, pw - 40, pw - 40, 20);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.drawImage(qr, px + 30, 190, size, size);
  }
  ctx.fillStyle = '#475569';
  ctx.font = '20px "Inter"';
  const caption =
    data.tickets.length > 1 ? `Ticket 1 of ${data.tickets.length} · all QR codes on your ticket page` : 'Show this QR code at check-in';
  const cap = fitText(ctx, caption, 'Inter', 20, 16, pw - 40, 2);
  cap.lines.forEach((l, i) => ctx.fillText(l, px + (pw - ctx.measureText(l).width) / 2, 180 + pw + 10 + i * 26));

  // Booking ID and status under the QR
  const centre = (text: string, ty: number) => ctx.fillText(text, px + (pw - ctx.measureText(text).width) / 2, ty);
  let py = 180 + pw + 10 + cap.lines.length * 26 + 50;
  ctx.fillStyle = '#64748b';
  ctx.font = '18px "Inter SemiBold"';
  centre('BOOKING ID', py);
  ctx.fillStyle = '#0f172a';
  const ref = fitText(ctx, data.bookingReference, 'Inter SemiBold', 24, 16, pw - 40, 1);
  centre(ref.lines[0], py + 32);
  py += 62;
  const badge = statusBadge(data);
  ctx.font = '22px "Inter Bold"';
  const bw = ctx.measureText(badge.text).width + 44;
  roundRect(ctx, px + (pw - bw) / 2, py, bw, 44, 22);
  ctx.fillStyle = badge.bg;
  ctx.fill();
  ctx.fillStyle = badge.fg;
  centre(badge.text, py + 30);

  // Footer brand
  ctx.fillStyle = '#1d4ed8';
  ctx.font = '24px "Inter Bold"';
  ctx.fillText('INVEON EVENTS', mx, H - 90);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '20px "Inter"';
  ctx.fillText('Official booking & ticketing', mx + 210, H - 90);

  return canvas.encode('png');
}

// ---------------------------------------------------------------- PDF

const PDF_COLORS = {
  stage: '#070b16',
  strip: '#0b1325',
  line: '#334155',
  gold: '#fbbf24',
  muted: '#94a3b8',
  cream: '#fbf7ee',
  creamLine: '#e7dcc4',
  navy: '#0b1426',
  ink: '#0b1c30',
};

// One A4-landscape page per attendee, laid out like the desktop ticket:
// the organizer's stage banner, date / time / venue bar, attendee strip,
// the QR stub, Partners & Supporters and the notice bar.
export async function renderTicketPdf(data: TicketArtworkData): Promise<Buffer> {
  const header = await renderEventHeaderPng({
    backgroundUrl: data.backgroundUrl,
    organizerName: data.organizerName,
    organizerLogoUrl: data.organizerLogoUrl,
    eventName: data.eventName,
    eventDate: data.eventDate,
    tagline: data.tagline,
  });
  const partnerLogos = await Promise.all(
    data.partners.map(async (p) => emailSafePng(await loadStoredImage(p.logoUrl, 4 * 1024 * 1024), 300, 150)),
  );
  const { venue, city } = venueParts(data.venueAddress);
  const badge = statusBadge(data);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, info: { Title: `Tickets ${data.bookingReference}` } });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('R', path.join(FONT_DIR, 'Inter_400Regular.ttf'));
    doc.registerFont('S', path.join(FONT_DIR, 'Inter_600SemiBold.ttf'));
    doc.registerFont('B', path.join(FONT_DIR, 'Inter_700Bold.ttf'));
    const t = (
      font: 'R' | 'S' | 'B',
      size: number,
      color: string,
      str: string,
      x: number,
      y: number,
      opts: PDFKit.Mixins.TextOptions = {},
    ) =>
      doc
        .font(font)
        .fontSize(size)
        .fillColor(color)
        .text(str, x, y, { lineBreak: opts.width !== undefined, ...opts });

    const X = 24;
    const Y = 24;
    const W = doc.page.width - 48;
    const heroW = W - 232;
    const stubX = X + heroW;
    const headerH = (heroW * 460) / 1200;
    const heroH = headerH + 118;

    if (data.tickets.length === 0) {
      t('B', 18, '#0f172a', 'No active tickets on this booking.', X, 80);
    }

    data.tickets.forEach((ticket, i) => {
      if (i > 0) doc.addPage({ size: 'A4', layout: 'landscape', margin: 0 });
      doc.roundedRect(X, Y, W, doc.page.height - 48, 10).clip();

      // Stage
      doc.rect(X, Y, heroW, heroH).fill(PDF_COLORS.stage);
      doc.image(header, X, Y, { width: heroW, height: headerH });

      // Date / time / venue bar
      const barY = Y + headerH + 8;
      doc
        .roundedRect(X + 16, barY, heroW - 32, 44, 7)
        .fillOpacity(0.9)
        .fill('#000000')
        .fillOpacity(1);
      doc
        .roundedRect(X + 16, barY, heroW - 32, 44, 7)
        .lineWidth(0.6)
        .stroke('#3f3f46');
      const meta: [string, string, string | null][] = [
        ['DATE', istDateLabel(data.eventDate).toUpperCase(), istWeekday(data.eventDate).toUpperCase()],
        ['REPORTING TIME', istTimeLabel(data.gateOpenTime ?? data.eventDate), null],
        ['EVENT TIME', istTimeLabel(data.eventDate), 'ONWARDS'],
        ['VENUE', venue, null],
        ['CITY', city || '—', null],
      ];
      const mw = [0.24, 0.17, 0.15, 0.28, 0.16].map((f) => f * (heroW - 56));
      let mx = X + 28;
      meta.forEach(([k, v, sub], j) => {
        doc.rect(mx, barY + 10, 2, 24).fill(PDF_COLORS.gold);
        t('B', 6.5, PDF_COLORS.muted, k, mx + 8, barY + 8);
        t('B', 9, '#ffffff', v, mx + 8, barY + 18, { width: mw[j] - 14, height: 12, ellipsis: true });
        if (sub) t('S', 6.5, '#cbd5e1', sub, mx + 8, barY + 31);
        mx += mw[j];
      });

      // Attendee strip
      const sy = barY + 54;
      doc.roundedRect(X + 16, sy, heroW - 32, 48, 7).fill(PDF_COLORS.strip);
      doc
        .roundedRect(X + 16, sy, heroW - 32, 48, 7)
        .lineWidth(0.6)
        .stroke(PDF_COLORS.line);
      t('B', 6.5, PDF_COLORS.muted, 'ENTRY FOR', X + 30, sy + 10);
      t('B', 13, '#ffffff', ticket.attendeeName, X + 30, sy + 21, { width: 150, height: 17, ellipsis: true });
      t('B', 6.5, PDF_COLORS.muted, 'TICKET TYPE', X + 180, sy + 10);
      t('B', 10, PDF_COLORS.gold, ticket.tierName.toUpperCase(), X + 180, sy + 22, { width: 100, height: 13, ellipsis: true });
      const statusText = ticket.status === 'checked_in' ? 'CHECKED IN' : badge.text;
      doc.font('B').fontSize(8);
      const bw = Math.min(doc.widthOfString(statusText) + 18, 96);
      const idX = X + 288;
      const idW = X + heroW - 28 - bw - 8 - (idX + 50);
      t('S', 7, '#cbd5e1', 'TICKET ID:', idX, sy + 13);
      t('B', 7.5, '#ffffff', ticket.reference, idX + 50, sy + 12.5, { width: idW, height: 10, ellipsis: true });
      t('S', 7, '#cbd5e1', 'BOOKING ID:', idX, sy + 27);
      t('B', 7.5, '#ffffff', data.bookingReference, idX + 50, sy + 26.5, { width: idW, height: 10, ellipsis: true });
      t('B', 6.5, PDF_COLORS.muted, 'STATUS', X + heroW - 16 - 12 - bw, sy + 8, { width: bw, align: 'right' });
      doc
        .roundedRect(X + heroW - 16 - 12 - bw, sy + 20, bw, 17, 8.5)
        .fill(badge.text === 'CONFIRMED' && ticket.status !== 'checked_in' ? '#10b981' : '#64748b');
      t('B', 8, '#ffffff', statusText, X + heroW - 16 - 12 - bw, sy + 24.5, { width: bw, align: 'center' });

      // QR stub
      doc.rect(stubX, Y, W - heroW, heroH).fill(PDF_COLORS.cream);
      doc.save();
      doc.fillColor('#d4af37').fillOpacity(0.35);
      for (let dy = Y + 6; dy < Y + heroH; dy += 10) for (let dx = stubX + 6; dx < X + W; dx += 10) doc.circle(dx, dy, 0.45).fill();
      doc.restore();
      doc
        .moveTo(stubX, Y)
        .lineTo(stubX, Y + heroH)
        .dash(4, { space: 3 })
        .lineWidth(1.2)
        .stroke('#b0b7c3')
        .undash();
      const stubW = W - heroW;
      t('B', 10.5, '#0f172a', 'SCAN FOR ENTRY', stubX, Y + 26, { width: stubW, align: 'center', characterSpacing: 1.6 });
      const qr = 168;
      const qx = stubX + (stubW - qr) / 2;
      doc.roundedRect(qx - 10, Y + 52, qr + 20, qr + 20, 12).fillAndStroke('#ffffff', '#fde68a');
      doc.image(ticket.qrPng, qx, Y + 62, { width: qr, height: qr });
      t('R', 8.5, '#475569', 'Present this QR code at the event entrance.', stubX + 30, Y + 258, { width: stubW - 60, align: 'center' });
      t('S', 7, '#64748b', `${ticket.reference} • 1 ADMIT`, stubX + 10, Y + heroH - 26, { width: stubW - 20, align: 'center' });

      // Partners & technology partners
      const py = Y + heroH;
      const footerY = doc.page.height - 24 - 26;
      doc.rect(X, py, W, footerY - py).fill('#fdfbf6');
      doc
        .moveTo(X, py)
        .lineTo(X + W, py)
        .lineWidth(0.6)
        .stroke('#e2e8f0');
      const techW = 250;
      if (data.partners.length > 0) {
        t('B', 8, PDF_COLORS.ink, 'PARTNERS & SUPPORTERS', X + 18, py + 14, { characterSpacing: 1.4 });
        const cols = 5;
        const gap = 7;
        const areaW = W - techW - 36;
        const tw = (areaW - gap * (cols - 1)) / cols;
        const rows = Math.ceil(data.partners.length / cols);
        const th = Math.min(58, (footerY - py - 40 - gap * (rows - 1)) / rows);
        data.partners.forEach((p, k) => {
          const cx = X + 18 + (k % cols) * (tw + gap);
          const cy = py + 30 + Math.floor(k / cols) * (th + gap);
          doc.roundedRect(cx, cy, tw, th, 5).fillAndStroke('#ffffff', '#e2e8f0');
          const logo = partnerLogos[k];
          if (logo) doc.image(logo, cx + 8, cy + 5, { fit: [tw - 16, th - 26], align: 'center', valign: 'center' });
          t('B', 6.5, '#1e293b', (p.role || p.name).toUpperCase(), cx + 4, cy + th - 19, {
            width: tw - 8,
            align: 'center',
            height: 8,
            ellipsis: true,
          });
          if (p.role)
            t('R', 6, PDF_COLORS.muted, p.name, cx + 4, cy + th - 10, { width: tw - 8, align: 'center', height: 7, ellipsis: true });
        });
      }
      const tx = data.partners.length > 0 ? X + W - techW - 12 : X + (W - techW) / 2;
      t('B', 8, PDF_COLORS.ink, 'TECHNOLOGY PARTNERS', tx, py + 14, { width: techW, align: 'center', characterSpacing: 1.4 });
      t('B', 6, '#475569', 'TECHNOLOGY PARTNER', tx, py + 34, { width: techW / 2, align: 'center' });
      t('B', 6, '#475569', 'EVENT BOOKING PARTNER', tx + techW / 2, py + 34, { width: techW / 2, align: 'center' });
      const mark = (mx0: number, my0: number) => {
        doc.save().translate(mx0, my0).scale(0.7);
        doc.path('M4 4L16 28L28 4H20L16 16L12 4H4Z').fill('#0050cb');
        doc.path('M20 4L16 16L12 4H7L16 22L25 4H20Z').fill('#f97316');
        doc.restore();
      };
      mark(tx + 22, py + 46);
      t('B', 11, '#0f172a', 'INVEON', tx + 46, py + 47);
      t('B', 5.5, '#0050cb', 'TECHNOLOGIES', tx + 46.5, py + 61, { characterSpacing: 1 });
      doc
        .moveTo(tx + techW / 2, py + 44)
        .lineTo(tx + techW / 2, py + 72)
        .lineWidth(0.6)
        .stroke('#cbd5e1');
      mark(tx + techW / 2 + 22, py + 46);
      t('B', 11, '#0f172a', 'INVEON', tx + techW / 2 + 46, py + 47);
      t('B', 5.5, '#0050cb', 'EVENTS', tx + techW / 2 + 46.5, py + 61, { characterSpacing: 1 });
      t('S', 6.5, '#64748b', 'Digital Booking • Secure Payments • QR Ticketing', tx, py + 82, { width: techW, align: 'center' });

      // Notice bar
      doc.rect(X, footerY, W, 26).fill(PDF_COLORS.navy);
      t('R', 7.5, '#cbd5e1', 'Please carry this ticket on your phone. Valid QR ticket required for entry.', X + 16, footerY + 9);
      const contact = `For event information: ${data.organizerName}${data.organizerPhone ? `  |  ${data.organizerPhone}` : ''}`;
      t('S', 7.5, '#ffffff', contact, X + W / 2, footerY + 9, { width: W / 2 - 16, align: 'right' });
      t('R', 6.5, '#64748b', `Ticket ${i + 1} of ${data.tickets.length}`, X + W / 2 - 60, footerY + 10, { width: 120, align: 'center' });
    });

    doc.end();
  });
}
