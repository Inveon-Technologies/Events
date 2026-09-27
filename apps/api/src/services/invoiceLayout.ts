import { getStoredSetting } from './platformSettings';

// The invoice's layout, designed in the super admin portal (Settings →
// Invoice designer): its sections in any order, each shown or hidden,
// with editable headings, plus custom text blocks and spacers. Text can
// use dynamic values like {customerName} or {totalAmount}, filled in per
// booking by invoice.ts. The footer stays pinned to the bottom of the page.

export const INVOICE_LAYOUT_SETTING = 'invoiceLayout';
export const MAX_INVOICE_BLOCKS = 24;

export const INVOICE_SECTIONS = ['header', 'parties', 'event', 'items', 'payment', 'terms'] as const;
export type InvoiceBuiltInSection = (typeof INVOICE_SECTIONS)[number];
export type InvoiceSectionType = InvoiceBuiltInSection | 'text' | 'spacer';

export const INVOICE_TOKENS: Record<string, string> = {
  customerName: 'Customer name',
  customerEmail: 'Customer email',
  customerPhone: 'Customer phone',
  eventName: 'Event name',
  eventDate: 'Event date',
  eventTime: 'Event time',
  venue: 'Venue',
  organizerName: 'Organizer name',
  bookingReference: 'Booking ID',
  invoiceNumber: 'Invoice number',
  invoiceDate: 'Invoice date',
  totalAmount: 'Total amount',
  ticketCount: 'Number of tickets',
  platformName: 'Platform name',
  companyName: 'Company name',
  supportEmail: 'Support email',
};

export interface InvoiceBlock {
  id: string;
  type: InvoiceSectionType;
  visible: boolean;
  // payment / terms: heading override; text: optional heading.
  title?: string;
  // text
  text?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  // spacer
  height?: number;
}

export interface InvoiceLayout {
  version: 1;
  blocks: InvoiceBlock[];
}

export class InvoiceLayoutError extends Error {}

export function defaultInvoiceLayout(): InvoiceLayout {
  return { version: 1, blocks: INVOICE_SECTIONS.map((type) => ({ id: type, type, visible: true })) };
}

export function fillInvoiceText(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in values ? values[key] : m));
}

const clamp = (n: unknown, min: number, max: number, fallback: number): number => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
};

export function sanitizeInvoiceLayout(input: unknown): InvoiceLayout {
  if (!input || typeof input !== 'object' || !Array.isArray((input as InvoiceLayout).blocks)) {
    throw new InvoiceLayoutError('Invoice layout is missing');
  }
  const raw = (input as { blocks: unknown[] }).blocks;
  if (raw.length > MAX_INVOICE_BLOCKS) throw new InvoiceLayoutError(`An invoice can have at most ${MAX_INVOICE_BLOCKS} blocks`);
  const seenSections = new Set<string>();
  const seenIds = new Set<string>();
  const blocks: InvoiceBlock[] = [];
  raw.forEach((b, i) => {
    const r = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
    const type = r.type as InvoiceSectionType;
    const builtIn = (INVOICE_SECTIONS as readonly string[]).includes(type as string);
    if (!builtIn && type !== 'text' && type !== 'spacer') throw new InvoiceLayoutError('Unknown invoice block');
    if (builtIn) {
      if (seenSections.has(type)) throw new InvoiceLayoutError('Each invoice section can appear only once');
      seenSections.add(type);
    }
    let id = typeof r.id === 'string' && /^[\w-]{1,40}$/.test(r.id) ? r.id : `${type}${i + 1}`;
    while (seenIds.has(id)) id = `${id}x`;
    seenIds.add(id);
    const block: InvoiceBlock = { id, type, visible: r.visible !== false };
    if (typeof r.title === 'string' && r.title.trim() && (type === 'payment' || type === 'terms' || type === 'text')) {
      block.title = r.title.trim().slice(0, 80);
    }
    if (type === 'text') {
      block.text = typeof r.text === 'string' ? r.text.slice(0, 1500) : '';
      block.fontSize = clamp(r.fontSize, 6, 16, 8);
      block.color = typeof r.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.color) ? r.color : '#374151';
      block.bold = r.bold === true;
      block.align = r.align === 'center' || r.align === 'right' ? r.align : 'left';
    }
    if (type === 'spacer') block.height = clamp(r.height, 4, 120, 16);
    blocks.push(block);
  });
  // Sections left out of the submission stay on the invoice, hidden —
  // so every invoice still has them to turn back on.
  for (const type of INVOICE_SECTIONS) {
    if (!seenSections.has(type)) blocks.push({ id: type, type, visible: false });
  }
  if (!blocks.some((b) => b.visible && b.type === 'items')) {
    throw new InvoiceLayoutError('The item table must stay on the invoice');
  }
  return { version: 1, blocks };
}

export function getInvoiceLayout(): InvoiceLayout {
  const stored = getStoredSetting(INVOICE_LAYOUT_SETTING);
  if (stored) {
    try {
      return sanitizeInvoiceLayout(stored);
    } catch {
      // A broken saved layout never stops an invoice going out.
    }
  }
  return defaultInvoiceLayout();
}
