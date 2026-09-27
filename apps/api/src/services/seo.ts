import fs from 'fs/promises';
import path from 'path';
import { Op } from 'sequelize';
import { Event, Organizer, EventMedia } from '../models';
import { getPublicEvent, listPublicEvents, type PublicEventDetail, type PublicEventSummary } from './publicEvents';
import { getPublicOrganizer, listPublicOrganizers } from './publicOrganizers';
import { getBranding } from './platformSettings';
import { logger } from '../logger';

// Search engine support for the public site.
//
// The web app is a client-rendered SPA, so a crawler that doesn't run
// JavaScript (and every link preview on WhatsApp / Facebook / X) used to
// see an empty page titled "Inveon Events". nginx now sends the public
// pages (home, events, one event, organizers, one organizer, legal
// pages) here; this returns the same index.html the SPA ships, with:
//   - a real <title>, meta description, canonical URL, Open Graph and
//     Twitter card tags (name, date, venue, banner image),
//   - schema.org JSON-LD — Event (with offers, place, geo, organizer,
//     images) for an event page, which is what Google shows as an event
//     card with date, place, price and image; ItemList / Organization /
//     WebSite / BreadcrumbList elsewhere,
//   - a plain-HTML summary of the page inside #root, so the text and
//     links are there without JavaScript. React replaces it on load.
// Plus /sitemap.xml (every public event and organizer, with images).
// The web app also asks /api/seo/meta for the same tags on every
// client-side navigation (apps/web/src/lib/seo.ts), so they're right
// even where nginx doesn't route pages here.

export const DEFAULT_SITE_URL = 'https://events.inveontechnologies.in';

export function siteUrl(): string {
  return (process.env.WEB_PUBLIC_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');
}

export function absoluteUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('data:')) return null;
  return `${siteUrl()}${url.startsWith('/') ? '' : '/'}${url}`;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// JSON inside <script> must not be able to close the tag.
export function jsonLd(data: unknown): string {
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  return `<script type="application/ld+json">${json}</script>`;
}

export function plainText(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[*_#`>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

// "Venue, Street, Area, City, State, 411001" → parts for a PostalAddress.
export function addressParts(address: string | null): {
  venue: string | null;
  locality: string | null;
  region: string | null;
  postalCode: string | null;
  full: string | null;
} {
  const pieces = (address ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (pieces.length === 0) return { venue: null, locality: null, region: null, postalCode: null, full: null };
  const postalCode = pieces.find((p) => /^\d{6}$/.test(p)) ?? null;
  const rest = pieces.filter((p) => p !== postalCode && !/^india$/i.test(p));
  const region = rest.length >= 3 ? rest[rest.length - 1] : null;
  const locality = rest.length >= 3 ? rest[rest.length - 2] : rest.length === 2 ? rest[1] : null;
  return { venue: rest[0] ?? pieces[0], locality, region, postalCode, full: pieces.join(', ') };
}

const IST_DATE = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const IST_TIME = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true });

export function istLabel(iso: string): string {
  const d = new Date(iso);
  return `${IST_DATE.format(d)}, ${IST_TIME.format(d)} IST`;
}

// ISO 8601 with the +05:30 offset, e.g. 2026-10-18T19:00:00+05:30 — the
// event's local time, which is what Google shows on the event card.
export function istIso(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + 330 * 60 * 1000);
  return `${shifted.toISOString().slice(0, 19)}+05:30`;
}

function rupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

