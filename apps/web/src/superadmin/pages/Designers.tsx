import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  Minus,
  MousePointerClick,
  MoveVertical,
  Plus,
  RefreshCw,
  Trash2,
  Type,
  Heading1,
  LayoutTemplate,
  Users,
  Hexagon,
} from 'lucide-react';
import { PageHeader, Card, Loading, Notice, Button, Field, Badge } from '../ui';
import { useSa, useSaAction, useSaKey, inputClass } from '../lib';
import { saBlob, saRequest, SaError } from '../api';
import { resetBrandingCache, type CertificateFooterDesign, type CertificateFooterField } from '../../lib/branding';
import CertificateCanvas from '../../organizer/components/certificate/CertificateCanvas';

// Drag-and-drop designers for Inveon's own documents: the certificate
// footer band, the invoice layout and the customer email templates. Each
// edits a design the API validates and saves (routes/superAdmin.ts), with
// a live preview rendered by the same code as the real document.

// ---------- shared pieces ----------

type Align = 'left' | 'center' | 'right';

function AlignButtons({ value, onChange }: { value: Align | undefined; onChange: (a: Align) => void }) {
  const opts: [Align, typeof AlignLeft][] = [
    ['left', AlignLeft],
    ['center', AlignCenter],
    ['right', AlignRight],
  ];
  return (
    <div className="flex gap-1" role="group" aria-label="Alignment">
      {opts.map(([a, Icon]) => (
        <button
          key={a}
          type="button"
          aria-label={`Align ${a}`}
          aria-pressed={value === a}
          onClick={() => onChange(a)}
          className={`flex-1 py-1.5 rounded-md border flex justify-center ${value === a ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-200'}`}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
}

// Dynamic values: clicking one inserts it at the cursor of the text box
// last focused (or at the end of it).
function useTokenTarget() {
  const target = useRef<{ el: HTMLInputElement | HTMLTextAreaElement; set: (v: string) => void } | null>(null);
  const bind = (set: (v: string) => void) => ({
    onFocus: (e: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => {
      target.current = { el: e.currentTarget, set };
    },
  });
  const insert = (token: string) => {
    const t = target.current;
    if (!t) return false;
    const el = t.el;
    const text = `{${token}}`;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    t.set(el.value.slice(0, start) + text + el.value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
    return true;
  };
  return { bind, insert };
}

function TokenChips({ tokens, onInsert }: { tokens: Record<string, string>; onInsert: (t: string) => void }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-600 mb-1">Dynamic values (click to insert)</p>
      <div className="flex flex-wrap gap-1">
        {Object.entries(tokens).map(([t, label]) => (
          <button
            key={t}
            type="button"
            title={label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onInsert(t)}
            className="px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 text-[10px] font-mono hover:bg-brand-100"
          >
            {`{${t}}`}
          </button>
        ))}
      </div>
    </div>
  );
}

function ImageUpload({ value, onChange }: { value: string | null | undefined; onChange: (url: string | null) => void }) {
  const action = useSaAction();
  return (
    <div className="space-y-2">
      <div className="h-20 border border-dashed border-slate-300 rounded-lg flex items-center justify-center bg-slate-50 overflow-hidden">
        {value ? (
          <img src={value} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-[11px] text-slate-400">No image</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <label className="text-xs font-semibold text-brand-700 cursor-pointer">
          {value ? 'Change image' : 'Upload image'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            aria-label="Upload image"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const form = new FormData();
              form.append('file', file);
              const res = await action.run<{ url: string }>('/settings/images', { form });
              if (res) onChange(res.url);
            }}
          />
        </label>
        {value && (
          <button type="button" className="text-xs text-rose-600 font-semibold" onClick={() => onChange(null)}>
            Remove
          </button>
        )}
        {action.busy && <span className="text-xs text-slate-400">Uploading…</span>}
      </div>
      <Notice message={action.message} />
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number | undefined;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <label className="block text-[11px] font-semibold text-slate-600">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value ?? ''}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
        aria-label={label}
        className={`${inputClass} mt-1 !py-1`}
      />
    </label>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string | undefined; onChange: (c: string) => void }) {
  return (
    <label className="block text-[11px] font-semibold text-slate-600">
      {label}
      <input
        type="color"
        value={value || '#000000'}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="mt-1 w-full h-[30px] rounded-md border border-slate-200"
      />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded" />
      {label}
    </label>
  );
}

// A palette item that can be dragged into a block list, or clicked to add
// it at the end.
function PaletteItem({
  type,
  label,
  icon,
  onAdd,
  disabled,
}: {
  type: string;
  label: string;
  icon: ReactNode;
  onAdd: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      draggable={!disabled}
      disabled={disabled}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', `new:${type}`)}
      onClick={onAdd}
      className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:border-brand-400 hover:bg-brand-50 cursor-grab disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      <Plus className="w-3.5 h-3.5 text-slate-400" />
    </button>
  );
}

// A vertical list whose rows are reordered by dragging (or the arrow
// buttons), and that accepts new blocks dropped from a palette.
function BlockList<T extends { id: string }>({
  items,
  selectedId,
  onSelect,
  onChange,
  onDropNew,
  renderRow,
  rowTone,
}: {
  items: T[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (items: T[]) => void;
  onDropNew: (type: string, index: number) => void;
  renderRow: (item: T) => ReactNode;
  rowTone?: (item: T) => string;
}) {
  const [over, setOver] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to > items.length) return;
    const next = [...items];
    const [it] = next.splice(from, 1);
    next.splice(to > from ? to - 1 : to, 0, it);
    onChange(next);
  };
  const drop = (e: DragEvent, index: number) => {
    e.preventDefault();
    setOver(null);
    const data = e.dataTransfer.getData('text/plain');
    if (data.startsWith('move:')) move(Number(data.slice(5)), index);
    else if (data.startsWith('new:')) onDropNew(data.slice(4), index);
  };
  // The marker doesn't change the zone's height: the list must not shift
  // under the pointer mid-drag.
  const dropZone = (index: number) => (
    <div
      key={`drop-${index}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(index);
      }}
      onDragLeave={() => setOver((o) => (o === index ? null : o))}
      onDrop={(e) => drop(e, index)}
      className="h-2 flex items-center"
    >
      <div className={`h-1 w-full rounded-full ${over === index ? 'bg-brand-500' : 'bg-transparent'}`} />
    </div>
  );
  return (
    <div data-testid="block-list">
      {dropZone(0)}
      {items.map((item, i) => (
        <div key={item.id}>
          <div
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', `move:${i}`)}
            onDragOver={(e) => {
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              setOver(e.clientY < r.top + r.height / 2 ? i : i + 1);
            }}
            onDrop={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              drop(e, e.clientY < r.top + r.height / 2 ? i : i + 1);
            }}
            onClick={() => onSelect(item.id)}
            className={`flex items-center gap-2 px-2 py-2 rounded-lg border text-xs cursor-pointer ${
              item.id === selectedId
                ? 'border-brand-500 ring-1 ring-brand-500 bg-brand-50'
                : 'border-slate-200 bg-white hover:border-slate-300'
            } ${rowTone?.(item) ?? ''}`}
          >
            <GripVertical className="w-4 h-4 text-slate-400 cursor-grab shrink-0" />
            <div className="flex-1 min-w-0">{renderRow(item)}</div>
            <button
              type="button"
              aria-label="Move up"
              disabled={i === 0}
              onClick={(e) => {
                e.stopPropagation();
                move(i, i - 1);
              }}
              className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label="Move down"
              disabled={i === items.length - 1}
              onClick={(e) => {
                e.stopPropagation();
                move(i, i + 2);
              }}
              className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          </div>
          {dropZone(i + 1)}
        </div>
      ))}
    </div>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

// ---------- certificate footer ----------

interface FooterMeta {
  design: CertificateFooterDesign;
  saved: boolean;
  defaultDesign: CertificateFooterDesign;
  fonts: string[];
  tokens: string[];
  footerTopPercent: number;
  maxFields: number;
}

const CERT_SAMPLE = {
  participant: 'Rahul Sharma',
  event: 'Rajgad Sunrise Trek',
  year: String(new Date().getFullYear()),
  date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
  organizer: 'Sahyadri Trekkers',
  tagline: 'Watch the sunrise from Balekilla',
  venue: 'Rajgad Fort',
  certificateNo: 'INV-CRT-2026-SAMPLE-01',
};

const CERT_TOKEN_LABELS: Record<string, string> = {
  participant: 'Participant name',
  event: 'Event name',
  year: 'Year',
  date: 'Event date',
  organizer: 'Organizer',
  tagline: 'Event tagline',
  venue: 'Venue',
  certificateNo: 'Certificate number',
};

export function CertificateFooterDesignerPage() {
  const { data, error, loading } = useSa<FooterMeta>('/settings/certificate-footer-design');
  const key = useSaKey();
  const [design, setDesign] = useState<CertificateFooterDesign | null>(null);
  const [savedJson, setSavedJson] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const action = useSaAction();
  const preview = useSaAction();
  const tokens = useTokenTarget();

  useEffect(() => {
    if (data && !design) {
      setDesign(data.design);
      setSavedJson(JSON.stringify(data.design));
    }
  }, [data, design]);
  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl]);

  if (!data || !design) return <Loading error={error} loading={loading} />;

  const footerTop = data.footerTopPercent;
  const selected = design.fields.find((f) => f.id === selectedId) ?? null;
  const dirty = JSON.stringify(design) !== savedJson;
  const update = (id: string, patch: Partial<CertificateFooterField>) =>
    setDesign((d) => (d ? { ...d, fields: d.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) } : d));

  function add(kind: CertificateFooterField['kind']) {
    if (!design) return;
    if (design.fields.length >= data!.maxFields) {
      action.setMessage({ kind: 'error', text: `The footer can have at most ${data!.maxFields} fields.` });
      return;
    }
    const y = footerTop + 3;
    const field: CertificateFooterField =
      kind === 'text'
        ? {
            id: newId('text'),
            kind,
            label: 'Custom text',
            x: 35,
            y,
            w: 30,
            h: 2,
            text: 'Your text',
            fontFamily: 'Montserrat',
            fontSize: 8,
            color: '#334155',
            bold: true,
            align: 'center',
            letterSpacing: 1,
            uppercase: false,
          }
        : kind === 'image'
          ? { id: newId('image'), kind, label: 'Logo', x: 45, y, w: 10, h: 4, imageUrl: null }
          : kind === 'platformMark'
            ? { id: newId('mark'), kind, label: 'Inveon mark', x: 48, y, w: 3, h: 3 }
            : { id: newId('partners'), kind, label: 'Event partners', x: 10, y, w: 80, h: 6 };
    setDesign({ ...design, fields: [...design.fields, field] });
    setSelectedId(field.id);
  }

  async function renderPreview() {
    try {
      const blob = await saBlob(key, '/settings/certificate-footer-design/preview', { design });
      setPreviewUrl(URL.createObjectURL(blob));
      preview.setMessage(null);
    } catch (err) {
      preview.setMessage({ kind: 'error', text: err instanceof SaError ? err.message : 'Preview failed' });
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Certificate footer"
        subtitle="The band at the bottom of every participation certificate. Drag fields to place them, drag the blue corner to resize. Organizers can't change it."
        actions={
          <>
            {data.saved ? <Badge value="saved here" /> : <Badge value="default" />}
            <Button tone="secondary" onClick={() => setDesign(data.defaultDesign)}>
              Reset to default
            </Button>
            <Button
              disabled={!dirty || action.busy}
              onClick={async () => {
                const res = await action.run<{ design: CertificateFooterDesign }>(
                  '/settings/certificate-footer-design',
                  { method: 'PUT', body: { design } },
                  'Saved. New certificates use this footer.',
                );
                if (res) {
                  setDesign(res.design);
                  setSavedJson(JSON.stringify(res.design));
                  resetBrandingCache();
                }
              }}
            >
              {dirty ? 'Save footer' : 'Saved'}
            </Button>
          </>
        }
      />
      <Notice message={action.message} />
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
        <div className="space-y-3">
          <CertificateCanvas
            design={{ backgroundUrl: null, fields: [] }}
            values={CERT_SAMPLE}
            organizerLogoUrl={null}
            onSelect={undefined}
            onChangeField={undefined}
            partners={[]}
            footerTop={footerTop}
            footerDesign={design}
            footerEditable
            selectedFooterId={selectedId}
            onSelectFooter={setSelectedId}
            onChangeFooterField={update}
          />
          <div className="flex flex-wrap gap-2">
            <Button tone="secondary" small onClick={() => add('text')}>
              <span className="inline-flex items-center gap-1">
                <Type className="w-3.5 h-3.5" /> Add text
              </span>
            </Button>
            <Button tone="secondary" small onClick={() => add('image')}>
              <span className="inline-flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5" /> Add logo / image
              </span>
            </Button>
            <Button tone="secondary" small onClick={() => add('platformMark')}>
              <span className="inline-flex items-center gap-1">
                <Hexagon className="w-3.5 h-3.5" /> Add Inveon mark
              </span>
            </Button>
            <Button tone="secondary" small disabled={design.fields.some((f) => f.kind === 'partners')} onClick={() => add('partners')}>
              <span className="inline-flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> Add event partners row
              </span>
            </Button>
            <Button tone="secondary" small disabled={preview.busy} onClick={renderPreview}>
              <span className="inline-flex items-center gap-1">
                <RefreshCw className="w-3.5 h-3.5" /> Render real certificate
              </span>
            </Button>
          </div>
          <p className="text-[11px] text-slate-500">
            The event partners row shows each event's Supported By partners (sample tiles here). A text field set to “only with partners” is
            hidden on events without partners.
          </p>
          <Notice message={preview.message} />
          {previewUrl && (
            <Card title="As printed (server render with sample data)">
              <img src={previewUrl} alt="Certificate preview" className="w-full border border-slate-200" />
            </Card>
          )}
        </div>

        <aside className="rounded-xl border border-slate-200 bg-white p-3 space-y-3 xl:sticky xl:top-20">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Fields</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {design.fields.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedId(f.id)}
                className={`w-full text-left px-2 py-1 rounded text-xs ${f.id === selectedId ? 'bg-brand-600 text-white' : 'hover:bg-slate-100 text-slate-700'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {selected ? (
            <div className="space-y-3 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between gap-2">
                <input
                  value={selected.label}
                  onChange={(e) => update(selected.id, { label: e.target.value })}
                  aria-label="Field name"
                  className="text-sm font-bold text-slate-900 bg-transparent focus:outline-none min-w-0"
                />
                <button
                  type="button"
                  aria-label="Remove field"
                  onClick={() => {
                    setDesign({ ...design, fields: design.fields.filter((f) => f.id !== selected.id) });
                    setSelectedId(null);
                  }}
                  className="p-1 text-slate-400 hover:text-rose-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {selected.kind === 'text' && (
                <>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Text
                    <textarea
                      value={selected.text ?? ''}
                      rows={2}
                      onChange={(e) => update(selected.id, { text: e.target.value })}
                      {...tokens.bind((v) => update(selected.id, { text: v }))}
                      aria-label="Field text"
                      className={`${inputClass} mt-1 font-mono`}
                    />
                  </label>
                  <TokenChips
                    tokens={Object.fromEntries(data.tokens.map((t) => [t, CERT_TOKEN_LABELS[t] ?? t]))}
                    onInsert={(t) => tokens.insert(t) || update(selected.id, { text: `${selected.text ?? ''}{${t}}` })}
                  />
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Font
                    <select
                      value={selected.fontFamily}
                      onChange={(e) => update(selected.id, { fontFamily: e.target.value })}
                      aria-label="Font"
                      className={`${inputClass} mt-1 !py-1`}
                    >
                      {data.fonts.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <NumberInput
                      label="Size"
                      value={selected.fontSize}
                      min={3}
                      max={60}
                      step={0.2}
                      onChange={(n) => update(selected.id, { fontSize: n })}
                    />
                    <ColorInput label="Colour" value={selected.color} onChange={(c) => update(selected.id, { color: c })} />
                    <NumberInput
                      label="Letter spacing"
                      value={selected.letterSpacing}
                      min={0}
                      max={30}
                      step={0.2}
                      onChange={(n) => update(selected.id, { letterSpacing: n })}
                    />
                  </div>
                  <AlignButtons value={selected.align} onChange={(a) => update(selected.id, { align: a })} />
                  <div className="flex flex-col gap-1.5">
                    <Toggle label="Bold" checked={Boolean(selected.bold)} onChange={(v) => update(selected.id, { bold: v })} />
                    <Toggle
                      label="Uppercase"
                      checked={Boolean(selected.uppercase)}
                      onChange={(v) => update(selected.id, { uppercase: v })}
                    />
                    <Toggle
                      label="Only with partners"
                      checked={Boolean(selected.onlyWithPartners)}
                      onChange={(v) => update(selected.id, { onlyWithPartners: v })}
                    />
                  </div>
                </>
              )}
              {selected.kind === 'image' && (
                <ImageUpload value={selected.imageUrl} onChange={(url) => update(selected.id, { imageUrl: url })} />
              )}
              {selected.kind === 'partners' && (
                <p className="text-[11px] text-slate-500">Each event's partner logos, laid out in a row inside this box.</p>
              )}
              {selected.kind === 'platformMark' && (
                <p className="text-[11px] text-slate-500">The drawn Inveon mark, fitted inside this box.</p>
              )}
              <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                <NumberInput
                  label="Left %"
                  value={selected.x}
                  min={0}
                  max={100 - selected.w}
                  step={0.1}
                  onChange={(n) => update(selected.id, { x: n })}
                />
                <NumberInput
                  label="Top %"
                  value={selected.y}
                  min={footerTop}
                  max={100 - selected.h}
                  step={0.1}
                  onChange={(n) => update(selected.id, { y: n })}
                />
                <NumberInput
                  label="Width %"
                  value={selected.w}
                  min={1}
                  max={100 - selected.x}
                  step={0.1}
                  onChange={(n) => update(selected.id, { w: n })}
                />
                <NumberInput
                  label="Height %"
                  value={selected.h}
                  min={0.5}
                  max={100 - selected.y}
                  step={0.1}
                  onChange={(n) => update(selected.id, { h: n })}
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 border-t border-slate-100 pt-3">Click a field on the certificate to edit it.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

// ---------- invoice ----------

interface InvoiceBlock {
  id: string;
  type: 'header' | 'parties' | 'event' | 'items' | 'payment' | 'terms' | 'text' | 'spacer';
  visible: boolean;
  title?: string;
  text?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  align?: Align;
  height?: number;
}
interface InvoiceLayout {
  version: 1;
  blocks: InvoiceBlock[];
}

const INVOICE_SECTION_LABELS: Record<string, string> = {
  header: 'Header (logo, invoice no., dates)',
  parties: 'Billed to & organizer',
  event: 'Event details',
  items: 'Ticket items & total',
  payment: 'Payment details',
  terms: 'Terms & conditions',
  text: 'Custom text',
  spacer: 'Space',
};

function newInvoiceBlock(type: string): InvoiceBlock {
  return type === 'spacer'
    ? { id: newId('spacer'), type: 'spacer', visible: true, height: 16 }
    : {
        id: newId('text'),
        type: 'text',
        visible: true,
        text: 'Thank you for booking with {platformName}!',
        fontSize: 9,
        color: '#374151',
        bold: false,
        align: 'left',
      };
}

export function InvoiceDesignerPage() {
  const { data, error, loading } = useSa<{
    layout: InvoiceLayout;
    saved: boolean;
    defaultLayout: InvoiceLayout;
    tokens: Record<string, string>;
  }>('/settings/invoice-layout');
  const key = useSaKey();
  const [layout, setLayout] = useState<InvoiceLayout | null>(null);
  const [savedJson, setSavedJson] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState('');
  const action = useSaAction();
  const tokens = useTokenTarget();
  const debounced = useDebounced(layout, 700);

  useEffect(() => {
    if (data && !layout) {
      setLayout(data.layout);
      setSavedJson(JSON.stringify(data.layout));
    }
  }, [data, layout]);

  useEffect(() => {
    if (!debounced) return undefined;
    let cancelled = false;
    let url: string | null = null;
    saBlob(key, '/settings/invoice-layout/preview', { layout: debounced })
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPdfUrl(url);
        setPreviewError('');
      })
      .catch((err) => !cancelled && setPreviewError(err instanceof SaError ? err.message : 'Preview failed'));
    return () => {
      cancelled = true;
      if (url) setTimeout(() => URL.revokeObjectURL(url!), 5000);
    };
  }, [debounced, key]);

  if (!data || !layout) return <Loading error={error} loading={loading} />;

  const selected = layout.blocks.find((b) => b.id === selectedId) ?? null;
  const dirty = JSON.stringify(layout) !== savedJson;
  const update = (id: string, patch: Partial<InvoiceBlock>) =>
    setLayout((l) => (l ? { ...l, blocks: l.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) } : l));
  const insert = (type: string, index = layout.blocks.length) => {
    if (type !== 'text' && type !== 'spacer') return;
    const block = newInvoiceBlock(type);
    const blocks = [...layout.blocks];
    blocks.splice(index, 0, block);
    setLayout({ ...layout, blocks });
    setSelectedId(block.id);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Invoice designer"
        subtitle="Drag sections to reorder the invoice, hide what you don't need, and add your own text with dynamic values. Company details and colours are under Invoice."
        actions={
          <>
            {data.saved ? <Badge value="saved here" /> : <Badge value="default" />}
            <Button tone="secondary" onClick={() => setLayout(data.defaultLayout)}>
              Reset to default
            </Button>
            <Button
              disabled={!dirty || action.busy}
              onClick={async () => {
                const res = await action.run<{ layout: InvoiceLayout }>(
                  '/settings/invoice-layout',
                  { method: 'PUT', body: { layout } },
                  'Saved. New invoices use this layout.',
                );
                if (res) {
                  setLayout(res.layout);
                  setSavedJson(JSON.stringify(res.layout));
                }
              }}
            >
              {dirty ? 'Save layout' : 'Saved'}
            </Button>
          </>
        }
      />
      <Notice message={action.message} />
      <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4 items-start">
        <div className="space-y-3">
          <Card title="Add">
            <div className="space-y-1.5">
              <PaletteItem type="text" label="Text block" icon={<Type className="w-4 h-4 text-brand-600" />} onAdd={() => insert('text')} />
              <PaletteItem
                type="spacer"
                label="Space"
                icon={<MoveVertical className="w-4 h-4 text-brand-600" />}
                onAdd={() => insert('spacer')}
              />
            </div>
          </Card>
          <Card title="Invoice sections (top to bottom)">
            <BlockList
              items={layout.blocks}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onChange={(blocks) => setLayout({ ...layout, blocks })}
              onDropNew={insert}
              rowTone={(b) => (b.visible ? '' : 'opacity-50')}
              renderRow={(b) => (
                <span className="flex items-center gap-2">
                  <span className="flex-1 truncate font-semibold text-slate-700">
                    {b.type === 'text' ? b.title || b.text || 'Custom text' : INVOICE_SECTION_LABELS[b.type]}
                  </span>
                  <button
                    type="button"
                    aria-label={b.visible ? 'Hide' : 'Show'}
                    onClick={(e) => {
                      e.stopPropagation();
                      update(b.id, { visible: !b.visible });
                    }}
                    className="p-0.5 text-slate-500 hover:text-slate-800"
                  >
                    {b.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                </span>
              )}
            />
            <p className="text-[11px] text-slate-400 mt-2">The footer (company details) always stays at the bottom of the page.</p>
          </Card>
          {selected && (
            <Card
              title={INVOICE_SECTION_LABELS[selected.type]}
              actions={
                (selected.type === 'text' || selected.type === 'spacer') && (
                  <button
                    type="button"
                    aria-label="Remove block"
                    onClick={() => {
                      setLayout({ ...layout, blocks: layout.blocks.filter((b) => b.id !== selected.id) });
                      setSelectedId(null);
                    }}
                    className="p-1 text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )
              }
            >
              <div className="space-y-3">
                {(selected.type === 'payment' || selected.type === 'terms' || selected.type === 'text') && (
                  <Field label="Heading" hint={selected.type === 'text' ? 'Optional' : 'Leave empty for the standard heading'}>
                    <input
                      className={inputClass}
                      value={selected.title ?? ''}
                      onChange={(e) => update(selected.id, { title: e.target.value })}
                    />
                  </Field>
                )}
                {selected.type === 'text' && (
                  <>
                    <Field label="Text">
                      <textarea
                        className={`${inputClass} font-mono`}
                        rows={4}
                        value={selected.text ?? ''}
                        onChange={(e) => update(selected.id, { text: e.target.value })}
                        {...tokens.bind((v) => update(selected.id, { text: v }))}
                      />
                    </Field>
                    <TokenChips
                      tokens={data.tokens}
                      onInsert={(t) => tokens.insert(t) || update(selected.id, { text: `${selected.text ?? ''}{${t}}` })}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <NumberInput
                        label="Size"
                        value={selected.fontSize}
                        min={6}
                        max={16}
                        onChange={(n) => update(selected.id, { fontSize: n })}
                      />
                      <ColorInput label="Colour" value={selected.color} onChange={(c) => update(selected.id, { color: c })} />
                    </div>
                    <AlignButtons value={selected.align} onChange={(a) => update(selected.id, { align: a })} />
                    <Toggle label="Bold" checked={Boolean(selected.bold)} onChange={(v) => update(selected.id, { bold: v })} />
                  </>
                )}
                {selected.type === 'spacer' && (
                  <NumberInput
                    label="Height (pt)"
                    value={selected.height}
                    min={4}
                    max={120}
                    onChange={(n) => update(selected.id, { height: n })}
                  />
                )}
                {!['payment', 'terms', 'text', 'spacer'].includes(selected.type) && (
                  <p className="text-xs text-slate-500">Drag it to move it, or use the eye to hide it.</p>
                )}
              </div>
            </Card>
          )}
        </div>
        <Card title="Live preview (sample booking)">
          {previewError && <Notice message={{ kind: 'error', text: previewError }} />}
          {pdfUrl ? (
            <iframe title="Invoice preview" src={pdfUrl} className="w-full h-[80vh] border border-slate-200 rounded" />
          ) : (
            !previewError && <p className="text-sm text-slate-400">Rendering…</p>
          )}
        </Card>
      </div>
    </div>
  );
}

// ---------- email templates ----------

interface EmailBlock {
  id: string;
  type: 'heading' | 'text' | 'button' | 'image' | 'divider' | 'spacer' | 'section';
  text?: string;
  url?: string;
  imageUrl?: string;
  align?: Align;
  color?: string;
  background?: string;
  fontSize?: number;
  width?: number;
  height?: number;
  section?: string;
}
interface EmailTemplate {
  enabled: boolean;
  subject: string;
  preheader: string;
  blocks: EmailBlock[];
}
interface TemplateInfo {
  key: string;
  name: string;
  description: string;
  variables: Record<string, string>;
  sections: Record<string, string>;
  saved: boolean;
  template: EmailTemplate;
  defaultTemplate: EmailTemplate;
}

const EMAIL_BLOCKS: [EmailBlock['type'], string, typeof Type][] = [
  ['heading', 'Heading', Heading1],
  ['text', 'Text', Type],
  ['button', 'Button', MousePointerClick],
  ['image', 'Image', ImageIcon],
  ['divider', 'Divider', Minus],
  ['spacer', 'Space', MoveVertical],
];

function newEmailBlock(type: string): EmailBlock | null {
  const id = newId(type);
  switch (type) {
    case 'heading':
      return { id, type, text: 'Heading', align: 'left', color: '#0f172a', fontSize: 20 };
    case 'text':
      return { id, type, text: 'Hi {customerName},', align: 'left', color: '#475569', fontSize: 14 };
    case 'button':
      return { id, type, text: 'View tickets', url: '', align: 'center', color: '#ffffff', background: '#0050cb', fontSize: 14 };
    case 'image':
      return { id, type, imageUrl: '', url: '', width: 600, align: 'center' };
    case 'divider':
      return { id, type, color: '#e2e8f0' };
    case 'spacer':
      return { id, type, height: 24 };
    default:
      return type.startsWith('section:') ? { id: `section-${type.slice(8)}`, type: 'section', section: type.slice(8) } : null;
  }
}

function emailBlockLabel(b: EmailBlock, sections: Record<string, string>): string {
  if (b.type === 'section') return `Built-in: ${sections[b.section ?? ''] ?? b.section}`;
  if (b.type === 'heading' || b.type === 'text' || b.type === 'button')
    return `${b.type[0].toUpperCase()}${b.type.slice(1)}: ${b.text || '(empty)'}`;
  return EMAIL_BLOCKS.find(([t]) => t === b.type)?.[1] ?? b.type;
}

function EmailEditor({ info, onSaved }: { info: TemplateInfo; onSaved: (t: TemplateInfo) => void }) {
  const key = useSaKey();
  const [tpl, setTpl] = useState<EmailTemplate>(info.template);
  const [savedJson, setSavedJson] = useState(JSON.stringify(info.template));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [testTo, setTestTo] = useState('');
  const action = useSaAction();
  const test = useSaAction();
  const tokens = useTokenTarget();
  const debounced = useDebounced(tpl, 600);
  const vars = useMemo(() => info.variables, [info.variables]);

  useEffect(() => {
    let cancelled = false;
    saRequest<{ subject: string; html: string }>(key, `/settings/email-templates/${info.key}/preview`, { body: { template: debounced } })
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
        setPreviewError('');
      })
      .catch((err) => !cancelled && setPreviewError(err instanceof SaError ? err.message : 'Preview failed'));
    return () => {
      cancelled = true;
    };
  }, [debounced, info.key, key]);

  const selected = tpl.blocks.find((b) => b.id === selectedId) ?? null;
  const dirty = JSON.stringify(tpl) !== savedJson;
  const update = (id: string, patch: Partial<EmailBlock>) =>
    setTpl((t) => ({ ...t, blocks: t.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
  const placed = new Set(tpl.blocks.filter((b) => b.type === 'section').map((b) => b.section));
  const insert = (type: string, index = tpl.blocks.length) => {
    const block = newEmailBlock(type);
    if (!block || (block.type === 'section' && placed.has(block.section))) return;
    const blocks = [...tpl.blocks];
    blocks.splice(index, 0, block);
    setTpl({ ...tpl, blocks });
    setSelectedId(block.id);
  };
  const insertToken = (t: string) => {
    if (tokens.insert(t)) return;
    if (selected && (selected.type === 'heading' || selected.type === 'text' || selected.type === 'button')) {
      update(selected.id, { text: `${selected.text ?? ''}{${t}}` });
    }
  };

  async function save(body: EmailTemplate) {
    const res = await action.run<{ template: EmailTemplate }>(
      `/settings/email-templates/${info.key}`,
      { method: 'PUT', body: { template: body } },
      body.enabled ? 'Saved. Customers now get this design.' : 'Saved as a draft. Switch it on to start sending it.',
    );
    if (res) {
      setTpl(res.template);
      setSavedJson(JSON.stringify(res.template));
      onSaved({ ...info, saved: true, template: res.template });
    }
  }

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-900">{info.name}</p>
            <p className="text-xs text-slate-500">{info.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={tpl.enabled}
                onChange={(e) => setTpl({ ...tpl, enabled: e.target.checked })}
                className="rounded"
              />
              {tpl.enabled ? 'On: customers get this design' : 'Off: the standard email is sent'}
            </label>
            <Button
              tone="secondary"
              disabled={action.busy}
              onClick={async () => {
                const res = await action.run<{ template: EmailTemplate }>(
                  `/settings/email-templates/${info.key}`,
                  { method: 'DELETE' },
                  'Reset. The standard email is sent again.',
                );
                if (res) {
                  setTpl(res.template);
                  setSavedJson(JSON.stringify(res.template));
                  onSaved({ ...info, saved: false, template: res.template });
                }
              }}
            >
              Reset to standard
            </Button>
            <Button disabled={!dirty || action.busy} onClick={() => save(tpl)}>
              {dirty ? 'Save template' : 'Saved'}
            </Button>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <Field label="Subject">
            <input
              className={inputClass}
              value={tpl.subject}
              onChange={(e) => setTpl({ ...tpl, subject: e.target.value })}
              {...tokens.bind((v) => setTpl((t) => ({ ...t, subject: v })))}
            />
          </Field>
          <Field label="Preview text" hint="Shown after the subject in most inboxes">
            <input
              className={inputClass}
              value={tpl.preheader}
              onChange={(e) => setTpl({ ...tpl, preheader: e.target.value })}
              {...tokens.bind((v) => setTpl((t) => ({ ...t, preheader: v })))}
            />
          </Field>
        </div>
        <div className="mt-3">
          <TokenChips tokens={vars} onInsert={insertToken} />
        </div>
        <Notice message={action.message} />
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-4 items-start">
        <div className="space-y-3">
          <Card title="Drag in blocks">
            <div className="grid grid-cols-2 gap-1.5">
              {EMAIL_BLOCKS.map(([type, label, Icon]) => (
                <PaletteItem
                  key={type}
                  type={type}
                  label={label}
                  icon={<Icon className="w-4 h-4 text-brand-600" />}
                  onAdd={() => insert(type)}
                />
              ))}
            </div>
            {Object.keys(info.sections).length > 0 && (
              <>
                <p className="text-[11px] font-semibold text-slate-500 mt-3 mb-1.5">Built-in sections</p>
                <div className="space-y-1.5">
                  {Object.entries(info.sections).map(([s, label]) => (
                    <PaletteItem
                      key={s}
                      type={`section:${s}`}
                      label={label}
                      disabled={placed.has(s)}
                      icon={<LayoutTemplate className="w-4 h-4 text-emerald-600" />}
                      onAdd={() => insert(`section:${s}`)}
                    />
                  ))}
                </div>
              </>
            )}
          </Card>
          <Card title="Email layout">
            <BlockList
              items={tpl.blocks}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onChange={(blocks) => setTpl({ ...tpl, blocks })}
              onDropNew={insert}
              renderRow={(b) => <span className="block truncate font-semibold text-slate-700">{emailBlockLabel(b, info.sections)}</span>}
            />
          </Card>
          {selected && (
            <Card
              title={emailBlockLabel(selected, info.sections).split(':')[0]}
              actions={
                <button
                  type="button"
                  aria-label="Remove block"
                  onClick={() => {
                    setTpl({ ...tpl, blocks: tpl.blocks.filter((b) => b.id !== selected.id) });
                    setSelectedId(null);
                  }}
                  className="p-1 text-slate-400 hover:text-rose-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              }
            >
              <div className="space-y-3">
                {(selected.type === 'heading' || selected.type === 'text' || selected.type === 'button') && (
                  <Field label={selected.type === 'button' ? 'Button label' : 'Text'}>
                    <textarea
                      className={`${inputClass} font-mono`}
                      rows={selected.type === 'text' ? 5 : 2}
                      value={selected.text ?? ''}
                      onChange={(e) => update(selected.id, { text: e.target.value })}
                      {...tokens.bind((v) => update(selected.id, { text: v }))}
                    />
                  </Field>
                )}
                {(selected.type === 'button' || selected.type === 'image') && (
                  <Field label="Link" hint="https://… or a dynamic value like {ticketPageUrl}">
                    <input
                      className={inputClass}
                      value={selected.url ?? ''}
                      onChange={(e) => update(selected.id, { url: e.target.value })}
                      {...tokens.bind((v) => update(selected.id, { url: v }))}
                    />
                  </Field>
                )}
                {selected.type === 'image' && (
                  <>
                    <ImageUpload value={selected.imageUrl} onChange={(url) => update(selected.id, { imageUrl: url ?? '' })} />
                    <NumberInput
                      label="Width (px)"
                      value={selected.width}
                      min={40}
                      max={600}
                      onChange={(n) => update(selected.id, { width: n })}
                    />
                  </>
                )}
                {(selected.type === 'heading' || selected.type === 'text' || selected.type === 'button') && (
                  <div className="grid grid-cols-2 gap-2">
                    <NumberInput
                      label="Size"
                      value={selected.fontSize}
                      min={10}
                      max={40}
                      onChange={(n) => update(selected.id, { fontSize: n })}
                    />
                    <ColorInput label="Text colour" value={selected.color} onChange={(c) => update(selected.id, { color: c })} />
                    {selected.type === 'button' && (
                      <ColorInput
                        label="Button colour"
                        value={selected.background}
                        onChange={(c) => update(selected.id, { background: c })}
                      />
                    )}
                  </div>
                )}
                {selected.type === 'divider' && (
                  <ColorInput label="Line colour" value={selected.color} onChange={(c) => update(selected.id, { color: c })} />
                )}
                {selected.type === 'spacer' && (
                  <NumberInput
                    label="Height (px)"
                    value={selected.height}
                    min={4}
                    max={120}
                    onChange={(n) => update(selected.id, { height: n })}
                  />
                )}
                {['heading', 'text', 'button', 'image'].includes(selected.type) && (
                  <AlignButtons value={selected.align} onChange={(a) => update(selected.id, { align: a })} />
                )}
                {selected.type === 'section' && (
                  <p className="text-xs text-slate-500">This part is filled in automatically for each booking. Drag it to move it.</p>
                )}
              </div>
            </Card>
          )}
        </div>
        <Card title="Live preview (sample data)">
          {previewError && <Notice message={{ kind: 'error', text: previewError }} />}
          {preview && (
            <>
              <p className="text-xs text-slate-500 mb-2">
                Subject: <span className="font-semibold text-slate-800">{preview.subject}</span>
              </p>
              <iframe
                title="Email preview"
                srcDoc={preview.html}
                sandbox=""
                className="w-full h-[75vh] border border-slate-200 rounded bg-white"
              />
            </>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100">
            <input
              className={`${inputClass} max-w-xs`}
              type="email"
              placeholder="Send a test to… (default: you)"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
            />
            <Button
              tone="secondary"
              disabled={test.busy}
              onClick={() =>
                test.run(
                  `/settings/email-templates/${info.key}/test`,
                  { body: { template: tpl, ...(testTo ? { to: testTo } : {}) } },
                  'Test email sent. Check the inbox.',
                )
              }
            >
              Send test email
            </Button>
            <Notice message={test.message} />
          </div>
        </Card>
      </div>
    </div>
  );
}

export function EmailTemplatesPage() {
  const { data, error, loading, setData } = useSa<{ templates: TemplateInfo[] }>('/settings/email-templates');
  const [active, setActive] = useState<string | null>(null);
  if (!data) return <Loading error={error} loading={loading} />;
  const current = data.templates.find((t) => t.key === active) ?? data.templates[0];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Email templates"
        subtitle="Design the emails customers get: drag blocks in, use dynamic values like {customerName}, and switch a template on when it's ready. Until then the standard email is sent."
      />
      <div className="flex flex-wrap gap-2" role="tablist">
        {data.templates.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === current.key}
            onClick={() => setActive(t.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${t.key === current.key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'}`}
          >
            {t.name}
            {t.template.enabled && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 align-middle" />}
          </button>
        ))}
      </div>
      <EmailEditor
        key={current.key}
        info={current}
        onSaved={(t) => setData({ templates: data.templates.map((x) => (x.key === t.key ? t : x)) })}
      />
    </div>
  );
}
