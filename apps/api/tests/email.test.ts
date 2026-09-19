import { isEmailConfigured, sendEmail } from '../src/services/email';
import { otpEmail, registrationSuccessEmail, bookingConfirmationEmail } from '../src/emails/templates';

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

  it('bookingConfirmationEmail shows the real booking reference, line items, and total — not zeroed or missing', () => {
    const html = bookingConfirmationEmail({
      customerName: 'Rahul Sharma',
      eventName: 'Rajgad Sunrise Trek',
      eventDateLabel: 'Friday, 9 October 2026 at 5:30 am',
      venueAddress: 'Rajgad Fort, Pune',
      organizerName: 'Eco Pandhari Club',
      bookingReference: 'INV-BKG-2026-42738',
      lineItems: [{ tierName: 'Solo Entry', quantity: 2, unitPricePaise: 49900 }],
      totalPaise: 99800,
      ticketCount: 2,
    });
    expect(html).toContain('INV-BKG-2026-42738');
    expect(html).toContain('Solo Entry');
    expect(html).toContain('\u20b9998'); // total, formatted from paise
    expect(html).toContain('Rajgad Sunrise Trek');
  });
});