function priceLabel(paise: number | null): string | null {
  if (paise === null) return null;
  return paise === 0 ? 'Free' : `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

export interface PageSeo {
  status: number;
  title: string;
  description: string;
  canonical: string;
  image: string | null;
  imageAlt?: string;
  ogType?: string;
  noindex?: boolean;
  jsonLd: unknown[];
  bodyHtml: string;
  extraMeta?: string[];
}

function platformName(): string {
  return getBranding().platformName || 'Inveon Events';
}

function siteLogo(): string | null {
  return absoluteUrl(getBranding().logoUrl);
}

function organizationLd() {
  return {
    '@type': 'Organization',
    '@id': `${siteUrl()}/#organization`,
    name: platformName(),
    url: `${siteUrl()}/`,
    ...(siteLogo() ? { logo: siteLogo() } : {}),
    parentOrganization: { '@type': 'Organization', name: 'Inveon Technologies', url: 'https://www.inveontechnologies.in' },
  };
}

function breadcrumbLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  };
}

export function eventUrl(e: { slug: string | null; id: string }): string {
  return `${siteUrl()}/events/${encodeURIComponent(e.slug || e.id)}`;
}

// schema.org Event — https://developers.google.com/search/docs/appearance/structured-data/event
export function eventJsonLd(e: PublicEventDetail, now: Date = new Date()) {
  const addr = addressParts(e.venueAddress);
  const url = eventUrl(e);
  const images = [e.bannerUrl, ...e.media.filter((m) => m.mediaType === 'photo').map((m) => m.url)]
    .map(absoluteUrl)
    .filter((u, i, all): u is string => Boolean(u) && all.indexOf(u) === i)
    .slice(0, 10);
  const description = plainText(e.description) || plainText(e.tagline) || `${e.name} — book tickets on ${platformName()}.`;
  const upcoming = new Date(e.eventDate).getTime() > now.getTime();

  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    '@id': `${url}#event`,
    name: e.name,
    description: truncate(description, 5000),
    url,
    startDate: istIso(e.eventDate),
    ...(e.gateOpenTime ? { doorTime: istIso(e.gateOpenTime) } : {}),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    ...(images.length ? { image: images } : {}),
    location: {
      '@type': 'Place',
      name: addr.venue || e.venueAddress || 'Venue to be announced',
      address: {
        '@type': 'PostalAddress',
        ...(addr.full ? { streetAddress: addr.full } : {}),
        ...(addr.locality ? { addressLocality: addr.locality } : {}),
        ...(addr.region ? { addressRegion: addr.region } : {}),
        ...(addr.postalCode ? { postalCode: addr.postalCode } : {}),
        addressCountry: 'IN',
      },
      ...(e.venueLatitude !== null && e.venueLongitude !== null
        ? { geo: { '@type': 'GeoCoordinates', latitude: e.venueLatitude, longitude: e.venueLongitude } }
        : {}),
      ...(e.venueMapUrl ? { hasMap: e.venueMapUrl } : {}),
    },
    organizer: {
      '@type': 'Organization',
      name: e.organizerName,
      url: `${siteUrl()}/organizers/${encodeURIComponent(e.organizerSlug)}`,
    },
    ...(e.ticketCategories.length
      ? {
          isAccessibleForFree: e.ticketCategories.every((t) => t.pricePaise === 0),
          offers: e.ticketCategories.map((t) => ({
            '@type': 'Offer',
            name: t.name,
            ...(t.description ? { description: truncate(plainText(t.description), 300) } : {}),
            price: rupees(t.pricePaise),
            priceCurrency: 'INR',
            availability: !upcoming
              ? 'https://schema.org/SoldOut'
              : t.available > 0
                ? 'https://schema.org/InStock'
                : 'https://schema.org/SoldOut',
            url,
            validThrough: istIso(e.eventDate),
          })),
        }
      : {}),
    ...(e.ratingSummary && e.ratingSummary.reviewCount > 0 && e.ratingSummary.averageRating
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: Number(e.ratingSummary.averageRating).toFixed(1),
            reviewCount: e.ratingSummary.reviewCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
}

function faqJsonLd(e: PublicEventDetail) {
  const items = (e.faqItems ?? []).filter((f) => f.question?.trim() && f.answer?.trim());
  if (!items.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.question.trim(),
      acceptedAnswer: { '@type': 'Answer', text: plainText(f.answer) },
    })),
  };
}

