import { Link } from 'react-router-dom';
import { PageHeader, Stat, Card, Loading, Table, Badge } from '../ui';
import { useSa, useSaKey, rupees, num, when } from '../lib';

interface DashboardData {
  totals: Record<string, number>;
  windows: Record<string, number>;
  platformFeePercent: number;
  platformEarningsPaise: number;
  grossRevenuePaise: number;
  daily: { day: string; bookings: number; revenuePaise: number }[];
  topEvents: { id: string; name: string; organizer_name: string; bookings: number; revenue_paise: number }[];
  recentBookings: {
    booking_reference: string;
    primary_contact_name: string;
    status: string;
    total_amount_paise: number;
    event_name: string;
    created_at: string;
  }[];
  notifications24h: { channel: string; status: string; count: number }[];
}

// Bookings per day for the last 30 days, as plain SVG bars.
function DailyChart({ daily }: { daily: DashboardData['daily'] }) {
  const max = Math.max(1, ...daily.map((d) => d.bookings));
  const W = 600;
  const H = 140;
  const bw = W / daily.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full h-44" role="img" aria-label="Bookings per day, last 30 days">
      {daily.map((d, i) => {
        const h = (d.bookings / max) * H;
        return (
          <g key={d.day}>
            <rect x={i * bw + 2} y={H - h} width={bw - 4} height={Math.max(h, d.bookings ? 2 : 0)} rx={2} className="fill-brand-500">
              <title>{`${d.day}: ${d.bookings} bookings, ${rupees(d.revenuePaise)}`}</title>
            </rect>
            {i % 5 === 0 && (
              <text x={i * bw + bw / 2} y={H + 14} textAnchor="middle" className="fill-slate-400 text-[10px]">
                {d.day.slice(5)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function DashboardPage() {
  const key = useSaKey();
  const { data, error, loading } = useSa<DashboardData>('/dashboard');
  const t = data?.totals ?? {};
  const w = data?.windows ?? {};
  const channel = (c: string, s: string) => data?.notifications24h.find((n) => n.channel === c && n.status === s)?.count ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader title="Dashboard" subtitle="Everything happening on the platform, across all organizers." />
      <Loading error={error} loading={loading && !data} />
      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              label="Gross ticket sales"
              value={rupees(data.grossRevenuePaise)}
              hint={`${rupees(w.revenue_30d)} in the last 30 days`}
              tone="blue"
            />
            <Stat
              label="Platform earnings"
              value={rupees(data.platformEarningsPaise)}
              hint={`${data.platformFeePercent}% of online payments`}
              tone="green"
            />
            <Stat label="Bookings" value={num(t.bookings)} hint={`${num(w.bookings_24h)} today · ${num(w.bookings_7d)} this week`} />
            <Stat label="Tickets sold" value={num(t.tickets)} hint={`${num(t.checked_in)} checked in`} />
            <Stat
              label="Organizers"
              value={num(t.organizers)}
              hint={`${num(t.blocked_organizers)} blocked · ${num(t.organizer_users)} users`}
            />
            <Stat label="Customers" value={num(t.customers)} hint={`${num(t.blocked_customers)} blocked`} />
            <Stat label="Live events" value={num(t.live_events)} hint={`${num(t.events)} events in total`} />
            <Stat
              label="Pending payments"
              value={num(t.pending_bookings)}
              hint={`Refunded so far: ${rupees(t.refunded_paise)}`}
              tone={t.pending_bookings ? 'amber' : 'slate'}
            />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <Card title="Bookings per day (last 30 days, IST)" className="lg:col-span-2">
              <DailyChart daily={data.daily} />
            </Card>
            <Card
              title="Messages in the last 24 hours"
              actions={
                <Link to={`/x/${key}/messages`} className="text-xs text-brand-600 font-semibold">
                  Open log →
                </Link>
              }
            >
              <dl className="space-y-2 text-sm">
                {[
                  ['Emails sent', channel('email', 'sent'), 'green'],
                  ['Emails failed', channel('email', 'failed'), 'red'],
                  ['WhatsApp sent', channel('whatsapp', 'sent'), 'green'],
                  ['WhatsApp failed', channel('whatsapp', 'failed'), 'red'],
                  ['Login codes issued', channel('otp', 'issued'), 'slate'],
                  ['Login codes used', channel('otp', 'verified'), 'slate'],
                ].map(([label, value, tone]) => (
                  <div key={label as string} className="flex justify-between">
                    <dt className="text-slate-600">{label}</dt>
                    <dd className={`font-bold ${tone === 'red' && Number(value) > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                      {num(value as number)}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card title="Top events by sales">
              <Table head={['Event', 'Organizer', 'Bookings', 'Sales']} empty={!data.topEvents.length}>
                {data.topEvents.map((e) => (
                  <tr key={e.id}>
                    <td className="px-3 py-2 font-medium text-slate-800">{e.name}</td>
                    <td className="px-3 py-2 text-slate-600">{e.organizer_name}</td>
                    <td className="px-3 py-2">{num(e.bookings)}</td>
                    <td className="px-3 py-2 font-semibold">{rupees(e.revenue_paise)}</td>
                  </tr>
                ))}
              </Table>
            </Card>
            <Card
              title="Latest bookings"
              actions={
                <Link to={`/x/${key}/bookings`} className="text-xs text-brand-600 font-semibold">
                  All bookings →
                </Link>
              }
            >
              <Table head={['Booking', 'Customer', 'Status', 'Amount', 'When']} empty={!data.recentBookings.length}>
                {data.recentBookings.map((b) => (
                  <tr key={b.booking_reference}>
                    <td className="px-3 py-2 font-mono text-xs">{b.booking_reference}</td>
                    <td className="px-3 py-2">
                      <p className="text-slate-800">{b.primary_contact_name}</p>
                      <p className="text-[11px] text-slate-500">{b.event_name}</p>
                    </td>
                    <td className="px-3 py-2">
                      <Badge value={b.status} />
                    </td>
                    <td className="px-3 py-2">{rupees(b.total_amount_paise)}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{when(b.created_at)}</td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
