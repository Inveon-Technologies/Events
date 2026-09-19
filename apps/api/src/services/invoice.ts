import PDFDocument from 'pdfkit';

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPricePaise: number;
}

export interface InvoiceParams {
  bookingReference: string;
  eventName: string;
  eventDate: Date;
  venueAddress: string | null;
  organizerName: string;
  customerName: string;
  customerEmail: string;
  lineItems: InvoiceLineItem[];
  totalPaise: number;
  createdAt: Date;
}

function formatINR(paise: number): string {
  return `Rs. ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function generateInvoicePdf(params: InvoiceParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc
      .fillColor('#2563eb')
      .fontSize(22)
      .font('Helvetica-Bold')
      .text('Inveon Events', 50, 50);
    doc
      .fillColor('#64748b')
      .fontSize(10)
      .font('Helvetica')
      .text('Booking Invoice', 50, 78);

    doc
      .fillColor('#0f172a')
      .fontSize(10)
      .text(`Invoice / Booking Ref: ${params.bookingReference}`, 50, 110)
      .text(`Issued: ${params.createdAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`, 50, 126);

    // Bill-to / event panel
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('Billed To', 50, 160)
      .font('Helvetica')
      .fontSize(10)
      .text(params.customerName, 50, 178)
      .text(params.customerEmail, 50, 193);

    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('Event', 320, 160)
      .font('Helvetica')
      .fontSize(10)
      .text(params.eventName, 320, 178, { width: 220 })
      .text(
        params.eventDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
        320,
        193,
        { width: 220 },
      )
      .text(params.venueAddress ?? '', 320, 208, { width: 220 })
      .text(`Organized by ${params.organizerName}`, 320, 223, { width: 220 });

    // Line items table
    let y = 270;
    doc
      .rect(50, y, 495, 24)
      .fill('#f1f5f9');
    doc
      .fillColor('#334155')
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('DESCRIPTION', 60, y + 7)
      .text('QTY', 340, y + 7, { width: 50, align: 'right' })
      .text('UNIT PRICE', 390, y + 7, { width: 70, align: 'right' })
      .text('AMOUNT', 465, y + 7, { width: 70, align: 'right' });

    y += 24;
    doc.font('Helvetica').fillColor('#0f172a').fontSize(10);
    for (const item of params.lineItems) {
      const amount = item.quantity * item.unitPricePaise;
      doc
        .text(item.description, 60, y + 10, { width: 270 })
        .text(String(item.quantity), 340, y + 10, { width: 50, align: 'right' })
        .text(formatINR(item.unitPricePaise), 390, y + 10, { width: 70, align: 'right' })
        .text(formatINR(amount), 465, y + 10, { width: 70, align: 'right' });
      y += 28;
      doc.moveTo(50, y).lineTo(545, y).strokeColor('#e2e8f0').stroke();
    }

    // Total
    y += 16;
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#0f172a')
      .text('Total Paid', 340, y, { width: 120, align: 'right' })
      .fillColor('#2563eb')
      .text(formatINR(params.totalPaise), 465, y, { width: 70, align: 'right' });

    // Footer
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#94a3b8')
      .text(
        'This invoice was generated automatically by Inveon Events. Please bring your ticket QR code(s) for entry.',
        50,
        760,
        { width: 495, align: 'center' },
      );

    doc.end();
  });
}
