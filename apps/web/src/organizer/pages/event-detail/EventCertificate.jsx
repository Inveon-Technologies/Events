import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Award,
  Bold,
  Eye,
  Image as ImageIcon,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Type,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { ApiError, apiRequest, fetchCertificatePreview, uploadDesignImage } from '../../lib/api';
import CertificateCanvas from '../../components/certificate/CertificateCanvas';

// Organizer → event → Certificate: switch participation certificates on
// or off, and design the certificate by dragging fields on top of the
// organizer's own background. The footer (Supported By + Inveon) is fixed.

const TOKEN_HELP = {
  participant: 'Attendee name',
  event: 'Event name',
  date: 'Event date',
  year: 'Event year',
  organizer: 'Organizer name',
  tagline: 'Event tagline',
  venue: 'Venue',
  certificateNo: 'Certificate number',
};
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function venueOf(address) {
  return (address || '').split(',')[0].trim();
}

export default function EventCertificate() {
  const { id } = useParams();
  const { user } = useAuth();
  const { showToast } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [meta, setMeta] = useState(null); // fonts, tokens, footerTopPercent, defaultDesign, maxFields
  const [enabled, setEnabled] = useState(false);
  const [design, setDesign] = useState(null);
  const [savedJson, setSavedJson] = useState('');
  const [event, setEvent] = useState(null);
  const [organizer, setOrganizer] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [sampleName, setSampleName] = useState('Rahul Sharma');
  const [busy, setBusy] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiRequest(`/organizer/events/${id}/certificate`, { token: user?.token }),
      apiRequest(`/organizer/events/${id}`, { token: user?.token }),
      apiRequest('/organizer/profile', { token: user?.token }).catch(() => null),
    ])
      .then(([cert, ev, profile]) => {
        if (cancelled) return;
        setMeta(cert);
        setEnabled(cert.enabled);
        setDesign(cert.design);
        setSavedJson(JSON.stringify(cert.design));
        setEvent(ev);
        setOrganizer(profile);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Could not load the certificate.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, user?.token]);

  const values = useMemo(() => {
    const date = event?.eventDate ? new Date(event.eventDate) : new Date();
    return {
      participant: sampleName || 'Participant Name',
      event: event?.title || 'Event Name',
      year: date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric' }),
      date: date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }),
      organizer: organizer?.name || user?.orgName || 'Organizer',
      tagline: event?.shortDescription || '',
      venue: venueOf(event?.venueAddress),
      certificateNo: 'INV-CRT-2026-SAMPLE-01',
    };
  }, [event, organizer, sampleName, user?.orgName]);

  if (loading) return <p className="text-xs text-slate-500">Loading certificate…</p>;
  if (loadError || !design) return <p className="text-sm text-rose-600">{loadError || 'Certificate not available.'}</p>;

  const dirty = JSON.stringify(design) !== savedJson;
  const footerTop = meta.footerTopPercent;
  const selected = design.fields.find((f) => f.id === selectedId) || null;

  function updateField(fieldId, patch) {
    setDesign((d) => ({ ...d, fields: d.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)) }));
  }

  function addField(kind) {
    if (design.fields.length >= meta.maxFields) {
      showToast(`A certificate can have at most ${meta.maxFields} fields.`, 'error');
      return;
    }
    const newId = `${kind}${Date.now()}`;
    const field =
      kind === 'text'
        ? {
            id: newId,
            kind: 'text',
            label: 'Custom text',
            x: 30,
            y: 45,
            w: 40,
            h: 5,
            text: 'Your text',
            fontFamily: 'Montserrat',
            fontSize: 16,
            color: '#1f2937',
            bold: false,
            align: 'center',
            letterSpacing: 0,
            uppercase: false,
          }
        : { id: newId, kind: 'image', label: 'Image', x: 42, y: 40, w: 16, h: 12, imageUrl: null, source: null };
    setDesign((d) => ({ ...d, fields: [...d.fields, field] }));
    setSelectedId(newId);
  }

  function removeField(fieldId) {
    setDesign((d) => ({ ...d, fields: d.fields.filter((f) => f.id !== fieldId) }));
    setSelectedId(null);
  }

  async function upload(file) {
    if (!file) return null;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      showToast('Use a JPEG, PNG or WebP image.', 'error');
      return null;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      showToast(`"${file.name}" is over the 10MB limit.`, 'error');
      return null;
    }
    setBusy('upload');
    try {
      return (await uploadDesignImage(file, user?.token)).url;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Upload failed — please try again.', 'error');
      return null;
    } finally {
      setBusy('');
    }
  }

  async function save(patch) {
    setBusy('save');
    try {
      const result = await apiRequest(`/organizer/events/${id}/certificate`, { method: 'PUT', token: user?.token, body: patch });
      setEnabled(result.enabled);
      if (patch.design !== undefined) {
        setDesign(result.design);
        setSavedJson(JSON.stringify(result.design));
      }
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not save the certificate.', 'error');
      return false;
    } finally {
      setBusy('');
    }
  }

  async function toggleEnabled() {
    const next = !enabled;
    if (await save({ enabled: next })) {
      showToast(
        next ? 'Certificates on — checked-in attendees will receive one after the event.' : 'Certificates switched off.',
        'success',
      );
    }
  }

  async function saveDesign() {
    if (await save({ design })) showToast('Certificate design saved', 'success');
  }

  async function showServerPreview() {
    setBusy('preview');
    try {
      const url = await fetchCertificatePreview(id, design, sampleName, user?.token);
      setPreviewUrl(url);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not render the preview.', 'error');
    } finally {
      setBusy('');
    }
  }

  function insertToken(token) {
    if (!selected || selected.kind !== 'text') return;
    updateField(selected.id, { text: `${selected.text || ''}{${token}}` });
  }

  const input =
    'w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500';

  return (
    <div className="space-y-4 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <NavLink
            to={`/organizer/events/${id}/dashboard`}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to event
          </NavLink>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2 mt-1">
            <Award className="w-5 h-5 text-amber-600" /> Participation certificate
          </h1>
          <p className="text-xs text-slate-500">{event?.title}</p>
        </div>
        <label className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-slate-200 bg-white cursor-pointer">
          <span className="text-xs">
            <span className="block font-bold text-slate-800">Send certificates</span>
            <span className="text-slate-500">To checked-in attendees, by email, WhatsApp and on their ticket page</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Send certificates"
            onClick={toggleEnabled}
            disabled={busy === 'save'}
            className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`}
            />
          </button>
        </label>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl border border-slate-200 bg-white">
        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 cursor-pointer">
          <Upload className="w-3.5 h-3.5" /> {design.backgroundUrl ? 'Change background' : 'Upload background layout'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            aria-label="Upload certificate background"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              const url = await upload(file);
              if (url) setDesign((d) => ({ ...d, backgroundUrl: url }));
            }}
          />
        </label>
        {design.backgroundUrl && (
          <button
            type="button"
            onClick={() => setDesign((d) => ({ ...d, backgroundUrl: null }))}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-100"
          >
            <X className="w-3.5 h-3.5" /> Use built-in frame
          </button>
        )}
        <span className="w-px h-5 bg-slate-200" />
        <button
          type="button"
          onClick={() => addField('text')}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-100"
        >
          <Type className="w-3.5 h-3.5" /> Add text
        </button>
        <button
          type="button"
          onClick={() => addField('image')}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-100"
        >
          <ImageIcon className="w-3.5 h-3.5" /> Add image
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Reset to the default certificate layout? Your changes will be lost.')) {
              setDesign(meta.defaultDesign);
              setSelectedId(null);
            }
          }}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-100"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset layout
        </button>
        <div className="ml-auto flex items-center gap-2">
          <input
            value={sampleName}
            onChange={(e) => setSampleName(e.target.value)}
            aria-label="Sample participant name"
            placeholder="Sample name"
            className="w-36 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg"
          />
          <button
            type="button"
            onClick={showServerPreview}
            disabled={busy === 'preview'}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 hover:bg-slate-50"
          >
            <Eye className="w-3.5 h-3.5" /> {busy === 'preview' ? 'Rendering…' : 'Preview as PDF'}
          </button>
          <button
            type="button"
            onClick={saveDesign}
            disabled={!dirty || busy === 'save'}
            className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" /> {dirty ? 'Save design' : 'Saved'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
        <div className="space-y-2">
          <CertificateCanvas
            design={design}
            values={values}
            organizerLogoUrl={organizer?.logoUrl || null}
            partners={event?.partners || []}
            footerTop={footerTop}
            editable
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChangeField={updateField}
          />
          <p className="text-[11px] text-slate-500">
            Drag fields to move them; drag the blue corner to resize. The footer — Supported By (this event's partners from the ticket
            design) and Inveon as technology & booking partner — is added to every certificate and can't be changed.{' '}
            {busy === 'upload' && 'Uploading…'}
          </p>
        </div>

        <aside className="rounded-xl border border-slate-200 bg-white p-3 space-y-3 xl:sticky xl:top-4">
          {selected ? (
            <>
              <div className="flex items-center justify-between">
                <input
                  value={selected.label}
                  onChange={(e) => updateField(selected.id, { label: e.target.value })}
                  aria-label="Field name"
                  className="text-sm font-bold text-slate-900 bg-transparent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeField(selected.id)}
                  aria-label="Remove field"
                  className="p-1 text-slate-400 hover:text-rose-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {selected.kind === 'text' ? (
                <>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Text
                    <textarea
                      value={selected.text || ''}
                      rows={3}
                      onChange={(e) => updateField(selected.id, { text: e.target.value })}
                      aria-label="Field text"
                      className={`${input} mt-1 font-mono`}
                    />
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {meta.tokens.map((t) => (
                      <button
                        key={t}
                        type="button"
                        title={TOKEN_HELP[t]}
                        onClick={() => insertToken(t)}
                        className="px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 text-[10px] font-mono hover:bg-brand-100"
                      >
                        {`{${t}}`}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[11px] font-semibold text-slate-600 col-span-2">
                      Font
                      <select
                        value={selected.fontFamily}
                        onChange={(e) => updateField(selected.id, { fontFamily: e.target.value })}
                        aria-label="Font"
                        className={`${input} mt-1`}
                        style={{ fontFamily: selected.fontFamily }}
                      >
                        {meta.fonts.map((f) => (
                          <option key={f} value={f} style={{ fontFamily: f }}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[11px] font-semibold text-slate-600">
                      Size
                      <input
                        type="number"
                        min={6}
                        max={160}
                        value={selected.fontSize}
                        onChange={(e) => updateField(selected.id, { fontSize: Number(e.target.value) || 6 })}
                        aria-label="Font size"
                        className={`${input} mt-1`}
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-slate-600">
                      Colour
                      <input
                        type="color"
                        value={selected.color}
                        onChange={(e) => updateField(selected.id, { color: e.target.value })}
                        aria-label="Colour"
                        className="mt-1 w-full h-[30px] rounded-md border border-slate-200"
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-slate-600">
                      Letter spacing
                      <input
                        type="number"
                        min={0}
                        max={30}
                        step={0.5}
                        value={selected.letterSpacing}
                        onChange={(e) => updateField(selected.id, { letterSpacing: Number(e.target.value) || 0 })}
                        aria-label="Letter spacing"
                        className={`${input} mt-1`}
                      />
                    </label>
                    <div className="text-[11px] font-semibold text-slate-600">
                      Style
                      <div className="mt-1 flex gap-1">
                        <button
                          type="button"
                          aria-pressed={selected.bold}
                          aria-label="Bold"
                          onClick={() => updateField(selected.id, { bold: !selected.bold })}
                          className={`p-1.5 rounded-md border ${selected.bold ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-200'}`}
                        >
                          <Bold className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-pressed={selected.uppercase}
                          aria-label="Uppercase"
                          onClick={() => updateField(selected.id, { uppercase: !selected.uppercase })}
                          className={`px-1.5 rounded-md border text-[10px] font-bold ${selected.uppercase ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-200'}`}
                        >
                          AA
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1" role="group" aria-label="Alignment">
                    {[
                      ['left', AlignLeft],
                      ['center', AlignCenter],
                      ['right', AlignRight],
                    ].map(([a, IconCmp]) => (
                      <button
                        key={a}
                        type="button"
                        aria-label={`Align ${a}`}
                        aria-pressed={selected.align === a}
                        onClick={() => updateField(selected.id, { align: a })}
                        className={`flex-1 py-1.5 rounded-md border flex justify-center ${selected.align === a ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-200'}`}
                      >
                        <IconCmp className="w-3.5 h-3.5" />
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white cursor-pointer">
                    <Upload className="w-3.5 h-3.5" /> {selected.imageUrl ? 'Change image' : 'Upload image'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      aria-label="Upload field image"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        const url = await upload(file);
                        if (url) updateField(selected.id, { imageUrl: url });
                      }}
                    />
                  </label>
                  {selected.imageUrl && (
                    <button
                      type="button"
                      onClick={() => updateField(selected.id, { imageUrl: null })}
                      className="block text-[11px] text-slate-500 hover:text-rose-600"
                    >
                      Remove image
                    </button>
                  )}
                  <label className="flex items-center gap-2 text-[11px] text-slate-600">
                    <input
                      type="checkbox"
                      checked={selected.source === 'organizerLogo'}
                      onChange={(e) => updateField(selected.id, { source: e.target.checked ? 'organizerLogo' : null })}
                    />
                    Use my organization logo when no image is uploaded
                  </label>
                  <p className="text-[11px] text-slate-500">Use a PNG with a transparent background for signatures and logos.</p>
                </div>
              )}

              <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-slate-100">
                {['x', 'y', 'w', 'h'].map((k) => (
                  <label key={k} className="text-[10px] font-semibold text-slate-500 uppercase">
                    {k}
                    <input
                      type="number"
                      step={0.5}
                      value={selected[k]}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v)) updateField(selected.id, { [k]: v });
                      }}
                      aria-label={`Position ${k}`}
                      className={`${input} mt-0.5 px-1.5`}
                    />
                  </label>
                ))}
              </div>
              <button type="button" onClick={() => setSelectedId(null)} className="text-[11px] text-slate-500 hover:text-slate-800">
                ← All fields
              </button>
            </>
          ) : (
            <>
              <p className="text-xs font-bold text-slate-900">
                Fields{' '}
                <span className="font-normal text-slate-400">
                  ({design.fields.length}/{meta.maxFields})
                </span>
              </p>
              <ul className="space-y-1 max-h-[440px] overflow-y-auto">
                {design.fields.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(f.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs hover:bg-slate-50"
                    >
                      {f.kind === 'image' ? (
                        <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <Type className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span className="flex-1 truncate">{f.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => addField('text')}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-dashed border-slate-300 text-xs text-slate-600 hover:bg-slate-50"
                >
                  <Plus className="w-3 h-3" /> Text
                </button>
                <button
                  type="button"
                  onClick={() => addField('image')}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-dashed border-slate-300 text-xs text-slate-600 hover:bg-slate-50"
                >
                  <Plus className="w-3 h-3" /> Image
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Placeholders like <code className="font-mono">{'{participant}'}</code> are filled in for each attendee.
              </p>
            </>
          )}
        </aside>
      </div>

      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4"
          role="dialog"
          aria-label="Certificate preview"
          onClick={() => setPreviewUrl(null)}
        >
          <div className="relative max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
            <img src={previewUrl} alt="Certificate preview" className="w-full rounded-lg shadow-2xl bg-white" />
            <button
              type="button"
              onClick={() => setPreviewUrl(null)}
              aria-label="Close preview"
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white shadow flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
            <p className="mt-2 text-center text-xs text-white/80">
              Exactly as attendees receive it (the dashed boxes and footer placeholders show only in your preview).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
