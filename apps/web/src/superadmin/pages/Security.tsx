import { useState, type FormEvent } from 'react';
import { PageHeader, Card, Table, Badge, Pager, SearchBar, Loading, Notice, Button, Field, ConfirmAction } from '../ui';
import { useSa, useSaAction, useListQuery, when, inputClass } from '../lib';
import { getSaSession, saveSaSession } from '../api';

interface AdminRow {
  id: string;
  email: string;
  name: string;
  active: boolean;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  lockedUntil: string | null;
  createdAt: string;
}

// Same rules as the server (services/adminAuth.ts), shown while typing.
function passwordProblems(p: string): string[] {
  const out: string[] = [];
  if (p.length < 14) out.push('14+ characters');
  if (!/[a-z]/.test(p)) out.push('a lower-case letter');
  if (!/[A-Z]/.test(p)) out.push('an upper-case letter');
  if (!/[0-9]/.test(p)) out.push('a number');
  if (!/[^A-Za-z0-9]/.test(p)) out.push('a symbol');
  if (/password|inveon|admin|qwerty|123456/i.test(p)) out.push('no common words');
  return out;
}

function PasswordRules({ value }: { value: string }) {
  if (!value) return null;
  const problems = passwordProblems(value);
  return problems.length ? (
    <p className="text-[11px] text-amber-700 mt-1">Still needs: {problems.join(', ')}</p>
  ) : (
    <p className="text-[11px] text-emerald-700 mt-1">Strong password ✓</p>
  );
}

export function AdminsPage() {
  const me = getSaSession();
  const { data, error, loading, reload } = useSa<{ admins: AdminRow[] }>('/admins');
  const action = useSaAction();
  const pw = useSaAction();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });

  async function add(e: FormEvent) {
    e.preventDefault();
    if (await action.run('/admins', { body: form }, `${form.email} can now sign in (a code is emailed at every sign-in).`)) {
      setForm({ name: '', email: '', password: '' });
      reload();
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirm) {
      pw.setMessage({ kind: 'error', text: 'The two new passwords don’t match' });
      return;
    }
    const res = await pw.run<{ token: string }>(
      '/auth/change-password',
      { body: { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword } },
      'Password changed. Other sessions are signed out.',
    );
    if (res && me) {
      saveSaSession({ ...me, token: res.token });
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Admins & password"
        subtitle="Who can use this portal. Sign-in always needs the password and a code emailed to the admin."
      />
      <Notice message={action.message} />
      <Loading error={error} loading={loading && !data} />
      {data && (
        <Table head={['Admin', 'Last sign-in', 'Status', '']}>
          {data.admins.map((a) => (
            <tr key={a.id}>
              <td className="px-3 py-2">
                <p className="font-medium">
                  {a.name} {a.email === me?.email && <span className="text-[11px] text-brand-600">(you)</span>}
                </p>
                <p className="text-xs text-slate-500">{a.email}</p>
              </td>
              <td className="px-3 py-2 text-xs">
                {when(a.lastLoginAt)}
                {a.lastLoginIp && <p className="text-slate-500">IP {a.lastLoginIp}</p>}
              </td>
              <td className="px-3 py-2">
                <Badge value={a.lockedUntil && new Date(a.lockedUntil) > new Date() ? 'locked' : a.active ? 'active' : 'blocked'} />
              </td>
              <td className="px-3 py-2 whitespace-nowrap space-x-2">
                {a.lockedUntil && new Date(a.lockedUntil) > new Date() && (
                  <Button
                    small
                    tone="secondary"
                    onClick={async () =>
                      (await action.run(`/admins/${a.id}`, { method: 'PATCH', body: { unlock: true } }, 'Unlocked')) && reload()
                    }
                  >
                    Unlock
                  </Button>
                )}
                {a.email !== me?.email &&
                  (a.active ? (
                    <ConfirmAction
                      label="Switch off"
                      question={`Stop ${a.email} signing in?`}
                      onConfirm={async () => {
                        if (await action.run(`/admins/${a.id}`, { method: 'PATCH', body: { active: false } }, 'Switched off')) reload();
                      }}
                    />
                  ) : (
                    <Button
                      small
                      tone="secondary"
                      onClick={async () =>
                        (await action.run(`/admins/${a.id}`, { method: 'PATCH', body: { active: true } }, 'Switched on')) && reload()
                      }
                    >
                      Switch on
                    </Button>
                  ))}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Add an admin">
          <form className="space-y-3" onSubmit={add}>
            <Field label="Name">
              <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Work email" hint="The sign-in code is sent here.">
              <input
                className={inputClass}
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </Field>
            <Field label="Starting password">
              <input
                className={inputClass}
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
              <PasswordRules value={form.password} />
            </Field>
            <Button type="submit" disabled={action.busy || passwordProblems(form.password).length > 0}>
              Add admin
            </Button>
          </form>
        </Card>
        <Card title="Change my password">
          <form className="space-y-3" onSubmit={changePassword}>
            <Field label="Current password">
              <input
                className={inputClass}
                type="password"
                autoComplete="current-password"
                value={pwForm.currentPassword}
                onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                required
              />
            </Field>
            <Field label="New password">
              <input
                className={inputClass}
                type="password"
                autoComplete="new-password"
                value={pwForm.newPassword}
                onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                required
              />
              <PasswordRules value={pwForm.newPassword} />
            </Field>
            <Field label="New password again">
              <input
                className={inputClass}
                type="password"
                autoComplete="new-password"
                value={pwForm.confirm}
                onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                required
              />
            </Field>
            <Notice message={pw.message} />
            <Button type="submit" disabled={pw.busy || passwordProblems(pwForm.newPassword).length > 0}>
              Change password
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

interface AuditRow {
  id: number;
  adminEmail: string | null;
  action: string;
  target: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export function AuditPage() {
  const list = useListQuery();
  const { data, error, loading } = useSa<{ logs: AuditRow[]; page: number; pageSize: number; total: number }>(`/audit?${list.query}`);
  return (
    <div>
      <PageHeader title="Audit log" subtitle="Every sign-in attempt and every change made in this portal." />
      <SearchBar value={list.q} onChange={list.setQ} placeholder="Search action, target or admin email" />
      <Loading error={error} loading={loading && !data} />
      {data && (
        <>
          <Table head={['When', 'Admin', 'Action', 'Target', 'Details', 'IP']} empty={!data.logs.length}>
            {data.logs.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{when(l.createdAt)}</td>
                <td className="px-3 py-2 text-xs">{l.adminEmail ?? '—'}</td>
                <td className="px-3 py-2 text-xs font-mono">{l.action}</td>
                <td className="px-3 py-2 text-xs break-all">{l.target ?? '—'}</td>
                <td className="px-3 py-2 text-[11px] text-slate-500 font-mono break-all">{l.details ? JSON.stringify(l.details) : ''}</td>
                <td className="px-3 py-2 text-xs">{l.ip ?? '—'}</td>
              </tr>
            ))}
          </Table>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={list.setPage} />
        </>
      )}
    </div>
  );
}
