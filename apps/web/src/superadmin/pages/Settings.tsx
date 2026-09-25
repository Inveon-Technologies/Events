import { useEffect, useState } from 'react';
import { PageHeader, Card, Loading, Notice, Button, Field, Badge } from '../ui';
import { useSa, useSaAction, inputClass } from '../lib';
import { resetBrandingCache } from '../../lib/branding';

type Values = Record<string, string | null>;

interface SettingsData {
  branding: Values;
  invoice: Values;
  certificateFooter: Values;
  integrations: Record<string, { key: string; source: 'portal' | 'env' | 'unset'; value: string | null; secret: boolean }[]>;
  defaults: { branding: Values; invoice: Values; certificateFooter: Values };
}

interface FieldSpec {
  key: string;
  label: string;
  hint?: string;
  kind?: 'text' | 'color' | 'image' | 'textarea' | 'email';
}

function ImageField({ value, onChange }: { value: string | null; onChange: (url: string | null) => void }) {
  const action = useSaAction();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-40 h-16 border border-dashed border-slate-300 rounded-lg flex items-center justify-center bg-slate-50 overflow-hidden">
        {value ? (
          <img src={value} alt="Current" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-[11px] text-slate-400">Default Inveon logo</span>
        )}
      </div>
      <label className="text-xs font-semibold text-brand-700 cursor-pointer">
        Upload PNG / JPG / WebP
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const form = new FormData();
            form.append('file', file);
            const res = await action.run<{ url: string }>('/settings/images', { form });
            if (res) onChange(res.url);
            e.target.value = '';
          }}
        />
      </label>
      {value && (
        <button type="button" className="text-xs text-rose-600 font-semibold" onClick={() => onChange(null)}>
          Remove (use default)
        </button>
      )}
      {action.busy && <span className="text-xs text-slate-400">Uploading…</span>}
      <Notice message={action.message} />
    </div>
  );
}

