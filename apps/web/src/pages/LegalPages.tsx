import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useBranding } from '../lib/branding';

// Public policy pages: Contact Us, Terms & Conditions, Privacy Policy and
// Refunds & Cancellations. Payment gateways (Cashfree) check for these
// before approving the website. Company name, address, GSTIN, email and
// phone come from the super admin portal (Settings → Branding / Invoice),
// so they stay in step with invoices and emails.

const LEGAL_LAST_UPDATED = '25 September 2026';

const FALLBACK = {
  companyName: 'Inveon Technologies',
  platformName: 'Inveon Events',
  email: 'inveontechnologies@gmail.com',
  phone: '+91 7030411076',
  address: 'Pune, Maharashtra, India',
  website: 'https://events.inveontechnologies.in',
};

function useCompany() {
  const b = useBranding();
  return {
    companyName: b?.companyName || FALLBACK.companyName,
    platformName: b?.platformName || FALLBACK.platformName,
    email: b?.supportEmail || FALLBACK.email,
    phone: b?.supportPhone || FALLBACK.phone,
    address: b?.companyAddress || FALLBACK.address,
    gstin: b?.companyGstin || null,
    website: FALLBACK.website,
  };
}

function LegalShell({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <Layout>
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
          <h1 className="text-3xl font-black text-slate-900">{title}</h1>
          <p className="mt-2 text-sm text-slate-500">Last updated: {LEGAL_LAST_UPDATED}</p>
          {intro && <div className="mt-4 text-slate-600 leading-relaxed">{intro}</div>}
        </div>
      </div>
      <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8 text-[15px] leading-relaxed text-slate-700 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_a]:text-brand-700 [&_a]:font-semibold hover:[&_a]:underline">
        {children}
      </article>
    </Layout>
  );
}

function ContactLine() {
  const c = useCompany();
  return (
    <p>
      Questions? Write to <a href={`mailto:${c.email}`}>{c.email}</a> or call <a href={`tel:${c.phone.replace(/\s/g, '')}`}>{c.phone}</a>.
      See also our <Link to="/contact">Contact Us</Link> page.
    </p>
  );
}

// ---------------- Contact Us ----------------

export function ContactPage() {
  const c = useCompany();
  return (
    <LegalShell title="Contact Us" intro={`We're happy to help with bookings, tickets, refunds and hosting events on ${c.platformName}.`}>
      <section className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2>Customer support</h2>
          <ul className="!list-none !pl-0">
            <li>
              Email: <a href={`mailto:${c.email}`}>{c.email}</a>
            </li>
            <li>
              Phone / WhatsApp: <a href={`tel:${c.phone.replace(/\s/g, '')}`}>{c.phone}</a>
            </li>
            <li>Hours: Monday to Saturday, 10:00 am – 7:00 pm IST</li>
            <li>We reply to emails within 1 working day.</li>
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2>Registered business</h2>
          <p className="font-semibold text-slate-900">{c.companyName}</p>
          <p className="whitespace-pre-line">{c.address}</p>
          {c.gstin && <p className="mt-1 text-sm">GSTIN: {c.gstin}</p>}
          <p className="mt-1 text-sm">
            Website: <a href={c.website}>{c.website.replace('https://', '')}</a>
          </p>
        </div>
      </section>
      <section>
        <h2>Quick help</h2>
        <ul>
          <li>
            <b>Find or manage a booking</b> (download tickets, cancel): <Link to="/bookings/lookup">Manage Booking</Link>, using your
            Booking ID and the email you booked with.
          </li>
          <li>
            <b>Refunds and cancellations</b>: see our <Link to="/refund-policy">Refunds &amp; Cancellations policy</Link>.
          </li>
          <li>
            <b>Questions about an event</b> (venue, schedule, what to bring): each event page lists its organizer; you can also write to us
            and we'll put you in touch.
          </li>
          <li>
            <b>Host your event</b>: <Link to="/organizer/login">create an organizer account</Link>.
          </li>
        </ul>
      </section>
      <section>
        <h2>Complaints</h2>
        <p>
          If something went wrong, email <a href={`mailto:${c.email}`}>{c.email}</a> with your Booking ID. We acknowledge every complaint
          within 48 hours and aim to resolve it within 7 working days.
        </p>
      </section>
    </LegalShell>
  );
}

// ---------------- Terms & Conditions ----------------

