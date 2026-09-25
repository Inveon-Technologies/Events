import crypto from 'crypto';
import { PlatformSetting } from '../models';
import { logger } from '../logger';

// Platform-wide settings the super admin portal edits: branding (logo
// shown across the site, emails and documents), invoice details, the
// certificate footer, and integration credentials. Read synchronously
// from an in-process cache (refreshed every 30 s and right after a
// save), so the hot paths that use them never wait on the database.
//
// Integration secrets are stored encrypted (AES-256-GCM) with a key from
// SETTINGS_ENCRYPTION_KEY (falls back to one derived from JWT_SECRET), and
// the portal only ever sees them masked.

export interface BrandingSettings {
  platformName: string;
  logoUrl: string | null;
  supportEmail: string;
  supportPhone: string | null;
  primaryColor: string;
}

export interface InvoiceSettings {
  companyName: string;
  companyAddress: string | null;
  companyGstin: string | null;
  platformLine: string;
  footerNote: string | null;
  accentColor: string;
}

export interface CertificateFooterSettings {
  supportedByLabel: string;
  technologyPartnerLabel: string;
  technologyPartnerName: string;
  technologyPartnerTagline: string;
  bookingPartnerLabel: string;
  bookingPartnerName: string;
  bookingPartnerTagline: string;
  // Replaces the drawn Inveon mark next to both partner names.
  logoUrl: string | null;
}

export const DEFAULT_BRANDING: BrandingSettings = {
  platformName: 'Inveon Events',
  logoUrl: null,
  supportEmail: 'office.inveontech@gmail.com',
  supportPhone: null,
  primaryColor: '#0050cb',
};

export const DEFAULT_INVOICE: InvoiceSettings = {
  companyName: 'Inveon Technologies',
  companyAddress: null,
  companyGstin: null,
  platformLine: 'Inveon Events (booking partner)',
  footerNote: null,
  accentColor: '#0050cb',
};

export const DEFAULT_CERTIFICATE_FOOTER: CertificateFooterSettings = {
  supportedByLabel: 'SUPPORTED BY',
  technologyPartnerLabel: 'TECHNOLOGY PARTNER',
  technologyPartnerName: 'INVEON',
  technologyPartnerTagline: 'TECHNOLOGIES',
  bookingPartnerLabel: 'EVENT BOOKING PARTNER',
  bookingPartnerName: 'INVEON',
  bookingPartnerTagline: 'EVENTS',
  logoUrl: null,
};

// Credentials the portal may set. Anything set here wins over the
// same-named environment variable; clearing it falls back to the env.
export const INTEGRATION_KEYS = {
  email: ['SMTP_USER', 'SMTP_PASS', 'SMTP_FROM_NAME'],
  cashfree: ['CASHFREE_APP_ID', 'CASHFREE_SECRET_KEY', 'CASHFREE_ENV', 'PLATFORM_FEE_PERCENT'],
  whatsapp: [
    'WHATSAPP_PROVIDER',
    'AISENSY_API_KEY',
    'AISENSY_API_URL',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_TEMPLATE_LANGUAGE',
  ],
} as const;
export type IntegrationKey = (typeof INTEGRATION_KEYS)[keyof typeof INTEGRATION_KEYS][number];
const ALL_INTEGRATION_KEYS = new Set<string>(Object.values(INTEGRATION_KEYS).flat());
// Shown in full in the portal (not secret).
const PLAIN_INTEGRATION_KEYS = new Set<string>([
  'SMTP_USER',
  'SMTP_FROM_NAME',
  'CASHFREE_ENV',
  'PLATFORM_FEE_PERCENT',
  'WHATSAPP_PROVIDER',
  'AISENSY_API_URL',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_TEMPLATE_LANGUAGE',
]);

export function isIntegrationKey(key: string): key is IntegrationKey {
  return ALL_INTEGRATION_KEYS.has(key);
}

const cache = new Map<string, unknown>();
let loadedAt = 0;
const listeners: (() => void)[] = [];

// Called when integration values change (e.g. the SMTP transporter is
// rebuilt with the new login).
export function onSettingsChanged(listener: () => void): void {
  listeners.push(listener);
}

export async function loadPlatformSettings(): Promise<void> {
  const rows = await PlatformSetting.findAll();
  const before = JSON.stringify(cache.get('integrations') ?? null);
  cache.clear();
  for (const row of rows) cache.set(row.key, row.value);
  loadedAt = Date.now();
  if (JSON.stringify(cache.get('integrations') ?? null) !== before) listeners.forEach((l) => l());
}

let refreshTimer: NodeJS.Timeout | null = null;
export function startSettingsRefresh(intervalMs = 30_000): void {
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    loadPlatformSettings().catch((err) => logger.warn({ err }, 'Could not refresh platform settings'));
  }, intervalMs);
  refreshTimer.unref();
}

