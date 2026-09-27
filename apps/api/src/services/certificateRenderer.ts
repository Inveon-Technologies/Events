import path from 'node:path';
import { getCertificateFooterDesign, type CertificateFooterDesign, type FooterField } from './certificateFooterDesign';
import { createCanvas, GlobalFonts, loadImage, Path2D, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import PDFDocument from 'pdfkit';
import { FONT_DIR } from './canvasKit';
import { loadStoredImage } from './designAssets';
import { logger } from '../logger';
import {
  fillCertificateText,
  FOOTER_TOP_PERCENT,
  type CertificateDesign,
  type CertificateField,
  type CertificateValues,
} from './certificateDesign';

// Draws a certificate from its design (certificateDesign.ts): the
// organizer's background (or the built-in frame), every field at its
// percentage position, then the fixed footer — Supported By partners and
// the Inveon technology / booking partners. One PNG per attendee; the
// PDF is one A4-landscape page per attendee.

export const CERT_W = 1754; // A4 landscape at 150 dpi
export const CERT_H = 1240;

let fontsReady = false;
function registerCertificateFonts(): void {
  if (fontsReady) return;
  const dir = path.join(FONT_DIR, 'certificate');
  const add = (file: string, family: string) => GlobalFonts.registerFromPath(path.join(dir, file), family);
  add('cinzel-latin-400-normal.woff2', 'Cinzel');
  add('cinzel-latin-700-normal.woff2', 'Cinzel');
  add('playfair-display-latin-400-normal.woff2', 'Playfair Display');
  add('playfair-display-latin-700-normal.woff2', 'Playfair Display');
  add('montserrat-latin-400-normal.woff2', 'Montserrat');
  add('montserrat-latin-700-normal.woff2', 'Montserrat');
  add('great-vibes-latin-400-normal.woff2', 'Great Vibes');
  GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Inter_400Regular.ttf'), 'Inter');
  GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Inter_700Bold.ttf'), 'Inter');
  fontsReady = true;
}

export interface CertificatePartner {
  name: string;
  role: string | null;
  logoUrl: string | null;
}

export interface CertificateAssets {
  background: Image | null;
  organizerLogo: Image | null;
  images: Map<string, Image>; // field id → uploaded image
  partners: { name: string; role: string | null; logo: Image | null }[];
  // The footer band's design and its uploaded images (Settings →
  // Certificate footer in the super admin portal).
  footer?: { design: CertificateFooterDesign; images: Map<string, Image> };
}

export async function loadFooterAssets(design: CertificateFooterDesign = getCertificateFooterDesign()) {
  const images = new Map<string, Image>();
  for (const f of design.fields) {
    if (f.kind === 'image' && f.imageUrl) {
      // eslint-disable-next-line no-await-in-loop
      const img = await image(f.imageUrl);
      if (img) images.set(f.id, img);
    }
  }
  return { design, images };
}

async function image(url: string | null | undefined): Promise<Image | null> {
  const buf = await loadStoredImage(url);
  if (!buf) return null;
  try {
    return await loadImage(buf);
  } catch (err) {
    logger.warn({ err, url }, 'Unreadable certificate image');
    return null;
  }
}

// Loaded once per event, reused for every attendee.
export async function loadCertificateAssets(
  design: CertificateDesign,
  organizerLogoUrl: string | null,
  partners: CertificatePartner[],
): Promise<CertificateAssets> {
  const images = new Map<string, Image>();
  for (const f of design.fields) {
    if (f.kind === 'image' && f.imageUrl) {
      // eslint-disable-next-line no-await-in-loop
      const img = await image(f.imageUrl);
      if (img) images.set(f.id, img);
    }
  }
  return {
    background: await image(design.backgroundUrl),
    organizerLogo: await image(organizerLogoUrl),
    images,
    partners: await Promise.all(partners.map(async (p) => ({ name: p.name, role: p.role, logo: await image(p.logoUrl) }))),
    footer: await loadFooterAssets(),
  };
}

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function contain(ctx: SKRSContext2D, img: Image, x: number, y: number, w: number, h: number): void {
  const s = Math.min(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function cover(ctx: SKRSContext2D, img: Image, w: number, h: number): void {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h);
}

// Cream page, navy border, gold rules and corner diamonds — used when the
// organizer hasn't uploaded a background.
export function drawBuiltInFrame(ctx: SKRSContext2D, W: number, H: number): void {
  ctx.fillStyle = '#fbf7ee';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, W * 0.7);
  glow.addColorStop(0, 'rgba(255,255,255,0.9)');
  glow.addColorStop(1, 'rgba(234,221,190,0.55)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const b = W * 0.022;
  ctx.fillStyle = '#0b1c3f';
  ctx.fillRect(0, 0, W, b);
  ctx.fillRect(0, H - b, W, b);
  ctx.fillRect(0, 0, b, H);
  ctx.fillRect(W - b, 0, b, H);
  ctx.strokeStyle = '#c8a24a';
  ctx.lineWidth = W * 0.0035;
  ctx.strokeRect(b * 1.6, b * 1.6, W - b * 3.2, H - b * 3.2);
  ctx.lineWidth = W * 0.0012;
  ctx.strokeRect(b * 2.1, b * 2.1, W - b * 4.2, H - b * 4.2);
  const d = W * 0.012;
  for (const [cx, cy] of [
    [b * 1.6, b * 1.6],
    [W - b * 1.6, b * 1.6],
    [b * 1.6, H - b * 1.6],
    [W - b * 1.6, H - b * 1.6],
  ]) {
    ctx.fillStyle = '#c8a24a';
    ctx.beginPath();
    ctx.moveTo(cx, cy - d);
    ctx.lineTo(cx + d, cy);
    ctx.lineTo(cx, cy + d);
    ctx.lineTo(cx - d, cy);
    ctx.closePath();
    ctx.fill();
  }
}

function wrapLines(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (!line || ctx.measureText(next).width <= maxWidth) line = next;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

function drawTextField(ctx: SKRSContext2D, f: CertificateField, values: CertificateValues, W: number, H: number): void {
  let str = fillCertificateText(f.text ?? '', values).trim();
  if (!str) return;
  if (f.uppercase) str = str.toUpperCase();
  const px = ((f.fontSize ?? 15) * W) / 1000;
  const x = (f.x / 100) * W;
  const y = (f.y / 100) * H;
  const w = (f.w / 100) * W;
  ctx.save();
  ctx.font = `${f.bold ? 'bold ' : ''}${px}px "${f.fontFamily ?? 'Montserrat'}"`;
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${((f.letterSpacing ?? 0) * W) / 1000}px`;
  ctx.fillStyle = f.color ?? '#1f2937';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = f.align ?? 'center';
  const ax = f.align === 'left' ? x : f.align === 'right' ? x + w : x + w / 2;
  const lineHeight = px * 1.22;
  wrapLines(ctx, str, w).forEach((line, i) => ctx.fillText(line, ax, y + px * 0.95 + i * lineHeight));
  ctx.restore();
}

function drawImageField(ctx: SKRSContext2D, f: CertificateField, assets: CertificateAssets, W: number, H: number, preview: boolean): void {
  const img = assets.images.get(f.id) ?? (f.source === 'organizerLogo' ? assets.organizerLogo : null);
  const x = (f.x / 100) * W;
  const y = (f.y / 100) * H;
  const w = (f.w / 100) * W;
  const h = (f.h / 100) * H;
  if (img) {
    contain(ctx, img, x, y, w, h);
    return;
  }
  if (!preview) return;
  ctx.save();
  ctx.setLineDash([10, 8]);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#94a3b8';
  ctx.font = `${W * 0.011}px "Montserrat"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(f.label, x + w / 2, y + h / 2, w - 10);
  ctx.restore();
}

const INVEON_MARK_BLUE = new Path2D('M4 4L16 28L28 4H20L16 16L12 4H4Z');
const INVEON_MARK_ORANGE = new Path2D('M20 4L16 16L12 4H7L16 22L25 4H20Z');

function drawPlatformMark(ctx: SKRSContext2D, x: number, y: number, w: number, h: number): void {
  const size = Math.min(w, h);
  ctx.save();
  ctx.translate(x + (w - size) / 2, y + (h - size) / 2);
  ctx.scale(size / 32, size / 32);
  ctx.fillStyle = '#0050cb';
  ctx.fill(INVEON_MARK_BLUE);
  ctx.fillStyle = '#f97316';
  ctx.fill(INVEON_MARK_ORANGE);
  ctx.restore();
}

type FooterPartner = { name: string; role: string | null; logo: Image | null };

// The event's Supported By partners, in a row centred inside the box.
function drawPartnersRow(ctx: SKRSContext2D, partners: FooterPartner[], x: number, y: number, w: number, h: number, W: number): void {
  if (partners.length === 0) return;
  const cellW = Math.min(w / partners.length, W * 0.16);
  const startX = x + w / 2 - (cellW * partners.length) / 2;
  partners.forEach((p, i) => {
    const cx = startX + i * cellW;
    if (i > 0) {
      ctx.fillStyle = '#d6c08a';
      ctx.fillRect(cx, y + h * 0.15, 1.5, h * 0.7);
    }
    if (p.logo) contain(ctx, p.logo, cx + cellW * 0.12, y, cellW * 0.76, h * 0.52);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1e293b';
    ctx.font = `bold ${W * 0.0074}px "Montserrat"`;
    const roleY = p.logo ? y + h * 0.7 : y + h * 0.45;
    ctx.fillText((p.role || p.name).toUpperCase(), cx + cellW / 2, roleY, cellW - 8);
    if (p.role) {
      ctx.fillStyle = '#64748b';
      ctx.font = `${W * 0.0072}px "Montserrat"`;
      ctx.fillText(p.name, cx + cellW / 2, roleY + W * 0.011, cellW - 8);
    }
    ctx.restore();
  });
}

// The band organizers can't change, drawn from the footer design set in
// the super admin portal (certificateFooterDesign.ts): the event's
// Supported By partners (or placeholder tiles in the organizer's
// preview when there are none) and the Inveon partners.
function drawFixedFooter(ctx: SKRSContext2D, assets: CertificateAssets, values: CertificateValues, W: number, H: number, preview: boolean): void {
  const footer = assets.footer ?? { design: getCertificateFooterDesign(), images: new Map<string, Image>() };
  const top = (FOOTER_TOP_PERCENT / 100) * H + H * 0.004;
  const left = W * 0.075;
  const width = W - left * 2;
  const bottom = H - H * 0.045;
  ctx.save();
  roundRect(ctx, left, top, width, bottom - top, W * 0.008);
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.fill();
  ctx.restore();

  const partners: FooterPartner[] =
    assets.partners.length > 0
      ? assets.partners
      : preview
        ? ['Music Partner', 'Co-Sponsor', 'Media Partner', 'Associate Partner'].map((role) => ({
            name: 'Your Logo Here',
            role,
            logo: null,
          }))
        : [];

  for (const f of footer.design.fields as FooterField[]) {
    const x = (f.x / 100) * W;
    const y = (f.y / 100) * H;
    const w = (f.w / 100) * W;
    const h = (f.h / 100) * H;
    if (f.kind === 'partners') drawPartnersRow(ctx, partners, x, y, w, h, W);
    else if (f.kind === 'platformMark') drawPlatformMark(ctx, x, y, w, h);
    else if (f.kind === 'image') {
      const img = footer.images.get(f.id);
      if (img) contain(ctx, img, x, y, w, h);
    } else if (!f.onlyWithPartners || partners.length > 0) {
      drawTextField(ctx, f as CertificateField, values, W, H);
    }
  }
}

export function renderCertificateCanvas(
  design: CertificateDesign,
  assets: CertificateAssets,
  values: CertificateValues,
  opts: { preview?: boolean; width?: number } = {},
) {
  registerCertificateFonts();
  const W = opts.width ?? CERT_W;
  const H = Math.round((W * CERT_H) / CERT_W);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  if (assets.background) cover(ctx, assets.background, W, H);
  else drawBuiltInFrame(ctx, W, H);
  for (const f of design.fields) {
    if (f.kind === 'image') drawImageField(ctx, f, assets, W, H, Boolean(opts.preview));
    else drawTextField(ctx, f, values, W, H);
  }
  drawFixedFooter(ctx, assets, values, W, H, Boolean(opts.preview));
  return canvas;
}

export async function renderCertificatePng(
  design: CertificateDesign,
  assets: CertificateAssets,
  values: CertificateValues,
  preview = false,
): Promise<Buffer> {
  return renderCertificateCanvas(design, assets, values, { preview }).encode('png');
}

// One A4-landscape page per attendee.
export async function renderCertificatesPdf(
  design: CertificateDesign,
  assets: CertificateAssets,
  pages: CertificateValues[],
  preview = false,
): Promise<Buffer> {
  const jpegs: Buffer[] = [];
  for (const values of pages) {
    // eslint-disable-next-line no-await-in-loop
    jpegs.push(await renderCertificateCanvas(design, assets, values, { preview }).encode('jpeg', 90));
  }
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 0,
      autoFirstPage: false,
      info: { Title: 'Certificate of Participation' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    for (const jpg of jpegs) {
      doc.addPage({ size: 'A4', layout: 'landscape', margin: 0 });
      doc.image(jpg, 0, 0, { width: doc.page.width, height: doc.page.height });
    }
    doc.end();
  });
}
