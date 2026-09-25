import { amountInWords, invoiceNumber, generateInvoicePdf } from '../src/services/invoice';
import type { BookingDocumentData } from '../src/services/bookingDocuments';

describe('invoice', () => {
  it('writes amounts in words with Indian numbering', () => {
    expect(amountInWords(149800)).toBe('Rupees One Thousand Four Hundred Ninety-Eight Only');
    expect(amountInWords(0)).toBe('Rupees Zero Only');
    expect(amountInWords(12345678950)).toBe(
      'Rupees Twelve Crore Thirty-Four Lakh Fifty-Six Thousand Seven Hundred Eighty-Nine and Fifty Paise Only',
    );
  });

  it('derives the invoice number from the booking reference', () => {
    expect(invoiceNumber('INV-BKG-2026-X07C1FHF')).toBe('INV-2026-X07C1FHF');
  });

  const data = (gst: string | null): BookingDocumentData => ({
    bookingId: 'b1',
    bookingReference: 'INV-BKG-2026-AB12CD',
    bookingStatus: 'confirmed',
    bookedAt: new Date('2026-09-01T05:00:00Z'),
    customer: { name: 'Rahul Sharma', email: 'rahul@example.com', phone: '9876543210', city: null },
    event: {
      name: 'Dandiya Night 2026',
      tagline: null,
      eventDate: new Date('2026-10-18T13:30:00Z'),
      gateOpenTime: null,
      venueAddress: 'Ground, Pune, Maharashtra, 411001',
    },
    organizer: {
      name: 'Eco Pandhari Club',
      contactEmail: null,
      contactPhone: '0788 750 3856',
      logoUrl: null,
      gstNumber: gst,
      panNumber: null,
    },
    tickets: [
      {
        id: 't1',
        displayReference: 'INV-TKT-2026-AB12CD-01',
        attendeeName: 'Rahul',
        tierName: 'General',
        tierDescription: null,
        unitPricePaise: 49900,
        status: 'valid',
        qrToken: 'q1',
      },
    ],
    totalPaise: 49900,
    payment: { method: 'online', status: 'paid', gatewayReference: 'CF-1', paidAt: new Date() },
    design: { backgroundUrl: null, partners: [] },
    links: { ticketPage: null, ticketPdf: null },
  });

  it('renders a PDF for both a GST-registered and an unregistered organizer', async () => {
    for (const gst of ['27AABCE1234F1Z5', null]) {
      // eslint-disable-next-line no-await-in-loop
      const pdf = await generateInvoicePdf(data(gst));
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.length).toBeGreaterThan(5000);
    }
  });
});
