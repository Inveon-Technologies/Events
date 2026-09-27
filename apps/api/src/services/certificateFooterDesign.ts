import { isAcceptableImageUrl } from './designAssets';
import { CERTIFICATE_FONTS, CertificateDesignError, FOOTER_TOP_PERCENT, type CertificateFont } from './certificateDesign';
import { getCertificateFooter, getStoredSetting, type CertificateFooterSettings } from './platformSettings';

// The certificate footer band (from FOOTER_TOP_PERCENT to the bottom of
// the page), designed by Inveon staff in the super admin portal by
// dragging fields — the same editor model as an event's certificate
// (certificateDesign.ts): positions are % of the whole page, font sizes
// are per 1000 px of page width. Organizers can't change it.
//
// Field kinds beyond text/image:
//   - partners:     the event's Supported By partner logos, laid out in a
//                   row inside the box (empty when the event has none)
//   - platformMark: the drawn Inveon mark, fitted inside the box
// A text field with onlyWithPartners is hidden when the event has no
// partners (the "SUPPORTED BY" heading).

export const MAX_FOOTER_FIELDS = 24;
export const FOOTER_DESIGN_SETTING = 'certificateFooterDesign';

export interface FooterField {
  id: string;
  kind: 'text' | 'image' | 'partners' | 'platformMark';
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  fontFamily?: CertificateFont;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  letterSpacing?: number;
  uppercase?: boolean;
  imageUrl?: string | null;
  onlyWithPartners?: boolean;
}

export interface CertificateFooterDesign {
  version: 1;
  fields: FooterField[];
}

const text = (f: Omit<FooterField, 'kind'>): FooterField => ({
  kind: 'text',
  fontFamily: 'Montserrat',
  fontSize: 7,
  color: '#334155',
  bold: true,
  align: 'center',
  letterSpacing: 1.6,
  uppercase: false,
  ...f,
});

// Reproduces the footer as it looked before it became designable, from
// the labels already saved (Settings → Certificate footer), so nothing
// changes on existing certificates until staff edit the design.
export function defaultFooterDesign(footer: CertificateFooterSettings = getCertificateFooter()): CertificateFooterDesign {
  const partnerColumn = (prefix: 'tech' | 'booking', centerX: number, label: string, name: string, tagline: string): FooterField[] => {
    const fields: FooterField[] = [
      text({ id: `${prefix}Label`, label: `${label} (label)`, x: centerX - 11, y: 90.6, w: 22, h: 1.6, text: label, fontSize: 6.8 }),
    ];
    if (footer.logoUrl) {
      fields.push({
        id: `${prefix}Logo`,
        kind: 'image',
        label: `${label} logo`,
        x: centerX - 4,
        y: 91.9,
        w: 8,
        h: 3.2,
        imageUrl: footer.logoUrl,
      });
    } else {
      fields.push(
        { id: `${prefix}Mark`, kind: 'platformMark', label: `${label} mark`, x: centerX - 3.4, y: 92.1, w: 1.8, h: 2.55 },
        text({
          id: `${prefix}Name`,
          label: `${label} name`,
          x: centerX - 1.4,
          y: 92.2,
          w: 12,
          h: 2.2,
          text: name,
          fontSize: 11.2,
          color: '#0f172a',
          align: 'left',
          letterSpacing: 0.7,
        }),
        text({
          id: `${prefix}Tagline`,
          label: `${label} tagline`,
          x: centerX - 1.35,
          y: 94,
          w: 12,
          h: 1,
          text: tagline,
          fontSize: 4,
          color: '#0050cb',
          align: 'left',
          letterSpacing: 1.6,
        }),
      );
    }
    return fields;
  };
  return {
    version: 1,
    fields: [
      text({
        id: 'supportedBy',
        label: 'Partners heading',
        x: 30,
        y: 81.5,
        w: 40,
        h: 1.6,
        text: footer.supportedByLabel,
        fontSize: 8.2,
        color: '#0b1c3f',
        letterSpacing: 2,
        onlyWithPartners: true,
      }),
      { id: 'partners', kind: 'partners', label: 'Event partners', x: 10, y: 83.3, w: 80, h: 6.2 },
      ...partnerColumn('tech', 39, footer.technologyPartnerLabel, footer.technologyPartnerName, footer.technologyPartnerTagline),
      ...partnerColumn('booking', 61, footer.bookingPartnerLabel, footer.bookingPartnerName, footer.bookingPartnerTagline),
    ],
  };
}

// The saved design, or the default built from the footer labels.
export function getCertificateFooterDesign(): CertificateFooterDesign {
  const stored = getStoredSetting(FOOTER_DESIGN_SETTING);
  if (stored && typeof stored === 'object' && Array.isArray((stored as CertificateFooterDesign).fields)) {
    try {
      return sanitizeFooterDesign(stored);
    } catch {
      // Fall through to the default rather than breaking certificates.
    }
  }
  return defaultFooterDesign();
}

const clamp = (n: unknown, min: number, max: number, fallback: number): number => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v * 100) / 100)) : fallback;
};

export function sanitizeFooterDesign(input: unknown): CertificateFooterDesign {
  if (!input || typeof input !== 'object') throw new CertificateDesignError('Footer design is missing');
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.fields)) throw new CertificateDesignError('Footer fields are missing');
  if (raw.fields.length > MAX_FOOTER_FIELDS) throw new CertificateDesignError(`The footer can have at most ${MAX_FOOTER_FIELDS} fields`);
  const band = 100 - FOOTER_TOP_PERCENT;
  const seen = new Set<string>();
  const fields = raw.fields.map((f, i): FooterField => {
    const r = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
    const kind: FooterField['kind'] =
      r.kind === 'image' || r.kind === 'partners' || r.kind === 'platformMark' ? (r.kind as FooterField['kind']) : 'text';
    let id = typeof r.id === 'string' && /^[\w-]{1,40}$/.test(r.id) ? r.id : `field${i + 1}`;
    while (seen.has(id)) id = `${id}x`;
    seen.add(id);
    const w = clamp(r.w, 1, 100, 20);
    const h = clamp(r.h, 0.5, band, 2);
    const base = {
      id,
      kind,
      label: typeof r.label === 'string' ? r.label.slice(0, 60) : kind,
      x: clamp(r.x, 0, 100 - w, 10),
      y: clamp(r.y, FOOTER_TOP_PERCENT, 100 - h, FOOTER_TOP_PERCENT + 1),
      w,
      h,
    };
    if (kind === 'partners' || kind === 'platformMark') return base;
    if (kind === 'image') {
      const url = typeof r.imageUrl === 'string' && r.imageUrl.trim() ? r.imageUrl.trim() : null;
      if (url && !isAcceptableImageUrl(url)) throw new CertificateDesignError(`"${base.label}" isn't a valid image — upload it again`);
      return { ...base, imageUrl: url };
    }
    return {
      ...base,
      text: typeof r.text === 'string' ? r.text.slice(0, 300) : '',
      fontFamily: CERTIFICATE_FONTS.includes(r.fontFamily as CertificateFont) ? (r.fontFamily as CertificateFont) : 'Montserrat',
      fontSize: clamp(r.fontSize, 3, 60, 7),
      color: typeof r.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.color) ? r.color : '#334155',
      bold: r.bold === true,
      align: r.align === 'left' || r.align === 'right' ? r.align : 'center',
      letterSpacing: clamp(r.letterSpacing, 0, 30, 0),
      uppercase: r.uppercase === true,
      onlyWithPartners: r.onlyWithPartners === true,
    };
  });
  return { version: 1, fields };
}
