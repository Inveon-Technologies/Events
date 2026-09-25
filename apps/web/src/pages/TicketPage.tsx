import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';

// The ticket page behind the signed link sent on WhatsApp and email
// (/t/:token). The link is the access — no login or email needed.

interface TicketRow {
  id: string;
  ticketReference: string;
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
  bookedAt: string;
  organizerName: string;
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

function paymentLabel(d: TicketDetail): { text: string; tone: 'ok' | 'warn' | 'muted' } {
  if (d.totalAmountPaise === 0) return { text: 'FREE', tone: 'ok' };
  if (d.paymentStatus === 'paid') return { text: 'PAID', tone: 'ok' };
  if (d.paymentStatus === 'refunded') return { text: 'REFUNDED', tone: 'muted' };
  return { text: d.paymentMethod === 'cash' ? 'PAY AT VENUE' : 'PENDING', tone: 'warn' };
}

function ticketStatus(d: TicketDetail, t: TicketRow | undefined): { text: string; tone: 'ok' | 'warn' | 'bad' | 'muted' } {
  if (d.bookingStatus === 'cancelled' || t?.status === 'cancelled') return { text: 'CANCELLED', tone: 'bad' };
  if (t?.status === 'checked_in') return { text: 'CHECKED IN', tone: 'muted' };
  if (d.bookingStatus === 'pending') return { text: 'PENDING', tone: 'warn' };
  return { text: 'CONFIRMED', tone: 'ok' };
}

const TONES = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  warn: 'bg-amber-50 text-amber-700 border-amber-100',
  bad: 'bg-rose-50 text-rose-700 border-rose-100',
  muted: 'bg-slate-100 text-slate-600 border-slate-200',
};

