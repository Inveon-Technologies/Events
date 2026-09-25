import { useEffect, useRef, useState, type ReactNode } from 'react';
import { num } from './lib';

export function Notice({ message }: { message: { kind: 'ok' | 'error'; text: string } | null }) {
  if (!message) return null;
  return (
    <div
      role={message.kind === 'error' ? 'alert' : 'status'}
      className={`rounded-lg px-3 py-2 text-sm ${message.kind === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}
    >
      {message.text}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  children,
  actions,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
          {title && <h2 className="text-sm font-bold text-slate-800">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = 'slate',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue';
}) {
  const tones = {
    slate: 'text-slate-900',
    green: 'text-emerald-600',
    amber: 'text-amber-600',
    red: 'text-rose-600',
    blue: 'text-brand-700',
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${tones[tone]}`}>{value}</p>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

const BADGE: Record<string, string> = {
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  sent: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  running: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  issued: 'bg-sky-50 text-sky-700 border-sky-200',
  draft: 'bg-slate-50 text-slate-600 border-slate-200',
  closed: 'bg-slate-100 text-slate-600 border-slate-200',
  skipped: 'bg-slate-100 text-slate-600 border-slate-200',
  expired: 'bg-slate-100 text-slate-600 border-slate-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
  failed: 'bg-rose-50 text-rose-700 border-rose-200',
  wrong: 'bg-rose-50 text-rose-700 border-rose-200',
  locked: 'bg-rose-50 text-rose-700 border-rose-200',
  blocked: 'bg-rose-50 text-rose-700 border-rose-200',
  refunded: 'bg-violet-50 text-violet-700 border-violet-200',
  exited: 'bg-rose-50 text-rose-700 border-rose-200',
};

export function Badge({ value }: { value: string | null | undefined }) {
  const v = (value ?? '—').toString();
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold capitalize ${BADGE[v.toLowerCase()] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}
    >
      {v.replace(/_/g, ' ')}
    </span>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  tone = 'primary',
  type = 'button',
  small,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'secondary' | 'danger';
  type?: 'button' | 'submit';
  small?: boolean;
}) {
  const tones = {
    primary: 'bg-brand-600 hover:bg-brand-700 text-white',
    secondary: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300',
    danger: 'bg-rose-600 hover:bg-rose-700 text-white',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${small ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm'} rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

// Asks for a reason (or plain confirmation) before a risky action.
export function ConfirmAction({
  label,
  question,
  askReason,
  tone = 'danger',
  onConfirm,
  small = true,
}: {
  label: string;
  question: string;
  askReason?: boolean;
  tone?: 'primary' | 'secondary' | 'danger';
  onConfirm: (reason: string) => void | Promise<void>;
  small?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  if (!open) {
    return (
      <Button tone={tone} small={small} onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2">
      <span className="text-xs text-slate-700">{question}</span>
      {askReason && (
        <input
          ref={ref}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (shown in the audit log)"
          aria-label="Reason"
          className="px-2 py-1 text-xs border border-slate-300 rounded w-56"
        />
      )}
      <Button
        tone={tone}
        small
        onClick={async () => {
          await onConfirm(reason);
          setOpen(false);
          setReason('');
        }}
      >
        Yes, {label.toLowerCase()}
      </Button>
      <Button tone="secondary" small onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </span>
  );
}

export function SearchBar({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  children?: ReactNode;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <form
      className="flex flex-wrap items-center gap-2 mb-3"
      onSubmit={(e) => {
        e.preventDefault();
        onChange(draft.trim());
      }}
    >
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        aria-label="Search"
        className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
      />
      {children}
      <Button type="submit" tone="secondary">
        Search
      </Button>
    </form>
  );
}

export function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between text-xs text-slate-500 mt-3">
      <span>
        {num(total)} result{total === 1 ? '' : 's'} · page {page} of {pages}
      </span>
      <span className="flex gap-2">
        <Button tone="secondary" small disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button tone="secondary" small disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </span>
    </div>
  );
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {empty ? (
            <tr>
              <td colSpan={head.length} className="px-3 py-6 text-center text-slate-400">
                Nothing here yet.
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Loading({ error, loading }: { error?: string; loading?: boolean }) {
  if (error) return <Notice message={{ kind: 'error', text: error }} />;
  if (loading) return <p className="text-sm text-slate-400">Loading…</p>;
  return null;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-600 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}
