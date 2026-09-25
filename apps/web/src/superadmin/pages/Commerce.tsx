import { useState } from 'react';
import { PageHeader, Table, Badge, Pager, SearchBar, Select, Loading, Notice, Stat, ConfirmAction, Card, Button } from '../ui';
import { useSa, useSaAction, useListQuery, rupees, num, when } from '../lib';

interface EventRow {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  event_date: string;
  venue_address: string | null;
  certificate_enabled: boolean;
  organizer_name: string;
  capacity: number;
  tickets_sold: number;
  checked_in: number;
  revenue_paise: number;
}

export function EventsPage() {
  const list = useListQuery({ status: '' });
  const { data, error, loading, reload } = useSa<{ events: EventRow[]; page: number; pageSize: number; total: number }>(
    `/events?${list.query}`,
  );
  const action = useSaAction();
  return (
    <div>
      <PageHeader title="Events" subtitle="All events from all organizers. Close an event to stop sales immediately." />
      <SearchBar value={list.q} onChange={list.setQ} placeholder="Search event or organizer">
        <Select
          label="Status"
          value={list.filters.status}
          onChange={(v) => list.setFilter('status', v)}
          options={[
            ['', 'All'],
            ['published', 'Published'],
            ['draft', 'Draft'],
            ['closed', 'Closed'],
            ['cancelled', 'Cancelled'],
          ]}
        />
      </SearchBar>
      <Notice message={action.message} />
      <Loading error={error} loading={loading && !data} />
      {data && (
        <>
          <Table head={['Event', 'Organizer', 'Date', 'Sold', 'Checked in', 'Sales', 'Status', '']} empty={!data.events.length}>
            {data.events.map((e) => (
              <tr key={e.id}>
                <td className="px-3 py-2">
                  <p className="font-medium">{e.name}</p>
                  {e.slug && (
                    <a href={`/events/${e.slug}`} target="_blank" rel="noreferrer" className="text-[11px] text-brand-600">
                      View public page ↗
                    </a>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">{e.organizer_name}</td>
                <td className="px-3 py-2 text-xs">{when(e.event_date)}</td>
                <td className="px-3 py-2">
                  {num(e.tickets_sold)} <span className="text-xs text-slate-400">/ {num(e.capacity)}</span>
                </td>
                <td className="px-3 py-2">{num(e.checked_in)}</td>
                <td className="px-3 py-2 font-semibold">{rupees(e.revenue_paise)}</td>
                <td className="px-3 py-2">
                  <Badge value={e.status} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {e.status === 'published' && (
                    <ConfirmAction
                      label="Close sales"
                      question="Stop all sales for this event?"
                      onConfirm={async () => {
                        if (await action.run(`/events/${e.id}/status`, { body: { status: 'closed' } }, `${e.name}: sales closed`)) reload();
                      }}
                    />
                  )}
                  {e.status === 'closed' && (
                    <ConfirmAction
                      label="Reopen"
                      tone="secondary"
                      question="Publish again?"
                      onConfirm={async () => {
                        if (await action.run(`/events/${e.id}/status`, { body: { status: 'published' } }, `${e.name}: reopened`)) reload();
                      }}
                    />
                  )}
                </td>
              </tr>
            ))}
          </Table>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={list.setPage} />
        </>
      )}
    </div>
  );
}

interface BookingRow {
  id: string;
  booking_reference: string;
  status: string;
  payment_method: string;
  total_amount_paise: number;
  primary_contact_name: string;
  primary_contact_email: string;
  primary_contact_whatsapp: string;
  refund_amount_paise: number | null;
  refund_status: string | null;
  confirmation_email_status: string | null;
  confirmation_whatsapp_status: string | null;
  created_at: string;
  event_name: string;
  organizer_name: string;
  tickets: number;
}

export function BookingsPage() {
  const list = useListQuery({ status: '' });
  const { data, error, loading } = useSa<{ bookings: BookingRow[]; page: number; pageSize: number; total: number }>(
    `/bookings?${list.query}`,
  );
  return (
    <div>
      <PageHeader title="Bookings" subtitle="Every booking, with how its confirmation email and WhatsApp went." />
      <SearchBar value={list.q} onChange={list.setQ} placeholder="Booking ID, email, name, phone or event">
        <Select
          label="Status"
          value={list.filters.status}
          onChange={(v) => list.setFilter('status', v)}
          options={[
            ['', 'All'],
            ['confirmed', 'Confirmed'],
            ['pending', 'Pending payment'],
            ['cancelled', 'Cancelled'],
          ]}
        />
      </SearchBar>
      <Loading error={error} loading={loading && !data} />
      {data && (
        <>
          <Table
            head={['Booking', 'Customer', 'Event', 'Tickets', 'Amount', 'Status', 'Email / WhatsApp', 'When']}
            empty={!data.bookings.length}
          >
            {data.bookings.map((b) => (
              <tr key={b.id}>
                <td className="px-3 py-2 font-mono text-xs">{b.booking_reference}</td>
                <td className="px-3 py-2">
                  <p className="font-medium">{b.primary_contact_name}</p>
                  <p className="text-xs text-slate-500">
                    {b.primary_contact_email} · {b.primary_contact_whatsapp}
                  </p>
                </td>
                <td className="px-3 py-2 text-xs">
                  {b.event_name}
                  <p className="text-slate-500">{b.organizer_name}</p>
                </td>
                <td className="px-3 py-2">{b.tickets}</td>
                <td className="px-3 py-2">
                  <p className="font-semibold">{rupees(b.total_amount_paise)}</p>
                  <p className="text-[11px] text-slate-500">{b.payment_method}</p>
                  {b.refund_amount_paise ? (
                    <p className="text-[11px] text-violet-600">
                      Refund {rupees(b.refund_amount_paise)} ({b.refund_status ?? 'pending'})
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <Badge value={b.status} />
                </td>
                <td className="px-3 py-2 space-x-1 whitespace-nowrap">
                  <Badge value={b.confirmation_email_status ?? '—'} />
                  <Badge value={b.confirmation_whatsapp_status ?? '—'} />
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">{when(b.created_at)}</td>
              </tr>
            ))}
          </Table>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={list.setPage} />
        </>
      )}
    </div>
  );
}

interface PaymentRow {
  id: string;
  amount_paise: number;
  method: string;
  status: string;
  gateway_reference: string | null;
  verified_at: string | null;
  created_at: string;
  booking_reference: string;
  primary_contact_name: string;
  primary_contact_email: string;
  refund_amount_paise: number | null;
  refund_status: string | null;
  event_name: string;
  organizer_name: string;
}

interface CashfreeLookup {
  reference: string;
  mode: string;
  order: { order_status: string; order_expiry_time: string; cf_order_id: string; order_amount?: number };
  payments: { cf_payment_id: string | number; payment_status: string; payment_group?: string; payment_message?: string; payment_time?: string }[];
}

// What Cashfree itself says about one booking's order — for "I paid but
// got no ticket" support cases.
function CashfreeLookupCard({ lookup, onClose }: { lookup: CashfreeLookup; onClose: () => void }) {
  return (
    <Card
      title={`Cashfree: ${lookup.reference} (${lookup.mode})`}
      className="mb-4"
      actions={
        <Button small tone="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="text-sm space-y-2">
        <p>
          Order status: <Badge value={lookup.order.order_status} /> · expires {when(lookup.order.order_expiry_time)}
          {lookup.order.order_amount !== undefined && <> · ₹{lookup.order.order_amount}</>}
        </p>
        {lookup.payments.length ? (
          <ul className="space-y-1">
            {lookup.payments.map((p) => (
              <li key={String(p.cf_payment_id)} className="text-xs">
                <Badge value={p.payment_status} /> <span className="font-mono">{String(p.cf_payment_id)}</span> {p.payment_group ?? ''}{' '}
                {p.payment_time ? when(p.payment_time) : ''} <span className="text-slate-500">{p.payment_message ?? ''}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">No payment attempts on this order — the customer never reached the payment step.</p>
        )}
      </div>
    </Card>
  );
}

export function PaymentsPage() {
  const list = useListQuery({ status: '', method: '' });
  const cf = useSaAction();
  const [lookup, setLookup] = useState<CashfreeLookup | null>(null);
  async function askCashfree(reference: string) {
    setLookup(null);
    const r = await cf.run<Omit<CashfreeLookup, 'reference'>>(`/payments/${encodeURIComponent(reference)}/cashfree`, { method: 'GET' });
    if (r) setLookup({ ...r, reference });
  }
  const { data, error, loading } = useSa<{
    payments: PaymentRow[];
    summary: Record<string, number>;
    page: number;
    pageSize: number;
    total: number;
  }>(`/payments?${list.query}`);
  return (
    <div>
      <PageHeader title="Payments" subtitle="Online (Cashfree) and cash payments across the platform, with refunds." />
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Stat label="Paid" value={rupees(data.summary.paid_paise)} tone="green" />
          <Stat label="Waiting" value={rupees(data.summary.pending_paise)} tone="amber" />
          <Stat label="Failed" value={rupees(data.summary.failed_paise)} tone="red" />
          <Stat label="Refunded" value={rupees(data.summary.refunded_paise)} />
        </div>
      )}
      <SearchBar value={list.q} onChange={list.setQ} placeholder="Booking ID, Cashfree order ID, email or event">
        <Select
          label="Status"
          value={list.filters.status}
          onChange={(v) => list.setFilter('status', v)}
          options={[
            ['', 'Any status'],
            ['paid', 'Paid'],
            ['pending', 'Pending'],
            ['failed', 'Failed'],
            ['refunded', 'Refunded'],
          ]}
        />
        <Select
          label="Method"
          value={list.filters.method}
          onChange={(v) => list.setFilter('method', v)}
          options={[
            ['', 'Any method'],
            ['online', 'Online'],
            ['cash', 'Cash'],
          ]}
        />
      </SearchBar>
      <Loading error={error} loading={loading && !data} />
      <Notice message={cf.message} />
      {lookup && <CashfreeLookupCard lookup={lookup} onClose={() => setLookup(null)} />}
      {data && (
        <>
          <Table
            head={['Booking', 'Customer', 'Event / organizer', 'Amount', 'Method', 'Gateway ref', 'Status', 'When']}
            empty={!data.payments.length}
          >
            {data.payments.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2 font-mono text-xs">{p.booking_reference}</td>
                <td className="px-3 py-2">
                  <p>{p.primary_contact_name}</p>
                  <p className="text-xs text-slate-500">{p.primary_contact_email}</p>
                </td>
                <td className="px-3 py-2 text-xs">
                  {p.event_name}
                  <p className="text-slate-500">{p.organizer_name}</p>
                </td>
                <td className="px-3 py-2 font-semibold">
                  {rupees(p.amount_paise)}
                  {p.refund_amount_paise ? <p className="text-[11px] text-violet-600">Refund {rupees(p.refund_amount_paise)}</p> : null}
                </td>
                <td className="px-3 py-2 text-xs">{p.method}</td>
                <td className="px-3 py-2 font-mono text-[11px]">
                  {p.gateway_reference ?? '—'}
                  {p.method === 'online' && (
                    <button
                      className="block mt-1 font-sans text-brand-600 font-semibold hover:underline disabled:opacity-50"
                      disabled={cf.busy}
                      onClick={() => askCashfree(p.gateway_reference || p.booking_reference)}
                    >
                      Check with Cashfree
                    </button>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Badge value={p.status} />
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">{when(p.created_at)}</td>
              </tr>
            ))}
          </Table>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={list.setPage} />
        </>
      )}
    </div>
  );
}