function eventListHtml(
  events: {
    name: string;
    slug: string | null;
    id: string;
    eventDate: string;
    venueAddress: string | null;
    minPricePaise?: number | null;
    bannerUrl?: string | null;
  }[],
): string {
  if (!events.length) return '<p>No upcoming events right now — check back soon.</p>';
  return `<ul>${events
    .map((e) => {
      const price = priceLabel(e.minPricePaise ?? null);
      const img = absoluteUrl(e.bannerUrl);
      return `<li>${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(e.name)}" width="320" height="180" loading="lazy" />` : ''}<a href="${escapeHtml(eventUrl(e))}"><strong>${escapeHtml(e.name)}</strong></a> — ${escapeHtml(istLabel(e.eventDate))}${
        e.venueAddress ? `, ${escapeHtml(e.venueAddress)}` : ''
      }${price ? ` — from ${escapeHtml(price)}` : ''}</li>`;
    })
    .join('')}</ul>`;
}

function itemListLd(events: PublicEventSummary[], name: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    itemListElement: events.slice(0, 50).map((e, i) => ({ '@type': 'ListItem', position: i + 1, url: eventUrl(e), name: e.name })),
  };
}

function eventMetaDescription(e: PublicEventDetail): string {
  const addr = addressParts(e.venueAddress);
  const place = [addr.venue, addr.locality].filter(Boolean).join(', ');
  const prices = e.ticketCategories.map((t) => t.pricePaise);
  const from = prices.length ? priceLabel(Math.min(...prices)) : null;
  const lead = plainText(e.tagline) || plainText(e.description);
  const facts = [istLabel(e.eventDate), place, from ? (from === 'Free' ? 'Free entry' : `Tickets from ${from}`) : null]
    .filter(Boolean)
    .join(' · ');
  return truncate(`${facts}. ${lead}`.trim(), 160);
}