export function settingsLoadedAt(): Date | null {
  return loadedAt ? new Date(loadedAt) : null;
}

function merged<T extends object>(key: string, defaults: T): T {
  const stored = cache.get(key);
  return stored && typeof stored === 'object' ? { ...defaults, ...(stored as Partial<T>) } : { ...defaults };
}

export const getBranding = (): BrandingSettings => merged('branding', DEFAULT_BRANDING);
export const getInvoiceSettings = (): InvoiceSettings => merged('invoice', DEFAULT_INVOICE);
export const getCertificateFooter = (): CertificateFooterSettings => merged('certificateFooter', DEFAULT_CERTIFICATE_FOOTER);

export async function saveSetting(key: string, value: unknown, updatedBy: string): Promise<void> {
  await PlatformSetting.upsert({ key, value: value as object, updatedBy });
  await loadPlatformSettings();
}

// --- integration credentials ---

function encryptionKey(): Buffer {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!raw) throw new Error('SETTINGS_ENCRYPTION_KEY (or JWT_SECRET) must be set to store integration secrets');
  return crypto.createHash('sha256').update(`inveon-settings:${raw}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decryptSecret(stored: string): string | null {
  try {
    const [version, iv, tag, data] = stored.split(':');
    if (version !== 'v1') return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

function storedIntegrations(): Record<string, string> {
  const stored = cache.get('integrations');
  return stored && typeof stored === 'object' ? (stored as Record<string, string>) : {};
}

// The value a service should use: the portal's saved value, else the
// environment variable of the same name.
export function integrationValue(key: IntegrationKey): string | undefined {
  const stored = storedIntegrations()[key];
  if (stored) {
    const value = decryptSecret(stored);
    if (value !== null && value !== '') return value;
  }
  const fromEnv = process.env[key];
  return fromEnv === undefined || fromEnv === '' ? undefined : fromEnv;
}

function mask(value: string): string {
  if (value.length <= 4) return '••••';
  return `••••••${value.slice(-4)}`;
}

export interface IntegrationFieldView {
  key: IntegrationKey;
  source: 'portal' | 'env' | 'unset';
  value: string | null; // full for plain fields, masked for secrets
  secret: boolean;
}

export function integrationView(): Record<keyof typeof INTEGRATION_KEYS, IntegrationFieldView[]> {
  const stored = storedIntegrations();
  const out = {} as Record<keyof typeof INTEGRATION_KEYS, IntegrationFieldView[]>;
  for (const [group, keys] of Object.entries(INTEGRATION_KEYS) as [keyof typeof INTEGRATION_KEYS, readonly IntegrationKey[]][]) {
    out[group] = keys.map((key) => {
      const secret = !PLAIN_INTEGRATION_KEYS.has(key);
      const fromPortal = stored[key] ? decryptSecret(stored[key]) : null;
      const value = fromPortal || process.env[key] || null;
      return {
        key,
        secret,
        source: fromPortal ? 'portal' : process.env[key] ? 'env' : 'unset',
        value: value ? (secret ? mask(value) : value) : null,
      };
    });
  }
  return out;
}

// `values`: key → new value; '' clears the portal value (back to env);
// keys left out are unchanged.
export async function saveIntegrations(values: Record<string, string>, updatedBy: string): Promise<IntegrationKey[]> {
  const next = { ...storedIntegrations() };
  const changed: IntegrationKey[] = [];
  for (const [key, raw] of Object.entries(values)) {
    if (!isIntegrationKey(key)) continue;
    const value = String(raw ?? '').trim();
    if (value.length > 2000) continue;
    if (value === '') delete next[key];
    else next[key] = encryptSecret(value);
    changed.push(key);
  }
  await saveSetting('integrations', next, updatedBy);
  return changed;
}

// For tests.
export function resetSettingsCacheForTests(): void {
  cache.clear();
  loadedAt = 0;
}

// Inveon's cut of every online payment, in percent. One source for the
// Cashfree split and every page that shows the fee: 0 is honoured (it
// used to fall back to 5 in the split but 0 on screen); unset → 5.
export const DEFAULT_PLATFORM_FEE_PERCENT = 5;
export function platformFeePercent(): number {
  const raw = integrationValue('PLATFORM_FEE_PERCENT');
  if (raw === undefined) return DEFAULT_PLATFORM_FEE_PERCENT;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 50 ? value : DEFAULT_PLATFORM_FEE_PERCENT;
}

// 'production' only when explicitly set; anything else is the sandbox.
export function cashfreeMode(): 'production' | 'sandbox' {
  return integrationValue('CASHFREE_ENV') === 'production' ? 'production' : 'sandbox';
}
