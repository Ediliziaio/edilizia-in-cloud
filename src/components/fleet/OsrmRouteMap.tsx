import { useEffect } from "react";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from "react-leaflet";
import L from "leaflet";

// Fix icone Leaflet
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

interface Waypoint {
  lat: number;
  lng: number;
  label: string;
}

interface OsrmRouteMapProps {
  routeCoordinates: [number, number][];
  waypoints: Waypoint[];
  startLat: number | null;
  startLng: number | null;
  height?: string;
}

function FitRoute({ coords }: { coords: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (coords.length < 2) return;
    const bounds = L.latLngBounds(coords.map(([lat, lng]) => [lat, lng]));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
  }, [coords, map]);
  return null;
}

/**
 * Mappa Leaflet con il tracciato OSRM + marker waypoints numerati.
 * Componente separato per lazy-loading.
 */
export function OsrmRouteMap({
  routeCoordinates,
  waypoints,
  startLat,
  startLng,
  height = "240px",
}: OsrmRouteMapProps) {
  const center: [number, number] =
    routeCoordinates.length > 0
      ? routeCoordinates[Math.floor(routeCoordinates.length / 2)]
      : [41.9028, 12.4964];

  return (
    <div style={{ height }} className="rounded-xl overflow-hidden border border-slate-700">
      <MapContainer
        center={center}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
        zoomControl
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {routeCoordinates.length > 1 && (
          <>
            <FitRoute coords={routeCoordinates} />
            <Polyline
              positions={routeCoordinates}
              pathOptions={{
                color: "#3b82f6",
                weight: 4,
                opacity: 0.85,
                dashArray: undefined,
              }}
            />
          </>
        )}

        {/* Punto di partenza (tecnico) */}
        {startLat != null && startLng != null && (
          <CircleMarker
            center={[startLat, startLng]}
            radius={8}
            pathOptions={{
              color: "#22c55e",
              fillColor: "#4ade80",
              fillOpacity: 1,
              weight: 2,
            }}
          >
            <Popup>
              <p className="text-xs font-semibold">Posizione attuale</p>
            </Popup>
          </CircleMarker>
        )}

        {/* Waypoints numerati */}
        {waypoints.map((wp, idx) => (
          <CircleMarker
            key={idx}
            center={[wp.lat, wp.lng]}
            radius={9}
            pathOptions={{
              color: "#1d4ed8",
              fillColor: "#3b82f6",
              fillOpacity: 1,
              weight: 2,
            }}
          >
            <Popup>
              <div className="text-xs">
                <p className="font-bold text-blue-700">{idx + 1}°</p>
                <p>{wp.label}</p>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
