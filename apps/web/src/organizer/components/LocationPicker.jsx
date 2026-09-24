import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, LocateFixed, ArrowUp, ArrowDown, Trash2, Crosshair, MapPin, Route } from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';
import {
  POINT_TYPES,
  OSM_TILE_URL,
  OSM_ATTRIBUTION,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  numberedPinIcon,
  pointTypeInfo,
} from '../../lib/mapPoints';

const MAX_POINTS = 20;

// Point objects may carry _city/_state/_pincode from a geocoding result so
// the parent form can fill its address fields; the API ignores them.
function pointFromGeocode(result, type) {
  return {
    type,
    label: result.venueName || result.displayName.split(',')[0],
    address: result.displayName,
    latitude: result.latitude,
    longitude: result.longitude,
    time: null,
    note: null,
    _city: result.city,
    _state: result.state,
    _pincode: result.pincode,
  };
}

function ClickToAdd({ onClick }) {
  useMapEvents({ click: (e) => onClick(e.latlng) });
  return null;
}

// Keeps the view on the points: fits all of them whenever the set of
// points changes, or flies to one the organizer asked to focus.
function ViewController({ points, focus }) {
  const map = useMap();
  const lastFitKey = useRef('');
  useEffect(() => {
    if (focus) {
      map.flyTo([focus.latitude, focus.longitude], Math.max(map.getZoom(), 15));
      return;
    }
    const key = points.map((p) => `${p.latitude},${p.longitude}`).join('|');
    if (key === lastFitKey.current) return;
    lastFitKey.current = key;
    // Instant, not animated: an animated fit was being cut short by the
    // re-render that follows adding a point (markers and route line
    // updating mid-animation), leaving the new point off-screen.
    map.stop();
    if (points.length === 1) map.setView([points[0].latitude, points[0].longitude], 15, { animate: false });
    else if (points.length > 1) map.fitBounds(points.map((p) => [p.latitude, p.longitude]), { padding: [40, 40], animate: false });
  }, [points, focus, map]);
  return null;
}

