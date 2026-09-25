import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { INVEON_EVENTS_LOGO_URL } from '../../lib/brand';
import { useBranding } from '../../lib/branding';

function PlatformLogo({ className }: { className: string }) {
  const branding = useBranding();
  return <img src={branding?.logoUrl || INVEON_EVENTS_LOGO_URL} alt={branding?.platformName || 'Inveon Events'} className={className} />;
}

// The digital ticket, shared by the customer's ticket page (/t/:token)
// and the organizer's "preview before publish" step, so what the
// organizer approves is exactly what attendees get.
//   - desktop: dark stage hero (organizer's title background), attendee
//     strip, QR stub, Partners & Supporters, notice bar;
//   - mobile: the same content stacked on a white page.

export interface TicketPartner {
  name: string;
  role: string | null;
  logoUrl: string | null;
}

export type TicketStatusTone = 'ok' | 'warn' | 'bad' | 'muted';

export interface EventTicketData {
  organizerName: string;
  organizerLogoUrl: string | null;
  organizerPhone: string | null;
  eventName: string;
  tagline: string | null;
  eventDate: string; // ISO
  gateOpenTime: string | null; // ISO
  venueAddress: string | null;
  backgroundUrl: string | null;
  partners: TicketPartner[];
  bookingReference: string;
  attendeeName: string;
  tierName: string;
  ticketId: string;
  statusText: string;
  statusTone: TicketStatusTone;
  quantity: number;
  qrSrc: string | null;
}

const IST = { timeZone: 'Asia/Kolkata' } as const;

// Shown only to the organizer, where they have no partners yet.
const PLACEHOLDER_PARTNERS: { role: string; icon: string }[] = [
  { role: 'Music Partner', icon: 'music_note' },
  { role: 'Co-Sponsor', icon: 'handshake' },
  { role: 'Media Partner', icon: 'videocam' },
  { role: 'Associate Partner', icon: 'groups' },
];

// "Dandiya Night 2026" → ["Dandiya Night", "2026"]; otherwise the
// event's own year goes under the title, as in the design.
export function splitTitle(name: string, eventDate: string): { title: string; year: string } {
  const m = name.trim().match(/^(.*?)[\s-–]*((?:19|20)\d{2})$/);
  if (m && m[1]) return { title: m[1], year: m[2] };
  const year = new Date(eventDate).toLocaleDateString('en-IN', { ...IST, year: 'numeric' });
  return { title: name.trim(), year };
}

function parts(address: string | null): { venue: string; city: string } {
  const pieces = (address ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (pieces.length === 0) return { venue: 'Venue to be announced', city: '' };
  // "Venue, Street, City, State, 411001" — the city is the part before the state / PIN.
  const withoutPin = pieces.filter((p) => !/^\d{6}$/.test(p));
  const city = withoutPin.length > 2 ? withoutPin[withoutPin.length - 2] : withoutPin.length === 2 ? withoutPin[1] : '';
  return { venue: pieces[0], city };
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?'
  );
}

