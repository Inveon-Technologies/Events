import { defaultFooterDesign, sanitizeFooterDesign, MAX_FOOTER_FIELDS } from '../src/services/certificateFooterDesign';
import { FOOTER_TOP_PERCENT, CertificateDesignError } from '../src/services/certificateDesign';
import { defaultInvoiceLayout, fillInvoiceText, sanitizeInvoiceLayout, InvoiceLayoutError } from '../src/services/invoiceLayout';
import {
  EMAIL_TEMPLATE_KEYS,
  defaultEmailTemplate,
  renderCustomEmail,
  renderEmailFromTemplate,
  sanitizeEmailTemplate,
  EmailTemplateError,
} from '../src/services/emailTemplates';
import { generateInvoicePdf } from '../src/services/invoice';
import { sampleBookingDocument } from '../src/services/designerPreviews';

describe('certificate footer design', () => {
  it('defaults to the legacy footer, all inside the footer band', () => {
    const design = defaultFooterDesign();
    expect(design.fields.map((f) => f.id)).toEqual(expect.arrayContaining(['supportedBy', 'partners', 'techLabel', 'bookingLabel']));
    for (const f of design.fields) expect(f.y).toBeGreaterThanOrEqual(FOOTER_TOP_PERCENT);
    expect(sanitizeFooterDesign(design)).toMatchObject(design);
  });

  it('keeps fields in the band and rejects bad input', () => {
    const out = sanitizeFooterDesign({
      fields: [
        { id: 'a', kind: 'text', text: 'Hi', x: -5, y: 10, w: 20, h: 2, color: 'red', align: 'middle' },
        { id: 'a', kind: 'platformMark', x: 95, y: 99, w: 10, h: 5 },
      ],
    });
    expect(out.fields[0]).toMatchObject({ x: 0, y: FOOTER_TOP_PERCENT, color: '#334155', align: 'center' });
    expect(out.fields[1].id).toBe('ax');
    expect(out.fields[1].x).toBe(90);
    expect(out.fields[1].y + out.fields[1].h).toBeLessThanOrEqual(100);
    expect(() => sanitizeFooterDesign({ fields: [{ kind: 'image', imageUrl: 'javascript:alert(1)' }] })).toThrow(CertificateDesignError);
    expect(() => sanitizeFooterDesign({ fields: Array.from({ length: MAX_FOOTER_FIELDS + 1 }, () => ({})) })).toThrow(
      CertificateDesignError,
    );
  });
});

describe('invoice layout', () => {
  it('fills tokens and leaves unknown ones', () => {
    expect(fillInvoiceText('Hi {customerName}, {nope}', { customerName: 'Rahul' })).toBe('Hi Rahul, {nope}');
  });

  it('adds missing sections hidden and requires the item table', () => {
    const out = sanitizeInvoiceLayout({ blocks: [{ type: 'items' }, { type: 'text', text: 'Thanks {customerName}', fontSize: 99 }] });
    expect(out.blocks.map((b) => [b.type, b.visible])).toEqual([
      ['items', true],
      ['text', true],
      ['header', false],
      ['parties', false],
      ['event', false],
      ['payment', false],
      ['terms', false],
    ]);
    expect(out.blocks[1].fontSize).toBe(16);
    expect(() => sanitizeInvoiceLayout({ blocks: [{ type: 'items', visible: false }] })).toThrow(InvoiceLayoutError);
    expect(() => sanitizeInvoiceLayout({ blocks: [{ type: 'items' }, { type: 'items' }] })).toThrow(InvoiceLayoutError);
    expect(() => sanitizeInvoiceLayout({ blocks: [{ type: 'script' }] })).toThrow(InvoiceLayoutError);
  });

  it('renders a reordered layout with custom text to a PDF', async () => {
    const layout = sanitizeInvoiceLayout({
      blocks: [
        { type: 'header' },
        { type: 'text', text: 'Hello {customerName}', bold: true },
        { type: 'items' },
        { type: 'spacer', height: 30 },
        { type: 'terms', title: 'Rules' },
      ],
    });
    const pdf = await generateInvoicePdf(sampleBookingDocument(), new Date(), layout);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const standard = await generateInvoicePdf(sampleBookingDocument(), new Date(), defaultInvoiceLayout());
    expect(standard.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('email templates', () => {
  it('every default template is valid and switched off', () => {
    for (const key of EMAIL_TEMPLATE_KEYS) {
      const t = defaultEmailTemplate(key);
      expect(t.enabled).toBe(false);
      expect(sanitizeEmailTemplate(key, t)).toEqual(t);
    }
  });

  it('renders blocks with dynamic values, escaped', () => {
    const t = sanitizeEmailTemplate('bookingCancellation', {
      enabled: true,
      subject: 'Cancelled: {eventName}',
      blocks: [
        { type: 'heading', text: 'Bye {customerName}' },
        { type: 'button', text: 'Help', url: 'mailto:{supportEmail}' },
        { type: 'section', section: 'refund' },
      ],
    });
    const out = renderEmailFromTemplate('bookingCancellation', t, {
      eventName: 'Trek',
      customerName: '<b>Rahul</b>',
      supportEmail: 'help@example.com',
      refundAmount: '₹500',
    });
    expect(out.subject).toBe('Cancelled: Trek');
    expect(out.html).toContain('Bye &lt;b&gt;Rahul&lt;/b&gt;');
    expect(out.html).toContain('href="mailto:help@example.com"');
    expect(out.html).toContain('₹500');
  });

  it('rejects unsafe links and unknown sections', () => {
    const blocks = (b: object) => ({ blocks: [b] });
    expect(() => sanitizeEmailTemplate('otp', blocks({ type: 'button', url: 'javascript:alert(1)' }))).toThrow(EmailTemplateError);
    expect(() => sanitizeEmailTemplate('otp', blocks({ type: 'section', section: 'tickets' }))).toThrow(EmailTemplateError);
    expect(() => sanitizeEmailTemplate('otp', blocks({ type: 'iframe' }))).toThrow(EmailTemplateError);
  });

  it('uses the built-in email while nothing is switched on', () => {
    expect(renderCustomEmail('otp', { otpCode: '123456' })).toBeNull();
  });
});