// Real map (OpenStreetMap via Leaflet — free, no API key) for choosing an
// event's location: one venue / drop point, or several group pickup
// points along a route. Search a real place, click the map, drag pins,
// or use the device's location; every pin can carry a time and a note.
export default function LocationPicker({ points, onChange, token }) {
  const [mode, setMode] = useState(points.length > 1 ? 'multiple' : 'single');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState('');
  const [focus, setFocus] = useState(null);

  const icons = useMemo(() => points.map((p, i) => numberedPinIcon(i + 1, p.type)), [points]);

  async function reverseGeocode(lat, lng) {
    try {
      const data = await apiRequest(`/organizer/venue-reverse?lat=${lat}&lng=${lng}`, { token });
      return data.result;
    } catch {
      return null;
    }
  }

  function commit(next) {
    onChange(next.slice(0, MAX_POINTS));
  }

  function addOrReplace(point) {
    setFocus(null);
    if (mode === 'single') {
      commit([{ ...point, type: points[0]?.type === 'drop' || points[0]?.type === 'meeting' ? points[0].type : 'venue' }]);
      return;
    }
    if (points.length >= MAX_POINTS) {
      setMessage(`You can add up to ${MAX_POINTS} points.`);
      return;
    }
    commit([...points, point]);
  }

  async function handleMapClick(latlng) {
    setMessage('');
    const lat = Math.round(latlng.lat * 1e6) / 1e6;
    const lng = Math.round(latlng.lng * 1e6) / 1e6;
    const found = await reverseGeocode(lat, lng);
    const type = mode === 'single' ? 'venue' : 'pickup';
    addOrReplace(
      found
        ? pointFromGeocode({ ...found, latitude: lat, longitude: lng }, type)
        : { type, label: `Pinned location`, address: null, latitude: lat, longitude: lng, time: null, note: null },
    );
  }

  async function handleSearch(e) {
    e.preventDefault();
    if (query.trim().length < 3) {
      setMessage('Type at least 3 characters to search.');
      return;
    }
    setSearching(true);
    setMessage('');
    try {
      const data = await apiRequest(`/organizer/venue-search?q=${encodeURIComponent(query.trim())}`, { token });
      setResults(data.results);
      if (data.results.length === 0) setMessage('No places found — try a nearby landmark, or click the map to drop a pin.');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Location search failed. Please try again.');
    } finally {
      setSearching(false);
    }
  }

  function chooseResult(result) {
    setResults([]);
    setQuery('');
    addOrReplace(pointFromGeocode(result, mode === 'single' ? 'venue' : 'pickup'));
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setMessage('Your browser does not support location access.');
      return;
    }
    setLocating(true);
    setMessage('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await handleMapClick({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setMessage(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied — search for the place or click the map instead.'
            : 'Could not get your location — search for the place or click the map instead.',
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function updatePoint(index, changes) {
    commit(points.map((p, i) => (i === index ? { ...p, ...changes } : p)));
  }

  async function handleDragEnd(index, marker) {
    const { lat, lng } = marker.getLatLng();
    const latitude = Math.round(lat * 1e6) / 1e6;
    const longitude = Math.round(lng * 1e6) / 1e6;
    const found = await reverseGeocode(latitude, longitude);
    updatePoint(index, {
      latitude,
      longitude,
      ...(found ? { address: found.displayName, _city: found.city, _state: found.state, _pincode: found.pincode } : {}),
    });
  }

  function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= points.length) return;
    const next = [...points];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    if (nextMode === 'single' && points.length > 1) {
      const keep = points.find((p) => p.type === 'venue') ?? points[0];
      commit([keep]);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Location type" className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs font-bold">
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'single'}
            onClick={() => switchMode('single')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 ${mode === 'single' ? 'bg-white shadow-xs text-brand-700' : 'text-slate-500'}`}
          >
            <MapPin className="w-3.5 h-3.5" /> Single location
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'multiple'}
            onClick={() => switchMode('multiple')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 ${mode === 'multiple' ? 'bg-white shadow-xs text-brand-700' : 'text-slate-500'}`}
          >
            <Route className="w-3.5 h-3.5" /> Multiple pickup points
          </button>
        </div>
        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={locating}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-brand-700 hover:bg-blue-100 rounded-lg text-xs font-bold border border-blue-200 shrink-0"
        >
          <LocateFixed className={`w-3.5 h-3.5 ${locating ? 'animate-spin' : ''}`} />
          {locating ? 'Getting your location…' : 'Use my current location'}
        </button>
      </div>

      <p className="text-xs text-slate-500">
        {mode === 'single'
          ? 'Search for the venue or drop point, or click the map to place the pin. Drag the pin to fine-tune it.'
          : 'Add every group pickup point in order — search or click the map for each one. Add a pickup time and a note (landmark, bus number…) for each point.'}
      </p>

      <form onSubmit={handleSearch} className="relative flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a real place, landmark, or address…"
            aria-label="Search a place"
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <button type="submit" disabled={searching} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl disabled:opacity-60">
          {searching ? 'Searching…' : 'Search'}
        </button>
        {results.length > 0 && (
          <ul className="absolute z-[1000] top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
            {results.map((r) => (
              <li key={`${r.latitude},${r.longitude},${r.displayName}`}>
                <button
                  type="button"
                  onClick={() => chooseResult(r)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 border-b border-slate-50"
                >
                  <span className="font-semibold text-slate-900 block">{r.venueName}</span>
                  <span className="text-slate-500">{r.displayName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>
      {message && <p className="text-xs text-amber-700" role="status">{message}</p>}

      <div className="h-72 sm:h-96 w-full rounded-2xl overflow-hidden border border-slate-300 relative z-0" data-testid="location-map">
        <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} scrollWheelZoom className="h-full w-full cursor-crosshair">
          <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
          <ClickToAdd onClick={handleMapClick} />
          <ViewController points={points} focus={focus} />
          {mode === 'multiple' && points.length > 1 && (
            <Polyline positions={points.map((p) => [p.latitude, p.longitude])} pathOptions={{ color: '#2563eb', weight: 3, dashArray: '6 8' }} />
          )}
          {points.map((p, i) => (
            <Marker
              key={`${i}-${p.latitude}-${p.longitude}`}
              position={[p.latitude, p.longitude]}
              icon={icons[i]}
              draggable
              eventHandlers={{ dragend: (e) => handleDragEnd(i, e.target) }}
            >
              <Tooltip direction="top" offset={[0, -36]}>
                {i + 1}. {p.label}
                {p.time ? ` · ${p.time}` : ''}
              </Tooltip>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {points.length === 0 ? (
        <p className="text-xs text-slate-400">No location chosen yet.</p>
      ) : (
        <ol className="space-y-2">
          {points.map((p, i) => (
            <li key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center gap-2">
                <span
                  className="w-6 h-6 rounded-full text-white text-[11px] font-bold flex items-center justify-center shrink-0"
                  style={{ backgroundColor: pointTypeInfo(p.type).color }}
                >
                  {i + 1}
                </span>
                <select
                  value={p.type}
                  onChange={(e) => updatePoint(i, { type: e.target.value })}
                  aria-label={`Point ${i + 1} type`}
                  className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg"
                >
                  {POINT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={p.label}
                  onChange={(e) => updatePoint(i, { label: e.target.value })}
                  aria-label={`Point ${i + 1} name`}
                  maxLength={100}
                  className="flex-1 min-w-0 px-2 py-1 text-xs font-semibold bg-white border border-slate-200 rounded-lg"
                />
                <div className="flex items-center shrink-0">
                  <button type="button" aria-label={`Show point ${i + 1} on map`} onClick={() => setFocus({ ...p })} className="p-1 text-slate-500 hover:text-brand-600">
                    <Crosshair className="w-3.5 h-3.5" />
                  </button>
                  {mode === 'multiple' && (
                    <>
                      <button type="button" aria-label={`Move point ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} className="p-1 text-slate-500 hover:text-brand-600 disabled:opacity-30">
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" aria-label={`Move point ${i + 1} down`} disabled={i === points.length - 1} onClick={() => move(i, 1)} className="p-1 text-slate-500 hover:text-brand-600 disabled:opacity-30">
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  <button type="button" aria-label={`Remove point ${i + 1}`} onClick={() => commit(points.filter((_, j) => j !== i))} className="p-1 text-rose-500 hover:text-rose-700">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {p.address && <p className="text-[11px] text-slate-500 pl-8">{p.address}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-2 pl-8">
                <input
                  type="time"
                  value={p.time || ''}
                  onChange={(e) => updatePoint(i, { time: e.target.value || null })}
                  aria-label={`Point ${i + 1} time`}
                  className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg"
                />
                <input
                  type="text"
                  value={p.note || ''}
                  onChange={(e) => updatePoint(i, { note: e.target.value || null })}
                  placeholder="Note for attendees — landmark, gate number, bus details…"
                  aria-label={`Point ${i + 1} note`}
                  maxLength={300}
                  className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg"
                />
              </div>
              <p className="text-[10px] text-slate-400 font-mono pl-8">
                {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
