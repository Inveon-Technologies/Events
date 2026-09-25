import path from 'node:path';
import PDFDocument from 'pdfkit';
import type { BookingDocumentData, BookingDocumentTicket } from './bookingDocuments';
import { istDateLabel, istTimeLabel, venueParts } from './bookingDocuments';
import { SUPPORT_EMAIL } from '../emails/templates';

// The invoice attached to the confirmation email, laid out after the
// approved template: header with badge, Billed To / Issued By, event
// strip, item table, payment details, tax & amount breakdown, terms and
// signatory, footer.
//
// A GST tax invoice (prices GST-inclusive, 18% = CGST 9% + SGST 9%,
// SAC 999691) only when the organizer has registered a GSTIN — an
// organizer without one cannot issue a tax invoice, so theirs is a plain
// payment receipt with no tax lines.

const FONT_DIR = path.join(__dirname, '../../assets/fonts');
const SAC_CODE = '999691'; // Services by way of admission to recreational / cultural events
const GST_RATE = 0.18;

const C = {
  ink: '#111827',
  body: '#374151',
  muted: '#6b7280',
  faint: '#9ca3af',
  line: '#e2e8f0',
  panel: '#f8fafc',
  blue: '#1d4ed8',
  blueSoft: '#eff6ff',
  blueLine: '#bfdbfe',
  green: '#15803d',
  greenSoft: '#dcfce7',
  amber: '#b45309',
  amberSoft: '#fef3c7',
  orange: '#f97316',
};

export function invoiceNumber(bookingReference: string): string {
  // INV-BKG-2026-X07C1FHF → INV-2026-X07C1FHF
  return bookingReference.replace(/^INV-BKG-/, 'INV-');
}