function Pill({ text, tone }: { text: string; tone: keyof typeof TONES }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold rounded-full border ${TONES[tone]}`}>
      {tone === 'ok' && <Icon name="check_circle" className="text-[14px]" filled />}
      {text}
    </span>
  );
}

function Field({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <Icon name={icon} className="text-[20px] text-brand-600 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide">{label}</p>
        <p className="text-sm font-bold text-ink break-words">{value}</p>
      </div>
    </div>
  );
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
  const showQr = detail.bookingStatus !== 'cancelled' && ticket;
  const eventDate = new Date(detail.eventDate);
  const reporting = new Date(detail.gateOpenTime ?? detail.eventDate);
  const dateText = eventDate.toLocaleDateString('en-IN', { ...IST, day: 'numeric', month: 'long', year: 'numeric' });
  const weekday = eventDate.toLocaleDateString('en-IN', { ...IST, weekday: 'long' });
  const timeText = reporting.toLocaleTimeString('en-IN', { ...IST, hour: 'numeric', minute: '2-digit' }).toUpperCase();
  const timeCaption = detail.gateOpenTime ? 'Reporting Time' : 'Starts At';
  const place = locationLabel(detail);
  const pdfUrl = `/api/t/${encodeURIComponent(token)}/tickets.pdf`;
  const payment = paymentLabel(detail);
  const status = ticketStatus(detail, ticket);

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
      <div className="bg-gradient-to-b from-orange-50 via-white to-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
          <nav className="flex items-center gap-1.5 text-xs text-ink-muted" aria-label="Breadcrumb">
            <Link to="/" aria-label="Home">
              <Icon name="home" className="text-[18px]" />
            </Link>
            <Icon name="chevron_right" className="text-[16px]" />
            <Link to="/bookings/my" className="hover:text-ink">
              My Tickets
            </Link>
            <Icon name="chevron_right" className="text-[16px]" />
            <span className="text-ink">Ticket Details</span>
          </nav>

          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">Your Event Ticket</h1>
            <p className="text-sm text-ink-muted mt-1">Show this ticket at the event check-in</p>
          </div>

          {detail.bookingStatus === 'cancelled' && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800" role="alert">
              This booking has been cancelled, so these tickets can no longer be used for entry.
            </div>
          )}

          {/* The ticket */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
            <div className="order-1 relative min-h-[220px] bg-gradient-to-br from-brand-600 to-slate-900">
              {detail.bannerUrl && <img src={detail.bannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/20 to-transparent" />
              <div className="absolute bottom-0 p-5 text-white">
                <p className="text-sm opacity-90">{detail.organizerName}</p>
                <p className="text-2xl font-extrabold leading-tight">{detail.eventName}</p>
                <p className="text-sm mt-1.5 flex items-center gap-1">
                  <Icon name="location_on" className="text-[16px]" />
                  {place}
                </p>
              </div>
            </div>

            <div className="p-5 sm:p-6 space-y-5 order-3 lg:order-2">
              <div className="hidden lg:block">
                <p className="text-sm text-ink-muted">{detail.organizerName}</p>
                <h2 className="text-xl sm:text-2xl font-extrabold text-ink">{detail.eventName}</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field icon="calendar_month" label={weekday} value={dateText} />
                <Field icon="schedule" label={timeCaption} value={timeText} />
                <Field icon="location_on" label="Location" value={place} />
              </div>

              {tickets.length > 1 && (
                <div className="flex flex-wrap gap-2" role="tablist" aria-label="Participants">
                  {tickets.map((t, i) => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={i === active}
                      onClick={() => setActive(i)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${i === active ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-ink border-slate-200 hover:bg-slate-50'}`}
                    >
                      {t.attendeeName}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
                <Field icon="person" label="Participant" value={ticket?.attendeeName ?? '—'} />
                <Field icon="confirmation_number" label="Ticket ID" value={ticket ? ticketId(ticket.ticketReference) : '—'} />
                <div className="flex items-start gap-2.5">
                  <Icon name="credit_card" className="text-[20px] text-brand-600 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Payment Status</p>
                    <Pill {...payment} />
                  </div>
                </div>
                <Field icon="local_activity" label="Ticket Type" value={ticket?.tierName ?? '—'} />
                <Field icon="receipt_long" label="Booking ID" value={detail.bookingReference} />
                <div className="flex items-start gap-2.5">
                  <Icon name="verified" className="text-[20px] text-brand-600 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Ticket Status</p>
                    <Pill {...status} />
                  </div>
                </div>
              </div>
            </div>

            {/* On phones the QR comes straight after the photo — it's what the gate needs. */}
            <div className="order-2 lg:order-3 lg:border-l-2 border-b-2 lg:border-b-0 border-dashed border-slate-200 p-5 flex items-center justify-center">
              <div className="bg-slate-50 rounded-2xl p-5 text-center w-full lg:w-64">
                <p className="text-sm font-extrabold text-ink tracking-wide">SCAN AT ENTRY</p>
                {showQr ? (
                  <img
                    src={`/api/t/${encodeURIComponent(token)}/tickets/${ticket.id}/qr`}
                    alt={`QR code for ${ticket.attendeeName}`}
                    className="w-52 h-52 mx-auto my-3 bg-white rounded-xl p-2"
                  />
                ) : (
                  <div className="w-52 h-52 mx-auto my-3 rounded-xl bg-white flex items-center justify-center text-xs text-ink-muted">
                    No active ticket
                  </div>
                )}
                {showQr && tickets.length > 1 && <p className="text-sm font-bold text-ink">{ticket.attendeeName}</p>}
                <p className="text-xs text-ink-muted">Show this QR code at event check-in.</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener"
              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm"
            >
              <Icon name="download" className="text-[20px]" /> Download Ticket PDF
            </a>
            <button
              type="button"
              onClick={share}
              className="flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-brand-600 font-semibold text-sm"
            >
              <Icon name="share" className="text-[20px]" /> {copied ? 'Link copied' : 'Share Ticket'}
            </button>
            <Link
              to="/bookings/my"
              className="flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-brand-600 font-semibold text-sm"
            >
              <Icon name="arrow_back" className="text-[20px]" /> Back to My Tickets
            </Link>
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
