import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Search engine tags for client-side navigation. The server renders
// them into the first page load (apps/api/src/services/seo.ts); this
// keeps <title>, description, canonical, Open Graph and the schema.org
// JSON-LD right as the visitor (or Google's renderer) moves between
// pages without a reload.

interface SeoMeta {
  status: number;
  title: string;
  description: string;
  canonical: string;
  image: string | null;
  imageAlt: string | null;
  noindex: boolean;
  jsonLd: unknown[];
}

const PUBLIC_PAGE = /^\/(?:|events|organizers|events\/[^/]+|organizers\/[^/]+|contact|terms|privacy|refund-policy)\/?$/;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

function upsertMeta(attr: 'name' | 'property', key: string, content: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!content) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string | null) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!href) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = href;
}

function setJsonLd(items: unknown[]) {
  document.head.querySelectorAll('script[type="application/ld+json"]').forEach((s) => s.remove());
  for (const item of items) {
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = JSON.stringify(item);
    document.head.appendChild(s);
  }
}

export function applySeo(meta: SeoMeta) {
  document.title = meta.title;
  upsertMeta('name', 'description', meta.description);
  upsertMeta('name', 'robots', meta.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1');
  setCanonical(meta.canonical);
  upsertMeta('property', 'og:title', meta.title);
  upsertMeta('property', 'og:description', meta.description);
  upsertMeta('property', 'og:url', meta.canonical);
  upsertMeta('property', 'og:image', meta.image);
  upsertMeta('property', 'og:image:alt', meta.image ? meta.imageAlt || meta.title : null);
  upsertMeta('name', 'twitter:card', meta.image ? 'summary_large_image' : 'summary');
  upsertMeta('name', 'twitter:title', meta.title);
  upsertMeta('name', 'twitter:description', meta.description);
  upsertMeta('name', 'twitter:image', meta.image);
  setJsonLd(meta.jsonLd);
}

// Mounted once in App. Private pages (organizer portal, bookings,
// checkout, tickets) are marked noindex and carry no structured data.
export function SeoManager() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (import.meta.env.MODE === 'test') return undefined;
    if (!PUBLIC_PAGE.test(pathname)) {
      upsertMeta('name', 'robots', 'noindex, nofollow');
      setCanonical(null);
      setJsonLd([]);
      return undefined;
    }
    const controller = new AbortController();
    fetch(`${API_BASE_URL}/api/seo/meta?path=${encodeURIComponent(pathname)}`, { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<SeoMeta>) : null))
      .then((meta) => {
        if (meta) applySeo(meta);
      })
      .catch(() => {
        // Tags from the server-rendered first load stay in place.
      });
    return () => controller.abort();
  }, [pathname]);

  return null;
}
