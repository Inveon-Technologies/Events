import { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  LocationPoint,
  OSM_TILE_URL,
  OSM_ATTRIBUTION,
  numberedPinIcon,
  pointTypeInfo,
  directionsUrl,
} from '../../lib/mapPoints';

// Read-only map of an event's pins (venue / pickup points / drop point)
// for attendees, with each point's time, note and a directions link.
export function EventLocationMap({ points }: { points: LocationPoint[] }) {
  const icons = useMemo(() => points.map((p, i) => numberedPinIcon(i + 1, p.type)), [points]);
  if (points.length === 0) return null;

  const bounds = points.map((p) => [p.latitude, p.longitude] as [number, number]);
  const isRoute = points.length > 1 && points.some((p) => p.type === 'pickup' || p.type === 'stop');

  return (
    <div className="space-y-3">
      <div className="h-72 sm:h-80 w-full rounded-2xl overflow-hidden border border-slate-200 relative z-0" data-testid="event-location-map">
        <MapContainer
          {...(points.length === 1 ? { center: bounds[0], zoom: 15 } : { bounds, boundsOptions: { padding: [40, 40] } })}
          scrollWheelZoom={false}
          className="h-full w-full"
        >
          <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
          {isRoute && <Polyline positions={bounds} pathOptions={{ color: '#2563eb', weight: 3, dashArray: '6 8' }} />}
          {points.map((p, i) => (
            <Marker key={i} position={[p.latitude, p.longitude]} icon={icons[i]}>
              <Popup>
                <strong>{i + 1}. {p.label}</strong>
                {p.time && <div>{p.time}</div>}
                {p.note && <div>{p.note}</div>}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <ol className="space-y-2">
        {points.map((p, i) => {
          const info = pointTypeInfo(p.type);
          return (
            <li key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span
                className="w-6 h-6 rounded-full text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5"
                style={{ backgroundColor: info.color }}
              >
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-bold text-slate-900 text-sm">{p.label}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: info.color }}>{info.label}</span>
                  {p.time && <span className="text-xs font-semibold text-slate-700">· {p.time}</span>}
                </div>
                {p.address && <p className="text-xs text-slate-500 mt-0.5">{p.address}</p>}
                {p.note && <p className="text-xs text-slate-700 mt-1">{p.note}</p>}
              </div>
              <a
                href={directionsUrl(p)}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-primary hover:underline shrink-0"
              >
                Directions
              </a>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
