import { useEffect } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import type { GpsPosition } from "@/types/fleet";

// Fix icone Leaflet
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

type PositionPoint = Pick<GpsPosition, "lat" | "lng" | "recorded_at">;

function FitPolyline({ positions }: { positions: PositionPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length < 2) return;
    const bounds = L.latLngBounds(positions.map((p) => [p.lat, p.lng]));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
  }, [positions, map]);
  return null;
}

interface PercorsoMapProps {
  positions: PositionPoint[];
  height?: string;
}

/**
 * Mappa Leaflet del percorso di un tecnico (polyline + punti di inizio/fine).
 * Componente separato per consentire il lazy loading.
 */
export function PercorsoMap({ positions, height = "320px" }: PercorsoMapProps) {
  if (positions.length === 0) return null;

  const latlngs: [number, number][] = positions.map((p) => [p.lat, p.lng]);
  const start = latlngs[0];
  const end = latlngs[latlngs.length - 1];

  return (
    <div style={{ height }} className="rounded-lg overflow-hidden border">
      <MapContainer
        center={start}
        zoom={14}
        style={{ height: "100%", width: "100%" }}
        zoomControl
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitPolyline positions={positions} />

        <Polyline
          positions={latlngs}
          pathOptions={{ color: "#3b82f6", weight: 3, opacity: 0.85 }}
        />

        {/* Punto di inizio — verde */}
        <CircleMarker
          center={start}
          radius={7}
          pathOptions={{ color: "#16a34a", fillColor: "#22c55e", fillOpacity: 1, weight: 2 }}
        />

        {/* Punto di fine — rosso */}
        <CircleMarker
          center={end}
          radius={7}
          pathOptions={{ color: "#dc2626", fillColor: "#ef4444", fillOpacity: 1, weight: 2 }}
        />
      </MapContainer>
    </div>
  );
}
