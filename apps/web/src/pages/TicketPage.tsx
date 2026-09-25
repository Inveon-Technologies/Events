import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';
import { EventTicket, type TicketPartner, type TicketStatusTone } from '../components/ticket/EventTicket';

// The ticket page behind the signed link sent on WhatsApp and email
// (/t/:token). The link is the access — no login or email needed.

interface TicketRow {
  id: string;
  ticketReference: string;
  displayReference?: string;
  attendeeName: string;
  tierName: string;
  status: 'valid' | 'checked_in' | 'cancelled';
}

interface TicketDetail {
  bookingReference: string;
  bookingStatus: 'pending' | 'confirmed' | 'cancelled';
  eventName: string;
  eventDate: string;
  gateOpenTime: string | null;
  venueAddress: string | null;
  venueMapUrl: string | null;
  bannerUrl: string | null;
  ticketBackgroundUrl?: string | null;
  partners?: TicketPartner[];
  eventTagline?: string | null;
  bookedAt: string;
  organizerName: string;
  organizerLogoUrl?: string | null;
  organizerContactPhone: string | null;
  locationPoints?: { type: string; label: string }[] | null;
  paymentMethod: 'online' | 'cash' | null;
  paymentStatus: string | null;
  totalAmountPaise: number;
  ticketPageUrl: string;
  delivery: { email: string | null; whatsapp: string | null };
  tickets: TicketRow[];
}

const IST = { timeZone: 'Asia/Kolkata' } as const;

function shortPlace(text: string | null | undefined): string {
  return text ? text.split(',')[0].trim() : '';
}

// "Pune → Rajgad" when there's a pickup point, else the venue's first part.
function locationLabel(d: TicketDetail): string {
  const venue = shortPlace(d.venueAddress);
  const pickup = d.locationPoints?.find((p) => p.type === 'pickup' || p.type === 'meeting');
  if (pickup && venue && shortPlace(pickup.label) !== venue) return `${shortPlace(pickup.label)} → ${venue}`;
  return venue || shortPlace(pickup?.label) || 'See event page';
}

// INV-BKG-2026-8F3K2Q-1 → INV-TKT-2026-8F3K2Q-01 (same as the PDF and card).
function ticketId(ticketReference: string): string {
  const m = ticketReference.match(/^(.*)-(\d+)$/);
  if (!m) return ticketReference;
  return `${m[1].replace(/-BKG-/, '-TKT-')}-${m[2].padStart(2, '0')}`;
}

function paymentText(d: TicketDetail): string {
  if (d.totalAmountPaise === 0) return 'Free';
  if (d.paymentStatus === 'paid') return 'Paid';
  if (d.paymentStatus === 'refunded') return 'Refunded';
  return d.paymentMethod === 'cash' ? 'Pay at venue' : 'Pending';
}

function ticketStatus(d: TicketDetail, t: TicketRow | undefined): { text: string; tone: TicketStatusTone } {
  if (d.bookingStatus === 'cancelled' || t?.status === 'cancelled') return { text: 'CANCELLED', tone: 'bad' };
  if (t?.status === 'checked_in') return { text: 'CHECKED IN', tone: 'muted' };
  if (d.bookingStatus === 'pending') return { text: 'PENDING', tone: 'warn' };
  return { text: 'CONFIRMED', tone: 'ok' };
}

const DELIVERY: Record<string, { text: string; className: string; icon: string }> = {
  sent: { text: 'Sent', className: 'text-emerald-600', icon: 'check_circle' },
  failed: { text: 'Not delivered', className: 'text-rose-600', icon: 'error' },
  skipped: { text: 'Not sent', className: 'text-slate-400', icon: 'remove_circle' },
};

// Bookings made before delivery was tracked never get a status; only a
// fresh booking's missing status means "still sending".
const STILL_SENDING_MS = 15 * 60 * 1000;

function DeliveryRow({
  icon,
  iconClass,
  title,
  detail,
  status,
  bookedAt,
}: {
  icon: string;
  iconClass: string;
  title: string;
  detail: string;
  status: string | null;
  bookedAt: string;
}) {
  const pending = !status && Date.now() - new Date(bookedAt).getTime() < STILL_SENDING_MS;
  const s = status ? DELIVERY[status] : pending ? null : { text: 'Not recorded', className: 'text-slate-400', icon: 'help' };
  return (
    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconClass}`}>
        <Icon name={icon} className="text-[20px]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-ink">{title}</p>
        <p className="text-xs text-ink-muted">{detail}</p>
      </div>
      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${s?.className ?? 'text-slate-400'}`}>
        <Icon name={s?.icon ?? 'schedule'} className="text-[16px]" filled={Boolean(s)} />
        {s?.text ?? 'Sending…'}
      </span>
    </div>
  );
}

