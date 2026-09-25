import React, { useState } from 'react';
import { Image as ImageIcon, Plus, Trash2, Upload, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ApiError, uploadDesignImage } from '../lib/api';

export const MAX_PARTNERS = 10;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ROLE_SUGGESTIONS = [
  'Title Sponsor',
  'Co-Sponsor',
  'Music Partner',
  'Media Partner',
  'Associate Partner',
  'Hospitality Partner',
  'Travel Partner',
  'Supported By',
];

// The organizer's ticket design for one event: the background behind the
// event title (ticket page, email, PDF, WhatsApp card) and up to 10
// Partners & Supporters. Images upload immediately and only their URLs
// live in the form, so nothing is lost if the event is saved later.
export default function TicketDesignEditor({ value, onChange }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(null); // 'background' | partner index
  const [error, setError] = useState('');
  const partners = value.partners || [];

  async function upload(file, target) {
    setError('');
    if (!file) return null;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setError('Use a JPEG, PNG or WebP image.');
      return null;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`"${file.name}" is over the 10MB limit.`);
      return null;
    }
    setBusy(target);
    try {
      return (await uploadDesignImage(file, user?.token)).url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed — please try again.');
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function handleBackground(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const url = await upload(file, 'background');
    if (url) onChange({ ...value, ticketBackgroundUrl: url });
  }

  function updatePartner(index, patch) {
    onChange({ ...value, partners: partners.map((p, i) => (i === index ? { ...p, ...patch } : p)) });
  }

  async function handleLogo(index, e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const url = await upload(file, index);
    if (url) updatePartner(index, { logoUrl: url });
  }

  function addPartner() {
    if (partners.length >= MAX_PARTNERS) return;
    onChange({ ...value, partners: [...partners, { id: `partner-${Date.now()}`, name: '', role: '', logoUrl: null }] });
  }

  function removePartner(index) {
    onChange({ ...value, partners: partners.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="block text-xs font-bold text-slate-700 mb-1">Ticket title background</p>
        <p className="text-[11px] text-slate-500 mb-2">
          Shown behind your event title on the ticket, email and PDF. A wide image (at least 1600×900) works best. If you skip this, your
          event's cover photo is used.
        </p>
        <div className="flex items-center gap-3">
          <div className="w-40 h-[90px] rounded-lg overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center shrink-0">
            {value.ticketBackgroundUrl ? (
              <img src={value.ticketBackgroundUrl} alt="Ticket background" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="w-6 h-6 text-slate-300" />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white cursor-pointer">
              <Upload className="w-3.5 h-3.5" />{' '}
              {busy === 'background' ? 'Uploading…' : value.ticketBackgroundUrl ? 'Change image' : 'Upload image'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleBackground}
                disabled={busy !== null}
                aria-label="Upload ticket background"
              />
            </label>
            {value.ticketBackgroundUrl && (
              <button
                type="button"
                onClick={() => onChange({ ...value, ticketBackgroundUrl: null })}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-red-600"
              >
                <X className="w-3.5 h-3.5" /> Use the cover photo instead
              </button>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-bold text-slate-700">
            Partners &amp; Supporters{' '}
            <span className="font-normal text-slate-400">
              ({partners.length}/{MAX_PARTNERS})
            </span>
          </p>
          <button
            type="button"
            onClick={addPartner}
            disabled={partners.length >= MAX_PARTNERS}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:text-brand-700 disabled:text-slate-300"
          >
            <Plus className="w-3 h-3" /> Add partner
          </button>
        </div>
        <p className="text-[11px] text-slate-500 mb-2">
          Sponsor and partner logos shown on every ticket and confirmation email. Leave empty if you have none — attendees then see only the
          Inveon technology partner strip.
        </p>
        <datalist id="partner-role-suggestions">
          {ROLE_SUGGESTIONS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <div className="space-y-2">
          {partners.map((p, i) => (
            <div
              key={p.id || i}
              className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50"
            >
              <label
                className="w-14 h-14 rounded-md border border-dashed border-slate-300 bg-white flex items-center justify-center overflow-hidden cursor-pointer shrink-0"
                title="Upload logo"
              >
                {busy === i ? (
                  <span className="text-[9px] text-slate-400">Uploading…</span>
                ) : p.logoUrl ? (
                  <img src={p.logoUrl} alt={`${p.name || 'Partner'} logo`} className="w-full h-full object-contain" />
                ) : (
                  <Upload className="w-4 h-4 text-slate-400" />
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => handleLogo(i, e)}
                  disabled={busy !== null}
                  aria-label={`Upload logo for partner ${i + 1}`}
                />
              </label>
              <input
                value={p.name}
                onChange={(e) => updatePartner(i, { name: e.target.value })}
                placeholder="Partner name"
                maxLength={80}
                aria-label={`Partner ${i + 1} name`}
                className="flex-1 min-w-[120px] px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <input
                value={p.role || ''}
                onChange={(e) => updatePartner(i, { role: e.target.value })}
                placeholder="Role, e.g. Media Partner"
                maxLength={60}
                list="partner-role-suggestions"
                aria-label={`Partner ${i + 1} role`}
                className="flex-1 min-w-[120px] px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={() => removePartner(i)}
                aria-label={`Remove partner ${i + 1}`}
                className="p-1.5 text-slate-400 hover:text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-[11px] text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
