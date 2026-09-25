import { useEffect, useState } from 'react';
import { PageHeader, Card, Stat, Table, Badge, Loading, Notice, Button, ConfirmAction, Select } from '../ui';
import { useSa, useSaKey, useSaAction, bytes, duration, num, when } from '../lib';
import { saRequest, saDownload, SaError } from '../api';

interface SystemData {
  api: {
    nodeVersion: string;
    environment: string;
    imageTag: string | null;
    uptimeSeconds: number;
    memory: { rssBytes: number; heapUsedBytes: number };
    hostname: string;
    cpus: number;
    loadAverage: number[];
    systemMemory: { totalBytes: number; freeBytes: number };
    startedAt: string;
    settingsLoadedAt: string | null;
  };
  database: {
    ok: boolean;
    ms: number;
    error?: string;
    value?: {
      version: string;
      sizeBytes: number;
      connections: number;
      tables: { table: string; rows: number; bytes: number }[];
      migrations: string[];
    };
  };
  redis: {
    ok: boolean;
    ms: number;
    error?: string;
    value?: { version: string; usedMemory: string; connectedClients: number; uptimeSeconds: number; keys: number };
  };
  integrations: { email: boolean; whatsapp: string | null; cashfree: boolean; cashfreeMode: string; s3: boolean; queue: boolean };
  config: {
    platformFeePercent: number;
    seatHoldMinutes: number;
    webPublicUrl: string | null;
    rateLimitsDisabled: boolean;
    opsHelperConfigured: boolean;
  };
}

function Check({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-slate-700">{label}</span>
      <span className="flex items-center gap-2">
        {detail && <span className="text-xs text-slate-500">{detail}</span>}
        <Badge value={ok ? 'ok' : 'failed'} />
      </span>
    </div>
  );
}