export function TicketPage() {
  const { token = '' } = useParams();
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/t/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) setError(data.error || 'We couldn’t find this ticket.');
        else setDetail(data);
      })
      .catch(() => {
        if (!cancelled) setError('Something went wrong. Please try again.');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) {
    return (
      <Layout>
        <div className="max-w-md mx-auto px-4 py-16 text-center">
          <Icon name="confirmation_number" className="text-[40px] text-slate-300" />
          <h1 className="text-lg font-bold text-ink mt-2">Ticket not found</h1>
          <p className="text-sm text-ink-muted mt-1">{error}</p>
          <Link
            to="/bookings/lookup"
            className="inline-block mt-5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg"
          >
            Find my booking
          </Link>
        </div>
      </Layout>
    );
  }

  if (!detail) {
    return (
      <Layout>
        <p className="max-w-md mx-auto px-4 py-16 text-center text-sm text-ink-muted">Loading your ticket…</p>
      </Layout>
    );
  }

  const tickets = detail.tickets.filter((t) => t.status !== 'cancelled');
  const ticket = tickets[Math.min(active, tickets.length - 1)];
  const showQr = detail.bookingStatus !== 'cancelled' && Boolean(ticket);
  const eventDate = new Date(detail.eventDate);
  const reporting = new Date(detail.gateOpenTime ?? detail.eventDate);
  const dateText = eventDate.toLocaleDateString('en-IN', { ...IST, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeText = reporting.toLocaleTimeString('en-IN', { ...IST, hour: 'numeric', minute: '2-digit' }).toUpperCase();
  const timeCaption = detail.gateOpenTime ? 'Reporting Time' : 'Starts At';
  const place = locationLabel(detail);
  const pdfUrl = `/api/t/${encodeURIComponent(token)}/tickets.pdf`;
  const status = ticketStatus(detail, ticket);
  const shown = ticket ?? detail.tickets[0];

  async function share() {
    const data = { title: `${detail!.eventName} — ticket`, text: `My ticket for ${detail!.eventName}`, url: detail!.ticketPageUrl };
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share(data);
        return;
      }
      await navigator.clipboard.writeText(detail!.ticketPageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Share sheet dismissed — nothing to do.
    }
  }

  return (
    <Layout>
      <div className="bg-white lg:bg-[#d7e2ed] pb-24 lg:pb-0">
        <div className="max-w-[1360px] mx-auto px-3.5 sm:px-6 py-4 lg:py-7 space-y-4 lg:space-y-5">
          <nav className="flex items-center gap-1.5 text-xs text-ink-muted" aria-label="Breadcrumb">
            <Link to="/" aria-label="Home">
              <Icon name="home" className="text-[18px]" />
            </Link>
            <Icon name="chevron_right" className="text-[16px]" />
            <Link to="/bookings/my" className="hover:text-ink">
              My Tickets
            </Link>
            <Icon name="chevron_right" className="text-[16px]" />
            <span className="text-ink">Your Ticket</span>
          </nav>

          {detail.bookingStatus === 'cancelled' && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800" role="alert">
              This booking has been cancelled, so these tickets can no longer be used for entry.
            </div>
          )}

          {tickets.length > 1 && (
            <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Participants">
              <span className="text-xs font-semibold text-ink-muted mr-1">{tickets.length} tickets:</span>
              {tickets.map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={i === active}
                  onClick={() => setActive(i)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                    i === active ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-ink border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {t.attendeeName}
                </button>
              ))}
            </div>
          )}

          <EventTicket
            data={{
              organizerName: detail.organizerName,
              organizerLogoUrl: detail.organizerLogoUrl ?? null,
              organizerPhone: detail.organizerContactPhone,
              eventName: detail.eventName,
              tagline: detail.eventTagline ?? null,
              eventDate: detail.eventDate,
              gateOpenTime: detail.gateOpenTime,
              venueAddress: detail.venueAddress,
              backgroundUrl: detail.ticketBackgroundUrl ?? detail.bannerUrl,
              partners: detail.partners ?? [],
              bookingReference: detail.bookingReference,
              attendeeName: shown?.attendeeName ?? '—',
              tierName: shown?.tierName ?? '—',
              ticketId: shown ? (shown.displayReference ?? ticketId(shown.ticketReference)) : '—',
              statusText: status.text,
              statusTone: status.tone,
              quantity: 1,
              qrSrc: showQr ? `/api/t/${encodeURIComponent(token)}/tickets/${ticket!.id}/qr` : null,
            }}
          />

          {/* Actions — a fixed dock on phones, as in the mobile design. */}
          <div className="fixed lg:static bottom-0 inset-x-0 z-40 bg-white/95 lg:bg-transparent backdrop-blur-lg lg:backdrop-blur-none border-t border-slate-200 lg:border-0 px-4 py-3 lg:p-0 shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.25)] lg:shadow-none">
            <div className="max-w-[420px] lg:max-w-none mx-auto flex lg:grid lg:grid-cols-3 gap-2.5 lg:gap-3">
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener"
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs lg:text-sm uppercase lg:normal-case tracking-wide lg:tracking-normal shadow-lg shadow-brand-600/30 lg:shadow-none"
              >
                <Icon name="download" className="text-[20px]" /> Download Ticket PDF
              </a>
              <button
                type="button"
                onClick={share}
                aria-label="Share Ticket"
                className="flex items-center justify-center gap-2 py-3 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-brand-600 font-semibold text-sm"
              >
                <Icon name="share" className="text-[20px]" />{' '}
                <span className="hidden lg:inline">{copied ? 'Link copied' : 'Share Ticket'}</span>
              </button>
              <Link
                to="/bookings/my"
                className="hidden lg:flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-brand-600 font-semibold text-sm"
              >
                <Icon name="arrow_back" className="text-[20px]" /> Back to My Tickets
              </Link>
            </div>
            {copied && <p className="lg:hidden text-center text-[11px] text-emerald-700 mt-1.5">Ticket link copied</p>}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h3 className="flex items-center gap-2 font-bold text-ink mb-4">
                <Icon name="description" className="text-brand-600" /> Event Information
              </h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {[
                  ['calendar_month', 'Date', dateText],
                  ['schedule', timeCaption, timeText],
                  ['location_on', 'Location', place],
                  ['person', 'Organizer', detail.organizerName],
                  ['credit_card', 'Payment', paymentText(detail)],
                ].map(([icon, label, value]) => (
                  <div key={label} className="flex items-center gap-2">
                    <Icon name={icon} className="text-[18px] text-ink-muted" />
                    <dt className="text-ink-muted w-28 shrink-0">{label}</dt>
                    <dd className="font-semibold text-ink">{value}</dd>
                  </div>
                ))}
                {detail.organizerContactPhone && (
                  <div className="flex items-center gap-2">
                    <Icon name="call" className="text-[18px] text-ink-muted" />
                    <dt className="text-ink-muted w-28 shrink-0">Organizer Contact</dt>
                    <dd>
                      <a
                        href={`tel:${detail.organizerContactPhone.replace(/\s/g, '')}`}
                        className="font-semibold text-ink hover:text-brand-600"
                      >
                        {detail.organizerContactPhone}
                      </a>
                    </dd>
                  </div>
                )}
                {detail.venueMapUrl && (
                  <div className="flex items-center gap-2">
                    <Icon name="map" className="text-[18px] text-ink-muted" />
                    <a
                      href={detail.venueMapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-brand-600 hover:underline"
                    >
                      View Location →
                    </a>
                  </div>
                )}
              </dl>
            </section>

            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h3 className="flex items-center gap-2 font-bold text-ink mb-3">
                <Icon name="send" className="text-brand-600" /> Ticket Delivered To
              </h3>
              <div className="divide-y divide-slate-100">
                <DeliveryRow
                  icon="mail"
                  iconClass="bg-emerald-50 text-emerald-600"
                  title="Email"
                  detail="Ticket sent to the registered email address."
                  status={detail.delivery.email}
                  bookedAt={detail.bookedAt}
                />
                <DeliveryRow
                  icon="chat"
                  iconClass="bg-green-50 text-green-600"
                  title="WhatsApp"
                  detail="Ticket link sent to the registered WhatsApp number."
                  status={detail.delivery.whatsapp}
                  bookedAt={detail.bookedAt}
                />
              </div>
            </section>
          </div>

          <div className="bg-brand-50/60 border border-brand-100 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="flex items-start gap-3">
              <Icon name="shield" className="text-[24px] text-brand-600" filled />
              <div>
                <p className="font-bold text-ink">This ticket is linked to your booking.</p>
                <p className="text-ink-muted">
                  Keep your ticket link private and show the QR code at check-in. Each participant has their own QR code.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Icon name="edit_document" className="text-[24px] text-brand-600" />
              <div className="flex-1">
                <p className="font-bold text-ink">Need to make a change?</p>
                <p className="text-ink-muted">Contact the organizer, or cancel or manage your booking with your booking ID and email.</p>
              </div>
              <Link
                to={`/bookings/${encodeURIComponent(detail.bookingReference)}/manage`}
                state={{ bookingReference: detail.bookingReference }}
                className="px-3 py-2 rounded-lg border border-brand-200 bg-white text-brand-600 font-semibold whitespace-nowrap"
              >
                Manage Booking →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
