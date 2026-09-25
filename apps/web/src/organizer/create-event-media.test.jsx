import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

  it('uploads every staged image to the real endpoint after the event is created, with progress', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url, opts) => {
      const urlStr = String(url);
      if (urlStr.includes('/organizer/events') && opts?.method === 'POST' && !urlStr.includes('/media')) {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ id: 'evt-new-1', slug: 'new-test-event-2026' }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ organizerName: 'Eco Pandhari Club', counts: {}, events: [] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    // Uploads use XMLHttpRequest (fetch can't report upload progress).
    const uploads = [];
    class FakeXhr {
      constructor() {
        this.headers = {};
        this.upload = {};
      }
      open(method, url) {
        this.method = method;
        this.url = url;
      }
      setRequestHeader(k, v) {
        this.headers[k] = v;
      }
      send(body) {
        this.body = body;
        uploads.push(this);
        setTimeout(() => {
          this.upload.onprogress?.({ lengthComputable: true, loaded: 500, total: 1000 });
          this.status = 201;
          this.responseText = JSON.stringify({ id: 'media-1', mediaType: 'photo', url: '/api/uploads/events/evt-new-1/x.jpg' });
          this.onload?.();
        }, 10);
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXhr);

    renderAt('/organizer/create-event/basic');

    const fileInput = document.querySelector('input[type="file"][accept*="image"]');
    await user.upload(fileInput, [makeFile('a.jpg', 1000, 'image/jpeg'), makeFile('b.jpg', 1000, 'image/jpeg')]);
    await waitFor(() => expect(screen.getAllByAltText('')).toHaveLength(2));

    await user.type(screen.getByPlaceholderText(/Rajgad Sunrise Trek/i), 'New Test Event');
    await user.click(screen.getByText('Save as Draft'));

    // The progress overlay appears while the files upload.
    await waitFor(() => expect(screen.getByText(/Uploading photos & video|All done!/)).toBeInTheDocument());

    // Both staged files should each trigger a real multipart upload call
    // against the newly created event's real id.
    await waitFor(() => {
      expect(uploads.filter((x) => x.url.includes('/organizer/events/evt-new-1/media'))).toHaveLength(2);
    });
    expect(uploads[0].method).toBe('POST');
    expect(uploads[0].body).toBeInstanceOf(FormData);
    expect(uploads[0].headers.Authorization).toBe('Bearer fake-token');
  });

  it('shows each file, lets the organizer retry a failed upload, and accepts dropped photos', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url, opts) => {
        if (String(url).includes('/organizer/events') && opts?.method === 'POST') {
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ id: 'evt-new-2', slug: 'x' }) });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ organizerName: 'Org', counts: {}, events: [] }) });
      }),
    );
    // b.jpg fails the first time only.
    const attempts = {};
    class FakeXhr {
      constructor() {
        this.upload = {};
      }
      open(method, url) {
        this.url = url;
      }
      setRequestHeader() {}
      send(body) {
        const name = body.get('file').name;
        attempts[name] = (attempts[name] ?? 0) + 1;
        setTimeout(() => {
          const fail = name === 'b.jpg' && attempts[name] === 1;
          this.status = fail ? 500 : 201;
          this.responseText = JSON.stringify(fail ? { error: 'Server busy' } : { id: `m-${name}`, mediaType: 'photo', url: '/x.jpg' });
          this.onload?.();
        }, 5);
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXhr);

    renderAt('/organizer/create-event/basic');
    const dropZone = document.querySelector('input[type="file"][accept*="image"]').closest('label').parentElement;
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [makeFile('a.jpg', 1000, 'image/jpeg'), makeFile('b.jpg', 1000, 'image/jpeg'), makeFile('notes.pdf', 10, 'application/pdf')] },
    });
    await waitFor(() => expect(screen.getAllByAltText('')).toHaveLength(2));
    expect(screen.getByText(/isn't a JPG, PNG or WebP photo/)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/Rajgad Sunrise Trek/i), 'Retry Event');
    await user.click(screen.getByText('Save as Draft'));

    await waitFor(() => expect(screen.getByText("1 file didn't upload")).toBeInTheDocument());
    expect(screen.getByText('Server busy')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Try again/ }));
    await waitFor(() => expect(attempts['b.jpg']).toBe(2));
    expect(attempts['a.jpg']).toBe(1);
  });
});