export function TermsPage() {
  const c = useCompany();
  return (
    <LegalShell
      title="Terms & Conditions"
      intro={
        <>
          These terms apply to everyone who uses {c.platformName} ({c.website.replace('https://', '')}), operated by {c.companyName} (“we”,
          “us”). By browsing, booking a ticket or listing an event you agree to them.
        </>
      }
    >
      <section>
        <h2>1. What we do</h2>
        <p>
          {c.platformName} is an online platform where event organizers list events (such as treks, tours, workshops, meet-ups and cultural
          events) and customers book tickets for them. The organizer named on each event page runs that event and is responsible for it. We
          provide the listing, booking, payment collection and ticketing service.
        </p>
      </section>
      <section>
        <h2>2. Services and prices</h2>
        <ul>
          <li>Each event page shows the ticket types, what is included, the date, venue and the price of every ticket.</li>
          <li>All prices are in Indian Rupees (₹, INR) and include applicable taxes unless the event page says otherwise.</li>
          <li>We do not add a booking or convenience fee on top of the ticket price shown at checkout.</li>
          <li>The price you pay is the total shown on the checkout page before you pay.</li>
        </ul>
      </section>
      <section>
        <h2>3. Booking and payment</h2>
        <ul>
          <li>You must give correct names, email and mobile number for every attendee; tickets and updates are sent to them.</li>
          <li>
            Online payments are processed securely by our payment partner, Cashfree Payments (UPI, cards, net banking, wallets). We never
            see or store your card details.
          </li>
          <li>
            Seats are held for a short time while you pay. A booking is confirmed only when payment succeeds; you then receive your e-ticket
            by email and WhatsApp.
          </li>
          <li>Some organizers allow payment in cash; such bookings are confirmed when the organizer records the payment.</li>
          <li>If money is debited but the booking is not confirmed, it is refunded automatically (see the refund policy).</li>
        </ul>
      </section>
      <section>
        <h2>4. Tickets and delivery</h2>
        <ul>
          <li>Tickets are electronic (e-tickets) with a QR code. Nothing is shipped by post.</li>
          <li>
            E-tickets are delivered instantly after confirmation by email and WhatsApp, and are always available under Manage Booking.
          </li>
          <li>Show the QR code at entry. Each ticket can be checked in once. Do not share it; the first person to scan it gets in.</li>
          <li>Some events accept only certain attendees (for example a women-only trek); this is shown before booking.</li>
        </ul>
      </section>
      <section>
        <h2>5. Cancellations and refunds</h2>
        <p>
          Cancellations and refunds follow our <Link to="/refund-policy">Refunds &amp; Cancellations policy</Link> and the refund rule shown
          on each event page.
        </p>
      </section>
      <section>
        <h2>6. Responsibilities of organizers</h2>
        <ul>
          <li>
            Organizers must describe their events accurately, hold any licences or permissions needed, and run the event as described.
          </li>
          <li>Organizers must complete identity and bank verification (KYC) before selling paid tickets.</li>
          <li>Organizers are responsible for the safety arrangements, itinerary and conduct of their events.</li>
          <li>We may remove an event or suspend an organizer who breaks these terms or receives serious complaints.</li>
        </ul>
      </section>
      <section>
        <h2>7. Your conduct</h2>
        <p>
          Follow the organizer's instructions and safety rules during the event. Do not misuse the website, make fraudulent bookings, resell
          tickets for profit, or attempt to access other people's bookings. We may cancel bookings made in breach of these terms.
        </p>
      </section>
      <section>
        <h2>8. Liability</h2>
        <p>
          Events are conducted by their organizers. To the extent allowed by law, our liability for any booking is limited to the amount you
          paid for it. Outdoor and adventure events carry inherent risks; take part only if you are fit to do so and follow the organizer's
          guidance.
        </p>
      </section>
      <section>
        <h2>9. Privacy</h2>
        <p>
          We handle your personal data as described in our <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </section>
      <section>
        <h2>10. Changes and governing law</h2>
        <p>
          We may update these terms; the date above shows the latest version. These terms are governed by the laws of India, and courts in
          Pune, Maharashtra have jurisdiction.
        </p>
      </section>
      <section>
        <h2>11. Contact</h2>
        <ContactLine />
      </section>
    </LegalShell>
  );
}

// ---------------- Refunds & Cancellations ----------------

