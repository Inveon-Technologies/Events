import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import { EventLocationMap } from '../components/map/EventLocationMap';
import type { LocationPoint } from '../lib/mapPoints';
import { getCustomerSession, normalizeBookingReference, validateBookingReference, validateEmailOrPhone } from '../lib/customerSession';

function formatINR(paise: number) {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

function maskEmail(email: string) {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(user.length - 2, 3))}@${domain}`;
}

function maskPhone(phone: string) {
  if (phone.length < 4) return phone;
  return `${phone.slice(0, phone.length - 6)}${'•'.repeat(4)}${phone.slice(-2)}`;
}

interface TierBreakdownRow {
  tierName: string;
  quantity: number;
  unitPricePaise: number;
  subtotalPaise: number;
}

interface TicketRow {
  id: string;
  ticketReference: string;
  attendeeName: string;
  tierName: string;
  status: 'valid' | 'checked_in' | 'cancelled';
  checkedInAt: string | null;
}

interface BookingDetail {
  bookingReference: string;
  bookingStatus: 'pending' | 'confirmed' | 'cancelled';
  bookedAt: string;
  eventName: string;
  eventTagline: string | null;
  eventDate: string;
  gateOpenTime: string | null;
  venueAddress: string | null;
  venueMapUrl: string | null;
  bannerUrl: string | null;
  organizerName: string;
  organizerContactEmail: string | null;
  organizerContactPhone: string | null;
  packingChecklist: { item: string; mandatory: boolean }[] | null;
  cancellationPolicyText: string | null;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactWhatsapp: string;
  totalAmountPaise: number;
  paymentMethod: 'online' | 'cash' | null;
  paymentStatus: string | null;
  paymentReference: string | null;
  tierBreakdown: TierBreakdownRow[];
  refundAmountPaise: number | null;
  refundStatus: string | null;
  allowSelfServiceCancellation: boolean;
  refundCutoffDays: number | null;
  refundPercentage: number | null;
  refundCutoffPassed: boolean;
  tickets: TicketRow[];
  galleryUrl?: string | null;
  locationPoints?: LocationPoint[] | null;
  galleryNote?: string | null;
  ticketPageUrl?: string;
}

export function ManageBookingPage() {
  const location = useLocation();
  const { bookingId: routeBookingRef } = useParams();
  const routeState = location.state as { bookingReference?: string; email?: string } | null;
  // Router state when coming from "My Bookings"; otherwise the Booking
  // ID in the URL plus the logged-in session's email, so a reload or a
  // shared /bookings/<id>/manage link still opens without retyping.
  const stateBookingRef = routeState?.bookingReference || routeBookingRef || '';
  const stateEmail = routeState?.email || getCustomerSession()?.email || '';
  const [bookingReference, setBookingReference] = useState(stateBookingRef);
  const [email, setEmail] = useState(stateEmail);
  const [verified, setVerified] = useState(false);
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ bookingReference?: string; contact?: string }>({});

  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [shareSupported, setShareSupported] = useState(false);

  useEffect(() => {
    setShareSupported(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  async function loadBooking(e?: React.FormEvent) {
    e?.preventDefault();
    const refError = validateBookingReference(bookingReference);
    const contactError = validateEmailOrPhone(email);
    setFieldErrors({ bookingReference: refError || undefined, contact: contactError || undefined });
    if (refError || contactError) return;
    setLoading(true);
    setError('');
    try {
      const reference = normalizeBookingReference(bookingReference);
      const res = await fetch(`/api/bookings/${encodeURIComponent(reference)}/tickets?email=${encodeURIComponent(email.trim())}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          res.status === 404
            ? 'No booking matches this Booking ID with that email or mobile number. Please recheck both and try again.'
            : data.error || 'Could not load that booking. Please try again.',
        );
        return;
      }
      // Canonical values from the server: the Booking ID as stored, and
      // the booking's email (cancelling and QR lookups need it even when
      // the customer typed a mobile number).
      setBookingReference(data.bookingReference);
      setEmail(data.primaryContactEmail || email.trim());
      setDetail(data);
      setVerified(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // Coming from the real logged-in "My Bookings" hub already carries a
  // verified booking reference + email via router state — skip asking
  // the person to type in what the app already knows, and load
  // straight into the real booking detail instead of showing the
  // manual verification form first.
  useEffect(() => {
    if (stateBookingRef && stateEmail) {
      loadBooking();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCancel() {
    if (!cancelReason.trim()) {
      setError('Please tell us why you\u2019re cancelling.');
      return;
    }
    setCancelling(true);
    setError('');
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(bookingReference.trim())}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), reason: cancelReason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not cancel this booking.');
        return;
      }
      await loadBooking();
      setShowCancelForm(false);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setCancelling(false);
    }
  }

  async function handleShareQr(ticket: TicketRow) {
    const qrUrl = `/api/bookings/${encodeURIComponent(bookingReference)}/tickets/${ticket.id}/qr?email=${encodeURIComponent(email)}`;
    try {
      const res = await fetch(qrUrl);
      const blob = await res.blob();
      const file = new File([blob], `${ticket.ticketReference}.png`, { type: 'image/png' });
      await navigator.share({ files: [file], title: `Ticket for ${ticket.attendeeName}`, text: `${detail?.eventName} — ${ticket.tierName}` });
    } catch {
      // A cancelled share (person backed out of the native sheet) or an
      // unsupported file-share on this browser both land here — neither
      // is a real error worth surfacing.
    }
  }

  if (loading && !verified) {
    return (
      <Layout>
        <div className="max-w-md mx-auto px-4 sm:px-6 py-16">
          <p className="text-xs text-ink-muted text-center">Loading your booking…</p>
        </div>
      </Layout>
    );
  }

  if (!verified) {
    return (
      <Layout>
        <div className="max-w-md mx-auto px-4 sm:px-6 py-16">
          <h1 className="text-xl font-bold text-ink mb-2 text-center">Manage Your Booking</h1>
          <p className="text-sm text-ink-muted text-center mb-8">
            Enter your Booking ID and the email or mobile number used to book.
          </p>
          <form onSubmit={loadBooking} noValidate className="bg-white rounded-2xl shadow-card p-6 space-y-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-muted">Booking ID</span>
              <input
                value={bookingReference}
                onChange={(e) => {
                  setBookingReference(e.target.value.toUpperCase());
                  setFieldErrors((f) => ({ ...f, bookingReference: undefined }));
                }}
                placeholder="INV-BKG-2026-AB12CD"
                autoCapitalize="characters"
                spellCheck={false}
                aria-invalid={Boolean(fieldErrors.bookingReference)}
                className={`border rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 ${
                  fieldErrors.bookingReference ? 'border-danger-500 focus:ring-danger-50' : 'border-slate-200 focus:ring-brand-100'
                }`}
              />
              {fieldErrors.bookingReference && (
                <span role="alert" className="text-xs text-danger-600">
                  {fieldErrors.bookingReference}
                </span>
              )}
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-muted">Email or mobile number used to book</span>
              <input
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFieldErrors((f) => ({ ...f, contact: undefined }));
                }}
                placeholder="you@example.com or 98765 43210"
                aria-invalid={Boolean(fieldErrors.contact)}
                className={`border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${
                  fieldErrors.contact ? 'border-danger-500 focus:ring-danger-50' : 'border-slate-200 focus:ring-brand-100'
                }`}
              />
              {fieldErrors.contact && (
                <span role="alert" className="text-xs text-danger-600">
                  {fieldErrors.contact}
                </span>
              )}
            </label>
            {error && (
              <p role="alert" className="text-xs text-danger-600">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Looking up…' : 'View My Booking'}
            </Button>
            <p className="text-xs text-ink-muted text-center">
              Want to see all your bookings?{' '}
              <Link to="/bookings/lookup" className="font-semibold text-brand-600 hover:text-brand-700">
                Log in with a one-time code
              </Link>
            </p>
          </form>
        </div>
      </Layout>
    );
  }

  if (!detail) return null;

  const canCancel = detail.bookingStatus === 'confirmed' && detail.allowSelfServiceCancellation && !detail.refundCutoffPassed;
  const activeTicket = detail.tickets.find((t) => t.id === activeTicketId) ?? null;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <p className="text-xs text-ink-muted mb-1">Your Booking</p>
          <h1 className="text-2xl font-bold text-ink">Booking details and tickets for your event.</h1>
        </div>

        <div
          className={`flex items-center gap-2 rounded-xl p-3.5 mb-6 text-sm font-semibold ${
            detail.bookingStatus === 'cancelled' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
          }`}
        >
          <Icon name={detail.bookingStatus === 'cancelled' ? 'cancel' : 'check_circle'} className="text-[18px]" filled />
          <span className="flex-1">{detail.bookingStatus === 'cancelled' ? 'This booking has been cancelled' : 'Booking Confirmed'}</span>
          {detail.bookingStatus === 'confirmed' && detail.ticketPageUrl && (
            <a
              href={detail.ticketPageUrl}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
            >
              <Icon name="confirmation_number" className="text-[16px]" /> Open Digital Ticket
            </a>
          )}
        </div>

        {detail.bookingStatus === 'cancelled' && detail.refundAmountPaise !== null && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 text-sm">
            {detail.refundAmountPaise > 0 ? (
              <p className="text-ink-muted">Refund: <strong className="text-ink">{formatINR(detail.refundAmountPaise)}</strong> — status: {detail.refundStatus ?? 'pending'}</p>
            ) : (
              <p className="text-ink-muted">This booking was not eligible for a refund under the event's cancellation policy.</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            {/* Event Banner Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col sm:flex-row">
              {detail.bannerUrl && (
                <img src={detail.bannerUrl} alt={detail.eventName} className="w-full sm:w-48 h-40 sm:h-auto object-cover shrink-0" />
              )}
              <div className="p-5 flex-1">
                <h2 className="text-lg font-bold text-ink">{detail.eventName}</h2>
                {detail.eventTagline && <p className="text-xs text-ink-muted mt-0.5">{detail.eventTagline}</p>}
                <p className="text-xs text-ink-muted mt-1">Organized by <span className="font-semibold text-ink">{detail.organizerName}</span></p>
                <div className="mt-3 space-y-1.5 text-xs text-ink-body">
                  <p className="flex items-center gap-2"><Icon name="calendar_month" className="text-[15px] text-brand-500" /> {formatDate(detail.eventDate)}</p>
                  <p className="flex items-center gap-2"><Icon name="schedule" className="text-[15px] text-brand-500" /> {formatTime(detail.eventDate)}{detail.gateOpenTime && ` · Reporting: ${formatTime(detail.gateOpenTime)}`}</p>
                  {detail.venueAddress && (
                    <p className="flex items-center gap-2"><Icon name="location_on" className="text-[15px] text-brand-500" /> {detail.venueAddress}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Booking Meta Strip */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs">
              <div>
                <p className="text-ink-muted mb-0.5">Booking ID</p>
                <p className="font-bold text-ink font-mono">{detail.bookingReference}</p>
              </div>
              <div>
                <p className="text-ink-muted mb-0.5">Booked On</p>
                <p className="font-bold text-ink">{formatDate(detail.bookedAt)}</p>
              </div>
              <div>
                <p className="text-ink-muted mb-0.5">Payment</p>
                <p className="font-bold text-ink">{formatINR(detail.totalAmountPaise)}</p>
              </div>
              <div>
                <p className="text-ink-muted mb-0.5">Tickets</p>
                <p className="font-bold text-ink">{detail.tickets.length} Pass{detail.tickets.length === 1 ? '' : 'es'}</p>
              </div>
              <div>
                <p className="text-ink-muted mb-0.5">Status</p>
                <p className="font-bold text-ink uppercase">{detail.bookingStatus}</p>
              </div>
            </div>

            {/* Event photos & videos — the organizer's own Drive/Photos link, shared after the event */}
            {detail.galleryUrl && (
              <div className="bg-gradient-to-r from-brand-50 to-cyan-50 rounded-2xl border border-brand-100 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-white text-brand-600 flex items-center justify-center shrink-0 shadow-sm">
                  <Icon name="photo_library" className="text-[22px]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-ink">Your event photos &amp; videos are ready</h3>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {detail.galleryNote || `${detail.organizerName} has shared the photos and videos from ${detail.eventName}.`}
                  </p>
                </div>
                <a
                  href={detail.galleryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg text-center shrink-0"
                >
                  View photos &amp; videos
                </a>
              </div>
            )}

            {/* Where to go: venue / pickup points with times, notes, directions */}
            {detail.locationPoints && detail.locationPoints.length > 0 && detail.bookingStatus !== 'cancelled' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h3 className="text-sm font-bold text-ink mb-3">
                  {detail.locationPoints.some((p) => p.type === 'pickup') ? 'Pickup points & venue' : 'Location'}
                </h3>
                <EventLocationMap points={detail.locationPoints} />
              </div>
            )}

            {/* Your Tickets */}
            <div>
              <h3 className="text-sm font-bold text-ink mb-1">Your Tickets</h3>
              <p className="text-xs text-ink-muted mb-3">Each participant has an individual digital ticket with a scannable QR code.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {detail.tickets.map((ticket) => (
                  <div key={ticket.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex items-start gap-3 pb-3 border-b border-slate-100">
                        <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                          <Icon name="person" className="text-[18px]" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-ink truncate">{ticket.attendeeName}</h4>
                          <span className="inline-block px-2 py-0.5 bg-brand-50 text-brand-600 rounded text-[10px] font-semibold mt-1">{ticket.tierName}</span>
                          <p className="text-[10px] text-ink-muted font-mono mt-0.5">{ticket.ticketReference}</p>
                        </div>
                      </div>
                      <div className="py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                            ticket.status === 'cancelled'
                              ? 'bg-rose-50 text-rose-600 border-rose-100'
                              : ticket.status === 'checked_in'
                                ? 'bg-slate-100 text-slate-600 border-slate-200'
                                : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                          }`}
                        >
                          {ticket.status === 'cancelled' ? 'CANCELLED' : ticket.status === 'checked_in' ? 'CHECKED IN' : 'CONFIRMED'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTicketId(ticket.id)}
                      disabled={ticket.status === 'cancelled'}
                      className="w-full py-2 px-3 border border-brand-500 bg-brand-50/40 text-brand-600 hover:bg-brand-600 hover:text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <Icon name="qr_code_2" className="text-[16px]" /> View Ticket &amp; QR
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-ink-muted">
              <Icon name="verified_user" className="text-[16px] text-brand-500 shrink-0" />
              <span>Verified access via one-time email codes — no password required.</span>
            </div>
          </div>

          {/* RIGHT SIDEBAR */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Icon name="lock" className="text-[16px]" />
              </div>
              <div>
                <p className="text-xs font-bold text-ink">Secure Access</p>
                <p className="text-[11px] text-ink-muted">Booking verified via email OTP &amp; encrypted tokens</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <h4 className="text-xs font-bold text-ink mb-2">Booking Contact</h4>
              <p className="text-sm font-semibold text-ink">{detail.primaryContactName}</p>
              <p className="text-xs text-ink-muted mt-0.5">{maskEmail(detail.primaryContactEmail)}</p>
              <p className="text-xs text-ink-muted">{maskPhone(detail.primaryContactWhatsapp)}</p>
              <p className="text-[10px] text-ink-muted mt-2 pt-2 border-t border-slate-100">Contact details are masked and privacy-protected.</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <h4 className="text-xs font-bold text-ink mb-3">Payment Summary</h4>
              <div className="space-y-1.5 text-xs">
                {detail.tierBreakdown.map((row) => (
                  <div key={row.tierName} className="flex justify-between text-ink-body">
                    <span>{row.tierName} × {row.quantity}</span>
                    <span className="font-semibold">{formatINR(row.subtotalPaise)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-sm font-bold text-ink pt-2.5 mt-2.5 border-t border-slate-100">
                <span>Total Paid</span>
                <span>{formatINR(detail.totalAmountPaise)}</span>
              </div>
              {detail.paymentReference && (
                <p className="text-[10px] text-ink-muted mt-1">Payment reference: <span className="font-mono">{detail.paymentReference}</span></p>
              )}
            </div>

            {detail.bookingStatus === 'confirmed' && !detail.allowSelfServiceCancellation && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3.5 text-red-700">
                <Icon name="block" className="text-[16px] shrink-0" />
                <p className="text-xs font-semibold">No Refund Policy — this event does not offer cancellations or refunds.</p>
              </div>
            )}

            {detail.bookingStatus === 'confirmed' && detail.allowSelfServiceCancellation && detail.refundCutoffPassed && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-amber-800">
                <Icon name="schedule" className="text-[16px] shrink-0" />
                <p className="text-xs font-semibold">The cancellation window for this event has closed.</p>
              </div>
            )}

            {canCancel && (
              <div className="bg-amber-50/50 border border-amber-200/70 rounded-2xl p-4">
                {!showCancelForm ? (
                  <>
                    <div className="flex items-start gap-2.5">
                      <Icon name="warning" className="text-[16px] text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold text-ink">Need to cancel?</h4>
                        <p className="text-[11px] text-ink-muted mt-0.5">You can cancel this booking under the organizer's refund rules.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCancelForm(true)}
                      className="w-full mt-3 py-2.5 border border-rose-300 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold"
                    >
                      Manage Ticket Cancellation
                    </button>
                  </>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-ink">Why are you cancelling?</p>
                    <textarea
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      rows={3}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-100"
                    />
                    {error && <p className="text-xs text-danger-600">{error}</p>}
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setShowCancelForm(false)}>Back</Button>
                      <Button onClick={handleCancel} disabled={cancelling}>{cancelling ? 'Cancelling…' : 'Confirm Cancellation'}</Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <h4 className="text-xs font-bold text-ink mb-2">Cancellation Policy</h4>
              {detail.allowSelfServiceCancellation ? (
                <ul className="text-[11px] text-ink-body space-y-1 pl-4 list-disc">
                  <li>{detail.refundPercentage}% refund up to {detail.refundCutoffDays} day{detail.refundCutoffDays === 1 ? '' : 's'} before the event</li>
                  <li>No refund after that window, or for no-shows</li>
                </ul>
              ) : (
                <p className="text-[11px] text-ink-body">This event does not offer self-service cancellations or refunds once booked.</p>
              )}
              {detail.cancellationPolicyText && <p className="text-[11px] text-ink-muted mt-2 pt-2 border-t border-slate-100">{detail.cancellationPolicyText}</p>}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <h4 className="text-xs font-bold text-ink mb-2.5">Important Event Information</h4>
              <div className="space-y-2.5 text-[11px]">
                {detail.gateOpenTime && (
                  <div>
                    <p className="text-ink-muted">Reporting Time</p>
                    <p className="font-semibold text-ink">{formatTime(detail.gateOpenTime)}</p>
                  </div>
                )}
                {detail.venueAddress && (
                  <div>
                    <p className="text-ink-muted">Meeting Point</p>
                    <p className="font-semibold text-ink">{detail.venueAddress}</p>
                  </div>
                )}
                {detail.packingChecklist && detail.packingChecklist.length > 0 && (
                  <div>
                    <p className="text-ink-muted">What to Carry</p>
                    <p className="font-semibold text-ink">{detail.packingChecklist.map((p) => p.item).join(', ')}</p>
                  </div>
                )}
                <div>
                  <p className="text-ink-muted">Organizer Contact</p>
                  <p className="font-semibold text-ink">{detail.organizerName}</p>
                  {detail.organizerContactEmail && <p className="text-ink-muted">{detail.organizerContactEmail}</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* QR Pass Modal */}
      {activeTicket && detail && (
        <QrPassModal
          ticket={activeTicket}
          allTickets={detail.tickets}
          bookingReference={bookingReference}
          email={email}
          eventName={detail.eventName}
          eventDate={detail.eventDate}
          venueAddress={detail.venueAddress}
          shareSupported={shareSupported}
          onSwitch={setActiveTicketId}
          onClose={() => setActiveTicketId(null)}
          onShare={handleShareQr}
        />
      )}
    </Layout>
  );
}

function QrPassModal(props: {
  ticket: TicketRow;
  allTickets: TicketRow[];
  bookingReference: string;
  email: string;
  eventName: string;
  eventDate: string;
  venueAddress: string | null;
  shareSupported: boolean;
  onSwitch: (id: string) => void;
  onClose: () => void;
  onShare: (ticket: TicketRow) => void;
}) {
  const { ticket, allTickets, bookingReference, email, eventName, eventDate, venueAddress, shareSupported, onSwitch, onClose, onShare } = props;
  const dialogRef = useRef<HTMLDivElement>(null);
  const qrUrl = `/api/bookings/${encodeURIComponent(bookingReference)}/tickets/${ticket.id}/qr?email=${encodeURIComponent(email)}`;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl"
      >
        <div className="bg-slate-900 text-white p-5 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wide bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full uppercase">
              {ticket.status === 'checked_in' ? 'Checked In' : 'Confirmed Pass'}
            </span>
            <button type="button" onClick={onClose} aria-label="Close" className="text-white/70 hover:text-white">
              <Icon name="close" className="text-[20px]" />
            </button>
          </div>
          <h3 className="text-sm font-bold mt-2">Digital Entry Pass</h3>
          <p className="text-xs text-white/60">{eventName}{venueAddress ? ` • ${venueAddress}` : ''}</p>

          {allTickets.length > 1 && (
            <div className="mt-4 pt-3 border-t border-white/10 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {allTickets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={t.status === 'cancelled'}
                  onClick={() => onSwitch(t.id)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all disabled:opacity-30 disabled:pointer-events-none ${
                    t.id === ticket.id ? 'bg-white text-slate-900' : 'bg-white/15 text-white hover:bg-white/25'
                  }`}
                >
                  {t.attendeeName.split(' ')[0]} ({t.tierName})
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between text-xs">
            <div>
              <p className="font-bold text-ink">{ticket.attendeeName}</p>
              <p className="text-ink-muted">{ticket.tierName}</p>
            </div>
            <p className="text-ink-muted font-mono">{ticket.ticketReference}</p>
          </div>

          <div className="flex flex-col items-center bg-slate-50 rounded-2xl p-5">
            <img src={qrUrl} alt={`QR code for ${ticket.attendeeName}`} className="w-48 h-48 rounded-xl border border-slate-200 bg-white" />
            <p className="text-[10px] text-ink-muted mt-3 text-center">Present this QR at the check-in desk</p>
          </div>

          <div className="bg-brand-50 rounded-xl p-3 text-[11px] text-brand-800">
            Valid exclusively for {formatDateTime(eventDate)}
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
            <a
              href={qrUrl}
              download={`${ticket.ticketReference}.png`}
              className="w-full sm:flex-1 py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all"
            >
              <Icon name="download" className="text-[16px]" /> Download Pass
            </a>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {shareSupported && (
                <button
                  type="button"
                  onClick={() => onShare(ticket)}
                  className="flex-1 sm:flex-none py-2.5 px-4 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Icon name="share" className="text-[16px]" /> Share
                </button>
              )}
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 sm:flex-none py-2.5 px-4 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Icon name="print" className="text-[16px]" /> Print
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