export function ticketFormat(data: Pick<EventTicketData, 'eventDate' | 'gateOpenTime'>) {
  const event = new Date(data.eventDate);
  const time = (d: Date) => d.toLocaleTimeString('en-IN', { ...IST, hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
  return {
    date: event.toLocaleDateString('en-IN', { ...IST, day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase(),
    shortDate: event.toLocaleDateString('en-IN', { ...IST, day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase(),
    weekday: event.toLocaleDateString('en-IN', { ...IST, weekday: 'long' }),
    reporting: data.gateOpenTime ? time(new Date(data.gateOpenTime)) : null,
    start: time(event),
  };
}

const STATUS_DARK: Record<TicketStatusTone, string> = {
  ok: 'bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.4)]',
  warn: 'bg-amber-500 text-white',
  bad: 'bg-rose-600 text-white',
  muted: 'bg-slate-500 text-white',
};

const STATUS_LIGHT: Record<TicketStatusTone, string> = {
  ok: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  warn: 'bg-amber-50 border-amber-200 text-amber-700',
  bad: 'bg-rose-50 border-rose-200 text-rose-700',
  muted: 'bg-slate-100 border-slate-200 text-slate-600',
};

function OrganizerBadge({ name, logoUrl, size }: { name: string; logoUrl: string | null; size: 'lg' | 'sm' }) {
  const box = size === 'lg' ? 'w-14 h-14' : 'w-9 h-9';
  return (
    <div
      className={`${box} shrink-0 rounded-full border-2 border-amber-400/90 bg-gradient-to-b from-[#09152b] to-[#040813] shadow-[0_0_15px_rgba(234,179,8,0.4)] overflow-hidden flex items-center justify-center`}
    >
      {logoUrl ? (
        <img src={logoUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className={`font-festive font-black text-amber-300 ${size === 'lg' ? 'text-lg' : 'text-xs'}`}>{initials(name)}</span>
      )}
    </div>
  );
}

function Hero({ data, compact }: { data: EventTicketData; compact?: boolean }) {
  const { title, year } = splitTitle(data.eventName, data.eventDate);
  return (
    <>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {data.backgroundUrl ? (
          <img src={data.backgroundUrl} alt="" className="w-full h-full object-cover brightness-[0.75] contrast-[1.1] scale-105" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#1a1329] via-[#16172e] to-[#0c1424]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#060a16] via-[#090b1c]/60 to-[#070b1a]/85" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-black/60" />
      </div>
      <div className={`relative z-10 text-center flex flex-col items-center ${compact ? 'px-4 pt-5 pb-5' : 'pt-6 px-6 sm:px-8'}`}>
        <div className="flex items-center gap-3 mb-1.5">
          <OrganizerBadge name={data.organizerName} logoUrl={data.organizerLogoUrl} size={compact ? 'sm' : 'lg'} />
          <div className="text-left">
            <p className="text-white text-[11px] sm:text-sm font-bold tracking-[0.22em] uppercase">{data.organizerName}</p>
            <p className="text-amber-300/90 text-[10px] sm:text-[11px] font-semibold tracking-[0.35em] uppercase">Presents</p>
          </div>
        </div>
        <h1
          className={`font-festive font-black uppercase leading-none tracking-wider bg-gradient-to-b from-[#fff7c2] via-[#ffd043] to-[#e69500] bg-clip-text text-transparent drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] break-words ${
            compact ? 'text-3xl mt-1' : 'text-4xl sm:text-5xl lg:text-[56px] mt-1'
          }`}
        >
          {title}
        </h1>
        <div className="flex items-center justify-center gap-4 my-1">
          <span className="h-[2px] w-10 sm:w-20 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
          <span
            className={`font-festive font-black tracking-widest bg-gradient-to-b from-white via-[#ffeaa7] to-[#f59e0b] bg-clip-text text-transparent ${compact ? 'text-2xl' : 'text-3xl sm:text-4xl'}`}
          >
            {year}
          </span>
          <span className="h-[2px] w-10 sm:w-20 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
        </div>
        {data.tagline && (
          <p className="text-amber-100/90 text-[11px] sm:text-sm font-medium tracking-[0.18em] uppercase drop-shadow">{data.tagline}</p>
        )}
      </div>
    </>
  );
}

function MetaItem({ icon, label, value, sub }: { icon: string; label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <Icon name={icon} className="text-[24px] text-amber-400 shrink-0" />
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">{label}</p>
        <p className="text-xs sm:text-[13px] font-bold text-white leading-tight break-words">{value}</p>
        {sub && <p className="text-[10px] text-slate-300 font-medium leading-none mt-0.5 uppercase">{sub}</p>}
      </div>
    </div>
  );
}

function QrBox({ data, className }: { data: EventTicketData; className: string }) {
  return data.qrSrc ? (
    <img src={data.qrSrc} alt={`QR code for ${data.attendeeName}`} className={`bg-white ${className}`} />
  ) : (
    <div className={`bg-white flex items-center justify-center text-center text-xs text-slate-400 ${className}`}>
      QR code appears here once booked
    </div>
  );
}

function PartnerTile({ partner, placeholder }: { partner?: TicketPartner; placeholder?: { role: string; icon: string } }) {
  return (
    <div
      className={`rounded-lg border py-3 px-2 flex flex-col items-center justify-center text-center min-h-[84px] ${
        placeholder ? 'border-dashed border-slate-300 bg-white/70' : 'border-slate-200/90 bg-white shadow-sm'
      }`}
    >
      {partner?.logoUrl ? (
        <img src={partner.logoUrl} alt={partner.name} className="h-9 max-w-full object-contain mb-1.5" />
      ) : (
        <Icon name={placeholder?.icon ?? 'workspace_premium'} className="text-[20px] text-brand-600 mb-1" />
      )}
      <p className="text-[9px] font-bold text-slate-800 uppercase tracking-tight leading-tight">
        {placeholder ? placeholder.role : partner?.role || partner?.name}
      </p>
      <p className="text-[8.5px] text-slate-400 mt-0.5 font-medium leading-tight">
        {placeholder ? 'Your Logo Here' : partner?.role ? partner.name : ''}
      </p>
    </div>
  );
}

function InveonTechMark() {
  return (
    <div className="flex items-center gap-2">
      <svg className="w-8 h-8" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M4 4L16 28L28 4H20L16 16L12 4H4Z" fill="#0050cb" />
        <path d="M20 4L16 16L12 4H7L16 22L25 4H20Z" fill="#f97316" />
      </svg>
      <div className="leading-none text-left">
        <span className="text-[15px] font-black text-slate-900 tracking-wider block">INVEON</span>
        <span className="block text-[6.5px] font-bold tracking-[0.25em] text-[#0050cb] uppercase mt-0.5">Technologies</span>
      </div>
    </div>
  );
}

function partnerTiles(data: EventTicketData, showPlaceholders: boolean): ReactNode[] {
  if (data.partners.length > 0) return data.partners.map((p, i) => <PartnerTile key={`${p.name}-${i}`} partner={p} />);
  if (showPlaceholders) return PLACEHOLDER_PARTNERS.map((p) => <PartnerTile key={p.role} placeholder={p} />);
  return [];
}

export function DesktopTicket({ data, showPartnerPlaceholders = false }: { data: EventTicketData; showPartnerPlaceholders?: boolean }) {
  const f = ticketFormat(data);
  const { venue, city } = parts(data.venueAddress);
  const tiles = partnerTiles(data, showPartnerPlaceholders);
  return (
    <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-300/70" data-testid="desktop-ticket">
      <div className="flex flex-row relative">
        <section className="flex-1 relative bg-[#0a0717] min-h-[460px] flex flex-col justify-between overflow-hidden">
          <Hero data={data} />
          <div className="relative z-10 px-6 lg:px-8 my-4">
            <div className="bg-black/60 backdrop-blur-md border border-white/15 rounded-xl px-4 py-2.5 grid grid-cols-5 gap-3 items-center">
              <MetaItem icon="calendar_month" label="Date" value={f.date} sub={f.weekday} />
              <MetaItem icon="schedule" label="Reporting Time" value={f.reporting ?? f.start} />
              <MetaItem icon="nest_clock_farsight_analog" label="Event Time" value={f.start} sub="Onwards" />
              <MetaItem icon="location_on" label="Venue" value={venue} />
              <MetaItem icon="location_city" label="City" value={city || '—'} />
            </div>
          </div>
          <div className="relative z-10 px-6 lg:px-8 pb-5">
            <div className="bg-[#0b1325]/90 border border-slate-700/80 rounded-xl p-3.5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-slate-800/90 border border-amber-400/40 flex items-center justify-center text-amber-400 shrink-0">
                  <Icon name="person" className="text-[20px]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9.5px] uppercase font-bold text-slate-400 tracking-wider">Entry For</p>
                  <p className="text-lg font-bold text-white leading-tight truncate">{data.attendeeName}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0">
                  <Icon name="confirmation_number" className="text-[20px]" />
                </div>
                <div>
                  <p className="text-[9.5px] uppercase font-bold text-slate-400 tracking-wider">Ticket Type</p>
                  <p className="text-sm font-black text-amber-400 tracking-wide uppercase">{data.tierName}</p>
                </div>
              </div>
              <div className="flex flex-col gap-1 text-[11px] text-slate-300 font-medium">
                <span>
                  TICKET ID: <strong className="text-white font-mono">{data.ticketId}</strong>
                </span>
                <span>
                  BOOKING ID: <strong className="text-white font-mono">{data.bookingReference}</strong>
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[9.5px] uppercase font-bold text-slate-400 tracking-wider mb-1">Status</span>
                <span
                  className={`px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-extrabold tracking-wider ${STATUS_DARK[data.statusTone]}`}
                >
                  {data.statusTone === 'ok' && <Icon name="check" className="text-[14px]" />}
                  {data.statusText}
                </span>
              </div>
            </div>
          </div>
        </section>
        <aside className="w-[285px] shrink-0 ticket-mandala border-l-2 border-dashed border-slate-300 flex flex-col justify-between items-center p-6 text-center">
          <h2 className="text-slate-900 font-extrabold text-[15px] tracking-[0.16em] uppercase">Scan For Entry</h2>
          <QrBox data={data} className="my-4 rounded-2xl shadow-md border border-amber-200/60 aspect-square w-full p-3" />
          <p className="text-xs text-slate-600 font-medium leading-relaxed max-w-[190px]">Present this QR code at the event entrance.</p>
        </aside>
      </div>

      <section className="bg-[#fdfbf6] border-t border-slate-200 px-6 py-4">
        <div className="flex flex-row items-center justify-between gap-6">
          {tiles.length > 0 && (
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#0b1c30] mb-2.5">Partners &amp; Supporters</p>
              <div className="grid grid-cols-5 gap-2.5">{tiles}</div>
            </div>
          )}
          <div className={`flex flex-col items-end shrink-0 ${tiles.length === 0 ? 'w-full items-center' : ''}`}>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#0b1c30] mb-2.5">Technology Partners</p>
            <div className="flex items-center gap-6">
              <div className="flex flex-col items-center">
                <span className="text-[8px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Technology Partner</span>
                <InveonTechMark />
              </div>
              <div className="w-px h-10 bg-slate-300" />
              <div className="flex flex-col items-center">
                <span className="text-[8px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Event Booking Partner</span>
                <PlatformLogo className="h-9 w-auto object-contain" />
              </div>
            </div>
            <p className="text-[9.5px] text-slate-500 font-semibold tracking-wide mt-2">Digital Booking • Secure Payments • QR Ticketing</p>
          </div>
        </div>
      </section>

      <footer className="bg-[#0b1426] text-slate-300 px-6 py-2.5 text-xs flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <Icon name="info" className="text-[16px] text-cyan-400" />
          Please carry this ticket on your phone. Valid QR ticket required for entry.
        </span>
        <span className="flex items-center gap-2">
          <Icon name="call" className="text-[14px] text-amber-400" filled />
          For event information: <strong className="text-white font-semibold">{data.organizerName}</strong>
          {data.organizerPhone && (
            <>
              <span className="text-slate-600">|</span>
              <a className="text-white font-bold hover:text-amber-400" href={`tel:${data.organizerPhone.replace(/\s/g, '')}`}>
                {data.organizerPhone}
              </a>
            </>
          )}
        </span>
      </footer>
    </div>
  );
}

function InfoCard({ icon, tone, label, value, sub }: { icon: string; tone: string; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-2.5 flex items-start gap-2.5 min-w-0 shadow-sm">
      <div className={`p-1.5 rounded-lg border shrink-0 mt-0.5 flex ${tone}`}>
        <Icon name={icon} className="text-[16px]" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500">{label}</p>
        <p className="text-xs font-bold text-slate-900 leading-tight break-words line-clamp-2">{value}</p>
        {sub && <p className="text-[10px] text-slate-500 font-medium truncate">{sub}</p>}
      </div>
    </div>
  );
}

// The mobile ticket on a white page (the design's dark page, lightened
// as requested); only the hero keeps the organizer's image behind it.
export function MobileTicket({ data, showPartnerPlaceholders = false }: { data: EventTicketData; showPartnerPlaceholders?: boolean }) {
  const f = ticketFormat(data);
  const { venue, city } = parts(data.venueAddress);
  const tiles = partnerTiles(data, showPartnerPlaceholders);
  return (
    <div className="space-y-4" data-testid="mobile-ticket">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_12px_35px_-10px_rgba(15,23,42,0.25)] overflow-hidden">
        <div className="relative overflow-hidden bg-[#0c1424]">
          <Hero data={data} compact />
        </div>

        <div className="p-3.5 grid grid-cols-2 gap-2.5 bg-slate-50">
          <InfoCard
            icon="calendar_month"
            tone="bg-amber-50 border-amber-200 text-amber-600"
            label="Date"
            value={f.shortDate}
            sub={f.weekday}
          />
          <InfoCard
            icon="schedule"
            tone="bg-blue-50 border-blue-200 text-blue-600"
            label={f.reporting ? 'Gate Opens' : 'Starts'}
            value={f.reporting ?? f.start}
            sub={f.reporting ? 'Reporting' : 'Onwards'}
          />
          <InfoCard
            icon="nest_clock_farsight_analog"
            tone="bg-indigo-50 border-indigo-200 text-indigo-600"
            label="Event Starts"
            value={f.start}
            sub="Onwards"
          />
          <InfoCard icon="location_on" tone="bg-rose-50 border-rose-200 text-rose-600" label="Venue" value={venue} sub={city} />
        </div>

        <div className="px-3.5 py-3 border-t border-slate-100">
          <div className="rounded-xl p-3 border border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 font-bold text-sm shrink-0">
                  {initials(data.attendeeName)}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase font-medium tracking-wider text-slate-500">Entry For</p>
                  <p className="text-sm font-bold text-slate-900 truncate">{data.attendeeName}</p>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border shrink-0 ${STATUS_LIGHT[data.statusTone]}`}>
                {data.statusText}
              </span>
            </div>
            <div className="pt-2.5 grid grid-cols-2 gap-2 text-xs">
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-medium text-slate-500">Ticket Type</p>
                <p className="font-bold text-amber-600 tracking-wide uppercase truncate">{data.tierName}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-medium text-slate-500">Ticket ID</p>
                <p className="font-mono text-slate-800 text-[11px] font-semibold break-all">{data.ticketId}</p>
              </div>
              <div className="col-span-2 pt-1.5 border-t border-slate-100 flex justify-between items-center gap-2 text-[10px]">
                <span className="text-slate-500 min-w-0">
                  Booking ID: <span className="font-mono text-slate-700 font-semibold break-all">{data.bookingReference}</span>
                </span>
                <span className="text-slate-500 shrink-0">
                  Qty:{' '}
                  <strong className="text-slate-900">
                    {data.quantity} {data.quantity === 1 ? 'Person' : 'People'}
                  </strong>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative py-2" aria-hidden="true">
          <span className="absolute left-[-11px] top-1/2 -translate-y-1/2 w-[22px] h-[22px] rounded-full bg-slate-100 border border-slate-200" />
          <div className="mx-4 border-b-2 border-dashed border-slate-200" />
          <span className="absolute right-[-11px] top-1/2 -translate-y-1/2 w-[22px] h-[22px] rounded-full bg-slate-100 border border-slate-200" />
        </div>

        <div className="ticket-mandala p-5 text-center flex flex-col items-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-100/90 border border-amber-300 text-amber-900 text-[11px] font-extrabold uppercase tracking-widest mb-3">
            <Icon name="qr_code_scanner" className="text-[14px]" /> Scan For Entry
          </span>
          <div className="p-3 bg-white rounded-2xl shadow-lg border-2 border-amber-200/70">
            <QrBox data={data} className="w-52 h-52 rounded-lg" />
          </div>
          <p className="text-xs font-semibold text-slate-700 mt-3 max-w-[240px]">
            Present this QR code at the event entrance for digital verification.
          </p>
          <span className="mt-2 text-[10px] font-mono uppercase tracking-wider text-slate-500 bg-amber-100/60 px-2.5 py-0.5 rounded">
            {data.ticketId} • 1 Admit
          </span>
        </div>
      </div>

      <section className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm">
        {tiles.length > 0 && (
          <>
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="h-px w-8 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-[10px] font-bold uppercase tracking-widest text-slate-600">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5" />
                Partners &amp; Supporters
              </span>
              <span className="h-px w-8 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">{tiles}</div>
          </>
        )}
        <div className="rounded-xl p-3 border border-blue-100 bg-gradient-to-r from-blue-50/60 via-white to-blue-50/60 flex flex-col items-center">
          <p className="flex items-center gap-1.5 mb-1.5 text-[9px] uppercase tracking-[0.2em] text-blue-700 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Official Technology &amp; Ticketing Partner
          </p>
          <div className="flex items-center gap-4 py-1">
            <InveonTechMark />
            <span className="w-px h-7 bg-slate-200" />
            <PlatformLogo className="h-7 w-auto object-contain" />
          </div>
          <p className="mt-1.5 text-[9px] text-slate-500">✓ Digital Booking • Secure Payments • QR Ticketing</p>
        </div>
      </section>

      <section className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs space-y-1.5">
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-blue-900">
          <Icon name="info" className="text-[16px] text-blue-600 shrink-0" />
          Please carry this digital ticket on your phone. Valid QR ticket required for gate entry.
        </p>
        {data.organizerPhone && (
          <p className="pt-1.5 border-t border-blue-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Helpline &amp; Info ({data.organizerName}):</span>
            <a className="text-brand-700 font-bold hover:underline" href={`tel:${data.organizerPhone.replace(/\s/g, '')}`}>
              {data.organizerPhone}
            </a>
          </p>
        )}
      </section>
    </div>
  );
}

const DESKTOP_QUERY = '(min-width: 1024px)';

function useIsDesktop(): boolean {
  const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(DESKTOP_QUERY).matches;
  const [desktop, setDesktop] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setDesktop(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return desktop;
}

// Desktop layout from 1024px up, the mobile one below — only one is
// rendered, so the QR image is fetched once.
export function EventTicket({ data, showPartnerPlaceholders = false }: { data: EventTicketData; showPartnerPlaceholders?: boolean }) {
  const desktop = useIsDesktop();
  return desktop ? (
    <DesktopTicket data={data} showPartnerPlaceholders={showPartnerPlaceholders} />
  ) : (
    <MobileTicket data={data} showPartnerPlaceholders={showPartnerPlaceholders} />
  );
}