async function eventPage(idOrSlug: string): Promise<PageSeo | null> {
  const e = await getPublicEvent(idOrSlug);
  if (!e) return null;
  const addr = addressParts(e.venueAddress);
  const url = eventUrl(e);
  const image = absoluteUrl(e.bannerUrl) ?? absoluteUrl(e.media.find((m) => m.mediaType === 'photo')?.url);
  const cityPart = addr.locality ? ` in ${addr.locality}` : '';
  const title = `${e.name}${cityPart} – ${IST_DATE.format(new Date(e.eventDate))} | Book Tickets | ${platformName()}`;
  const description = eventMetaDescription(e);
  const faq = faqJsonLd(e);

  const tiers = e.ticketCategories
    .map(
      (t) =>
        `<li>${escapeHtml(t.name)}: ${escapeHtml(priceLabel(t.pricePaise) ?? '')}${t.available > 0 ? '' : ' (sold out)'}${
          t.description ? ` — ${escapeHtml(plainText(t.description))}` : ''
        }</li>`,
    )
    .join('');
  const schedule = (e.scheduleItems ?? [])
    .map(
      (s) =>
        `<li>${escapeHtml(s.time ?? '')} ${escapeHtml(s.title ?? '')}${s.description ? ` — ${escapeHtml(plainText(s.description))}` : ''}</li>`,
    )
    .join('');
  const faqHtml = (e.faqItems ?? [])
    .filter((f) => f.question && f.answer)
    .map((f) => `<dt>${escapeHtml(f.question)}</dt><dd>${escapeHtml(plainText(f.answer))}</dd>`)
    .join('');

  const bodyHtml = `<main class="seo-prerender"><nav><a href="${siteUrl()}/">${escapeHtml(platformName())}</a> › <a href="${siteUrl()}/events">Events</a> › ${escapeHtml(e.name)}</nav>
<article>
${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(e.name)}" width="1200" height="630" />` : ''}
<h1>${escapeHtml(e.name)}</h1>
${e.tagline ? `<p><strong>${escapeHtml(plainText(e.tagline))}</strong></p>` : ''}
<p>📅 <time datetime="${istIso(e.eventDate)}">${escapeHtml(istLabel(e.eventDate))}</time></p>
${e.venueAddress ? `<p>📍 ${escapeHtml(e.venueAddress)}</p>` : ''}
<p>Organized by <a href="${siteUrl()}/organizers/${encodeURIComponent(e.organizerSlug)}">${escapeHtml(e.organizerName)}</a></p>
${e.genderRestriction ? `<p>This event is for ${escapeHtml(e.genderRestriction)} attendees only.</p>` : ''}
${tiers ? `<h2>Tickets</h2><ul>${tiers}</ul><p><a href="${url}/checkout">Book tickets</a></p>` : ''}
${e.description ? `<h2>About this event</h2><p>${escapeHtml(plainText(e.description))}</p>` : ''}
${schedule ? `<h2>Schedule</h2><ul>${schedule}</ul>` : ''}
${faqHtml ? `<h2>FAQs</h2><dl>${faqHtml}</dl>` : ''}
</article></main>`;

  return {
    status: 200,
    title,
    description,
    canonical: url,
    image,
    imageAlt: e.name,
    ogType: 'website',
    jsonLd: [
      eventJsonLd(e),
      breadcrumbLd([
        { name: platformName(), url: `${siteUrl()}/` },
        { name: 'Events', url: `${siteUrl()}/events` },
        { name: e.name, url },
      ]),
      ...(faq ? [faq] : []),
    ],
    bodyHtml,
    extraMeta: [
      `<meta property="event:start_time" content="${istIso(e.eventDate)}" />`,
      ...(addr.locality ? [`<meta name="geo.placename" content="${escapeHtml(addr.locality)}" />`] : []),
      ...(e.venueLatitude !== null && e.venueLongitude !== null
        ? [
            `<meta name="geo.position" content="${e.venueLatitude};${e.venueLongitude}" />`,
            `<meta name="ICBM" content="${e.venueLatitude}, ${e.venueLongitude}" />`,
          ]
        : []),
      '<meta name="geo.region" content="IN" />',
    ],
  };
}

async function homePage(): Promise<PageSeo> {
  const events = await listPublicEvents();
  const name = platformName();
  const cities = [...new Set(events.map((e) => addressParts(e.venueAddress).locality).filter(Boolean))].slice(0, 5);
  return {
    status: 200,
    title: `${name} – Book Treks, Trips, Workshops, Concerts & Events in India`,
    description: truncate(
      `Discover and book upcoming events${cities.length ? ` in ${cities.join(', ')}` : ' across India'} — treks, trips, workshops, conferences, sports and cultural events. Instant e-tickets with QR check-in on ${name}.`,
      160,
    ),
    canonical: `${siteUrl()}/`,
    image: absoluteUrl(events[0]?.bannerUrl) ?? siteLogo(),
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        '@id': `${siteUrl()}/#website`,
        name,
        url: `${siteUrl()}/`,
        publisher: { '@id': `${siteUrl()}/#organization` },
      },
      { '@context': 'https://schema.org', ...organizationLd() },
      itemListLd(events, 'Upcoming events'),
    ],
    bodyHtml: `<main class="seo-prerender"><h1>${escapeHtml(name)} — discover and book events</h1><p>Treks, trips, workshops, conferences, sports, cultural events and more. Book online and get instant e-tickets.</p><h2>Upcoming events</h2>${eventListHtml(
      events.slice(0, 30),
    )}<p><a href="${siteUrl()}/events">All events</a> · <a href="${siteUrl()}/organizers">Organizers</a></p></main>`,
  };
}

