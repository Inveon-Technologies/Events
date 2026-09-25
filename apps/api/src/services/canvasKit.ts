import path from 'node:path';
import { GlobalFonts, type Image, type SKRSContext2D } from '@napi-rs/canvas';

// Shared canvas helpers for the server-rendered images (ticket card,
// ticket PDF artwork, email banner).

export const FONT_DIR = path.join(__dirname, '../../assets/fonts');
let fontsRegistered = false;
export function registerFonts(): void {
  if (fontsRegistered) return;
  GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Inter_400Regular.ttf'), 'Inter');
  GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Inter_600SemiBold.ttf'), 'Inter SemiBold');
  GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Inter_700Bold.ttf'), 'Inter Bold');
  GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Cinzel_900Black.woff2'), 'Cinzel Black');
  fontsRegistered = true;
}

// Shrinks the font until the text fits `maxWidth` in at most `maxLines`
// lines; returns the lines and the size used.
export function fitText(
  ctx: SKRSContext2D,
  text: string,
  font: string,
  start: number,
  min: number,
  maxWidth: number,
  maxLines: number,
): { lines: string[]; size: number } {
  for (let size = start; size >= min; size -= 2) {
    ctx.font = `${size}px "${font}"`;
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth) line = next;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxWidth)) return { lines, size };
  }
  ctx.font = `${min}px "${font}"`;
  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) clipped = clipped.slice(0, -1);
  return { lines: [`${clipped}…`], size: min };
}

export function coverImage(ctx: SKRSContext2D, img: Image, x: number, y: number, w: number, h: number): void {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}
