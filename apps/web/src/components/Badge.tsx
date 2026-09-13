type Tone = 'success' | 'warning' | 'danger' | 'brand' | 'neutral';

const toneClasses: Record<Tone, string> = {
  success: 'bg-success-50 text-success-600',
  warning: 'bg-warning-50 text-warning-600',
  danger: 'bg-danger-50 text-danger-600',
  brand: 'bg-brand-50 text-brand-600',
  neutral: 'bg-surface-sunken text-ink-muted',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
