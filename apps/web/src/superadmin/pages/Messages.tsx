import { useState } from 'react';
import { PageHeader, Card, Table, Badge, Pager, SearchBar, Select, Loading, Notice, Button, ConfirmAction } from '../ui';
import { useSa, useSaAction, useListQuery, num, when, inputClass } from '../lib';

interface LogRow {
  id: number;
  channel: 'email' | 'whatsapp' | 'otp';
  kind: string | null;
  recipient: string;
  subject: string | null;
  status: string;
  error: string | null;
  createdAt: string;
}

const KIND_LABEL: Record<string, string> = {
  customer_login: 'Customer login code',
  signup: 'Organizer sign-up code',
  reset: 'Password reset code',
  admin_login: 'Admin sign-in code',
  admin_stepup: 'Admin re-check code',
  admin_stepup_code: 'Admin re-check code email',
};

export function MessagesPage() {
  const list = useListQuery({ channel: '', status: '' });
  const { data, error, loading, reload } = useSa<{
    logs: LogRow[];
    page: number;
    pageSize: number;
    total: number;
    last24h: { channel: string; status: string; count: number }[];
  }>(`/notifications?${list.query}`);
  const action = useSaAction();
  const [days, setDays] = useState('90');

  return (
    <div className="space-y-4">
      <PageHeader
        title="Emails, WhatsApp & login codes"
        subtitle="Every message the platform sends and every one-time code, with its status. Codes themselves are never stored or shown."
      />
      {data && (
        <div className="flex flex-wrap gap-2 text-xs">
          {data.last24h.length === 0 && <span className="text-slate-500">Nothing in the last 24 hours.</span>}
          {data.last24h.map((s) => (
            <span
              key={`${s.channel}-${s.status}`}
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-full px-2.5 py-1"
            >
              <span className="font-semibold capitalize">{s.channel}</span> <Badge value={s.status} />{' '}
              <span className="font-bold">{num(s.count)}</span>
              <span className="text-slate-400">24h</span>
            </span>
          ))}
        </div>
      )}
      <SearchBar value={list.q} onChange={list.setQ} placeholder="Search recipient, subject or type">
        <Select
          label="Channel"
          value={list.filters.channel}
          onChange={(v) => list.setFilter('channel', v)}
          options={[
            ['', 'All channels'],
            ['email', 'Email'],
            ['whatsapp', 'WhatsApp'],
            ['otp', 'Login codes'],
          ]}
        />
        <Select
          label="Status"
          value={list.filters.status}
          onChange={(v) => list.setFilter('status', v)}
          options={[
            ['', 'Any status'],
            ['sent', 'Sent'],
            ['failed', 'Failed'],
            ['issued', 'Code issued'],
            ['verified', 'Code used'],
            ['wrong', 'Wrong code'],
            ['expired', 'Code expired'],
            ['locked', 'Too many tries'],
          ]}
        />
      </SearchBar>
      <Loading error={error} loading={loading && !data} />
      {data && (
        <>
          <Table head={['When', 'Channel', 'Type', 'To', 'Subject / template', 'Status']} empty={!data.logs.length}>
            {data.logs.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{when(l.createdAt)}</td>
                <td className="px-3 py-2 text-xs capitalize">{l.channel === 'otp' ? 'Login code' : l.channel}</td>
                <td className="px-3 py-2 text-xs">{(l.kind && KIND_LABEL[l.kind]) || l.kind?.replace(/_/g, ' ') || '—'}</td>
                <td className="px-3 py-2 text-xs">{l.recipient}</td>
                <td className="px-3 py-2 text-xs">
                  {l.subject ?? '—'}
                  {l.error && <p className="text-rose-600 mt-0.5">{l.error}</p>}
                </td>
                <td className="px-3 py-2">
                  <Badge value={l.status} />
                </td>
              </tr>
            ))}
          </Table>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={list.setPage} />
        </>
      )}
      <Card title="Clean up old records">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Delete message and code records older than</span>
          <input
            aria-label="Days"
            className={`${inputClass} w-24`}
            type="number"
            min={7}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
          <span>days (the audit log always keeps 90 days).</span>
          <ConfirmAction
            label="Delete old records"
            question="Delete them permanently?"
            onConfirm={async () => {
              const r = await action.run<{ notifications: number; audit: number }>('/maintenance/purge-logs', {
                body: { olderThanDays: Number(days) },
              });
              if (r) {
                action.setMessage({ kind: 'ok', text: `Deleted ${r.notifications} message records and ${r.audit} audit entries.` });
                reload();
              }
            }}
          />
        </div>
        <div className="mt-2">
          <Notice message={action.message} />
        </div>
      </Card>
    </div>
  );
}