export function SystemPage() {
  const { data, error, loading, reload } = useSa<SystemData>('/system');
  useEffect(() => {
    const t = setInterval(reload, 30_000);
    return () => clearInterval(t);
  }, [reload]);
  const db = data?.database.value;
  const rd = data?.redis.value;
  return (
    <div className="space-y-4">
      <PageHeader
        title="System health"
        subtitle="Live state of the API, database, cache and integrations. Refreshes every 30 seconds."
        actions={
          <Button tone="secondary" onClick={reload}>
            Refresh
          </Button>
        }
      />
      <Loading error={error} loading={loading && !data} />
      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              label="API uptime"
              value={duration(data.api.uptimeSeconds)}
              hint={`Node ${data.api.nodeVersion} · ${data.api.environment}`}
              tone="green"
            />
            <Stat label="API memory" value={bytes(data.api.memory.rssBytes)} hint={`Heap ${bytes(data.api.memory.heapUsedBytes)}`} />
            <Stat
              label="Server load"
              value={data.api.loadAverage.map((l) => l.toFixed(2)).join(' / ')}
              hint={`${data.api.cpus} CPU cores · 1 / 5 / 15 min`}
              tone={data.api.loadAverage[0] > data.api.cpus ? 'red' : 'slate'}
            />
            <Stat
              label="Server memory free"
              value={bytes(data.api.systemMemory.freeBytes)}
              hint={`of ${bytes(data.api.systemMemory.totalBytes)}`}
            />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card title="Services">
              <Check
                ok={data.database.ok}
                label="PostgreSQL database"
                detail={data.database.ok ? `${data.database.ms} ms` : data.database.error}
              />
              <Check
                ok={data.redis.ok}
                label="Redis (cache, codes, queue)"
                detail={data.redis.ok ? `${data.redis.ms} ms` : data.redis.error}
              />
              <Check ok={data.integrations.queue} label="Background job queue" />
              <Check ok={data.integrations.email} label="Email sending (SMTP)" />
              <Check ok={Boolean(data.integrations.whatsapp)} label="WhatsApp" detail={data.integrations.whatsapp ?? 'not set up'} />
              <Check ok={data.integrations.cashfree} label="Cashfree payments" detail={data.integrations.cashfreeMode} />
              <Check ok={data.integrations.s3} label="S3 image storage" detail={data.integrations.s3 ? undefined : 'using server disk'} />
              <Check ok={data.config.opsHelperConfigured} label="Server helper (Docker, logs)" />
            </Card>
            <Card title="Configuration">
              <dl className="text-sm space-y-1.5">
                {[
                  ['Image tag', data.api.imageTag ?? '—'],
                  ['Container', data.api.hostname],
                  ['Started', when(data.api.startedAt)],
                  ['Public website', data.config.webPublicUrl ?? '—'],
                  ['Platform fee', `${data.config.platformFeePercent}%`],
                  ['Seat hold', `${data.config.seatHoldMinutes} min`],
                  ['Rate limits', data.config.rateLimitsDisabled ? 'OFF (load test mode!)' : 'On'],
                  ['Settings loaded', when(data.api.settingsLoadedAt)],
                  ['PostgreSQL', db ? `${db.version} · ${bytes(db.sizeBytes)} · ${db.connections} connections` : '—'],
                  ['Redis', rd ? `v${rd.version} · ${rd.usedMemory} · ${num(rd.keys)} keys · ${rd.connectedClients} clients` : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className={`text-right ${v.startsWith('OFF') ? 'text-rose-600 font-semibold' : 'text-slate-800'}`}>{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
          {db && (
            <div className="grid lg:grid-cols-3 gap-4">
              <Card title="Database tables" className="lg:col-span-2">
                <Table head={['Table', 'Rows', 'Size']}>
                  {db.tables.map((t) => (
                    <tr key={t.table}>
                      <td className="px-3 py-1.5 font-mono text-xs">{t.table}</td>
                      <td className="px-3 py-1.5">{num(t.rows)}</td>
                      <td className="px-3 py-1.5 text-xs">{bytes(t.bytes)}</td>
                    </tr>
                  ))}
                </Table>
              </Card>
              <Card title={`Migrations applied (${db.migrations.length})`}>
                <ul className="text-xs font-mono text-slate-600 space-y-0.5 max-h-96 overflow-y-auto">
                  {db.migrations.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface HostStatus {
  connected: boolean;
  stale: boolean;
  ageSeconds: number | null;
  status: {
    generatedAt: string;
    hostname?: string;
    uptimeSeconds?: number;
    loadavg?: number[];
    cpus?: number;
    memory?: { totalBytes: number; availableBytes: number };
    disks?: { mount: string; sizeBytes: number; usedBytes: number; availBytes: number; usePercent: number }[];
    docker?: { type: string; total: string; active: string; size: string; reclaimable: string }[];
    containers?: {
      name: string;
      image: string;
      state: string;
      status: string;
      cpu: string;
      mem: string;
      memPercent: string;
      netIO: string;
      blockIO: string;
      logBytes: number;
    }[];
  } | null;
  actions: {
    id: string;
    action: string;
    target: string | null;
    status: string;
    output?: string;
    requestedBy?: string;
    finishedAt?: string;
  }[];
  pending: { id: string; action: string; target: string | null; requestedBy: string; requestedAt: string }[];
  logs: string[];
  systemBackups: { name: string; sizeBytes: number; createdAt: string }[];
  availableActions: Record<string, string>;
}

export function ServerPage() {
  const key = useSaKey();
  const { data, error, loading, reload } = useSa<HostStatus>('/server');
  const action = useSaAction();
  const [logName, setLogName] = useState('');
  const [lines, setLines] = useState('300');
  const [logText, setLogText] = useState('');
  const [logError, setLogError] = useState('');
  const [restartTarget, setRestartTarget] = useState('');

  useEffect(() => {
    const t = setInterval(reload, 20_000);
    return () => clearInterval(t);
  }, [reload]);
  useEffect(() => {
    if (!logName && data?.logs.length) setLogName(data.logs.includes('events_api') ? 'events_api' : data.logs[0]);
  }, [data, logName]);

  async function loadLog() {
    if (!logName) return;
    setLogError('');
    try {
      setLogText(await saRequest<string>(key, `/server/logs/${encodeURIComponent(logName)}?lines=${lines}`));
    } catch (err) {
      setLogError(err instanceof SaError ? err.message : 'Could not load the log');
    }
  }

  async function request(name: string, target: string | null, label: string) {
    if (
      await action.run(
        '/server/actions',
        { body: { action: name, target } },
        `${label} requested — the server helper runs it within a minute.`,
      )
    )
      reload();
  }

  const s = data?.status;
  const containers = s?.containers ?? [];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Server, Docker & logs"
        subtitle="Reported by the server helper every minute. Actions are a fixed, safe list — the helper refuses anything else."
        actions={
          <Button tone="secondary" onClick={reload}>
            Refresh
          </Button>
        }
      />
      <Notice message={action.message} />
      <Loading error={error} loading={loading && !data} />
      {data && !data.connected && (
        <Notice
          message={{
            kind: 'error',
            text: 'The server helper is not reporting. Install it on the server (docs/ops/SUPER_ADMIN.md, step 4).',
          }}
        />
      )}
      {data?.connected && data.stale && (
        <Notice message={{ kind: 'error', text: `Last report was ${duration(data.ageSeconds)} ago — is the helper's cron job running?` }} />
      )}
      {s && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Server uptime" value={duration(s.uptimeSeconds)} hint={s.hostname} />
            <Stat
              label="Load (1/5/15 min)"
              value={(s.loadavg ?? []).map((l) => l.toFixed(2)).join(' / ')}
              hint={`${s.cpus ?? '?'} CPU cores`}
              tone={(s.loadavg?.[0] ?? 0) > (s.cpus ?? 99) ? 'red' : 'slate'}
            />
            <Stat
              label="Memory available"
              value={bytes(s.memory?.availableBytes)}
              hint={`of ${bytes(s.memory?.totalBytes)}`}
              tone={s.memory && s.memory.availableBytes / s.memory.totalBytes < 0.1 ? 'red' : 'slate'}
            />
            {(s.disks ?? []).slice(0, 1).map((d) => (
              <Stat
                key={d.mount}
                label={`Disk ${d.mount}`}
                value={`${d.usePercent}% used`}
                hint={`${bytes(d.availBytes)} free of ${bytes(d.sizeBytes)}`}
                tone={d.usePercent >= 85 ? 'red' : d.usePercent >= 70 ? 'amber' : 'green'}
              />
            ))}
          </div>
          <Card title={`Containers (${containers.length})`}>
            <Table head={['Container', 'State', 'CPU', 'Memory', 'Network', 'Disk I/O', 'Log size', '']} empty={!containers.length}>
              {containers.map((c) => (
                <tr key={c.name}>
                  <td className="px-3 py-2">
                    <p className="font-mono text-xs font-semibold">{c.name}</p>
                    <p className="text-[11px] text-slate-500 truncate max-w-[220px]">{c.image}</p>
                  </td>
                  <td className="px-3 py-2">
                    <Badge value={c.state} />
                    <p className="text-[11px] text-slate-500">{c.status}</p>
                  </td>
                  <td className="px-3 py-2 text-xs">{c.cpu}</td>
                  <td className="px-3 py-2 text-xs">
                    {c.mem} <span className="text-slate-400">({c.memPercent})</span>
                  </td>
                  <td className="px-3 py-2 text-xs">{c.netIO}</td>
                  <td className="px-3 py-2 text-xs">{c.blockIO}</td>
                  <td className="px-3 py-2 text-xs">{bytes(c.logBytes)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <ConfirmAction
                      label="Clear log"
                      tone="secondary"
                      question={`Empty ${c.name}'s log?`}
                      onConfirm={() => request('truncate_container_logs', c.name, `Clearing ${c.name}'s log`)}
                    />
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card title="Maintenance">
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <ConfirmAction
                    label="Clear all container logs"
                    tone="secondary"
                    small={false}
                    question="Empty every container's log file?"
                    onConfirm={() => request('truncate_container_logs', 'all', 'Clearing all logs')}
                  />
                  <ConfirmAction
                    label="Delete unused Docker images"
                    tone="secondary"
                    small={false}
                    question="Delete images no container uses?"
                    onConfirm={() => request('prune_images', null, 'Image clean-up')}
                  />
                  <ConfirmAction
                    label="Delete build cache"
                    tone="secondary"
                    small={false}
                    question="Delete the Docker build cache?"
                    onConfirm={() => request('prune_build_cache', null, 'Build cache clean-up')}
                  />
                  <ConfirmAction
                    label="Shrink system journal"
                    tone="secondary"
                    small={false}
                    question="Shrink the journal to 200 MB?"
                    onConfirm={() => request('vacuum_journal', null, 'Journal clean-up')}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    label="Container to restart"
                    value={restartTarget}
                    onChange={setRestartTarget}
                    options={[['', 'Choose a container…'], ...containers.map((c) => [c.name, c.name] as [string, string])]}
                  />
                  <ConfirmAction
                    label="Restart"
                    small={false}
                    question={`Restart ${restartTarget || 'this container'}? It will be offline for a few seconds.`}
                    onConfirm={() =>
                      restartTarget ? request('restart_container', restartTarget, `Restarting ${restartTarget}`) : undefined
                    }
                  />
                </div>
                <div>
                  <ConfirmAction
                    label="Make a full server backup (.zip)"
                    tone="primary"
                    small={false}
                    question="All databases, compose files, .env files and volumes — this can take a few minutes. Continue?"
                    onConfirm={() => request('system_backup', null, 'Full server backup')}
                  />
                </div>
                {s.docker && (
                  <Table head={['Docker', 'Count', 'In use', 'Size', 'Can free']}>
                    {s.docker.map((d) => (
                      <tr key={d.type}>
                        <td className="px-3 py-1.5 text-xs">{d.type}</td>
                        <td className="px-3 py-1.5 text-xs">{d.total}</td>
                        <td className="px-3 py-1.5 text-xs">{d.active}</td>
                        <td className="px-3 py-1.5 text-xs">{d.size}</td>
                        <td className="px-3 py-1.5 text-xs">{d.reclaimable}</td>
                      </tr>
                    ))}
                  </Table>
                )}
              </div>
            </Card>
            <Card title="Recent actions">
              <Table head={['Action', 'Target', 'By', 'Result']} empty={!data.actions.length && !data.pending.length}>
                {data.pending.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-1.5 text-xs">{data.availableActions[p.action] ?? p.action}</td>
                    <td className="px-3 py-1.5 text-xs font-mono">{p.target ?? '—'}</td>
                    <td className="px-3 py-1.5 text-xs">{p.requestedBy}</td>
                    <td className="px-3 py-1.5">
                      <Badge value="running" />
                    </td>
                  </tr>
                ))}
                {data.actions.map((a) => (
                  <tr key={a.id}>
                    <td className="px-3 py-1.5 text-xs">
                      {data.availableActions[a.action] ?? a.action}
                      <p className="text-slate-400">{when(a.finishedAt)}</p>
                    </td>
                    <td className="px-3 py-1.5 text-xs font-mono">{a.target ?? '—'}</td>
                    <td className="px-3 py-1.5 text-xs">{a.requestedBy ?? '—'}</td>
                    <td className="px-3 py-1.5">
                      <Badge value={a.status} />
                      {a.output && (
                        <pre className="text-[10px] text-slate-500 whitespace-pre-wrap max-w-xs max-h-24 overflow-y-auto">{a.output}</pre>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>
          {data.systemBackups.length > 0 && (
            <Card title="Full server backups">
              <Table head={['File', 'Size', 'Made', '']}>
                {data.systemBackups.map((b) => (
                  <tr key={b.name}>
                    <td className="px-3 py-1.5 font-mono text-xs">{b.name}</td>
                    <td className="px-3 py-1.5 text-xs">{bytes(b.sizeBytes)}</td>
                    <td className="px-3 py-1.5 text-xs">{when(b.createdAt)}</td>
                    <td className="px-3 py-1.5">
                      <Button
                        small
                        tone="secondary"
                        onClick={() =>
                          saDownload(key, `/server/backups/${encodeURIComponent(b.name)}`, b.name).catch((e) =>
                            action.setMessage({ kind: 'error', text: e.message }),
                          )
                        }
                      >
                        Download
                      </Button>
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
        </>
      )}
      {data && data.logs.length > 0 && (
        <Card title="Container logs">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Select label="Container" value={logName} onChange={setLogName} options={data.logs.map((l) => [l, l] as [string, string])} />
            <Select
              label="Lines"
              value={lines}
              onChange={setLines}
              options={[
                ['100', 'Last 100 lines'],
                ['300', 'Last 300 lines'],
                ['1000', 'Last 1,000 lines'],
                ['5000', 'Last 5,000 lines'],
              ]}
            />
            <Button onClick={loadLog}>Show log</Button>
          </div>
          {logError && <Notice message={{ kind: 'error', text: logError }} />}
          {logText && (
            <pre className="bg-slate-950 text-slate-100 text-[11px] leading-relaxed p-3 rounded-lg max-h-[520px] overflow-auto whitespace-pre-wrap">
              {logText}
            </pre>
          )}
        </Card>
      )}
    </div>
  );
}

export function BackupsPage() {
  const key = useSaKey();
  const { data, error, loading, reload } = useSa<{ backups: { name: string; sizeBytes: number; createdAt: string }[] }>('/backups');
  const action = useSaAction();
  return (
    <div className="space-y-4">
      <PageHeader
        title="Backups"
        subtitle="A .zip with the whole database, files stored on the server and the portal settings. The newest 7 are kept."
        actions={
          <Button
            disabled={action.busy}
            onClick={async () => {
              if (await action.run('/backups', {}, 'Backup made. Download it and keep it somewhere safe.')) reload();
            }}
          >
            {action.busy ? 'Making backup…' : 'Make a backup now'}
          </Button>
        }
      />
      <Notice message={action.message} />
      <Loading error={error} loading={loading && !data} />
      {data && (
        <Table head={['File', 'Size', 'Made', '']} empty={!data.backups.length}>
          {data.backups.map((b) => (
            <tr key={b.name}>
              <td className="px-3 py-2 font-mono text-xs">{b.name}</td>
              <td className="px-3 py-2 text-xs">{bytes(b.sizeBytes)}</td>
              <td className="px-3 py-2 text-xs">{when(b.createdAt)}</td>
              <td className="px-3 py-2 whitespace-nowrap space-x-2">
                <Button
                  small
                  tone="secondary"
                  onClick={() =>
                    saDownload(key, `/backups/${encodeURIComponent(b.name)}`, b.name).catch((e) =>
                      action.setMessage({ kind: 'error', text: e.message }),
                    )
                  }
                >
                  Download
                </Button>
                <ConfirmAction
                  label="Delete"
                  question="Delete this backup?"
                  onConfirm={async () => {
                    if (await action.run(`/backups/${encodeURIComponent(b.name)}`, { method: 'DELETE' }, 'Backup deleted')) reload();
                  }}
                />
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Card title="Restoring">
        <p className="text-sm text-slate-600">
          Unzip, then restore the database with{' '}
          <code className="bg-slate-100 px-1 rounded">
            pg_restore --clean --if-exists --no-owner -d &quot;$DATABASE_URL&quot; database/events.dump
          </code>{' '}
          (or <code className="bg-slate-100 px-1 rounded">scripts/restore-db.sh</code>) and copy{' '}
          <code className="bg-slate-100 px-1 rounded">uploads/</code> back into the API’s uploads volume. Images kept in S3 are not in the
          .zip — turn on versioning for the bucket.
        </p>
      </Card>
    </div>
  );
}
