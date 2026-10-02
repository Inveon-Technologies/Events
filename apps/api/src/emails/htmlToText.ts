// Plain-text part for an HTML email. Not a full HTML parser: the
// templates are simple tables, so keeping link targets, turning blocks
// into line breaks and dropping the rest reads well enough.
const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  middot: '·',
  rarr: '→',
  mdash: '—',
  ndash: '–',
  hellip: '…',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
    const lower = name.toLowerCase();
    if (lower in ENTITIES) return ENTITIES[lower];
    if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith('#')) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return match;
  });
}

export function htmlToText(html: string): string {
  const text = html
    .replace(/<(head|style|script|title)[\s\S]*?<\/\1>/gi, '')
    // The hidden preheader repeats the first line of the body.
    .replace(/<div[^>]*display:\s*none[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<img[^>]*\balt="([^"]*)"[^>]*>/gi, '$1')
    .replace(/<a[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const inner = label.replace(/<[^>]+>/g, '').trim();
      if (href.startsWith('mailto:') || href.startsWith('cid:')) return inner || href.replace(/^mailto:/, '');
      return inner && inner !== href ? `${inner} (${href})` : href;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|tr|table|li)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
