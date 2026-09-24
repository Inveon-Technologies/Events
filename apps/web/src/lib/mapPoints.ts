import L from 'leaflet';

// Shared by the organizer's map editor and the public event map.

export type LocationPointType = 'venue' | 'pickup' | 'drop' | 'meeting' | 'stop';

export interface LocationPoint {
  type: LocationPointType;
  label: string;
  address: string | null;
  latitude: number;
  longitude: number;
  time: string | null;
  note: string | null;
}

export const POINT_TYPES: Array<{ value: LocationPointType; label: string; color: string }> = [
  { value: 'venue', label: 'Venue', color: '#e11d48' },
  { value: 'pickup', label: 'Pickup point', color: '#2563eb' },
  { value: 'drop', label: 'Drop point', color: '#7c3aed' },
  { value: 'meeting', label: 'Meeting point', color: '#059669' },
  { value: 'stop', label: 'Stop', color: '#d97706' },
];

export function pointTypeInfo(type: string) {
  return POINT_TYPES.find((t) => t.value === type) ?? POINT_TYPES[1];
}

// Free OpenStreetMap tiles — no API key or billing account needed.
export const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Centre of India, for an empty map before any point is chosen.
export const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629];
export const DEFAULT_ZOOM = 5;

// Numbered, colour-coded pin drawn in HTML/CSS — avoids Leaflet's default
// marker PNGs, which break under bundlers, and shows the point's order.
export function numberedPinIcon(n: number, type: string): L.DivIcon {
  const { color } = pointTypeInfo(type);
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:30px;height:40px">
      <svg width="30" height="40" viewBox="0 0 30 40" style="filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))">
        <path d="M15 0C6.7 0 0 6.7 0 15c0 11 15 25 15 25s15-14 15-25C30 6.7 23.3 0 15 0z" fill="${color}"/>
        <circle cx="15" cy="15" r="10" fill="#fff"/>
      </svg>
      <span style="position:absolute;top:5px;left:0;width:30px;text-align:center;font:700 12px/20px sans-serif;color:${color}">${n}</span>
    </div>`,
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    popupAnchor: [0, -36],
  });
}

// Turn-by-turn directions to a point in whatever maps app the visitor
// uses — Google Maps' universal URL needs no API key.
export function directionsUrl(p: { latitude: number; longitude: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`;
}
