import { isAcceptableImageUrl } from './designAssets';

// A participation certificate's layout, designed per event by the
// organizer in the drag-and-drop editor (organizer portal → event →
// Certificate) and rendered for every checked-in attendee
// (certificates.ts).
//
// Coordinates are percentages of the page (A4 landscape), so the editor
// and the server render the same layout at any size. Font sizes are in
// units per 1000 px of page width for the same reason. The bottom of the
// page (from FOOTER_TOP_PERCENT) is reserved for the fixed footer —
// Supported By partners + the Inveon technology / booking partners —
// which organizers can't move or remove.

export const FOOTER_TOP_PERCENT = 80;
export const MAX_CERTIFICATE_FIELDS = 40;

export const CERTIFICATE_FONTS = ['Cinzel', 'Playfair Display', 'Montserrat', 'Inter', 'Great Vibes'] as const;
export type CertificateFont = (typeof CERTIFICATE_FONTS)[number];

// Placeholders a text field may contain; filled in per attendee.
export const CERTIFICATE_TOKENS = ['participant', 'event', 'year', 'date', 'organizer', 'tagline', 'venue', 'certificateNo'] as const;

export interface CertificateField {
  id: string;
  kind: 'text' | 'image';
  label: string; // shown in the editor's field list
  x: number;
  y: number;
  w: number;
  h: number;
  // text
  text?: string;
  fontFamily?: CertificateFont;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  letterSpacing?: number;
  uppercase?: boolean;
  // image
  imageUrl?: string | null;
  // 'organizerLogo' shows the organizer's profile logo unless an image is uploaded.
  source?: 'organizerLogo' | null;
}

export interface CertificateDesign {
  version: 1;
  backgroundUrl: string | null; // null = the built-in frame
  fields: CertificateField[];
}

export class CertificateDesignError extends Error {}

const text = (f: Omit<CertificateField, 'kind'>): CertificateField => ({
  kind: 'text',
  fontFamily: 'Montserrat',
  fontSize: 15,
  color: '#1f2937',
  bold: false,
  align: 'center',
  letterSpacing: 0,
  uppercase: false,
  ...f,
});

// The layout of the approved sample: organizer logo and name, CERTIFICATE
// OF PARTICIPATION, the attendee's name, event, tagline, date,
// certificate number and two signatures.
export function defaultCertificateDesign(): CertificateDesign {
  return {
    version: 1,
    backgroundUrl: null,
    fields: [
      { id: 'logo', kind: 'image', label: 'Organizer logo', x: 44.5, y: 5, w: 11, h: 13, imageUrl: null, source: 'organizerLogo' },
      text({
        id: 'organizer',
        label: 'Organizer name',
        x: 20,
        y: 18.5,
        w: 60,
        h: 4,
        text: '{organizer}',
        fontSize: 15,
        bold: true,
        uppercase: true,
        letterSpacing: 5,
        color: '#0b1c3f',
      }),
      text({
        id: 'title',
        label: 'Title',
        x: 15,
        y: 22.5,
        w: 70,
        h: 10,
        text: 'CERTIFICATE',
        fontFamily: 'Cinzel',
        fontSize: 60,
        bold: true,
        color: '#0b1c3f',
      }),
      text({
        id: 'subtitle',
        label: 'Subtitle',
        x: 15,
        y: 32.5,
        w: 70,
        h: 5,
        text: 'OF PARTICIPATION',
        fontFamily: 'Cinzel',
        fontSize: 24,
        bold: true,
        letterSpacing: 6,
        color: '#b7862c',
      }),
      text({
        id: 'presented',
        label: 'Presented to',
        x: 20,
        y: 39,
        w: 60,
        h: 4,
        text: 'This certificate is proudly presented to',
        fontSize: 15,
        color: '#334155',
      }),
      text({
        id: 'participant',
        label: 'Participant name',
        x: 10,
        y: 43,
        w: 80,
        h: 8,
        text: '{participant}',
        fontFamily: 'Cinzel',
        fontSize: 46,
        bold: true,
        uppercase: true,
        color: '#0b1c3f',
      }),
      text({
        id: 'recognition',
        label: 'Recognition line',
        x: 20,
        y: 51.5,
        w: 60,
        h: 4,
        text: 'in recognition of their participation in',
        fontSize: 15,
        color: '#334155',
      }),
      text({
        id: 'event',
        label: 'Event name',
        x: 10,
        y: 55,
        w: 80,
        h: 7,
        text: '{event}',
        fontFamily: 'Playfair Display',
        fontSize: 38,
        bold: true,
        color: '#0b1c3f',
      }),
      text({
        id: 'tagline',
        label: 'Tagline',
        x: 15,
        y: 61.5,
        w: 70,
        h: 3,
        text: '{tagline}',
        fontSize: 14,
        letterSpacing: 3,
        color: '#334155',
      }),
      text({
        id: 'thanks',
        label: 'Message',
        x: 22,
        y: 64.8,
        w: 56,
        h: 3,
        text: 'Thank you for being part of this celebration organized by {organizer}.',
        fontSize: 14,
        color: '#334155',
      }),
      text({
        id: 'date',
        label: 'Date',
        x: 38,
        y: 73,
        w: 24,
        h: 3.5,
        text: '{date}',
        fontSize: 16,
        bold: true,
        uppercase: true,
        color: '#0b1c3f',
      }),
      text({
        id: 'certno',
        label: 'Certificate number',
        x: 66,
        y: 5.5,
        w: 27,
        h: 6,
        text: 'Certificate No.\n{certificateNo}',
        fontSize: 12,
        align: 'right',
        color: '#334155',
      }),
      { id: 'sign1', kind: 'image', label: 'Signature 1', x: 9, y: 68, w: 20, h: 5.5, imageUrl: null, source: null },
      text({
        id: 'sign1name',
        label: 'Signature 1 name',
        x: 6,
        y: 73.6,
        w: 26,
        h: 3,
        text: '{organizer}',
        fontSize: 14,
        bold: true,
        color: '#0b1c3f',
      }),
      text({
        id: 'sign1role',
        label: 'Signature 1 role',
        x: 6,
        y: 76.6,
        w: 26,
        h: 3,
        text: 'Event Organizer',
        fontSize: 13,
        color: '#334155',
      }),
      { id: 'sign2', kind: 'image', label: 'Signature 2', x: 71, y: 68, w: 20, h: 5.5, imageUrl: null, source: null },
      text({
        id: 'sign2name',
        label: 'Signature 2 name',
        x: 68,
        y: 73.6,
        w: 26,
        h: 3,
        text: 'Event Coordinator',
        fontSize: 14,
        bold: true,
        color: '#0b1c3f',
      }),
      text({ id: 'sign2role', label: 'Signature 2 role', x: 68, y: 76.6, w: 26, h: 3, text: '', fontSize: 13, color: '#334155' }),
    ],
  };
}