async function eventsListPage(): Promise<PageSeo> {
  const events = await listPublicEvents();
  const name = platformName();
  return {
    status: 200,
    title: `Upcoming Events – Book Tickets Online | ${name}`,
    description: truncate(
      `Browse ${events.length} upcoming event${events.length === 1 ? '' : 's'} — treks, trips, workshops, concerts and more. Compare dates, venues and prices, and book tickets instantly on ${name}.`,
      160,
    ),
    canonical: `${siteUrl()}/events`,
    image: absoluteUrl(events[0]?.bannerUrl) ?? siteLogo(),
    jsonLd: [
      itemListLd(events, 'Upcoming events'),
      breadcrumbLd([
        { name, url: `${siteUrl()}/` },
        { name: 'Events', url: `${siteUrl()}/events` },
      ]),
    ],
    bodyHtml: `<main class="seo-prerender"><h1>Upcoming events</h1>${eventListHtml(events)}</main>`,
  };
}

async function organizersListPage(): Promise<PageSeo> {
  const organizers = await listPublicOrganizers();
  const name = platformName();
  return {
    status: 200,
    title: `Event Organizers | ${name}`,
    description: truncate(
      `Trek groups, clubs and companies hosting events on ${name}. See their upcoming events, reviews and book tickets.`,
      160,
    ),
    canonical: `${siteUrl()}/organizers`,
    image: siteLogo(),
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Organizers',
        itemListElement: organizers.slice(0, 100).map((o, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: `${siteUrl()}/organizers/${encodeURIComponent(o.slug)}`,
          name: o.name,
        })),
      },
    ],
    bodyHtml: `<main class="seo-prerender"><h1>Organizers</h1><ul>${organizers
      .map(
        (o) =>
          `<li><a href="${siteUrl()}/organizers/${encodeURIComponent(o.slug)}">${escapeHtml(o.name)}</a>${o.about ? ` — ${escapeHtml(truncate(plainText(o.about), 160))}` : ''}</li>`,
      )
      .join('')}</ul></main>`,
  };
}

