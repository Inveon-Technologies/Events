import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { saRequest, SaError } from './api';

// Non-component helpers for the super admin portal's pages.

// Small shared pieces for the super admin portal's pages.

export const SaKeyContext = createContext('');
export const useSaKey = () => useContext(SaKeyContext);

export function rupees(paise: number | string | null | undefined): string {
  const n = Number(paise ?? 0) / 100;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
}

export function num(n: number | string | null | undefined): string {
  return new Intl.NumberFormat('en-IN').format(Number(n ?? 0));
}

export function when(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

export function bytes(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (v < 1024) return `${v} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let x = v / 1024;
  let i = 0;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i += 1;
  }
  return `${x.toFixed(x < 10 ? 1 : 0)} ${units[i]}`;
}

export function duration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(Number(seconds ?? 0)));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

// GET a portal endpoint; re-fetches when `path` changes or reload() is called.
export function useSa<T>(path: string | null, deps: unknown[] = []) {
  const key = useSaKey();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(path));
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    saRequest<T>(key, path)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof SaError ? err.message : 'Could not load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, path, tick, ...deps]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

// Runs a portal action (POST/PUT/…) and shows its outcome.
export function useSaAction() {
  const key = useSaKey();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const run = useCallback(
    async <T>(path: string, options: { method?: string; body?: unknown; form?: FormData } = {}, success?: string): Promise<T | null> => {
      setBusy(true);
      setMessage(null);
      try {
        const result = await saRequest<T>(key, path, { method: options.method ?? 'POST', body: options.body, form: options.form });
        if (success) setMessage({ kind: 'ok', text: success });
        return result;
      } catch (err) {
        setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Something went wrong' });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [key],
  );
  return { run, busy, message, setMessage };
}

export const inputClass = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none';

// Search/filter/page state kept in one place for list pages.
export function useListQuery(defaults: Record<string, string> = {}) {
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>(defaults);
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({
    ...(q ? { q } : {}),
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
    page: String(page),
  });
  return {
    q,
    setQ: (v: string) => {
      setQ(v);
      setPage(1);
    },
    filters,
    setFilter: (k: string, v: string) => {
      setFilters((f) => ({ ...f, [k]: v }));
      setPage(1);
    },
    page,
    setPage,
    query: params.toString(),
  };
}