interface JobView {
  id: string;
  name: string;
  attemptsMade: number;
  failedReason: string | null;
  timestamp: number;
  finishedOn: number | null;
  summary: string;
}

interface QueueData {
  enabled: boolean;
  error?: string;
  queues: { name: string; counts: Record<string, number>; failed: JobView[]; active: JobView[]; waiting: JobView[] }[];
}

export function QueuePage() {
  const { data, error, loading, reload } = useSa<QueueData>('/queue');
  const action = useSaAction();
  return (
    <div className="space-y-4">
      <PageHeader
        title="Job queue"
        subtitle="Background work: confirmation emails and WhatsApp, reminders, the unpaid-seat sweep, post-event broadcasts."
        actions={
          <Button tone="secondary" onClick={reload}>
            Refresh
          </Button>
        }
      />
      <Notice message={action.message} />
      <Loading error={error} loading={loading && !data} />
      {data && !data.enabled && (
        <Notice message={{ kind: 'error', text: 'The queue is off (no Redis or QUEUE_ENABLED=false) — jobs run inline.' }} />
      )}
      {data?.error && <Notice message={{ kind: 'error', text: `Queue unreachable: ${data.error}` }} />}
      {data?.queues.map((q) => (
        <Card
          key={q.name}
          title={`Queue: ${q.name}`}
          actions={
            <div className="flex gap-2">
              <Button
                small
                tone="secondary"
                disabled={!q.counts.failed || action.busy}
                onClick={async () => {
                  const r = await action.run<{ retried: number }>(`/queue/${q.name}/retry-failed`);
                  if (r) {
                    action.setMessage({ kind: 'ok', text: `Retrying ${r.retried} failed job(s).` });
                    reload();
                  }
                }}
              >
                Retry all failed
              </Button>
              <ConfirmAction
                label="Clear failed"
                question="Delete all failed jobs?"
                onConfirm={async () => {
                  if (await action.run(`/queue/${q.name}/clean`, { body: { type: 'failed' } }, 'Failed jobs cleared')) reload();
                }}
              />
              <ConfirmAction
                label="Clear completed"
                tone="secondary"
                question="Delete finished jobs?"
                onConfirm={async () => {
                  if (await action.run(`/queue/${q.name}/clean`, { body: { type: 'completed' } }, 'Completed jobs cleared')) reload();
                }}
              />
            </div>
          }
        >
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
            {['waiting', 'active', 'delayed', 'failed', 'completed', 'paused'].map((k) => (
              <div key={k} className="bg-slate-50 rounded-lg p-2 text-center">
                <p className="text-[11px] uppercase text-slate-500">{k}</p>
                <p className={`text-lg font-bold ${k === 'failed' && q.counts[k] ? 'text-rose-600' : 'text-slate-900'}`}>
                  {num(q.counts[k])}
                </p>
              </div>
            ))}
          </div>
          <Table
            head={['Job', 'State', 'Tries', 'Details', 'Queued', '']}
            empty={!q.failed.length && !q.active.length && !q.waiting.length}
          >
            {[
              ...q.active.map((j) => ({ j, state: 'active' })),
              ...q.waiting.map((j) => ({ j, state: 'waiting' })),
              ...q.failed.map((j) => ({ j, state: 'failed' })),
            ].map(({ j, state }) => (
              <tr key={`${state}-${j.id}`}>
                <td className="px-3 py-2 text-xs font-mono">
                  {j.name} #{j.id}
                </td>
                <td className="px-3 py-2">
                  <Badge value={state} />
                </td>
                <td className="px-3 py-2 text-xs">{j.attemptsMade}</td>
                <td className="px-3 py-2 text-xs">
                  {j.summary}
                  {j.failedReason && <p className="text-rose-600">{j.failedReason}</p>}
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">{when(new Date(j.timestamp).toISOString())}</td>
                <td className="px-3 py-2">
                  {state === 'failed' && (
                    <Button
                      small
                      tone="secondary"
                      onClick={async () => {
                        if (await action.run(`/queue/${q.name}/jobs/${j.id}/retry`, {}, `Job ${j.id} retried`)) reload();
                      }}
                    >
                      Retry
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      ))}
    </div>
  );
}
