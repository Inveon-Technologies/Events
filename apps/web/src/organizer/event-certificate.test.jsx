import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../App';

function renderAt(path) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const design = {
  version: 1,
  backgroundUrl: null,
  fields: [
    {
      id: 'title',
      kind: 'text',
      label: 'Title',
      x: 15,
      y: 22,
      w: 70,
      h: 10,
      text: 'CERTIFICATE',
      fontFamily: 'Cinzel',
      fontSize: 60,
      color: '#0b1c3f',
      bold: true,
      align: 'center',
      letterSpacing: 0,
      uppercase: false,
    },
    {
      id: 'participant',
      kind: 'text',
      label: 'Participant name',
      x: 10,
      y: 43,
      w: 80,
      h: 8,
      text: '{participant}',
      fontFamily: 'Cinzel',
      fontSize: 46,
      color: '#0b1c3f',
      bold: true,
      align: 'center',
      letterSpacing: 0,
      uppercase: true,
    },
    {
      id: 'event',
      kind: 'text',
      label: 'Event name',
      x: 10,
      y: 55,
      w: 80,
      h: 7,
      text: '{event}',
      fontFamily: 'Playfair Display',
      fontSize: 38,
      color: '#0b1c3f',
      bold: true,
      align: 'center',
      letterSpacing: 0,
      uppercase: false,
    },
    { id: 'logo', kind: 'image', label: 'Organizer logo', x: 44, y: 5, w: 11, h: 13, imageUrl: null, source: 'organizerLogo' },
  ],
};

describe('Organizer: participation certificate designer', () => {
  let fetchMock;

  beforeEach(() => {
    localStorage.setItem(
      'inveon_user',
      JSON.stringify({
        id: 'u1',
        email: 'owner@epc.example',
        role: 'organizer_owner',
        organizerId: 'org-1',
        token: 't',
        name: 'owner',
        isLoggedIn: true,
      }),
    );
    fetchMock = vi.fn().mockImplementation((url, opts) => {
      const u = String(url);
      const json = (body, status = 200) =>
        Promise.resolve({ ok: status < 400, status, json: async () => body, blob: async () => new Blob(['png']) });
      if (u.endsWith('/organizer/events/evt-1/certificate') && opts?.method === 'PUT') {
        const body = JSON.parse(opts.body);
        return json({ enabled: body.enabled ?? true, design: body.design ?? design, isDefault: false });
      }
      if (u.endsWith('/organizer/events/evt-1/certificate')) {
        return json({
          enabled: false,
          design,
          isDefault: true,
          defaultDesign: design,
          fonts: ['Cinzel', 'Playfair Display', 'Montserrat', 'Inter', 'Great Vibes'],
          tokens: ['participant', 'event', 'date', 'organizer'],
          footerTopPercent: 80,
          maxFields: 40,
        });
      }
      if (u.endsWith('/organizer/events/evt-1')) {
        return json({
          id: 'evt-1',
          title: 'Dandiya Night 2026',
          eventDate: '2026-10-18T13:30:00.000Z',
          shortDescription: 'Music • Dance',
          venueAddress: 'Cultural Ground, Pandharpur',
          partners: [{ name: 'EPC Sound', role: 'Music Partner', logoUrl: null }],
        });
      }
      if (u.includes('/organizer/profile')) return json({ name: 'Eco Pandhari Club', logoUrl: null });
      if (u.includes('/certificate/preview')) return json({});
      return json({ counts: {}, events: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview');
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('shows the live certificate with the sample attendee, event values and the fixed footer', async () => {
    renderAt('/organizer/events/evt-1/certificate');
    const canvas = await screen.findByTestId('certificate-canvas');
    expect(within(canvas).getByText('RAHUL SHARMA')).toBeInTheDocument();
    expect(within(canvas).getByText('Dandiya Night 2026')).toBeInTheDocument();
    const footer = within(canvas).getByTestId('certificate-footer');
    expect(within(footer).getByText('SUPPORTED BY')).toBeInTheDocument();
    expect(within(footer).getByText('EPC Sound')).toBeInTheDocument();
    expect(within(footer).getByText('TECHNOLOGY PARTNER')).toBeInTheDocument();
    expect(within(footer).getByText('EVENT BOOKING PARTNER')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Sample participant name'));
    await userEvent.type(screen.getByLabelText('Sample participant name'), 'Asha Patil');
    expect(within(canvas).getByText('ASHA PATIL')).toBeInTheDocument();
  });

  it('switches certificates on straight away', async () => {
    renderAt('/organizer/events/evt-1/certificate');
    const toggle = await screen.findByRole('switch', { name: 'Send certificates' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    const put = fetchMock.mock.calls.find(([u, o]) => String(u).endsWith('/certificate') && o?.method === 'PUT');
    expect(JSON.parse(put[1].body)).toEqual({ enabled: true });
  });

  it('edits a field, adds custom text, and saves the design', async () => {
    renderAt('/organizer/events/evt-1/certificate');
    await screen.findByTestId('certificate-canvas');
    expect(screen.getByRole('button', { name: /Saved/ })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Participant name' }));
    await userEvent.selectOptions(screen.getByLabelText('Font'), 'Great Vibes');
    fireEvent.change(screen.getByLabelText('Colour'), { target: { value: '#b7862c' } });
    await userEvent.click(screen.getByLabelText('Align left'));

    await userEvent.click(screen.getByRole('button', { name: /Add text/ }));
    const text = screen.getByLabelText('Field text');
    await userEvent.clear(text);
    await userEvent.type(text, 'Held at Pandharpur');

    await userEvent.click(screen.getByRole('button', { name: /Save design/ }));
    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([u, o]) => String(u).endsWith('/certificate') && o?.method === 'PUT');
      expect(put).toBeTruthy();
      const saved = JSON.parse(put[1].body).design;
      const participant = saved.fields.find((f) => f.id === 'participant');
      expect(participant).toMatchObject({ fontFamily: 'Great Vibes', color: '#b7862c', align: 'left' });
      expect(saved.fields.some((f) => f.kind === 'text' && f.text === 'Held at Pandharpur')).toBe(true);
    });
  });

  it('opens the server-rendered preview', async () => {
    renderAt('/organizer/events/evt-1/certificate');
    await screen.findByTestId('certificate-canvas');
    await userEvent.click(screen.getByRole('button', { name: /Preview as PDF/ }));
    expect(await screen.findByAltText('Certificate preview')).toHaveAttribute('src', 'blob:preview');
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/certificate/preview'));
    expect(JSON.parse(call[1].body).participant).toBe('Rahul Sharma');
  });

  it('turns certificates on from the event wizard and sends it with the event', async () => {
    renderAt('/organizer/create-event/preview');
    const toggle = await screen.findByRole('switch', { name: 'Send participation certificates' });
    await userEvent.click(toggle);
    await userEvent.click(screen.getByText('Save as Draft'));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u, o]) => String(u).endsWith('/organizer/events') && o?.method === 'POST');
      expect(call).toBeTruthy();
      expect(JSON.parse(call[1].body).certificateEnabled).toBe(true);
    });
  });
});
