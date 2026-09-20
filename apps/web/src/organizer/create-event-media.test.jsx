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

function makeFile(name, sizeBytes, type) {
  const file = new File([new Uint8Array(sizeBytes)], name, { type });
  return file;
}

describe('CreateEvent: event media picker', () => {
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
    // jsdom has no real image/video decoder — createObjectURL just needs
    // to not throw so the picker's preview thumbnails can render. Each
    // call gets a distinct URL, matching real browser behavior — the
    // component keys thumbnails by this value, so a fixed mock value
    // would create bogus duplicate-key warnings across multiple files.
    let blobUrlCounter = 0;
    globalThis.URL.createObjectURL = vi.fn(() => `blob:mock-preview-url-${blobUrlCounter++}`);
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('adds selected images as thumbnails, enforces the 5-image limit, and lets you remove one', async () => {
    const user = userEvent.setup();
    renderAt('/organizer/create-event/basic');

    const fileInput = document.querySelector('input[type="file"][accept*="image"]');
    expect(fileInput).toBeTruthy();

    const images = [1, 2, 3, 4, 5, 6].map((i) => makeFile(`photo${i}.jpg`, 1000, 'image/jpeg'));

    // First 5 should be accepted with no error.
    await user.upload(fileInput, images.slice(0, 5));
    await waitFor(() => expect(screen.getAllByAltText('')).toHaveLength(5));
    expect(screen.getByText('5/5 images · up to 10MB each')).toBeInTheDocument();

    // The "Add" tile itself should now be gone — the limit is reached.
    expect(document.querySelector('input[type="file"][accept*="image"]')).toBeNull();

    // Remove one image, frees a slot and the picker reappears.
    const removeButtons = screen.getAllByLabelText('Remove image');
    await user.click(removeButtons[0]);
    await waitFor(() => expect(screen.getAllByAltText('')).toHaveLength(4));
    expect(document.querySelector('input[type="file"][accept*="image"]')).toBeTruthy();
  });

  it('rejects an image over the 10MB limit with a clear error, and does not add it', async () => {
    const user = userEvent.setup();
    renderAt('/organizer/create-event/basic');

    const fileInput = document.querySelector('input[type="file"][accept*="image"]');
    const tooBig = makeFile('huge.jpg', 11 * 1024 * 1024, 'image/jpeg');

    await user.upload(fileInput, [tooBig]);
    await waitFor(() => expect(screen.getByText(/over the 10MB limit/i)).toBeInTheDocument());
    expect(screen.queryByAltText('')).not.toBeInTheDocument();
  });

  it('uploads every staged image to the real endpoint after the event is created', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url, opts) => {
      const urlStr = String(url);
      if (urlStr.includes('/organizer/events') && opts?.method === 'POST' && !urlStr.includes('/media')) {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ id: 'evt-new-1', slug: 'new-test-event-2026' }) });
      }
      if (urlStr.includes('/media')) {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ id: 'media-1', mediaType: 'photo', url: '/api/uploads/events/evt-new-1/x.jpg' }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ organizerName: 'Eco Pandhari Club', counts: {}, events: [] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/organizer/create-event/basic');

    const fileInput = document.querySelector('input[type="file"][accept*="image"]');
    await user.upload(fileInput, [makeFile('a.jpg', 1000, 'image/jpeg'), makeFile('b.jpg', 1000, 'image/jpeg')]);
    await waitFor(() => expect(screen.getAllByAltText('')).toHaveLength(2));

    await user.type(screen.getByPlaceholderText(/Rajgad Sunrise Trek/i), 'New Test Event');
    await user.click(screen.getByText('Save as Draft'));

    // Both staged files should each trigger a real multipart upload call
    // against the newly created event's real id.
    await waitFor(() => {
      const mediaCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('/organizer/events/evt-new-1/media'));
      expect(mediaCalls).toHaveLength(2);
    });
    const [, firstCallOpts] = fetchMock.mock.calls.find(([u]) => String(u).includes('/media'));
    expect(firstCallOpts.body).toBeInstanceOf(FormData);
    expect(firstCallOpts.headers.Authorization).toBe('Bearer fake-token');
  });
});
