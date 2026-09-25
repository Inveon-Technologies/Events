import { createCanvas, loadImage } from '@napi-rs/canvas';
import { coverImage, fitText, registerFonts } from './ticketArtwork';
import { loadStoredImage } from './designAssets';
import { logger } from '../logger';

// The top banner of the confirmation email: the organizer's title
// background with "<ORGANIZER> PRESENTS", the event title in gold, the
// year and the tagline — the same stage look as the ticket page hero.
// Rendered to a PNG (sent inline) because background images and web
// fonts behind text don't work across mail clients.

export interface EventHeaderInput {
  backgroundUrl: string | null;
  organizerName: string;
  organizerLogoUrl: string | null;
  eventName: string;
  eventDate: Date;
  tagline: string | null;
}

const W = 1200;
const H = 460;

// "Dandiya Night 2026" → title "Dandiya Night", year "2026"; otherwise the event's year.
export function splitEventTitle(name: string, eventDate: Date): { title: string; year: string } {
  const m = name.trim().match(/^(.*?)[\s\-–]*((?:19|20)\d{2})$/);
  if (m && m[1]) return { title: m[1], year: m[2] };
  return { title: name.trim(), year: eventDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric' }) };
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?'
  );
}

async function safeImage(url: string | null) {
  const buf = await loadStoredImage(url);
  if (!buf) return null;
  try {
    return await loadImage(buf);
  } catch (err) {
    logger.warn({ err, url }, 'Unreadable image for the email header');
    return null;
  }
}

export async function renderEventHeaderPng(input: EventHeaderInput): Promise<Buffer> {
  registerFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const bg = await safeImage(input.backgroundUrl);
  if (bg) {
    coverImage(ctx, bg, 0, 0, W, H);
  } else {
    const g = ctx.createRadialGradient(W / 2, H * 0.3, 20, W / 2, H * 0.3, W * 0.7);
    g.addColorStop(0, '#3d0726');
    g.addColorStop(0.7, '#170414');
    g.addColorStop(1, '#0c020b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(7,11,26,0.78)');
  shade.addColorStop(0.5, 'rgba(9,11,28,0.55)');
  shade.addColorStop(1, 'rgba(6,10,22,0.92)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);

  // Organizer badge + name / PRESENTS, centred as a group.
  ctx.font = '26px "Inter Bold"';
  const orgText = input.organizerName.toUpperCase();
  const spaced = (t: string) => t.split('').join(' ');
  const orgLabel = spaced(orgText);
  const labelW = Math.min(ctx.measureText(orgLabel).width, 700);
  const badge = 70;
  const groupW = badge + 18 + labelW;
  const gx = (W - groupW) / 2;
  const by = 36;
  ctx.save();
  ctx.beginPath();
  ctx.arc(gx + badge / 2, by + badge / 2, badge / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = '#09152b';
  ctx.fill();
  ctx.clip();
  const logo = await safeImage(input.organizerLogoUrl);
  if (logo) coverImage(ctx, logo, gx, by, badge, badge);
  else {
    ctx.fillStyle = '#fcd34d';
    ctx.font = '24px "Cinzel Black"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(input.organizerName), gx + badge / 2, by + badge / 2 + 2);
  }
  ctx.restore();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#facc15';
  ctx.beginPath();
  ctx.arc(gx + badge / 2, by + badge / 2, badge / 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = '26px "Inter Bold"';
  ctx.fillText(orgLabel, gx + badge + 18, by + 32, 700);
  ctx.fillStyle = '#fcd34d';
  ctx.font = '19px "Inter SemiBold"';
  ctx.fillText(spaced('PRESENTS'), gx + badge + 18, by + 60);

  // Title (up to 2 lines) in gold.
  const { title, year } = splitEventTitle(input.eventName, input.eventDate);
  const fit = fitText(ctx, title.toUpperCase(), 'Cinzel Black', 92, 46, W - 120, 2);
  ctx.textAlign = 'center';
  let y = 150 + fit.size * 0.85;
  for (const line of fit.lines) {
    const gold = ctx.createLinearGradient(0, y - fit.size, 0, y);
    gold.addColorStop(0, '#fff7c2');
    gold.addColorStop(0.45, '#ffd043');
    gold.addColorStop(0.75, '#e69500');
    gold.addColorStop(1, '#ffdf79');
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = gold;
    ctx.font = `${fit.size}px "Cinzel Black"`;
    ctx.fillText(line, W / 2, y);
    y += fit.size * 1.02;
  }
  ctx.shadowBlur = 0;

  // Year between two gold rules.
  const yearY = y + 30;
  ctx.font = '54px "Cinzel Black"';
  const yearW = ctx.measureText(year).width;
  const yg = ctx.createLinearGradient(0, yearY - 50, 0, yearY);
  yg.addColorStop(0, '#ffffff');
  yg.addColorStop(0.4, '#ffeaa7');
  yg.addColorStop(1, '#f59e0b');
  ctx.fillStyle = yg;
  ctx.fillText(year, W / 2, yearY);
  for (const dir of [-1, 1]) {
    const x0 = W / 2 + dir * (yearW / 2 + 24);
    const x1 = x0 + dir * 150;
    const rule = ctx.createLinearGradient(x0, 0, x1, 0);
    rule.addColorStop(0, '#fbbf24');
    rule.addColorStop(1, 'rgba(251,191,36,0)');
    ctx.fillStyle = rule;
    ctx.fillRect(Math.min(x0, x1), yearY - 20, 150, 3);
  }

  if (input.tagline) {
    const tag = fitText(ctx, input.tagline.toUpperCase(), 'Inter SemiBold', 24, 16, W - 160, 1);
    ctx.fillStyle = 'rgba(254,243,199,0.92)';
    ctx.font = `${tag.size}px "Inter SemiBold"`;
    ctx.fillText(spaced(tag.lines[0]), W / 2, Math.min(yearY + 50, H - 24), W - 120);
  }

  return canvas.toBuffer('image/png');
}

// Any uploaded logo (JPEG / PNG / WebP) as a small PNG — several mail
// apps (Outlook among them) don't display WebP.
export async function emailSafePng(buf: Buffer | null, maxW = 360, maxH = 180): Promise<Buffer | null> {
  if (!buf) return null;
  try {
    const img = await loadImage(buf);
    const scale = Math.min(1, maxW / img.width, maxH / img.height);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = createCanvas(w, h);
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return canvas.toBuffer('image/png');
  } catch (err) {
    logger.warn({ err }, 'Unreadable logo for the email');
    return null;
  }
}
