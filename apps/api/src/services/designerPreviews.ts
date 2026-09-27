import type { BookingDocumentData } from './bookingDocuments';
import { generateInvoicePdf } from './invoice';
import type { InvoiceLayout } from './invoiceLayout';
import { defaultCertificateDesign } from './certificateDesign';
import { loadCertificateAssets, loadFooterAssets, renderCertificatePng } from './certificateRenderer';
import type { CertificateFooterDesign } from './certificateFooterDesign';
import { EMAIL_TEMPLATE_DEFS, renderEmailFromTemplate, type EmailTemplate, type EmailTemplateKey } from './emailTemplates';
import { ticketConfirmationParts } from '../emails/ticketConfirmation';
import { generateTicketQrPng } from './qrCode';

// Sample renders for the super admin portal's designers: what a design
// looks like on a real certificate, invoice or email before it's saved.
// Same renderers as the real documents, fed made-up booking data.

export function sampleBookingDocument(): BookingDocumentData {
  const eventDate = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  return {
    bookingId: 'sample',
    bookingReference: 'INV-BKG-2026-SAMPLE',
    bookingStatus: 'confirmed',
    bookedAt: new Date(),
    customer: { name: 'Rahul Sharma', email: 'rahul@example.com', phone: '9876543210', city: 'Pune' },
    event: {
      name: 'Rajgad Sunrise Trek',
      tagline: 'Watch the sunrise from Balekilla',
      eventDate,
      gateOpenTime: null,
      venueAddress: 'Gunjavane Village, Velhe, Pune, Maharashtra, 412213',
    },
    organizer: {
      name: 'Sahyadri Trekkers',
      contactEmail: 'hello@example.com',
      contactPhone: '98765 43210',
      logoUrl: null,
      gstNumber: null,
      panNumber: null,
    },
    tickets: [
      {
        id: 't1',
        displayReference: 'INV-TKT-2026-SAMPLE-01',
        attendeeName: 'Rahul Sharma',
        tierName: 'General',
        tierDescription: 'Guide, breakfast and entry',
        unitPricePaise: 149900,
        status: 'valid',
        qrToken: 'sample-1',
      },
      {
        id: 't2',
        displayReference: 'INV-TKT-2026-SAMPLE-02',
        attendeeName: 'Priya Sharma',
        tierName: 'General',
        tierDescription: 'Guide, breakfast and entry',
        unitPricePaise: 149900,
        status: 'valid',
        qrToken: 'sample-2',
      },
    ],
    totalPaise: 299800,
    payment: {
      method: 'online',
      status: 'paid',
      gatewayReference: 'INV-BKG-2026-SAMPLE',
      transactionReference: '412345678901',
      paidAt: new Date(),
    },
    design: { backgroundUrl: null, partners: [] },
    links: { ticketPage: 'https://events.inveontechnologies.in/t/sample', ticketPdf: null },
  };
}

export function invoicePreviewPdf(layout: InvoiceLayout): Promise<Buffer> {
  return generateInvoicePdf(sampleBookingDocument(), new Date(), layout);
}

export async function certificateFooterPreviewPng(design: CertificateFooterDesign): Promise<Buffer> {
  const body = defaultCertificateDesign();
  const assets = await loadCertificateAssets(body, null, []);
  assets.footer = await loadFooterAssets(design);
  return renderCertificatePng(
    body,
    assets,
    {
      participant: 'Rahul Sharma',
      event: 'Rajgad Sunrise Trek',
      year: String(new Date().getFullYear()),
      date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }),
      organizer: 'Sahyadri Trekkers',
      tagline: 'Watch the sunrise from Balekilla',
      venue: 'Rajgad Fort',
      certificateNo: 'INV-CRT-2026-SAMPLE-01',
    },
    true,
  );
}

// Sample email as HTML, with the QR codes inlined so it shows in the
// portal (a real email carries them as attachments).
export async function emailPreview(key: EmailTemplateKey, template: EmailTemplate): Promise<{ subject: string; html: string }> {
  const sample = EMAIL_TEMPLATE_DEFS[key].sample;
  let sections: Record<string, string> = {};
  const images: Record<string, string> = {};
  if (key === 'bookingConfirmation') {
    const d = sampleBookingDocument();
    const tickets = [];
    for (const [i, t] of d.tickets.entries()) {
      // eslint-disable-next-line no-await-in-loop
      images[`ticket-qr-${i + 1}`] = `data:image/png;base64,${(await generateTicketQrPng(t.qrToken)).toString('base64')}`;
      tickets.push({
        attendeeName: t.attendeeName,
        tierName: t.tierName,
        ticketId: t.displayReference,
        statusText: 'CONFIRMED',
        qrCid: `ticket-qr-${i + 1}`,
      });
    }
    sections = ticketConfirmationParts({
      headerCid: null,
      eventName: sample.eventName,
      customerName: sample.customerName,
      bookingReference: sample.bookingReference,
      statusLine: 'your payment has been successfully verified and your entry tickets have been generated',
      dateLabel: sample.eventDate,
      weekday: 'Saturday',
      reportingTime: null,
      eventTime: sample.eventTime,
      venue: sample.venue,
      city: sample.city,
      organizerName: sample.organizerName,
      organizerPhone: sample.organizerPhone,
      organizerLogoCid: null,
      inviteNote: `We look forward to welcoming you in ${sample.city}. Please carry your ticket QR on your phone.`,
      tickets,
      ticketPageUrl: sample.ticketPageUrl,
      ticketPdfUrl: null,
      partners: [
        { name: 'Your partner', role: 'Co-Sponsor', logoCid: null },
        { name: 'Your partner', role: 'Media Partner', logoCid: null },
      ],
      amountLine: `Amount paid: ${sample.amount} · Invoice attached`,
      supportEmail: sample.supportEmail,
    });
  }
  const out = renderEmailFromTemplate(key, template, sample, sections);
  const html = out.html.replace(/cid:([\w-]+)/g, (m, cid: string) => images[cid] ?? m);
  return { subject: out.subject, html };
}
