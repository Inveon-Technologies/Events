import { Link, useParams } from 'react-router-dom';
import { PageHeader, Card, Table, Badge, Pager, SearchBar, Select, Loading, Notice, ConfirmAction } from '../ui';
import { useSa, useSaKey, useSaAction, useListQuery, rupees, num, when } from '../lib';

interface OrganizerRow {
  id: string;
  name: string;
  slug: string;
  contact_email: string | null;
  contact_phone: string | null;
  cashfree_vendor_status: string;
  blocked_at: string | null;
  blocked_reason: string | null;
  created_at: string;
  users: number;
  events: number;
  bookings: number;
  revenue_paise: number;
}

export function OrganizersPage() {
  const key = useSaKey();
  const list = useListQuery({ status: '' });
  const { data, error, loading, reload } = useSa<{ organizers: OrganizerRow[]; page: number; pageSize: number; total: number }>(
    `/organizers?${list.query}`,
  );
  const action = useSaAction();

  return (
    <div>
      <PageHeader
        title="Organizers"
        subtitle="Every organizer account on the platform. Blocking signs their team out and hides their events."
      />
      <SearchBar value={list.q} onChange={list.setQ} placeholder="Search name, slug, email or phone">
        <Select
          label="Status"
          value={list.filters.status}
          onChange={(v) => list.setFilter('status', v)}
          options={[
            ['', 'All'],
            ['active', 'Active'],
            ['blocked', 'Blocked'],
          ]}
        />
      </SearchBar>
      <Notice message={action.message} />
      <Loading error={error} loading={loading && !data} />
      {data && (
        <>
          <Table
            head={['Organizer', 'Contact', 'Payouts', 'Events', 'Bookings', 'Sales', 'Joined', 'Status', '']}
            empty={!data.organizers.length}
          >
            {data.organizers.map((o) => (
              <tr key={o.id} className={o.blocked_at ? 'bg-rose-50/40' : ''}>
                <td className="px-3 py-2">
                  <Link to={`/x/${key}/organizers/${o.id}`} className="font-semibold text-brand-700 hover:underline">
                    {o.name}
                  </Link>
                  <p className="text-[11px] text-slate-500">
                    {o.users} team member{o.users === 1 ? '' : 's'}
                  </p>
                </td>
                <td className="px-3 py-2 text-xs">
                  <p>{o.contact_email ?? '—'}</p>
                  <p className="text-slate-500">{o.contact_phone ?? ''}</p>
                </td>
                <td className="px-3 py-2">
                  <Badge value={o.cashfree_vendor_status} />
                </td>
                <td className="px-3 py-2">{num(o.events)}</td>
                <td className="px-3 py-2">{num(o.bookings)}</td>
                <td className="px-3 py-2 font-semibold">{rupees(o.revenue_paise)}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{when(o.created_at)}</td>
                <td className="px-3 py-2">
                  <Badge value={o.blocked_at ? 'blocked' : 'active'} />
                  {o.blocked_reason && <p className="text-[11px] text-rose-600 mt-0.5">{o.blocked_reason}</p>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {o.blocked_at ? (
                    <ConfirmAction
                      label="Unblock"
                      tone="secondary"
                      question={`Unblock ${o.name}?`}
                      onConfirm={async () => {
                        if (await action.run(`/organizers/${o.id}/unblock`, {}, `${o.name} unblocked`)) reload();
                      }}
                    />
                  ) : (
                    <ConfirmAction
                      label="Block"
                      askReason
                      question={`Block ${o.name}?`}
                      onConfirm={async (reason) => {
                        if (await action.run(`/organizers/${o.id}/block`, { body: { reason } }, `${o.name} blocked`)) reload();
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

interface OrganizerDetail {
  organizer: Record<string, unknown> & { id: string; name: string; blockedAt: string | null; blockedReason: string | null };
  users: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    emailVerified: boolean;
    blockedAt: string | null;
    blockedReason: string | null;
    createdAt: string;
  }[];
  events: { id: string; name: string; status: string; event_date: string; bookings: number; revenue_paise: number }[];
}

const ORGANIZER_FIELDS: [string, string][] = [
  ['slug', 'Public page'],
  ['contactEmail', 'Email'],
  ['contactPhone', 'Phone'],
  ['website', 'Website'],
  ['gstNumber', 'GSTIN'],
  ['panNumber', 'PAN'],
  ['kycAccountType', 'KYC type'],
  ['businessType', 'Business type'],
  ['bankAccountHolderName', 'Bank account holder'],
  ['bankAccountNumberLast4', 'Account ending'],
  ['bankIfsc', 'IFSC'],
  ['cashfreeVendorId', 'Cashfree vendor'],
  ['cashfreeVendorStatus', 'Payout status'],
  ['kycSubmittedAt', 'KYC submitted'],
  ['createdAt', 'Joined'],
];

export function OrganizerDetailPage() {
  const { organizerId = '' } = useParams();
  const key = useSaKey();
  const { data, error, loading, reload } = useSa<OrganizerDetail>(`/organizers/${organizerId}`);
  const action = useSaAction();
  const o = data?.organizer;

  return (
    <div className="space-y-4">
      <Link to={`/x/${key}/organizers`} className="text-xs text-brand-600 font-semibold">
        ← All organizers
      </Link>
      <Loading error={error} loading={loading && !data} />
      {o && data && (
        <>
          <PageHeader
            title={o.name}
            subtitle={o.blockedAt ? `Blocked ${when(o.blockedAt)}${o.blockedReason ? ` — ${o.blockedReason}` : ''}` : 'Active'}
            actions={
              o.blockedAt ? (
                <ConfirmAction
                  label="Unblock organizer"
                  tone="secondary"
                  small={false}
                  question="Unblock?"
                  onConfirm={async () => {
                    if (await action.run(`/organizers/${o.id}/unblock`, {}, 'Unblocked')) reload();
                  }}
                />
              ) : (
                <ConfirmAction
                  label="Block organizer"
                  askReason
                  small={false}
                  question="Block this organizer?"
                  onConfirm={async (reason) => {
                    if (await action.run(`/organizers/${o.id}/block`, { body: { reason } }, 'Blocked')) reload();
                  }}
                />
              )
            }
          />
          <Notice message={action.message} />
          <div className="grid lg:grid-cols-3 gap-4">
            <Card title="Details">
              <dl className="text-sm space-y-1.5">
                {ORGANIZER_FIELDS.map(([k, label]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="text-slate-800 text-right break-all">
                      {o[k] ? (k.endsWith('At') ? when(String(o[k])) : String(o[k])) : '—'}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
            <Card title="Team" className="lg:col-span-2">
              <Table head={['Person', 'Role', 'Verified', 'Status', '']} empty={!data.users.length}>
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-3 py-2">
                      <p className="font-medium">{u.name ?? '—'}</p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </td>
                    <td className="px-3 py-2 text-xs">{u.role.replace(/_/g, ' ')}</td>
                    <td className="px-3 py-2 text-xs">{u.emailVerified ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2">
                      <Badge value={u.blockedAt ? 'blocked' : 'active'} />
                    </td>
                    <td className="px-3 py-2">
                      {u.blockedAt ? (
                        <ConfirmAction
                          label="Unblock"
                          tone="secondary"
                          question={`Unblock ${u.email}?`}
                          onConfirm={async () => {
                            if (await action.run(`/users/${u.id}/unblock`, {}, `${u.email} unblocked`)) reload();
                          }}
                        />
                      ) : (
                        <ConfirmAction
                          label="Block"
                          askReason
                          question={`Block ${u.email}?`}
                          onConfirm={async (reason) => {
                            if (await action.run(`/users/${u.id}/block`, { body: { reason } }, `${u.email} blocked`)) reload();
                          }}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>
          <Card title="Events">
            <Table head={['Event', 'Date', 'Status', 'Bookings', 'Sales']} empty={!data.events.length}>
              {data.events.map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-2 font-medium">{e.name}</td>
                  <td className="px-3 py-2 text-xs">{when(e.event_date)}</td>
                  <td className="px-3 py-2">
                    <Badge value={e.status} />
                  </td>
                  <td className="px-3 py-2">{num(e.bookings)}</td>
                  <td className="px-3 py-2 font-semibold">{rupees(e.revenue_paise)}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

interface CustomerRow {
  email: string;
  name: string;
  phone: string;
  city: string | null;
  bookings: number;
  confirmed: number;
  spent_paise: number;
  first_booking_at: string;
  last_booking_at: string;
  blocked: boolean;
  blocked_reason: string | null;
}

export function CustomersPage() {
  const list = useListQuery({ status: '' });
  const { data, error, loading, reload } = useSa<{ customers: CustomerRow[]; page: number; pageSize: number; total: number }>(
    `/customers?${list.query}`,
  );
  const action = useSaAction();

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Everyone who has booked, grouped by email. A blocked email can’t book or sign in to manage bookings."
      />
      <SearchBar value={list.q} onChange={list.setQ} placeholder="Search email, name or phone">
        <Select
          label="Status"
          value={list.filters.status}
          onChange={(v) => list.setFilter('status', v)}
          options={[
            ['', 'All'],
            ['blocked', 'Blocked'],
          ]}
        />
      </SearchBar>
      <Notice message={action.message} />
      <Loading error={error} loading={loading && !data} />
      {data && (
        <>
          <Table head={['Customer', 'Phone', 'Bookings', 'Spent', 'First / last booking', 'Status', '']} empty={!data.customers.length}>
            {data.customers.map((c) => (
              <tr key={c.email} className={c.blocked ? 'bg-rose-50/40' : ''}>
                <td className="px-3 py-2">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-slate-500">{c.email}</p>
                </td>
                <td className="px-3 py-2 text-xs">
                  {c.phone}
                  {c.city && <p className="text-slate-500">{c.city}</p>}
                </td>
                <td className="px-3 py-2">
                  {num(c.confirmed)} <span className="text-xs text-slate-400">/ {num(c.bookings)}</span>
                </td>
                <td className="px-3 py-2 font-semibold">{rupees(c.spent_paise)}</td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  {when(c.first_booking_at)}
                  <br />
                  {when(c.last_booking_at)}
                </td>
                <td className="px-3 py-2">
                  <Badge value={c.blocked ? 'blocked' : 'active'} />
                  {c.blocked_reason && <p className="text-[11px] text-rose-600 mt-0.5">{c.blocked_reason}</p>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {c.blocked ? (
                    <ConfirmAction
                      label="Unblock"
                      tone="secondary"
                      question={`Unblock ${c.email}?`}
                      onConfirm={async () => {
                        if (await action.run('/customers/unblock', { body: { email: c.email } }, `${c.email} unblocked`)) reload();
                      }}
                    />
                  ) : (
                    <ConfirmAction
                      label="Block"
                      askReason
                      question={`Block ${c.email}?`}
                      onConfirm={async (reason) => {
                        if (await action.run('/customers/block', { body: { email: c.email, reason } }, `${c.email} blocked`)) reload();
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
