import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

const KEY = 'k7Qp2Vx9LmT4sRw8ZyA1';
const BASE = `/api/sa/${KEY}`;

type Handler = (url: string, init?: RequestInit) => { status?: number; body: unknown } | undefined;

function stubFetch(handler: Handler) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const r = handler(String(input), init) ?? { status: 404, body: { error: 'Not found' } };
    const status = r.status ?? 200;
    const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return {
      ok: status < 400,
      status,
      text: async () => text,
      json: async () => JSON.parse(text),
      blob: async () => new Blob([text]),
    } as Response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function lastBody(fetchMock: ReturnType<typeof stubFetch>, url: string, method: string) {
  const call = [...fetchMock.mock.calls].reverse().find(([u, init]) => String(u) === url && init?.method === method);
  return call ? JSON.parse(String(call[1]!.body)) : null;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('super admin designers', () => {
  beforeEach(() => {
    sessionStorage.setItem(
      'inveon_sa_session',
      JSON.stringify({ token: 't', email: 'ops@inveon.in', name: 'Ops', expiresAt: Date.now() + 3600_000 }),
    );
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:preview', revokeObjectURL: () => undefined }));
  });
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('adds a button to an email template, switches it on and saves it', async () => {
    const template = {
      enabled: false,
      subject: 'Thanks for joining {eventName}',
      preheader: '',
      blocks: [{ id: 'heading', type: 'heading', text: 'Thanks!', align: 'left', fontSize: 20 }],
    };
    const fetchMock = stubFetch((url, init) => {
      if (url === `${BASE}/ping`) return { body: { ok: true } };
      if (url === `${BASE}/settings/email-templates`)
        return {
          body: {
            templates: [
              {
                key: 'postEventThankYou',
                name: 'Thank you (after the event)',
                description: 'Sent after the event.',
                variables: { customerName: 'Attendee name(s)', feedbackUrl: 'Feedback link' },
                sections: { gallery: 'Photos & videos' },
                saved: false,
                template,
                defaultTemplate: template,
              },
            ],
          },
        };
      if (url === `${BASE}/settings/email-templates/postEventThankYou/preview`)
        return { body: { subject: 'Thanks for joining Rajgad Trek', html: '<p>preview</p>' } };
      if (url === `${BASE}/settings/email-templates/postEventThankYou` && init?.method === 'PUT')
        return { body: { template: JSON.parse(String(init.body)).template } };
      return undefined;
    });
    renderAt(`/x/${KEY}/email-templates`);
    expect(await screen.findByText('Thanks for joining Rajgad Trek')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^Button/ }));
    const label = screen.getByLabelText('Button label');
    await userEvent.clear(label);
    await userEvent.type(label, 'Rate ');
    await userEvent.click(screen.getByRole('button', { name: '{customerName}' }));
    await userEvent.type(screen.getByLabelText(/^Link/), 'https://example.com/r');
    await userEvent.click(screen.getByRole('checkbox', { name: /Off: the standard email is sent/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save template' }));

    await waitFor(() => expect(lastBody(fetchMock, `${BASE}/settings/email-templates/postEventThankYou`, 'PUT')).toBeTruthy());
    const body = lastBody(fetchMock, `${BASE}/settings/email-templates/postEventThankYou`, 'PUT');
    expect(body.template.enabled).toBe(true);
    expect(body.template.blocks[1]).toMatchObject({ type: 'button', text: 'Rate {customerName}', url: 'https://example.com/r' });
    expect(await screen.findByText(/Customers now get this design/)).toBeInTheDocument();
  });

  it('hides an invoice section and saves the layout', async () => {
    const layout = {
      version: 1,
      blocks: ['header', 'parties', 'event', 'items', 'payment', 'terms'].map((type) => ({ id: type, type, visible: true })),
    };
    const fetchMock = stubFetch((url, init) => {
      if (url === `${BASE}/ping`) return { body: { ok: true } };
      if (url === `${BASE}/settings/invoice-layout` && init?.method !== 'PUT')
        return { body: { layout, saved: false, defaultLayout: layout, tokens: { customerName: 'Customer name' } } };
      if (url === `${BASE}/settings/invoice-layout/preview`) return { body: '%PDF-1.3' };
      if (url === `${BASE}/settings/invoice-layout` && init?.method === 'PUT') return { body: JSON.parse(String(init.body)) };
      return undefined;
    });
    renderAt(`/x/${KEY}/invoice-designer`);
    const row = (await screen.findByText('Terms & conditions')).closest('div[draggable]') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Hide' }));
    await userEvent.click(screen.getByRole('button', { name: /^Text block/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save layout' }));
    await waitFor(() => expect(lastBody(fetchMock, `${BASE}/settings/invoice-layout`, 'PUT')).toBeTruthy());
    const body = lastBody(fetchMock, `${BASE}/settings/invoice-layout`, 'PUT');
    expect(body.layout.blocks.find((b: { type: string }) => b.type === 'terms').visible).toBe(false);
    expect(body.layout.blocks.at(-1)).toMatchObject({ type: 'text', visible: true });
    expect(await screen.findByTitle('Invoice preview')).toHaveAttribute('src', 'blob:preview');
  });

  it('edits a certificate footer field and saves the design', async () => {
    const design = {
      version: 1,
      fields: [
        { id: 'supportedBy', kind: 'text', label: 'Partners heading', x: 30, y: 81.5, w: 40, h: 1.6, text: 'SUPPORTED BY', fontSize: 8 },
        { id: 'partners', kind: 'partners', label: 'Event partners', x: 10, y: 83.3, w: 80, h: 6.2 },
      ],
    };
    const fetchMock = stubFetch((url, init) => {
      if (url === `${BASE}/ping`) return { body: { ok: true } };
      if (url === `${BASE}/settings/certificate-footer-design` && init?.method !== 'PUT')
        return {
          body: {
            design,
            saved: false,
            defaultDesign: design,
            fonts: ['Montserrat'],
            tokens: ['event'],
            footerTopPercent: 80,
            maxFields: 24,
          },
        };
      if (url === `${BASE}/settings/certificate-footer-design` && init?.method === 'PUT') return { body: JSON.parse(String(init.body)) };
      return undefined;
    });
    renderAt(`/x/${KEY}/certificate`);
    await userEvent.click(await screen.findByRole('button', { name: 'Partners heading' }));
    const text = screen.getByLabelText('Field text');
    await userEvent.clear(text);
    await userEvent.type(text, 'OUR PARTNERS');
    await userEvent.click(screen.getByRole('button', { name: /Add logo \/ image/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save footer' }));
    await waitFor(() => expect(lastBody(fetchMock, `${BASE}/settings/certificate-footer-design`, 'PUT')).toBeTruthy());
    const body = lastBody(fetchMock, `${BASE}/settings/certificate-footer-design`, 'PUT');
    expect(body.design.fields[0].text).toBe('OUR PARTNERS');
    expect(body.design.fields[2]).toMatchObject({ kind: 'image', imageUrl: null });
    expect(body.design.fields[2].y).toBeGreaterThanOrEqual(80);
  });
});