async function organizerPage(slug: string): Promise<PageSeo | null> {
  const o = await getPublicOrganizer(slug);
  if (!o) return null;
  const url = `${siteUrl()}/organizers/${encodeURIComponent(o.slug)}`;
  const logo = absoluteUrl(o.logoUrl);
  return {
    status: 200,
    title: `${o.name} – Events & Tickets | ${platformName()}`,
    description: truncate(
      `${plainText(o.about) || `${o.name} hosts events on ${platformName()}.`} ${o.events.length ? `${o.events.length} upcoming event${o.events.length === 1 ? '' : 's'} — book tickets online.` : ''}`.trim(),
      160,
    ),
    canonical: url,
    image: absoluteUrl(o.events[0]?.bannerUrl) ?? logo,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: o.name,
        url,
        ...(logo ? { logo } : {}),
        ...(o.about ? { description: truncate(plainText(o.about), 500) } : {}),
        ...(o.ratingSummary?.reviewCount && o.ratingSummary.averageRating
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: Number(o.ratingSummary.averageRating).toFixed(1),
                reviewCount: o.ratingSummary.reviewCount,
                bestRating: 5,
                worstRating: 1,
              },
            }
          : {}),
        event: o.events.slice(0, 20).map((e) => ({ '@type': 'Event', name: e.name, url: eventUrl(e), startDate: istIso(e.eventDate) })),
      },
      breadcrumbLd([
        { name: platformName(), url: `${siteUrl()}/` },
        { name: 'Organizers', url: `${siteUrl()}/organizers` },
        { name: o.name, url },
      ]),
    ],
    bodyHtml: `<main class="seo-prerender">${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(o.name)}" width="96" height="96" />` : ''}<h1>${escapeHtml(o.name)}</h1>${
      o.about ? `<p>${escapeHtml(plainText(o.about))}</p>` : ''
    }<h2>Upcoming events</h2>${eventListHtml(o.events)}</main>`,
  };
}

const STATIC_PAGES: Record<string, { title: string; description: string }> = {
  '/contact': {
    title: 'Contact Us',
    description: 'Get in touch with the Inveon Events team for bookings, organizer accounts and support.',
  },
  '/terms': { title: 'Terms & Conditions', description: 'Terms and conditions for booking tickets and hosting events on Inveon Events.' },
  '/privacy': { title: 'Privacy Policy', description: 'How Inveon Events collects, uses and protects your personal information.' },
  '/refund-policy': {
    title: 'Refunds & Cancellations',
    description: 'Refund and cancellation policy for tickets booked on Inveon Events.',
  },
};

function notFoundPage(pathname: string): PageSeo {
  return {
    status: 404,
    title: `Page not found | ${platformName()}`,
    description: 'This page could not be found.',
    canonical: `${siteUrl()}${pathname}`,
    image: null,
    noindex: true,
    jsonLd: [],
    bodyHtml: '',
  };
}

const EVENT_PATH = /^\/events\/([^/]+)\/?$/;
const ORGANIZER_PATH = /^\/organizers\/([^/]+)\/?$/;

export async function pageSeoForPath(pathname: string): Promise<PageSeo> {
  const clean = pathname.split(/[?#]/)[0] || '/';
  if (clean === '/' || clean === '') return homePage();
  if (clean === '/events' || clean === '/events/') return eventsListPage();
  if (clean === '/organizers' || clean === '/organizers/') return organizersListPage();
  const ev = EVENT_PATH.exec(clean);
  if (ev) {
    const page = await eventPage(decodeURIComponent(ev[1]));
    return page ?? notFoundPage(clean);
  }
  const org = ORGANIZER_PATH.exec(clean);
  if (org) {
    const page = await organizerPage(decodeURIComponent(org[1]));
    return page ?? notFoundPage(clean);
  }
  const staticPage = STATIC_PAGES[clean];
  if (staticPage) {
    return {
      status: 200,
      title: `${staticPage.title} | ${platformName()}`,
      description: staticPage.description,
      canonical: `${siteUrl()}${clean}`,
      image: siteLogo(),
      jsonLd: [],
      bodyHtml: '',
    };
  }
  return notFoundPage(clean);
}

export function headTags(p: PageSeo): string {
  const name = platformName();
  const tags = [
    `<title>${escapeHtml(p.title)}</title>`,
    `<meta name="description" content="${escapeHtml(p.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(p.canonical)}" />`,
    `<meta name="robots" content="${p.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1'}" />`,
    `<meta property="og:site_name" content="${escapeHtml(name)}" />`,
    `<meta property="og:type" content="${p.ogType ?? 'website'}" />`,
    `<meta property="og:title" content="${escapeHtml(p.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(p.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(p.canonical)}" />`,
    '<meta property="og:locale" content="en_IN" />',
    `<meta name="twitter:card" content="${p.image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${escapeHtml(p.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(p.description)}" />`,
  ];
  if (p.image) {
    tags.push(
      `<meta property="og:image" content="${escapeHtml(p.image)}" />`,
      `<meta property="og:image:alt" content="${escapeHtml(p.imageAlt ?? p.title)}" />`,
      `<meta name="twitter:image" content="${escapeHtml(p.image)}" />`,
    );
  }
  tags.push(...(p.extraMeta ?? []));
  tags.push(...p.jsonLd.map(jsonLd));
  return tags.join('\n    ');
}

// Puts the page's tags into the SPA's index.html: replaces its <title>
// (and any description/canonical already there) and fills #root.
export function renderShell(shell: string, p: PageSeo): string {
  let html = shell
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+name="description"[^>]*>/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>/gi, '');
  html = html.replace(/<\/head>/i, `    ${headTags(p)}\n  </head>`);
  if (p.bodyHtml) html = html.replace(/<div id="root"><\/div>/i, `<div id="root">${p.bodyHtml}</div>`);
  return html;
}

// ---- The SPA's own index.html -------------------------------------------

const SHELL_TTL_MS = 60 * 1000;
let shellCache: { html: string; at: number } | null = null;

// Read from the built web app (the shared web_static volume, mounted
// read-only into the api container), else fetched from this stack's
// nginx. Cached briefly so a deploy's new asset filenames show up fast.
export async function loadSpaShell(): Promise<string | null> {
  if (shellCache && Date.now() - shellCache.at < SHELL_TTL_MS) return shellCache.html;
  const dir = process.env.WEB_DIST_DIR || '/app/web-dist';
  let html: string | null = await fs.readFile(path.join(dir, 'index.html'), 'utf8').catch(() => null);
  if (!html) {
    const url = process.env.SEO_SHELL_URL || 'http://nginx/index.html';
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) html = await res.text();
    } catch (err) {
      logger.warn({ err, url }, 'SEO: could not load the SPA index.html');
    }
  }
  if (html && /<div id="root">/i.test(html)) {
    shellCache = { html, at: Date.now() };
    return html;
  }
  return null;
}

export function resetShellCacheForTests(): void {
  shellCache = null;
}

// ---- sitemap.xml / robots.txt ----------------------------------------------

function xml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function buildSitemap(): Promise<string> {
  const base = siteUrl();
  const events = await Event.findAll({
    where: { status: 'published' },
    attributes: ['id', 'slug', 'name', 'bannerUrl', 'eventDate', 'updatedAt'],
    include: [{ model: Organizer, attributes: ['slug'], where: { blockedAt: null }, required: true }],
    order: [['eventDate', 'DESC']],
    limit: 5000,
  });
  const photos = await EventMedia.findAll({
    where: { eventId: { [Op.in]: events.map((e) => e.id) }, mediaType: 'photo' },
    attributes: ['eventId', 'url'],
    order: [['createdAt', 'ASC']],
  });
  const photosByEvent = new Map<string, string[]>();
  for (const p of photos) {
    const list = photosByEvent.get(p.eventId) ?? [];
    if (list.length < 5) list.push(p.url);
    photosByEvent.set(p.eventId, list);
  }
  const organizers = await listPublicOrganizers();
  const now = Date.now();

  const urls: string[] = [];
  const add = (
    loc: string,
    opts: { lastmod?: Date; changefreq?: string; priority?: string; images?: { url: string; title: string }[] } = {},
  ) => {
    urls.push(
      `<url><loc>${xml(loc)}</loc>${opts.lastmod ? `<lastmod>${opts.lastmod.toISOString()}</lastmod>` : ''}${opts.changefreq ? `<changefreq>${opts.changefreq}</changefreq>` : ''}${
        opts.priority ? `<priority>${opts.priority}</priority>` : ''
      }${(opts.images ?? []).map((i) => `<image:image><image:loc>${xml(i.url)}</image:loc><image:title>${xml(i.title)}</image:title></image:image>`).join('')}</url>`,
    );
  };

  add(`${base}/`, { changefreq: 'daily', priority: '1.0' });
  add(`${base}/events`, { changefreq: 'daily', priority: '0.9' });
  add(`${base}/organizers`, { changefreq: 'weekly', priority: '0.6' });
  for (const e of events) {
    const upcoming = e.eventDate.getTime() > now;
    const images = [e.bannerUrl, ...(photosByEvent.get(e.id) ?? [])]
      .map(absoluteUrl)
      .filter((u, i, all): u is string => Boolean(u) && all.indexOf(u) === i)
      .map((url) => ({ url, title: e.name }));
    add(eventUrl(e), { lastmod: e.updatedAt, changefreq: upcoming ? 'daily' : 'monthly', priority: upcoming ? '0.9' : '0.4', images });
  }
  for (const o of organizers) {
    add(`${base}/organizers/${encodeURIComponent(o.slug)}`, { changefreq: 'weekly', priority: '0.6' });
  }
  for (const p of Object.keys(STATIC_PAGES)) add(`${base}${p}`, { changefreq: 'yearly', priority: '0.2' });

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join('\n')}\n</urlset>\n`;
}
