import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/** Direct Leaflet avoids the React 19 provider required by react-leaflet v5. */
export default function HrSedeMap({
  lat,
  lng,
  radius,
}: {
  lat: number;
  lng: number;
  radius: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const shapes = useRef<L.LayerGroup | null>(null);
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { scrollWheelZoom: false });
    const tiles = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      },
    ).addTo(instance);
    tiles.on("tileerror", () => setTileError(true));
    map.current = instance;
    shapes.current = L.layerGroup().addTo(instance);
    return () => {
      tiles.off();
      instance.remove();
      map.current = null;
      shapes.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = map.current;
    const layer = shapes.current;
    if (!instance || !layer) return;
    layer.clearLayers();
    L.circle([lat, lng], { radius, color: "#2563eb", fillOpacity: 0.12 }).addTo(
      layer,
    );
    L.circleMarker([lat, lng], {
      radius: 5,
      color: "#ea580c",
      fillOpacity: 1,
    }).addTo(layer);
    const safeLat = Math.min(85, Math.max(-85, lat));
    instance.fitBounds(L.latLng(safeLat, lng).toBounds(radius * 2.6), {
      padding: [20, 20],
      maxZoom: 18,
      animate: false,
    });
    instance.invalidateSize();
  }, [lat, lng, radius]);
  return (
    <div className="space-y-2">
      <div
        ref={container}
        className="relative isolate h-64 overflow-hidden rounded-xl border"
        role="region"
        aria-label="Mappa area timbratura"
      />
      {tileError && (
        <p role="status" className="text-xs text-orange-700">
          Cartografia non disponibile. Coordinate e raggio restano consultabili
          nello schema.
        </p>
      )}
      {Math.abs(lat) > 85 && (
        <p className="text-xs text-orange-700">
          Coordinate oltre la copertura cartografica: il centro della mappa è
          approssimato. Il punto GPS salvato non viene cambiato.
        </p>
      )}
    </div>
  );
}
