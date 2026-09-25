import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Lock } from 'lucide-react';
import { PageHeader, Card, Stat, Loading, Notice, Button, Select } from '../ui';
import { useSa, useSaAction, useSaKey, bytes, when, inputClass } from '../lib';
import { saRequest, SaError, getStepUp, saveStepUp, clearStepUp } from '../api';

// ---------- Config check ----------

interface CheckItem {
  id: string;
  group: string;
  label: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
  fix?: string;
}

const STATUS_ICON = {
  ok: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />,
  warn: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />,
  fail: <XCircle className="w-4 h-4 text-rose-600 shrink-0" />,
};

export function ConfigCheckPage() {
  const { data, error, loading, reload } = useSa<{ checkedAt: string; items: CheckItem[]; summary: Record<string, number> }>(
    '/config-check',
  );
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto) return undefined;
    const t = setInterval(reload, 60_000);
    return () => clearInterval(t);
  }, [auto, reload]);
  const groups = useMemo(() => {
    const map = new Map<string, CheckItem[]>();
    for (const i of data?.items ?? []) map.set(i.group, [...(map.get(i.group) ?? []), i]);
    return [...map.entries()];
  }, [data]);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Config check"
        subtitle="Live test of every setting: logs in to email, Cashfree and S3, pings the database and Redis, checks backups and the server helper."
        actions={
          <>
            <label className="flex items-center gap-1.5 text-sm text-slate-700">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Re-check every minute
            </label>
            <Button onClick={reload} disabled={loading}>
              {loading ? 'Checking…' : 'Check now'}
            </Button>
          </>
        }
      />
      <Loading error={error} loading={loading && !data} />
      {data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="OK" value={data.summary.ok} tone="green" />
            <Stat label="Warnings" value={data.summary.warn} tone={data.summary.warn ? 'amber' : 'slate'} />
            <Stat
              label="Problems"
              value={data.summary.fail}
              tone={data.summary.fail ? 'red' : 'slate'}
              hint={`Checked ${when(data.checkedAt)}`}
            />
          </div>
          {groups.map(([group, items]) => (
            <Card key={group} title={group}>
              <ul className="divide-y divide-slate-100">
                {items.map((i) => (
                  <li key={i.id} className="flex items-start gap-2 py-2 text-sm">
                    {STATUS_ICON[i.status]}
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800">{i.label}</p>
                      <p className="text-slate-600 break-words">{i.detail}</p>
                      {i.fix && i.status !== 'ok' && <p className="text-xs text-brand-700 mt-0.5">Fix: {i.fix}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

// ---------- Monitoring charts ----------

interface Sample {
  t: string;
  cpu: number | null;
  load1: number;
  memUsedBytes: number;
  memTotalBytes: number;
  diskPercent: number | null;
  c: Record<string, [number | null, number]>;
}

const COLORS = ['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c', '#0891b2', '#ca8a04', '#db2777', '#4b5563', '#65a30d'];

interface Series {
  name: string;
  values: (number | null)[];
}

// A small dependency-free SVG line chart. x = sample index, times on the axis.
function LineChart({ times, series, max, format }: { times: string[]; series: Series[]; max?: number; format: (v: number) => string }) {
  const W = 640;
  const H = 180;
  const P = { l: 52, r: 8, t: 8, b: 22 };
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const top = max ?? Math.max(1, ...all) * 1.1;
  const n = Math.max(1, times.length - 1);
  const x = (i: number) => P.l + (i / n) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - Math.min(v, top) / top) * (H - P.t - P.b);
  const tick = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  if (!times.length) return <p className="text-sm text-slate-500">No samples yet — the server helper records one a minute.</p>;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={P.l} x2={W - P.r} y1={y(top * f)} y2={y(top * f)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={P.l - 4} y={y(top * f) + 3} fontSize="9" textAnchor="end" fill="#64748b">
              {format(top * f)}
            </text>
          </g>
        ))}
        {[0, Math.floor(n / 2), n].map((i) => (
          <text key={i} x={x(i)} y={H - 6} fontSize="9" textAnchor={i === 0 ? 'start' : i === n ? 'end' : 'middle'} fill="#64748b">
            {times[i] ? tick(times[i]) : ''}
          </text>
        ))}
        {series.map((s, si) => {
          let d = '';
          s.values.forEach((v, i) => {
            if (v === null) return;
            d += `${d && s.values[i - 1] !== null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
          });
          return <path key={s.name} d={d} fill="none" stroke={COLORS[si % COLORS.length]} strokeWidth="1.6" />;
        })}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
        {series.map((s, si) => {
          const last = [...s.values].reverse().find((v) => v !== null);
          return (
            <span key={s.name} className="flex items-center gap-1 text-[11px] text-slate-600">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS[si % COLORS.length] }} />
              {s.name}
              {last !== undefined && last !== null && <b className="text-slate-800">{format(last)}</b>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function MonitoringPage() {
  const [hours, setHours] = useState('6');
  const { data, error, loading, reload } = useSa<{ samples: Sample[] }>(`/server/metrics?hours=${hours}`);
  useEffect(() => {
    const t = setInterval(reload, 60_000);
    return () => clearInterval(t);
  }, [reload]);
  const samples = useMemo(() => data?.samples ?? [], [data]);
  const times = samples.map((s) => s.t);
  const names = useMemo(() => {
    const totals = new Map<string, number>();
    for (const s of samples) for (const [n, [, mem]] of Object.entries(s.c)) totals.set(n, (totals.get(n) ?? 0) + mem);
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  }, [samples]);
  const [picked, setPicked] = useState<string[] | null>(null);
  const shown = picked ?? names.slice(0, 6);
  const last = samples[samples.length - 1];
  const pct = (v: number) => `${v.toFixed(0)}%`;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Monitoring"
        subtitle="One sample a minute from the server helper, kept for 24 hours. Updates by itself."
        actions={
          <Select
            label="Period"
            value={hours}
            onChange={setHours}
            options={[
              ['1', 'Last hour'],
              ['6', 'Last 6 hours'],
              ['24', 'Last 24 hours'],
            ]}
          />
        }
      />
      <Loading error={error} loading={loading && !data} />
      {last && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="CPU now" value={last.cpu === null ? '—' : pct(last.cpu)} tone={(last.cpu ?? 0) > 85 ? 'red' : 'slate'} />
          <Stat label="Load (1 min)" value={last.load1.toFixed(2)} />
          <Stat
            label="Memory used"
            value={bytes(last.memUsedBytes)}
            hint={`of ${bytes(last.memTotalBytes)}`}
            tone={last.memUsedBytes / last.memTotalBytes > 0.9 ? 'red' : 'slate'}
          />
          <Stat
            label="Disk /"
            value={last.diskPercent === null ? '—' : `${last.diskPercent}%`}
            tone={(last.diskPercent ?? 0) >= 85 ? 'red' : (last.diskPercent ?? 0) >= 70 ? 'amber' : 'green'}
          />
        </div>
      )}
      {data && (
        <>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card title="Server CPU and disk (%)">
              <LineChart
                times={times}
                max={100}
                format={pct}
                series={[
                  { name: 'CPU', values: samples.map((s) => s.cpu) },
                  { name: 'Disk', values: samples.map((s) => s.diskPercent) },
                ]}
              />
            </Card>
            <Card title="Server memory used">
              <LineChart
                times={times}
                max={last?.memTotalBytes}
                format={(v) => bytes(v)}
                series={[{ name: 'Used', values: samples.map((s) => s.memUsedBytes) }]}
              />
            </Card>
          </div>
          <Card
            title="Containers"
            actions={
              <span className="text-xs text-slate-500">
                {shown.length} of {names.length} shown
              </span>
            }
          >
            <div className="flex flex-wrap gap-2 mb-3">
              {names.map((n) => (
                <label key={n} className="flex items-center gap-1 text-xs font-mono text-slate-700">
                  <input
                    type="checkbox"
                    checked={shown.includes(n)}
                    onChange={(e) => setPicked(e.target.checked ? [...shown, n] : shown.filter((x) => x !== n))}
                  />
                  {n}
                </label>
              ))}
            </div>
            <div className="grid lg:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1">CPU % (100% = one core)</p>
                <LineChart
                  times={times}
                  format={pct}
                  series={shown.map((n) => ({ name: n, values: samples.map((s) => s.c[n]?.[0] ?? null) }))}
                />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1">Memory</p>
                <LineChart
                  times={times}
                  format={(v) => bytes(v)}
                  series={shown.map((n) => ({ name: n, values: samples.map((s) => (s.c[n] ? s.c[n][1] : null)) }))}
                />
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ---------- Step-up (password + emailed code again) ----------

function StepUpGate({ onReady }: { onReady: () => void }) {
  const key = useSaKey();
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (step === 'password') {
        await saRequest(key, '/auth/step-up/start', { body: { password } });
        setPassword('');
        setStep('code');
      } else {
        const r = await saRequest<{ stepUpToken: string; expiresInMinutes: number }>(key, '/auth/step-up/verify', { body: { code } });
        saveStepUp(r.stepUpToken, r.expiresInMinutes);
        onReady();
      }
    } catch (err) {
      setError(err instanceof SaError ? err.message : 'Could not confirm');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Confirm it's you">
      <form onSubmit={submit} className="max-w-sm space-y-3">
        <p className="text-sm text-slate-600 flex gap-2">
          <Lock className="w-4 h-4 mt-0.5 shrink-0 text-brand-600" />
          These tools can change or delete anything. Enter your password, then the code we email you. You stay unlocked for 10 minutes.
        </p>
        {step === 'password' ? (
          <input
            className={inputClass}
            type="password"
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        ) : (
          <input
            className={inputClass}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code from your email"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            required
          />
        )}
        {error && <Notice message={{ kind: 'error', text: error }} />}
        <Button type="submit" disabled={busy}>
          {busy ? 'Please wait…' : step === 'password' ? 'Email me a code' : 'Unlock'}
        </Button>
      </form>
    </Card>
  );
}

// Re-renders when the 10-minute unlock runs out.
function useStepUpState() {
  const [unlocked, setUnlocked] = useState(() => Boolean(getStepUp()));
  useEffect(() => {
    const t = setInterval(() => setUnlocked(Boolean(getStepUp())), 5_000);
    return () => clearInterval(t);
  }, []);
  return {
    unlocked,
    ready: () => setUnlocked(true),
    lock: () => {
      clearStepUp();
      setUnlocked(false);
    },
  };
}

function UnlockedBar({ onLock }: { onLock: () => void }) {
  const s = getStepUp();
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <span>
        Unlocked until {s ? new Date(s.expiresAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}. Every action
        is recorded in the audit log.
      </span>
      <Button small tone="secondary" onClick={onLock}>
        Lock now
      </Button>
    </div>
  );
}

// ---------- Database console + container commands ----------

interface SqlResult {
  command: string;
  rowCount: number | null;
  fields: string[];
  rows: Record<string, unknown>[];
  truncated: boolean;
  durationMs: number;
  mode: 'read' | 'write';
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function SqlConsole() {
  const tables = useSa<{ tables: { name: string; rows: number; sizeBytes: number }[] }>('/db/tables');
  const action = useSaAction();
  const [sql, setSql] = useState('SELECT booking_reference, status, created_at FROM bookings ORDER BY created_at DESC LIMIT 20');
  const [mode, setMode] = useState<'read' | 'write'>('read');
  const [result, setResult] = useState<SqlResult | null>(null);
  async function run(e: FormEvent) {
    e.preventDefault();
    if (mode === 'write' && !window.confirm('Run this statement for real and save the change? This cannot be undone.')) return;
    const r = await action.run<SqlResult>('/db/query', { body: { sql, mode } });
    if (r) setResult(r);
  }
  return (
    <Card title="Database console (Events database)">
      <form onSubmit={run} className="space-y-2">
        <textarea
          className={`${inputClass} font-mono text-xs min-h-[120px]`}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          spellCheck={false}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') run(e as unknown as FormEvent);
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select
            label="Mode"
            value={mode}
            onChange={(v) => setMode(v === 'write' ? 'write' : 'read')}
            options={[
              ['read', 'Read only (safe, always rolled back)'],
              ['write', 'Write (saves changes)'],
            ]}
          />
          <Button type="submit" tone={mode === 'write' ? 'danger' : 'primary'} disabled={action.busy}>
            {action.busy ? 'Running…' : 'Run (Ctrl+Enter)'}
          </Button>
          <span className="text-xs text-slate-500">One statement, 15 s limit, first 500 rows shown.</span>
        </div>
      </form>
      <div className="mt-3 space-y-2">
        <Notice message={action.message} />
        {result && (
          <>
            <p className="text-xs text-slate-600">
              {result.command} · {result.rowCount ?? 0} row(s) · {result.durationMs} ms
              {result.mode === 'read' && ' · read only'}
              {result.truncated && ' · only the first 500 rows are shown'}
            </p>
            {result.fields.length > 0 && (
              <div className="overflow-auto max-h-[420px] border border-slate-200 rounded-lg">
                <table className="text-xs font-mono">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      {result.fields.map((f) => (
                        <th key={f} className="px-2 py-1 text-left font-semibold text-slate-700 whitespace-nowrap">
                          {f}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        {result.fields.map((f) => (
                          <td key={f} className="px-2 py-1 whitespace-nowrap max-w-[320px] truncate" title={cell(row[f])}>
                            {cell(row[f])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        {tables.data && (
          <details className="text-xs text-slate-600">
            <summary className="cursor-pointer font-semibold">Tables ({tables.data.tables.length})</summary>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {tables.data.tables.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  className="px-2 py-0.5 rounded border border-slate-200 font-mono hover:bg-slate-50"
                  onClick={() => setSql(`SELECT * FROM "${t.name}" LIMIT 50`)}
                >
                  {t.name} <span className="text-slate-400">~{t.rows}</span>
                </button>
              ))}
            </div>
          </details>
        )}
      </div>
    </Card>
  );
}

interface HostStatusLite {
  status?: { containers?: { name: string; state: string }[]; execEnabled?: boolean } | null;
}

function ContainerCommand() {
  const key = useSaKey();
  const host = useSa<HostStatusLite>('/server');
  const action = useSaAction();
  const [container, setContainer] = useState('');
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState<{ status: string; output: string } | null>(null);
  const containers = (host.data?.status?.containers ?? []).filter((c) => c.state === 'running');
  const enabled = host.data?.status?.execEnabled;

  async function run(e: FormEvent) {
    e.preventDefault();
    setOutput({ status: 'waiting', output: 'Sent — the server helper picks it up within a few seconds…' });
    const r = await action.run<{ id: string }>('/server/exec', { body: { container, command } });
    if (!r) {
      setOutput(null);
      return;
    }
    // Wait for the helper's answer (up to ~2 minutes).
    for (let i = 0; i < 60; i += 1) {
      await new Promise((res) => setTimeout(res, 2000));
      try {
        const { result } = await saRequest<{ result: { status: string; output: string } | null }>(key, `/server/actions/${r.id}`);
        if (result) {
          setOutput({ status: result.status, output: result.output || '(no output)' });
          return;
        }
      } catch {
        // keep waiting
      }
    }
    setOutput({ status: 'failed', output: 'No answer from the server helper after 2 minutes.' });
  }

  return (
    <Card title="Run a command in a container">
      {host.data && !enabled ? (
        <p className="text-sm text-slate-600">
          Switched off on this server. To allow it, run on the server:{' '}
          <code className="bg-slate-100 px-1 rounded">sudo ALLOW_EXEC=1 bash /var/www/Events/scripts/server/install-admin-agent.sh</code>
        </p>
      ) : (
        <form onSubmit={run} className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              label="Container"
              value={container}
              onChange={setContainer}
              options={[['', 'Choose a container…'], ...containers.map((c) => [c.name, c.name] as [string, string])]}
            />
            <input
              className={`${inputClass} font-mono text-xs flex-1 min-w-[220px]`}
              placeholder="e.g. df -h   or   psql -U postgres -c '\l'"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              required
            />
            <Button type="submit" tone="danger" disabled={action.busy || !container || output?.status === 'waiting'}>
              Run
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            Runs as `sh -c` inside the container, 60 s limit. Recorded in the audit log with the full command.
          </p>
        </form>
      )}
      <div className="mt-2 space-y-2">
        <Notice message={action.message} />
        {output && (
          <pre
            className={`text-[11px] p-3 rounded-lg max-h-[420px] overflow-auto whitespace-pre-wrap ${output.status === 'failed' ? 'bg-rose-950 text-rose-100' : 'bg-slate-950 text-slate-100'}`}
          >
            {output.output}
          </pre>
        )}
      </div>
    </Card>
  );
}

export function ConsolePage() {
  const gate = useStepUpState();
  return (
    <div className="space-y-4">
      <PageHeader
        title="Console"
        subtitle="Query the database and run commands in containers. Needs your password and an emailed code again."
      />
      {gate.unlocked ? (
        <>
          <UnlockedBar onLock={gate.lock} />
          <SqlConsole />
          <ContainerCommand />
        </>
      ) : (
        <StepUpGate onReady={gate.ready} />
      )}
    </div>
  );
}

// ---------- Danger zone ----------

export function DangerPage() {
  const gate = useStepUpState();
  const info = useSa<{ confirmPhrase: string; keepTables: string[] }>('/danger/reset-info');
  const logs = useSaAction();
  const reset = useSaAction();
  const [phrase, setPhrase] = useState('');
  const [resetResult, setResetResult] = useState<{ backup: string; tables: string[] } | null>(null);
  return (
    <div className="space-y-4">
      <PageHeader title="Danger zone" subtitle="Wipe logs or every record. Needs your password and an emailed code again." />
      {!gate.unlocked ? (
        <StepUpGate onReady={gate.ready} />
      ) : (
        <>
          <UnlockedBar onLock={gate.lock} />
          <Card title="Clear all logs">
            <p className="text-sm text-slate-600 mb-3">
              Deletes every email / WhatsApp / login-code log entry, finished and failed background jobs, and empties every container's log
              file. The admin audit log is kept.
            </p>
            <Notice message={logs.message} />
            <div className="mt-2">
              <Button
                tone="danger"
                disabled={logs.busy}
                onClick={async () => {
                  if (!window.confirm('Delete all logs now?')) return;
                  const r = await logs.run<{ notifications: number; jobs: number; containerLogs: string }>('/danger/clear-logs', {});
                  if (r)
                    logs.setMessage({
                      kind: 'ok',
                      text: `Deleted ${r.notifications} message log(s) and ${r.jobs} job(s). Container logs: ${r.containerLogs}.`,
                    });
                }}
              >
                {logs.busy ? 'Clearing…' : 'Clear all logs'}
              </Button>
            </div>
          </Card>
          <Card title="Reset all data">
            <div className="space-y-3 text-sm">
              <p className="text-slate-700">
                Deletes <b>every</b> organizer, team member, event, booking, payment, ticket and customer record. A full database backup
                (.zip) is made first — download it from Backups if you need to undo.
              </p>
              {info.data && (
                <p className="text-xs text-slate-500">
                  Kept: {info.data.keepTables.join(', ')}. Uploaded files are not deleted. Organizer accounts on Cashfree are not removed.
                </p>
              )}
              <label className="block">
                <span className="block text-xs font-semibold text-slate-600 mb-1">
                  Type <b className="font-mono">{info.data?.confirmPhrase ?? '…'}</b> to confirm
                </span>
                <input className={`${inputClass} max-w-xs font-mono`} value={phrase} onChange={(e) => setPhrase(e.target.value)} />
              </label>
              <Notice message={reset.message} />
              <Button
                tone="danger"
                disabled={reset.busy || !info.data || phrase !== info.data.confirmPhrase}
                onClick={async () => {
                  const r = await reset.run<{ backup: string; tables: string[] }>('/danger/reset-data', { body: { confirm: phrase } });
                  if (r) {
                    setResetResult(r);
                    setPhrase('');
                  }
                }}
              >
                {reset.busy ? 'Backing up and deleting…' : 'Delete all data'}
              </Button>
              {resetResult && (
                <Notice
                  message={{
                    kind: 'ok',
                    text: `Done. Emptied ${resetResult.tables.length} tables. Backup made first: ${resetResult.backup}.`,
                  }}
                />
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