function inr(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ''}`;
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', rest ? belowHundred(rest) : ''].filter(Boolean).join(' ');
}

// Indian numbering: 1,23,45,678 → "One Crore Twenty-Three Lakh …".
export function amountInWords(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const p = paise % 100;
  const parts: string[] = [];
  let n = rupees;
  const crore = Math.floor(n / 1e7);
  n %= 1e7;
  const lakh = Math.floor(n / 1e5);
  n %= 1e5;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${crore >= 1000 ? amountInWords(crore * 100).replace(/^Rupees | Only$/g, '') : belowThousand(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (n) parts.push(belowThousand(n));
  const words = parts.join(' ') || 'Zero';
  return `Rupees ${words}${p ? ` and ${belowHundred(p)} Paise` : ''} Only`;
}

interface InvoiceLine {
  title: string;
  subtitle: string | null;
  detail: string;
  quantity: number;
  unitPaise: number;
  totalPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
}

// One line per ticket type; GST backed out of the inclusive price.
function buildLines(tickets: BookingDocumentTicket[], taxed: boolean): InvoiceLine[] {
  const byTier = new Map<string, BookingDocumentTicket[]>();
  for (const t of tickets) byTier.set(t.tierName, [...(byTier.get(t.tierName) ?? []), t]);
  return [...byTier.values()].map((group) => {
    const unitPaise = group[0].unitPricePaise;
    const totalPaise = unitPaise * group.length;
    const taxablePaise = taxed ? Math.round(totalPaise / (1 + GST_RATE)) : totalPaise;
    const gst = totalPaise - taxablePaise;
    const cgstPaise = Math.floor(gst / 2);
    return {
      title: group[0].tierName,
      subtitle: group[0].tierDescription,
      detail: group.map((t) => `${t.displayReference} (${t.attendeeName})`).join(', '),
      quantity: group.length,
      unitPaise: taxed ? Math.round(taxablePaise / group.length) : unitPaise,
      totalPaise,
      taxablePaise,
      cgstPaise,
      sgstPaise: gst - cgstPaise,
    };
  });
}

// "Venue, Street, City, State, 411001" → "State".
function stateOf(address: string | null): string | null {
  const pieces = (address ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !/^\d{6}$/.test(s));
  return pieces.length >= 3 ? pieces[pieces.length - 1] : null;
}

function paymentSummary(d: BookingDocumentData): { method: string; gateway: string; status: string; paid: boolean } {
  if (d.totalPaise === 0) return { method: 'Free registration', gateway: 'Not applicable', status: 'FREE', paid: true };
  if (d.payment.status === 'refunded') return { method: 'Online payment', gateway: 'Cashfree Payments India', status: 'REFUNDED', paid: true };
  if (d.payment.method === 'cash') {
    return d.payment.status === 'paid'
      ? { method: 'Cash at venue', gateway: 'Collected by organizer', status: 'PAID', paid: true }
      : { method: 'Pay at venue (cash)', gateway: 'Collected by organizer', status: 'DUE AT VENUE', paid: false };
  }
  return d.payment.status === 'paid'
    ? { method: 'Online (UPI / Card / Netbanking)', gateway: 'Cashfree Payments India', status: 'CAPTURED', paid: true }
    : { method: 'Online (UPI / Card / Netbanking)', gateway: 'Cashfree Payments India', status: 'PENDING', paid: false };
}

function inveonMark(doc: PDFKit.PDFDocument, x: number, y: number, size: number): void {
  const s = size / 32;
  doc.save().translate(x, y).scale(s);
  doc.path('M4 4L16 28L28 4H20L16 16L12 4H4Z').fill('#0050cb');
  doc.path('M20 4L16 16L12 4H7L16 22L25 4H20Z').fill(C.orange);
  doc.restore();
}

export async function generateInvoicePdf(d: BookingDocumentData, issuedAt: Date = new Date()): Promise<Buffer> {
  const taxed = Boolean(d.organizer.gstNumber);
  const lines = buildLines(d.tickets, taxed);
  const pay = paymentSummary(d);
  const number = invoiceNumber(d.bookingReference);
  const subtotal = lines.reduce((s, l) => s + l.taxablePaise, 0);
  const cgst = lines.reduce((s, l) => s + l.cgstPaise, 0);
  const sgst = lines.reduce((s, l) => s + l.sgstPaise, 0);
  const paidPaise = pay.paid ? d.totalPaise : 0;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36, info: { Title: `${taxed ? 'Tax Invoice' : 'Payment Receipt'} ${number}`, Author: 'Inveon Events' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('R', path.join(FONT_DIR, 'Inter_400Regular.ttf'));
    doc.registerFont('S', path.join(FONT_DIR, 'Inter_600SemiBold.ttf'));
    doc.registerFont('B', path.join(FONT_DIR, 'Inter_700Bold.ttf'));

    const L = 36;
    const R = doc.page.width - 36;
    const Wd = R - L;
    const text = (font: 'R' | 'S' | 'B', size: number, color: string, str: string, x: number, y: number, opts: PDFKit.Mixins.TextOptions = {}) => {
      doc.font(font).fontSize(size).fillColor(color).text(str, x, y, { lineBreak: opts.width !== undefined, ...opts });
    };
    const label = (str: string, x: number, y: number, w = 110) => text('S', 7.5, C.muted, str, x, y, { width: w });

    // ---- Header
    inveonMark(doc, L, 36, 30);
    text('B', 17, C.ink, 'INVEON', L + 36, 38);
    text('B', 7, C.blue, 'E V E N T S', L + 37, 58);
    const badge = taxed ? 'TAX INVOICE / RECEIPT' : 'PAYMENT RECEIPT';
    doc.font('B').fontSize(9);
    const bw = doc.widthOfString(badge) + 20;
    doc.roundedRect(R - bw, 36, bw, 20, 10).fill(C.blueSoft);
    text('B', 9, C.blue, badge, R - bw + 10, 41.5);
    const meta: [string, string][] = [
      ['Invoice No.', number],
      ['Invoice Date', istDateLabel(issuedAt)],
      ['Booking ID', d.bookingReference],
    ];
    meta.forEach(([k, v], i) => {
      text('R', 8, C.muted, k, R - 220, 64 + i * 12, { width: 80 });
      text('B', 8, C.ink, v, R - 140, 64 + i * 12, { width: 140, align: 'right' });
    });
    doc.rect(L, 104, Wd, 2).fill(C.blue);

    // ---- Parties
    let y = 116;
    const colW = (Wd - 12) / 2;
    const boxH = 104;
    doc.roundedRect(L, y, Wd, boxH + 16, 6).fill(C.panel);
    const party = (x: number, title: string, rows: [string, string][], heading: string, tag: string | null) => {
      doc.roundedRect(x + 8, y + 8, colW - 8, boxH, 4).fillAndStroke('#ffffff', C.line);
      text('B', 7.5, C.blue, title, x + 18, y + 16);
      if (tag) {
        doc.font('B').fontSize(6.5);
        const tw = doc.widthOfString(tag) + 10;
        doc.roundedRect(x + colW - 10 - tw, y + 14, tw, 11, 5.5).fill(C.greenSoft);
        text('B', 6.5, C.green, tag, x + colW - 5 - tw, y + 16.5);
      }
      text('B', 11, C.ink, heading, x + 18, y + 29, { width: colW - 30, height: 14, ellipsis: true });
      rows.forEach(([k, v], i) => {
        label(k, x + 18, y + 48 + i * 13, 80);
        text('R', 8, C.body, v, x + 96, y + 47.5 + i * 13, { width: colW - 106, height: 11, ellipsis: true });
      });
    };
    const placeOfSupply = stateOf(d.event.venueAddress);
    const billedTo: [string, string][] = [
      ['Email:', d.customer.email],
      ['Phone:', d.customer.phone],
      ...(placeOfSupply ? ([['Place of Supply:', `${placeOfSupply}, India`]] as [string, string][]) : []),
      ...(d.customer.city ? ([['City:', d.customer.city]] as [string, string][]) : []),
    ];
    party(L, 'BILLED TO (CUSTOMER)', billedTo.slice(0, 4), d.customer.name, null);
    const issuedBy: [string, string][] = [
      ['Contact:', d.organizer.contactPhone || '—'],
      ...(d.organizer.contactEmail ? ([['Email:', d.organizer.contactEmail]] as [string, string][]) : []),
      ...(d.organizer.gstNumber ? ([['GSTIN:', d.organizer.gstNumber]] as [string, string][]) : []),
      ...(d.organizer.panNumber ? ([['PAN:', d.organizer.panNumber]] as [string, string][]) : []),
      ['Platform:', 'Inveon Events (booking partner)'],
    ];
    party(L + colW + 4, 'ISSUED BY / ORGANIZER', issuedBy.slice(0, 4), d.organizer.name, 'VERIFIED ORGANIZER');
    y += boxH + 28;

    // ---- Event strip
    const { venue, city } = venueParts(d.event.venueAddress);
    doc.roundedRect(L, y, Wd, 34, 4).fillAndStroke(C.blueSoft, C.blueLine);
    const strip: [string, string][] = [
      ['EVENT', d.event.name],
      ['DATE', istDateLabel(d.event.eventDate)],
      [d.event.gateOpenTime ? 'REPORTING' : 'STARTS', istTimeLabel(d.event.gateOpenTime ?? d.event.eventDate)],
      ['VENUE', [venue, city].filter(Boolean).join(', ')],
    ];
    const sw = [Wd * 0.3, Wd * 0.2, Wd * 0.14, Wd * 0.36];
    let sx = L + 10;
    strip.forEach(([k, v], i) => {
      text('S', 6.5, C.muted, k, sx, y + 7);
      text('B', 8, C.ink, v, sx, y + 17, { width: sw[i] - 14, height: 11, ellipsis: true });
      sx += sw[i];
    });
    y += 46;

    // ---- Item table
    const cols = taxed
      ? [
          { h: '#', w: 20, a: 'left' as const },
          { h: 'Item Description', w: 160, a: 'left' as const },
          { h: 'SAC', w: 40, a: 'center' as const },
          { h: 'Qty', w: 26, a: 'center' as const },
          { h: 'Unit Price', w: 52, a: 'right' as const },
          { h: 'Taxable Value', w: 58, a: 'right' as const },
          { h: 'CGST (9%)', w: 50, a: 'right' as const },
          { h: 'SGST (9%)', w: 50, a: 'right' as const },
          { h: 'Total (INR)', w: 57, a: 'right' as const },
        ]
      : [
          { h: '#', w: 24, a: 'left' as const },
          { h: 'Item Description', w: 297, a: 'left' as const },
          { h: 'Qty', w: 40, a: 'center' as const },
          { h: 'Unit Price', w: 75, a: 'right' as const },
          { h: 'Total (INR)', w: 75, a: 'right' as const },
        ];
    const pad = 6;
    doc.rect(L, y, Wd, 20).fill('#1e293b');
    let cx = L + pad;
    for (const c of cols) {
      text('B', 7, '#ffffff', c.h, cx, y + 6.5, { width: c.w - 4, align: c.a });
      cx += c.w;
    }
    y += 20;
    lines.forEach((l, i) => {
      const descW = cols[1].w - 6;
      doc.font('B').fontSize(8.5);
      const hTitle = doc.heightOfString(l.title, { width: descW });
      doc.font('R').fontSize(7.5);
      const hSub = l.subtitle ? doc.heightOfString(l.subtitle, { width: descW }) : 0;
      doc.font('R').fontSize(7);
      const hDetail = doc.heightOfString(`Pass ID: ${l.detail}`, { width: descW });
      const rowH = Math.max(28, hTitle + hSub + hDetail + 14);
      if (i % 2 === 1) doc.rect(L, y, Wd, rowH).fill('#f8fafc');
      const cells = taxed
        ? [String(i + 1).padStart(2, '0'), '', SAC_CODE, String(l.quantity), inr(l.unitPaise), inr(l.taxablePaise), inr(l.cgstPaise), inr(l.sgstPaise), inr(l.totalPaise)]
        : [String(i + 1).padStart(2, '0'), '', String(l.quantity), inr(l.unitPaise), inr(l.totalPaise)];
      cx = L + pad;
      cols.forEach((c, j) => {
        if (j === 1) {
          text('B', 8.5, C.ink, l.title, cx, y + 6, { width: descW });
          let dy = y + 6 + hTitle;
          if (l.subtitle) {
            text('R', 7.5, C.muted, l.subtitle, cx, dy, { width: descW });
            dy += hSub;
          }
          text('R', 7, C.faint, `Pass ID: ${l.detail}`, cx, dy + 1, { width: descW });
        } else {
          text(j === cols.length - 1 ? 'B' : 'R', 8, C.ink, cells[j], cx, y + 7, { width: c.w - 4, align: c.a });
        }
        cx += c.w;
      });
      y += rowH;
      doc.moveTo(L, y).lineTo(R, y).lineWidth(0.5).stroke(C.line);
    });
    y += 14;

    // ---- Payment (left) + breakdown (right)
    const halfW = (Wd - 14) / 2;
    const topY = y;
    doc.roundedRect(L, y, halfW, 116, 5).stroke(C.line);
    text('B', 8, C.ink, 'PAYMENT & TRANSACTION DETAILS', L + 12, y + 11);
    doc.font('B').fontSize(6.5);
    const pw = doc.widthOfString(pay.status) + 10;
    doc.roundedRect(L + halfW - 12 - pw, y + 9, pw, 12, 6).fill(pay.paid ? C.greenSoft : C.amberSoft);
    text('B', 6.5, pay.paid ? C.green : C.amber, pay.status, L + halfW - 7 - pw, y + 12);
    const payRows: [string, string][] = [
      ['Payment Gateway:', pay.gateway],
      ['Payment Method:', pay.method],
      ['Order ID:', d.bookingReference],
      ['Bank Ref / TXN ID:', d.payment.gatewayReference ?? '—'],
      ['Payment Date & Time:', d.payment.paidAt ? `${istDateLabel(d.payment.paidAt)}, ${istTimeLabel(d.payment.paidAt)} IST` : '—'],
    ];
    payRows.forEach(([k, v], i) => {
      label(k, L + 12, y + 32 + i * 16, 100);
      text('S', 8, C.ink, v, L + 112, y + 31.5 + i * 16, { width: halfW - 124, height: 11, ellipsis: true });
    });

    const bx = L + halfW + 14;
    doc.roundedRect(bx, y, halfW, 116, 5).fill(C.panel);
    text('B', 8, C.ink, taxed ? 'TAX & FINANCIAL BREAKDOWN' : 'AMOUNT SUMMARY', bx + 12, y + 11);
    const brk: [string, string][] = taxed
      ? [
          ['Subtotal (Taxable Value):', inr(subtotal)],
          ['CGST @ 9%:', inr(cgst)],
          ['SGST @ 9%:', inr(sgst)],
          ['Convenience / Platform Fee:', 'Included (₹0.00)'],
        ]
      : [
          ['Subtotal:', inr(d.totalPaise)],
          ['GST:', 'Not applicable'],
          ['Convenience / Platform Fee:', 'Included (₹0.00)'],
        ];
    let by = y + 28;
    for (const [k, v] of brk) {
      text('R', 8, C.body, k, bx + 12, by, { width: 140 });
      text('S', 8, C.ink, v, bx + 12, by, { width: halfW - 24, align: 'right' });
      by += 13;
    }
    doc.moveTo(bx + 12, by + 1).lineTo(bx + halfW - 12, by + 1).lineWidth(0.5).stroke(C.line);
    text('B', 9.5, C.ink, 'Total Invoice Amount:', bx + 12, by + 6, { width: 150 });
    text('B', 11, C.blue, inr(d.totalPaise), bx + 12, by + 5, { width: halfW - 24, align: 'right' });
    text('R', 6.8, C.muted, amountInWords(d.totalPaise), bx + 12, by + 21, { width: halfW - 24, height: 9, ellipsis: true });
    y = topY + 124;
    doc.roundedRect(L, y, Wd, 24, 4).fill(pay.paid ? '#f0fdf4' : '#fffbeb');
    text('S', 8.5, C.body, `Amount Paid: ${inr(paidPaise)}`, L + 12, y + 8);
    text('B', 9, pay.paid ? C.green : C.amber, `BALANCE DUE: ${inr(d.totalPaise - paidPaise)}${pay.paid ? '' : ' (payable at venue)'}`, L + 12, y + 7.5, {
      width: Wd - 24,
      align: 'right',
    });
    y += 36;

    // ---- Terms + signatory
    const termsW = Wd * 0.64;
    text('B', 8, C.ink, 'TERMS & DECLARATION', L, y);
    const terms = [
      taxed
        ? 'This is a computer-generated tax invoice and receipt issued under Section 31 of the CGST Act, 2017, and does not require a physical signature. Prices are inclusive of GST.'
        : 'This is a computer-generated payment receipt and does not require a physical signature. The organizer is not GST-registered, so no tax is charged or shown.',
      `Issued for event registration and digital ticketing services provided by ${d.organizer.name} through the Inveon Events ticketing platform.`,
      `Cancellation and refund eligibility are governed by the organizer's policy. For refunds or queries, quote Booking ID ${d.bookingReference}.`,
    ];
    let ty = y + 13;
    for (const t of terms) {
      text('R', 7.2, C.body, `•  ${t}`, L, ty, { width: termsW });
      ty = doc.y + 3;
    }
    const sx0 = L + termsW + 16;
    const sW = R - sx0;
    doc.roundedRect(sx0, y, sW, 70, 5).dash(3, { space: 2 }).stroke(C.blueLine).undash();
    text('B', 7.5, C.muted, 'AUTHORIZED SIGNATORY', sx0, y + 10, { width: sW, align: 'center' });
    text('B', 9.5, C.ink, d.organizer.name, sx0 + 6, y + 28, { width: sW - 12, align: 'center', height: 13, ellipsis: true });
    text('S', 7, C.green, '✓ Digitally verified by Inveon Events', sx0, y + 48, { width: sW, align: 'center' });

    // ---- Footer
    const fy = doc.page.height - 36 - 30;
    doc.moveTo(L, fy).lineTo(R, fy).lineWidth(0.7).stroke(C.line);
    text('R', 7.2, C.muted, `Thank you for booking with Inveon Events. For billing queries, contact ${SUPPORT_EMAIL}`, L, fy + 10, { width: Wd * 0.5 });
    inveonMark(doc, L + Wd * 0.56, fy + 8, 16);
    text('B', 9, C.ink, 'INVEON EVENTS', L + Wd * 0.56 + 20, fy + 8);
    text('R', 6.5, C.muted, 'Inveon Technologies', L + Wd * 0.56 + 20, fy + 19);
    text('B', 7.5, C.ink, `INVOICE: ${number}`, R - 150, fy + 12, { width: 150, align: 'right' });

    doc.end();
  });
}