function SettingsForm({
  section,
  endpoint,
  fields,
  intro,
  preview,
}: {
  section: 'branding' | 'invoice' | 'certificateFooter';
  endpoint: string;
  fields: FieldSpec[];
  intro: string;
  preview?: (v: Values) => JSX.Element;
}) {
  const { data, error, loading } = useSa<SettingsData>('/settings');
  const [values, setValues] = useState<Values | null>(null);
  const action = useSaAction();
  useEffect(() => {
    if (data && !values) setValues(data[section]);
  }, [data, section, values]);

  const set = (k: string, v: string | null) => setValues((prev) => ({ ...(prev ?? {}), [k]: v }));

  return (
    <div className="space-y-4">
      <PageHeader title={intro.split('|')[0]} subtitle={intro.split('|')[1]} />
      <Loading error={error} loading={loading && !data} />
      {values && data && (
        <div className="grid lg:grid-cols-5 gap-4">
          <Card className="lg:col-span-3">
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const saved = await action.run<Values>(
                  endpoint,
                  { method: 'PUT', body: values },
                  'Saved — live everywhere within a minute.',
                );
                if (saved) {
                  setValues(saved);
                  resetBrandingCache();
                }
              }}
            >
              {fields.map((f) => (
                <Field key={f.key} label={f.label} hint={f.hint}>
                  {f.kind === 'image' ? (
                    <ImageField value={values[f.key] ?? null} onChange={(url) => set(f.key, url)} />
                  ) : f.kind === 'color' ? (
                    <span className="flex items-center gap-2">
                      <input
                        type="color"
                        aria-label={f.label}
                        value={values[f.key] ?? '#0050cb'}
                        onChange={(e) => set(f.key, e.target.value)}
                        className="h-9 w-14 border border-slate-300 rounded"
                      />
                      <input
                        className={`${inputClass} w-32 font-mono`}
                        value={values[f.key] ?? ''}
                        onChange={(e) => set(f.key, e.target.value)}
                      />
                    </span>
                  ) : f.kind === 'textarea' ? (
                    <textarea
                      className={inputClass}
                      rows={3}
                      value={values[f.key] ?? ''}
                      onChange={(e) => set(f.key, e.target.value)}
                      placeholder={data.defaults[section][f.key] ?? ''}
                    />
                  ) : (
                    <input
                      className={inputClass}
                      type={f.kind === 'email' ? 'email' : 'text'}
                      value={values[f.key] ?? ''}
                      onChange={(e) => set(f.key, e.target.value)}
                      placeholder={data.defaults[section][f.key] ?? ''}
                    />
                  )}
                </Field>
              ))}
              <Notice message={action.message} />
              <div className="flex gap-2">
                <Button type="submit" disabled={action.busy}>
                  Save
                </Button>
                <Button tone="secondary" onClick={() => setValues({ ...data.defaults[section] })}>
                  Reset to defaults
                </Button>
              </div>
            </form>
          </Card>
          {preview && (
            <Card title="Preview" className="lg:col-span-2">
              {preview(values)}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export function BrandingPage() {
  return (
    <SettingsForm
      section="branding"
      endpoint="/settings/branding"
      intro="Branding & logo|The logo and name shown on the website header, organizer portal, tickets, emails and invoices."
      fields={[
        { key: 'platformName', label: 'Platform name' },
        { key: 'logoUrl', label: 'Logo', kind: 'image', hint: 'A wide logo on a transparent background works best (about 400 × 100 px).' },
        { key: 'supportEmail', label: 'Support email', kind: 'email', hint: 'Shown in every email footer and on invoices.' },
        { key: 'supportPhone', label: 'Support phone' },
        { key: 'primaryColor', label: 'Brand colour', kind: 'color' },
      ]}
      preview={(v) => (
        <div className="space-y-3">
          <div className="flex items-center justify-between border border-slate-200 rounded-lg px-4 py-3">
            {v.logoUrl ? (
              <img src={v.logoUrl} alt="" className="h-8 object-contain" />
            ) : (
              <span className="font-black text-brand-700">INVEON EVENTS</span>
            )}
            <span className="text-xs text-slate-400">Website header</span>
          </div>
          <div className="rounded-lg overflow-hidden border border-slate-200">
            <div className="px-4 py-3" style={{ background: v.primaryColor ?? '#0050cb' }}>
              {v.logoUrl ? (
                <img src={v.logoUrl} alt="" className="h-7 object-contain bg-white/90 rounded p-0.5" />
              ) : (
                <span className="text-white font-bold">{v.platformName}</span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 px-4 py-2">
              {v.platformName} · Need help? {v.supportEmail}
            </p>
          </div>
        </div>
      )}
    />
  );
}

export function InvoicePage() {
  return (
    <SettingsForm
      section="invoice"
      endpoint="/settings/invoice"
      intro="Invoice|Company details and wording on every tax invoice / receipt PDF. The logo comes from Branding."
      fields={[
        { key: 'companyName', label: 'Company name' },
        { key: 'companyAddress', label: 'Company address', kind: 'textarea' },
        { key: 'companyGstin', label: 'Company GSTIN' },
        { key: 'platformLine', label: '“Platform” line in the customer box' },
        { key: 'footerNote', label: 'Extra note under Terms', kind: 'textarea', hint: 'Optional — added as the last bullet.' },
        { key: 'accentColor', label: 'Accent colour', kind: 'color' },
      ]}
      preview={(v) => (
        <div className="text-xs border border-slate-200 rounded-lg p-3 space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-black">INVEON</span>
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{ color: v.accentColor ?? '#0050cb', background: '#eff6ff' }}
            >
              TAX INVOICE / RECEIPT
            </span>
          </div>
          <div className="h-0.5" style={{ background: v.accentColor ?? '#0050cb' }} />
          <p>
            <span className="text-slate-500">Platform:</span> {v.platformLine}
          </p>
          {v.footerNote && <p>• {v.footerNote}</p>}
          <p className="text-slate-500 border-t border-slate-100 pt-2">
            {v.companyName}
            {v.companyGstin ? ` · GSTIN ${v.companyGstin}` : ''}
            {v.companyAddress ? <span className="block">{v.companyAddress}</span> : null}
          </p>
        </div>
      )}
    />
  );
}

export function CertificateFooterPage() {
  return (
    <SettingsForm
      section="certificateFooter"
      endpoint="/settings/certificate-footer"
      intro="Certificate footer|The fixed band at the bottom of every participation certificate (organizers can’t change it)."
      fields={[
        { key: 'supportedByLabel', label: 'Partners heading' },
        { key: 'technologyPartnerLabel', label: 'Left label' },
        { key: 'technologyPartnerName', label: 'Left name' },
        { key: 'technologyPartnerTagline', label: 'Left tagline' },
        { key: 'bookingPartnerLabel', label: 'Right label' },
        { key: 'bookingPartnerName', label: 'Right name' },
        { key: 'bookingPartnerTagline', label: 'Right tagline' },
        { key: 'logoUrl', label: 'Logo (replaces the drawn mark + name on both sides)', kind: 'image' },
      ]}
      preview={(v) => (
        <div className="bg-[#f6efdc] border-4 border-[#0b1c3f] p-3 text-center">
          <p className="text-[9px] font-bold tracking-[0.2em] text-[#0b1c3f]">{v.supportedByLabel}</p>
          <p className="text-[10px] text-slate-500 my-1">Event partners appear here</p>
          <div className="grid grid-cols-2 gap-2 border-t border-[#d6c08a] pt-2">
            {[
              [v.technologyPartnerLabel, v.technologyPartnerName, v.technologyPartnerTagline],
              [v.bookingPartnerLabel, v.bookingPartnerName, v.bookingPartnerTagline],
            ].map(([label, name, tag], i) => (
              <div key={i}>
                <p className="text-[8px] font-bold tracking-widest text-slate-600">{label}</p>
                {v.logoUrl ? (
                  <img src={v.logoUrl} alt="" className="h-6 mx-auto object-contain" />
                ) : (
                  <p className="font-black text-sm leading-none">
                    {name}
                    <span className="block text-[7px] tracking-[0.3em] text-brand-700">{tag}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    />
  );
}

const GROUP_TITLES: Record<string, string> = {
  email: 'Email (Gmail SMTP)',
  cashfree: 'Cashfree payments',
  whatsapp: 'WhatsApp (AiSensy or Meta)',
};

const FIELD_HINTS: Record<string, string> = {
  SMTP_PASS: 'A Gmail app password (16 letters), not the account password.',
  CASHFREE_ENV: 'production or sandbox',
  WHATSAPP_PROVIDER: 'aisensy or meta',
  SMTP_FROM_NAME: 'Sender name shown in the inbox',
};

export function IntegrationsPage() {
  const { data, error, loading, setData } = useSa<SettingsData>('/settings');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [testTo, setTestTo] = useState('');
  const action = useSaAction();
  const test = useSaAction();

  async function save(values: Record<string, string>) {
    const res = await action.run<{ changed: string[]; integrations: SettingsData['integrations'] }>('/settings/integrations', {
      method: 'PUT',
      body: values,
    });
    if (res && data) {
      setData({ ...data, integrations: res.integrations });
      setDraft({});
      action.setMessage({ kind: 'ok', text: `Saved ${res.changed.join(', ')}. In use within 30 seconds — no restart needed.` });
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Integrations"
        subtitle="Keys saved here are encrypted and used instead of the server's .env values. Clear a key to go back to the .env value."
      />
      <Notice message={action.message} />
      <Loading error={error} loading={loading && !data} />
      {data &&
        Object.entries(data.integrations).map(([group, fields]) => (
          <Card key={group} title={GROUP_TITLES[group] ?? group}>
            <div className="space-y-3">
              {fields.map((f) => (
                <div key={f.key} className="grid md:grid-cols-[220px_1fr_auto] gap-2 items-center">
                  <div>
                    <p className="font-mono text-xs font-semibold">{f.key}</p>
                    <p className="text-[11px] text-slate-500">
                      Now: {f.value ?? 'not set'}{' '}
                      <Badge value={f.source === 'portal' ? 'saved here' : f.source === 'env' ? 'from .env' : 'unset'} />
                    </p>
                  </div>
                  <input
                    className={inputClass}
                    type={f.secret ? 'password' : 'text'}
                    autoComplete="off"
                    aria-label={f.key}
                    placeholder={f.secret ? 'Enter a new value to replace it' : (FIELD_HINTS[f.key] ?? 'New value')}
                    value={draft[f.key] ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  />
                  {f.source === 'portal' ? (
                    <Button tone="secondary" small onClick={() => save({ [f.key]: '' })}>
                      Clear
                    </Button>
                  ) : (
                    <span />
                  )}
                  {FIELD_HINTS[f.key] && f.secret && (
                    <p className="md:col-start-2 text-[11px] text-slate-400 -mt-1">{FIELD_HINTS[f.key]}</p>
                  )}
                </div>
              ))}
              <Button
                disabled={action.busy || !fields.some((f) => draft[f.key]?.trim())}
                onClick={() =>
                  save(Object.fromEntries(fields.filter((f) => draft[f.key]?.trim()).map((f) => [f.key, draft[f.key].trim()])))
                }
              >
                Save {GROUP_TITLES[group] ?? group}
              </Button>
              {group === 'email' && (
                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
                  <input
                    className={`${inputClass} max-w-xs`}
                    type="email"
                    placeholder="Send a test email to…"
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                  />
                  <Button
                    tone="secondary"
                    disabled={test.busy}
                    onClick={() =>
                      test.run('/settings/test-email', { body: testTo ? { to: testTo } : {} }, 'Test email sent — check the inbox.')
                    }
                  >
                    Send test email
                  </Button>
                  <Notice message={test.message} />
                </div>
              )}
            </div>
          </Card>
        ))}
    </div>
  );
}
