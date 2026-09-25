import { useEffect, useState } from 'react';

// Name, logo and certificate footer set by Inveon staff in the super
// admin portal (Settings → Branding). Fetched once per page load and
// shared; everything falls back to the built-in Inveon look until it
// arrives or when nothing has been set.

export interface CertificateFooterBranding {
  supportedByLabel: string;
  technologyPartnerLabel: string;
  technologyPartnerName: string;
  technologyPartnerTagline: string;
  bookingPartnerLabel: string;
  bookingPartnerName: string;
  bookingPartnerTagline: string;
  logoUrl: string | null;
}

export interface Branding {
  platformName: string;
  logoUrl: string | null;
  supportEmail: string;
  supportPhone: string | null;
  primaryColor: string;
  companyName: string;
  certificateFooter: CertificateFooterBranding;
}

export const DEFAULT_CERTIFICATE_FOOTER: CertificateFooterBranding = {
  supportedByLabel: 'SUPPORTED BY',
  technologyPartnerLabel: 'TECHNOLOGY PARTNER',
  technologyPartnerName: 'INVEON',
  technologyPartnerTagline: 'TECHNOLOGIES',
  bookingPartnerLabel: 'EVENT BOOKING PARTNER',
  bookingPartnerName: 'INVEON',
  bookingPartnerTagline: 'EVENTS',
  logoUrl: null,
};

let cached: Branding | null = null;
let pending: Promise<Branding | null> | null = null;
const listeners = new Set<(b: Branding | null) => void>();

function isBranding(value: unknown): value is Branding {
  return Boolean(value) && typeof (value as Branding).platformName === 'string';
}

// Unit tests stub fetch with queued responses; a background branding
// request would consume one. Tests that cover branding switch it on.
function fetchAllowed(): boolean {
  return import.meta.env.MODE !== 'test' || Boolean((globalThis as { __brandingInTests?: boolean }).__brandingInTests);
}

export function loadBranding(): Promise<Branding | null> {
  if (cached) return Promise.resolve(cached);
  if (!fetchAllowed()) return Promise.resolve(null);
  if (!pending) {
    pending = fetch('/api/platform/branding')
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        cached = isBranding(body)
          ? { ...body, certificateFooter: { ...DEFAULT_CERTIFICATE_FOOTER, ...(body.certificateFooter ?? {}) } }
          : null;
        listeners.forEach((l) => l(cached));
        return cached;
      })
      .catch(() => null);
  }
  return pending;
}

export function useBranding(): Branding | null {
  const [branding, setBranding] = useState<Branding | null>(cached);
  useEffect(() => {
    listeners.add(setBranding);
    void loadBranding();
    return () => {
      listeners.delete(setBranding);
    };
  }, []);
  return branding;
}

// For tests and after the portal saves new branding.
export function resetBrandingCache(): void {
  cached = null;
  pending = null;
}
