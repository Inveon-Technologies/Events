import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D, type Image } from '@napi-rs/canvas';
import PDFDocument from 'pdfkit';
import { Op } from 'sequelize';
import { Booking, Event, Organizer, Ticket, TicketCategory } from '../models';
import { generateTicketQrPng } from './qrCode';
import { UPLOAD_DIR } from './eventMedia';
import { logger } from '../logger';

// The ticket as a picture and as a PDF, from the same data:
//   - renderTicketCardPng: a 16:9 card (event photo, details, QR) used as
//     the WhatsApp confirmation's header image and on the ticket page;
//   - renderTicketPdf: one A4 page per participant, each with its QR.

const FONT_DIR = path.join(__dirname, '../../assets/fonts');
let fontsRegistered = false;
function registerFonts(): void {
  if (fontsRegistered) return;
  GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Inter_400Regular.ttf'), 'Inter');
  GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Inter_600SemiBold.ttf'), 'Inter SemiBold');
  GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Inter_700Bold.ttf'), 'Inter Bold');
  fontsRegistered = true;
}

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
}

// Ticket number shown to people: INV-BKG-2026-8F3K2Q + #1 → INV-TKT-2026-8F3K2Q-01.
export function ticketDisplayReference(bookingReference: string, index: number): string {
  return `${bookingReference.replace(/-BKG-/, '-TKT-')}-${String(index + 1).padStart(2, '0')}`;
}

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

const MAX_BANNER_BYTES = 8 * 1024 * 1024;

// The event's banner, whether stored locally (/api/uploads/…) or on S3.
// Best-effort: a missing or slow banner gives a plain card, never an error.
async function loadBanner(bannerUrl: string | null): Promise<Buffer | null> {
  if (!bannerUrl) return null;
  try {
    const local = bannerUrl.match(/^\/api\/uploads\/([^/?#]+)$/);
    if (local) return await fs.readFile(path.join(UPLOAD_DIR, path.basename(local[1])));
    if (!/^https:\/\//.test(bannerUrl)) return null;
    const res = await fetch(bannerUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length <= MAX_BANNER_BYTES ? buf : null;
  } catch (err) {
    logger.warn({ err, bannerUrl }, 'Could not load event banner for the ticket');
    return null;
  }
}

export async function loadTicketArtworkData(booking: Booking): Promise<TicketArtworkData> {
  const event = await Event.findByPk(booking.eventId);
  if (!event) throw new Error('Event not found for booking');
  const organizer = await Organizer.findByPk(event.organizerId, { attributes: ['name', 'contactPhone'] });
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
    banner: await loadBanner(event.bannerUrl),
    tickets,
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

// Shrinks the font until the text fits `maxWidth` in at most `maxLines`
// lines; returns the lines and the size used.
function fitText(
  ctx: SKRSContext2D,
  text: string,
  font: string,
  start: number,
  min: number,
  maxWidth: number,
  maxLines: number,
): { lines: string[]; size: number } {
  for (let size = start; size >= min; size -= 2) {
    ctx.font = `${size}px "${font}"`;
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth) line = next;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxWidth)) return { lines, size };
  }
  ctx.font = `${min}px "${font}"`;
  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) clipped = clipped.slice(0, -1);
  return { lines: [`${clipped}…`], size: min };
}

function coverImage(ctx: SKRSContext2D, img: Image, x: number, y: number, w: number, h: number): void {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
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

async function bannerJpeg(banner: Buffer | null): Promise<Buffer | null> {
  if (!banner) return null;
  try {
    const img = await loadImage(banner);
    const w = 1000;
    const h = 380;
    const c = createCanvas(w, h);
    coverImage(c.getContext('2d'), img, 0, 0, w, h);
    return await c.encode('jpeg', 85);
  } catch {
    return null;
  }
}

export async function renderTicketPdf(data: TicketArtworkData): Promise<Buffer> {
  const banner = await bannerJpeg(data.banner);
  const badge = statusBadge(data);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Tickets ${data.bookingReference}` } });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Inter, not the built-in Helvetica: it has "→" and matches the card.
    doc.registerFont('Inter', path.join(FONT_DIR, 'Inter_400Regular.ttf'));
    doc.registerFont('Inter-Bold', path.join(FONT_DIR, 'Inter_700Bold.ttf'));

    const pageW = doc.page.width;
    const left = 40;
    const width = pageW - 80;

    const tickets = data.tickets.length ? data.tickets : [];
    if (tickets.length === 0) {
      doc.font('Inter-Bold').fontSize(18).text('No active tickets on this booking.', left, 80);
    }

    tickets.forEach((ticket, i) => {
      if (i > 0) doc.addPage();
      doc.rect(0, 0, pageW, 56).fill('#0f172a');
      doc.fillColor('#ffffff').font('Inter-Bold').fontSize(16).text('INVEON EVENTS', left, 20);
      doc
        .font('Inter')
        .fontSize(10)
        .fillColor('#cbd5e1')
        .text(`Ticket ${i + 1} of ${tickets.length}`, left, 24, { width, align: 'right' });

      let y = 76;
      if (banner) {
        doc.image(banner, left, y, { width, height: width * 0.38 });
        y += width * 0.38 + 18;
      }
      doc.fillColor('#475569').font('Inter').fontSize(11).text(data.organizerName, left, y);
      y += 16;
      doc.fillColor('#0f172a').font('Inter-Bold').fontSize(22).text(data.eventName, left, y, { width });
      y = doc.y + 14;

      const row = (label: string, value: string, x: number, ry: number, w: number) => {
        doc.fillColor('#64748b').font('Inter-Bold').fontSize(8).text(label.toUpperCase(), x, ry, { width: w });
        doc
          .fillColor('#0f172a')
          .font('Inter')
          .fontSize(12)
          .text(value, x, ry + 11, { width: w });
      };
      const col = (width - 190) / 2;
      row('Date', data.dateLabel, left, y, col);
      row(data.timeCaption, data.timeLabel, left + col, y, col);
      y += 40;
      row('Location', data.locationLabel, left, y, col * 2);
      y += 40;
      row('Participant', ticket.attendeeName, left, y, col);
      row('Ticket type', ticket.tierName, left + col, y, col);
      y += 40;
      row('Ticket ID', ticket.reference, left, y, col);
      row('Booking ID', data.bookingReference, left + col, y, col);
      y += 40;
      doc
        .fillColor(badge.fg)
        .font('Inter-Bold')
        .fontSize(11)
        .text(ticket.status === 'checked_in' ? 'CHECKED IN' : badge.text, left, y);

      const qrX = left + width - 180;
      const qrY = y - 160;
      doc
        .fillColor('#0f172a')
        .font('Inter-Bold')
        .fontSize(10)
        .text('SCAN AT ENTRY', qrX, qrY - 16, { width: 180, align: 'center' });
      doc.image(ticket.qrPng, qrX, qrY, { width: 180, height: 180 });

      y += 40;
      doc
        .fillColor('#475569')
        .font('Inter')
        .fontSize(10)
        .text(
          'Show this QR code at check-in, on your phone or printed. Each participant has their own QR code; it can be scanned once.',
          left,
          y,
          { width },
        );
      if (data.organizerPhone) {
        doc.moveDown(0.5).text(`Need help? Contact ${data.organizerName}: ${data.organizerPhone}`, { width });
      }
    });

    doc.end();
  });
}
