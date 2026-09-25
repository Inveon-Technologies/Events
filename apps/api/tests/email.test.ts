import { isEmailConfigured, sendEmail } from '../src/services/email';
import { otpEmail, registrationSuccessEmail } from '../src/emails/templates';
import { ticketConfirmationEmail } from '../src/emails/ticketConfirmation';

describe('email service configuration', () => {
  const originalUser = process.env.SMTP_USER;
  const originalPass = process.env.SMTP_PASS;

  afterEach(() => {
    if (originalUser === undefined) delete process.env.SMTP_USER;
    else process.env.SMTP_USER = originalUser;
    if (originalPass === undefined) delete process.env.SMTP_PASS;
    else process.env.SMTP_PASS = originalPass;
  });

  it('reports not configured when SMTP_USER/SMTP_PASS are unset', () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    expect(isEmailConfigured()).toBe(false);
  });

  it('sendEmail throws a clear, specific error rather than a raw SMTP failure when unconfigured', async () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    await expect(sendEmail({ to: 'a@example.com', subject: 'x', html: '<p>x</p>' })).rejects.toThrow(
      /SMTP_USER.*SMTP_PASS.*not set/,
    );
  });
});

describe('email templates', () => {
  it('otpEmail includes the actual code and expiry, not placeholder text', () => {
    const html = otpEmail({ recipientName: 'Priya', otpCode: '482913', expiresInMinutes: 10 });
    expect(html).toContain('482913');
    expect(html).toContain('10 minutes');
    expect(html).toContain('Priya');
  });

  it('registrationSuccessEmail links to the real dashboard URL passed in', () => {
    const html = registrationSuccessEmail({
      recipientName: 'Priya',
      orgName: 'Eco Pandhari Club',
      dashboardUrl: 'https://events.inveontechnologies.in/organizer/dashboard',
    });
    expect(html).toContain('https://events.inveontechnologies.in/organizer/dashboard');
    expect(html).toContain('Eco Pandhari Club');
  });

  it('ticketConfirmationEmail shows the real event, every ticket with its QR, partners, and escapes organizer text', () => {
    const html = ticketConfirmationEmail({
      headerCid: 'event-header',
      eventName: 'Dandiya Night 2026',
      customerName: 'Rahul <Sharma>',
      bookingReference: 'INV-BKG-2026-42738',
      statusLine: 'your payment has been successfully verified and your entry ticket has been generated',
      dateLabel: '18 October 2026',
      weekday: 'Sunday',
      reportingTime: '06:30 PM',
      eventTime: '07:00 PM',
      venue: 'Pandharpur Cultural Ground',
      city: 'Pandharpur',
      organizerName: 'Eco Pandhari Club',
      organizerPhone: '0788 750 3856',
      organizerLogoCid: null,
      inviteNote: null,
      tickets: [
        { attendeeName: 'Rahul Sharma', tierName: 'General Entry', ticketId: 'INV-TKT-2026-42738-01', statusText: 'CONFIRMED', qrCid: 'ticket-qr-1' },
        { attendeeName: 'Priya Sharma', tierName: 'General Entry', ticketId: 'INV-TKT-2026-42738-02', statusText: 'CONFIRMED', qrCid: 'ticket-qr-2' },
      ],
      ticketPageUrl: 'https://events.example/t/abc',
      ticketPdfUrl: 'https://events.example/api/ticket-pdf/abc',
      partners: [{ name: 'EPC Sound', role: 'Music Partner', logoCid: 'partner-1' }],
      amountLine: 'Amount paid: \u20b9998.00 · Invoice attached',
      supportEmail: 'help@example.com',
    });
    expect(html).toContain('cid:event-header');
    expect(html).toContain('INV-TKT-2026-42738-01');
    expect(html).toContain('INV-TKT-2026-42738-02');
    expect(html).toContain('cid:ticket-qr-2');
    expect(html).toContain('YOUR ENTRY TICKETS (2)');
    expect(html).toContain('https://events.example/t/abc');
    expect(html).toContain('OUR EVENT PARTNERS');
    expect(html).toContain('cid:partner-1');
    expect(html).toContain('06:30 PM');
    expect(html).toContain('Rahul &lt;Sharma&gt;');
    expect(html).not.toContain('Rahul <Sharma>');
  });

  it('ticketConfirmationEmail leaves out the partners section when the organizer has none', () => {
    const html = ticketConfirmationEmail({
      headerCid: null, eventName: 'Trek', customerName: 'A', bookingReference: 'R', statusLine: 's', dateLabel: 'd', weekday: 'w',
      reportingTime: null, eventTime: 't', venue: 'v', city: '', organizerName: 'O', organizerPhone: null, organizerLogoCid: null,
      inviteNote: null, tickets: [], ticketPageUrl: null, ticketPdfUrl: null, partners: [], amountLine: null, supportEmail: 'x@y.z',
    });
    expect(html).not.toContain('OUR EVENT PARTNERS');
    expect(html).not.toContain('Your Logo Here');
  });
});
