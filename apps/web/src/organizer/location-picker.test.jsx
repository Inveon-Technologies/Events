import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import LocationPicker from './components/LocationPicker';

// jsdom has no SVG layout, so Leaflet's vector layers (the dashed route
// line) can't render here; they're exercised in a real browser instead.
vi.mock('react-leaflet', async (importOriginal) => ({
  ...(await importOriginal()),
  Polyline: () => null,
}));


const swargate = { displayName: 'Swargate, Pune, Maharashtra, 411042, India', venueName: 'Swargate', city: 'Pune', state: 'Maharashtra', pincode: '411042', latitude: 18.5018, longitude: 73.8636 };
const katraj = { displayName: 'Katraj, Pune, Maharashtra, 411046, India', venueName: 'Katraj Chowk', city: 'Pune', state: 'Maharashtra', pincode: '411046', latitude: 18.4575, longitude: 73.8678 };

function Harness({ onChange }) {
  const [points, setPoints] = useState([]);
  return (
    <LocationPicker
      points={points}
      token="t"
      onChange={(next) => {
        setPoints(next);
        onChange(next);
      }}
    />
  );
}

function mockSearch() {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
    const u = String(url);
    const q = decodeURIComponent(u.split('q=')[1] ?? '');
    const results = q.startsWith('swar') ? [swargate] : q.startsWith('katr') ? [katraj] : [];
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ results }) });
  }));
}

describe('LocationPicker (real OpenStreetMap search)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders a real map and never offers hardcoded preset venues', () => {
    mockSearch();
    render(<Harness onChange={() => {}} />);
    expect(screen.getByTestId('location-map')).toBeInTheDocument();
    expect(document.querySelector('.leaflet-container')).toBeTruthy();
    expect(screen.queryByText(/Rajgad|Marriott|Popular Venues/i)).not.toBeInTheDocument();
  });

  it('single location: a searched place becomes the venue, replacing any previous pick', async () => {
    mockSearch();
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.type(screen.getByLabelText('Search a place'), 'swargate');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await user.click(await screen.findByRole('button', { name: /Swargate, Pune/ }));
    await user.type(screen.getByLabelText('Search a place'), 'katraj');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await user.click(await screen.findByRole('button', { name: /Katraj, Pune/ }));

    const last = onChange.mock.calls.at(-1)[0];
    expect(last).toHaveLength(1);
    expect(last[0]).toMatchObject({ type: 'venue', label: 'Katraj Chowk', latitude: 18.4575, _pincode: '411046' });
  });

  it('multiple pickup points: adds points in order with times and notes, reorders and removes', async () => {
    mockSearch();
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: /multiple pickup points/i }));
    for (const q of ['swargate', 'katraj']) {
      await user.type(screen.getByLabelText('Search a place'), q);
      await user.click(screen.getByRole('button', { name: 'Search' }));
      await user.click(await screen.findByRole('button', { name: new RegExp(q === 'swargate' ? 'Swargate, Pune' : 'Katraj, Pune') }));
    }
    await user.type(screen.getByLabelText('Point 1 time'), '04:30');
    await user.type(screen.getByLabelText('Point 2 note'), 'Opposite the petrol pump');

    let last = onChange.mock.calls.at(-1)[0];
    expect(last.map((p) => [p.type, p.label])).toEqual([['pickup', 'Swargate'], ['pickup', 'Katraj Chowk']]);
    expect(last[0].time).toBe('04:30');
    expect(last[1].note).toBe('Opposite the petrol pump');

    await user.click(screen.getByLabelText('Move point 1 down'));
    last = onChange.mock.calls.at(-1)[0];
    expect(last.map((p) => p.label)).toEqual(['Katraj Chowk', 'Swargate']);

    await user.click(screen.getByLabelText('Remove point 1'));
    await waitFor(() => expect(onChange.mock.calls.at(-1)[0].map((p) => p.label)).toEqual(['Swargate']));
  });

  it('says so when no real place matches, instead of inventing an address', async () => {
    mockSearch();
    const user = userEvent.setup();
    render(<Harness onChange={() => {}} />);
    await user.type(screen.getByLabelText('Search a place'), 'nowhere at all');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(/No places found/)).toBeInTheDocument();
  });
});
