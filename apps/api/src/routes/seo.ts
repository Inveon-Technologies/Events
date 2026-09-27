import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { buildSitemap, loadSpaShell, pageSeoForPath, renderShell } from '../services/seo';
import { logger } from '../logger';

// Public pages rendered for search engines and link previews (see
// services/seo.ts). nginx sends the page's path in X-Seo-Path; the
// ?path= query is for trying it by hand. A 5xx makes nginx fall back to
// the plain SPA index.html, so this can never take the site down.
export const seoRouter = Router();

const SITEMAP_TTL_MS = 10 * 60 * 1000;
let sitemapCache: { xml: string; at: number } | null = null;

seoRouter.get(
  '/page',
  asyncHandler(async (req, res) => {
    const header = req.get('x-seo-path');
    const raw = header || (typeof req.query.path === 'string' ? req.query.path : '/');
    const pathname = raw.startsWith('/') ? raw.slice(0, 512) : `/${raw.slice(0, 511)}`;
    const shell = await loadSpaShell();
    if (!shell) {
      res.status(503).type('text/plain').send('SPA shell unavailable');
      return;
    }
    try {
      const page = await pageSeoForPath(pathname);
      res.status(page.status).set('Cache-Control', 'no-cache').type('html').send(renderShell(shell, page));
    } catch (err) {
      logger.warn({ err, pathname }, 'SEO: page render failed, serving the plain SPA');
      res.status(200).set('Cache-Control', 'no-cache').type('html').send(shell);
    }
  }),
);

// The same tags as JSON, for the SPA to apply after client-side
// navigation (title, description, canonical, Open Graph, JSON-LD).
seoRouter.get(
  '/meta',
  asyncHandler(async (req, res) => {
    const raw = typeof req.query.path === 'string' ? req.query.path : '/';
    const pathname = raw.startsWith('/') ? raw.slice(0, 512) : `/${raw.slice(0, 511)}`;
    const page = await pageSeoForPath(pathname);
    res
      .status(200)
      .set('Cache-Control', 'public, max-age=60')
      .json({
        status: page.status,
        title: page.title,
        description: page.description,
        canonical: page.canonical,
        image: page.image,
        imageAlt: page.imageAlt ?? null,
        noindex: Boolean(page.noindex),
        jsonLd: page.jsonLd,
      });
  }),
);

seoRouter.get(
  '/sitemap.xml',
  asyncHandler(async (_req, res) => {
    if (!sitemapCache || Date.now() - sitemapCache.at > SITEMAP_TTL_MS) {
      sitemapCache = { xml: await buildSitemap(), at: Date.now() };
    }
    res.status(200).set('Cache-Control', 'public, max-age=600').type('application/xml').send(sitemapCache.xml);
  }),
);