export function RefundPolicyPage() {
  const c = useCompany();
  return (
    <LegalShell title="Refunds & Cancellations" intro="How to cancel a booking, how much you get back, and how long refunds take.">
      <section>
        <h2>1. Each event shows its refund rule before you pay</h2>
        <p>
          The organizer sets a refund rule for each event, for example “100% refund up to 3 days before the event”. It is shown on the event
          page and again on the checkout page before you pay. If an event says <b>No Refund Policy</b>, bookings for it cannot be cancelled
          by the customer.
        </p>
      </section>
      <section>
        <h2>2. Cancelling your booking</h2>
        <ul>
          <li>
            Go to <Link to="/bookings/lookup">Manage Booking</Link>, enter your Booking ID and email, and choose <b>Cancel booking</b>.
          </li>
          <li>
            You can cancel until the cut-off shown for the event (for example 3 days before it starts). After that, cancellation closes.
          </li>
          <li>You get back the percentage of the amount paid shown in the event's refund rule.</li>
          <li>The whole booking is cancelled together and its tickets stop working immediately.</li>
        </ul>
      </section>
      <section>
        <h2>3. If the organizer cancels</h2>
        <ul>
          <li>
            If an organizer cancels the event, or cancels your booking, you get a <b>100% refund</b> of the amount paid.
          </li>
          <li>
            If an event is postponed, the organizer will contact you; if you can't attend the new date, write to us for a full refund.
          </li>
        </ul>
      </section>
      <section>
        <h2>4. Failed or duplicate payments</h2>
        <p>
          If money was debited but your booking was not confirmed (for example the payment completed after your seat hold expired and the
          seats were no longer available), the amount is refunded automatically in full; no request is needed. For any other unexpected
          debit, email us with the payment details and we'll sort it out.
        </p>
      </section>
      <section>
        <h2>5. How and when you get your money</h2>
        <ul>
          <li>Refunds for online payments go back to the same payment method (UPI, card, bank account or wallet) you paid with.</li>
          <li>
            We start the refund immediately when a booking is cancelled. It usually reaches you within 5–7 working days, depending on your
            bank.
          </li>
          <li>Cash payments made to an organizer are refunded by that organizer directly.</li>
          <li>You get an email confirming the cancellation and the refund amount.</li>
        </ul>
      </section>
      <section>
        <h2>6. Need help?</h2>
        <p>
          If a refund hasn't arrived after 7 working days, email <a href={`mailto:${c.email}`}>{c.email}</a> with your Booking ID and we'll
          trace it with our payment partner.
        </p>
      </section>
    </LegalShell>
  );
}

// ---------------- Privacy Policy ----------------

export function PrivacyPage() {
  const c = useCompany();
  return (
    <LegalShell title="Privacy Policy" intro={`How ${c.companyName} collects and uses personal data on ${c.platformName}.`}>
      <section>
        <h2>1. What we collect</h2>
        <ul>
          <li>
            Booking details: names, email addresses, mobile numbers and any details an organizer needs for their event (for example gender
            for a women-only event).
          </li>
          <li>
            Payment status and references from our payment partner. We never receive or store card numbers, UPI PINs or bank passwords.
          </li>
          <li>Organizer account and verification (KYC) details needed to pay organizers.</li>
          <li>Basic technical data such as IP address and browser type, used for security and to prevent fraud.</li>
        </ul>
      </section>
      <section>
        <h2>2. How we use it</h2>
        <ul>
          <li>To confirm bookings, send tickets and updates by email and WhatsApp, and handle cancellations and refunds.</li>
          <li>To let organizers manage attendees and check tickets at entry.</li>
          <li>To keep the platform secure and meet legal and tax obligations.</li>
        </ul>
      </section>
      <section>
        <h2>3. Who we share it with</h2>
        <ul>
          <li>The organizer of the event you booked (attendee names and contact details).</li>
          <li>
            Service providers who help us run the platform: our payment partner (Cashfree Payments), email and WhatsApp messaging providers,
            and cloud hosting.
          </li>
          <li>Authorities, when the law requires it.</li>
        </ul>
        <p>We do not sell personal data.</p>
      </section>
      <section>
        <h2>4. Retention and your choices</h2>
        <p>
          We keep booking records as long as needed for the event, refunds, and accounting and tax rules. You can ask us to correct your
          details or delete data we no longer need to keep by writing to <a href={`mailto:${c.email}`}>{c.email}</a>.
        </p>
      </section>
      <section>
        <h2>5. Contact</h2>
        <ContactLine />
      </section>
    </LegalShell>
  );
}
