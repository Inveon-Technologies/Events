# Search engines (SEO)

What makes events show up on Google as rich event cards (name, date,
venue, price, image), and what the production server needs.

## What the app does

- **Server-rendered first load** — `GET /api/seo/page` (path in the
  `X-Seo-Path` header) returns the SPA's own `index.html` with:
  a real `<title>`, meta description, canonical URL, Open Graph and
  Twitter card tags, schema.org JSON-LD, and a plain-HTML summary of the
  page inside `#root` (React replaces it on load). Pages covered: `/`,
  `/events`, `/events/<slug>`, `/organizers`, `/organizers/<slug>`,
  `/contact`, `/terms`, `/privacy`, `/refund-policy`.
- **JSON-LD** — `Event` (with `offers` per ticket tier in INR,
  `location` Place + PostalAddress + geo, `organizer`, up to 10 images,
  `aggregateRating` once there are reviews) on each event page, plus
  `BreadcrumbList` and `FAQPage` (from the event's FAQs). `WebSite`,
  `Organization` and `ItemList` on the home and listing pages,
  `Organization` on organizer pages.
- **Client-side navigation** — the SPA fetches `GET /api/seo/meta?path=`
  on every route change and applies the same tags
  (`apps/web/src/lib/seo.ts`). Google renders JavaScript, so this alone
  already gives Google the structured data; the server-rendered load is
  what WhatsApp / Facebook / X link previews and non-JS crawlers need.
- **Sitemap** — `GET /api/seo/sitemap.xml`: every published event (with
  image entries), organizer and static page. Cached 10 minutes.
- **robots.txt** — a static file in the web build
  (`apps/web/public/robots.txt`), pointing at the sitemap and keeping
  the organizer portal, bookings, tickets and checkout out of the index.

## Production setup (the VPS)

Production runs from the `inveontechnologies-website` repo's compose
file and front-door nginx (see `scripts/deploy.sh`), not
`docker/docker-compose.yml`. Two changes there turn on the
server-rendered first load; without them everything still works, only
link previews and non-JS crawlers keep seeing the plain SPA.

1. **Give the API the web build's `index.html`** — mount the web static
   volume read-only into the events API container:

   ```yaml
   events-api:
     volumes:
       - events_web_static:/app/web-dist:ro
   ```

   (Or set `SEO_SHELL_URL` to a URL that serves the SPA's `index.html`
   from inside the API container. `WEB_DIST_DIR` overrides the mount
   path.)

2. **Route the public pages to the API** in whichever nginx serves the
   Events SPA — copy the `Search engines` block from
   `docker/nginx/conf.d/default.conf` (the `/sitemap.xml` location, the
   regex page location, and `@spa`). A 5xx from the API falls back to the
   plain `index.html`, so this can't take the site down.

`WEB_PUBLIC_URL` must be set in `apps/api/.env`
(`https://events.inveontechnologies.in`) — canonical URLs, sitemap
entries and image URLs are built from it.

## After deploying

1. Add the site to Google Search Console and submit
   `https://events.inveontechnologies.in/api/seo/sitemap.xml`
   (or `/sitemap.xml` once step 2 above is done).
2. Check an event page in Google's Rich Results Test
   (search.google.com/test/rich-results) — it should list one valid
   "Event" item.
3. Event cards appear after Google recrawls, usually days to a few weeks.
   Clear event names, a real banner photo, full venue address with city
   and pincode, and ticket prices make the cards richer.
