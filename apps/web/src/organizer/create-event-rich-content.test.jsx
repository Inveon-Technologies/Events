import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../App';

function renderAt(path) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CreateEvent: schedule, packing checklist, and FAQ', () => {
  beforeEach(() => {
    localStorage.setItem(
      'inveon_user',
      JSON.stringify({
        id: 'u1',
        email: 'owner@ecopandhari.example',
        role: 'organizer_owner',
        organizerId: 'org-1',
        token: 'fake-token',
        name: 'owner',
        orgName: null,
        avatar: 'https://example.com/avatar.png',
        isLoggedIn: true,
      }),
    );
    localStorage.removeItem('inveon_events');
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('adds, fills in, and removes schedule and packing checklist rows on the basic info step', async () => {
    const user = userEvent.setup();
    renderAt('/organizer/create-event/basic');

    await user.click(screen.getByRole('button', { name: /add step/i }));
    const timeInput = screen.getByPlaceholderText('6:00 AM');
    const titleInput = screen.getByPlaceholderText('Assembly at base camp');
    await user.type(timeInput, '06:00 AM');
    await user.type(titleInput, 'Assembly');
    expect(timeInput).toHaveValue('06:00 AM');
    expect(titleInput).toHaveValue('Assembly');

    await user.click(screen.getByRole('button', { name: /add item/i }));
    const itemInput = screen.getByPlaceholderText('Trekking shoes');
    await user.type(itemInput, 'Water bottle');
    expect(itemInput).toHaveValue('Water bottle');

    // Removing brings back the "nothing added yet" empty state.
    await user.click(screen.getByRole('button', { name: /remove step/i }));
    expect(screen.getByText('No schedule steps added yet — optional.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /remove item/i }));
    expect(screen.getByText('No packing items added yet — optional.')).toBeInTheDocument();
  });

  it('adds an FAQ question/answer pair on the Policy & FAQ step', async () => {
    const user = userEvent.setup();
    renderAt('/organizer/create-event/cancellation');

    await user.click(screen.getByRole('button', { name: /add question/i }));
    const questionInput = screen.getByPlaceholderText('Is food included?');
    await user.type(questionInput, 'Is transport included?');
    expect(questionInput).toHaveValue('Is transport included?');

    await user.click(screen.getByRole('button', { name: /remove question/i }));
    expect(screen.getByText('No FAQs added yet — optional.')).toBeInTheDocument();
  });

  it('includes schedule, packing checklist, and FAQ items in the real create-event request', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url, opts) => {
      const urlStr = String(url);
      if (urlStr.includes('/organizer/events') && opts?.method === 'POST' && !urlStr.includes('/media')) {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ id: 'evt-rich-1', slug: 'rich-event-2026' }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ organizerName: 'Eco Pandhari Club', counts: {}, events: [] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/organizer/create-event/basic');
    await user.type(screen.getByPlaceholderText(/Rajgad Sunrise Trek/i), 'Rich Content Event');

    await user.click(screen.getByRole('button', { name: /add step/i }));
    await user.type(screen.getByPlaceholderText('6:00 AM'), '06:00 AM');
    await user.type(screen.getByPlaceholderText('Assembly at base camp'), 'Assembly');

    await user.click(screen.getByRole('button', { name: /add item/i }));
    await user.type(screen.getByPlaceholderText('Trekking shoes'), 'Water bottle');

    await user.click(screen.getByText('Save as Draft'));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(
        ([u, o]) => String(u).includes('/organizer/events') && o?.method === 'POST' && !String(u).includes('/media'),
      );
      expect(createCall).toBeTruthy();
      const body = JSON.parse(createCall[1].body);
      expect(body.scheduleItems).toEqual([{ time: '06:00 AM', title: 'Assembly', description: '' }]);
      expect(body.packingChecklist).toEqual([{ item: 'Water bottle', mandatory: true }]);
    });
  });
});