const clamp = (n: unknown, min: number, max: number, fallback: number): number => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v * 100) / 100)) : fallback;
};

// Accepts the editor's JSON and returns a clean design, or throws with a
// message the organizer can act on. Positions are kept on the page and
// above the fixed footer.
export function sanitizeCertificateDesign(input: unknown): CertificateDesign {
  if (!input || typeof input !== 'object') throw new CertificateDesignError('Certificate design is missing');
  const raw = input as Record<string, unknown>;

  let backgroundUrl: string | null = null;
  if (typeof raw.backgroundUrl === 'string' && raw.backgroundUrl.trim()) {
    backgroundUrl = raw.backgroundUrl.trim();
    if (!isAcceptableImageUrl(backgroundUrl))
      throw new CertificateDesignError("The certificate background isn't a valid image — upload it again");
  }

  if (!Array.isArray(raw.fields)) throw new CertificateDesignError('Certificate fields are missing');
  if (raw.fields.length > MAX_CERTIFICATE_FIELDS)
    throw new CertificateDesignError(`A certificate can have at most ${MAX_CERTIFICATE_FIELDS} fields`);

  const seen = new Set<string>();
  const fields = raw.fields.map((f, i): CertificateField => {
    const r = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
    const kind = r.kind === 'image' ? 'image' : 'text';
    let id = typeof r.id === 'string' && /^[\w-]{1,40}$/.test(r.id) ? r.id : `field${i + 1}`;
    while (seen.has(id)) id = `${id}x`;
    seen.add(id);
    const w = clamp(r.w, 2, 100, 30);
    const h = clamp(r.h, 1, FOOTER_TOP_PERCENT, 5);
    const base = {
      id,
      kind,
      label: typeof r.label === 'string' ? r.label.slice(0, 60) : kind === 'image' ? 'Image' : 'Text',
      x: clamp(r.x, 0, 100 - w, 10),
      y: clamp(r.y, 0, FOOTER_TOP_PERCENT - h, 10),
      w,
      h,
    } as const;
    if (kind === 'image') {
      const url = typeof r.imageUrl === 'string' && r.imageUrl.trim() ? r.imageUrl.trim() : null;
      if (url && !isAcceptableImageUrl(url)) throw new CertificateDesignError(`"${base.label}" isn't a valid image — upload it again`);
      return { ...base, imageUrl: url, source: r.source === 'organizerLogo' ? 'organizerLogo' : null };
    }
    const color = typeof r.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.color) ? r.color : '#1f2937';
    return {
      ...base,
      text: typeof r.text === 'string' ? r.text.slice(0, 500) : '',
      fontFamily: CERTIFICATE_FONTS.includes(r.fontFamily as CertificateFont) ? (r.fontFamily as CertificateFont) : 'Montserrat',
      fontSize: clamp(r.fontSize, 6, 160, 15),
      color,
      bold: r.bold === true,
      align: r.align === 'left' || r.align === 'right' ? r.align : 'center',
      letterSpacing: clamp(r.letterSpacing, 0, 30, 0),
      uppercase: r.uppercase === true,
    };
  });

  return { version: 1, backgroundUrl, fields };
}

export interface CertificateValues {
  participant: string;
  event: string;
  year: string;
  date: string;
  organizer: string;
  tagline: string;
  venue: string;
  certificateNo: string;
}

export function fillCertificateText(template: string, values: CertificateValues): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in values ? values[key as keyof CertificateValues] : m));
}

// INV-BKG-2026-X07C1FHF + ticket #1 → INV-CRT-2026-X07C1FHF-01
export function certificateNumber(bookingReference: string, index: number): string {
  return `${bookingReference.replace(/-BKG-/, '-CRT-')}-${String(index + 1).padStart(2, '0')}`;
}
