import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TecnicoLivePosition, CantiereGeofence } from "@/types/fleet";
import { STALE_THRESHOLD_SEC } from "@/hooks/useLiveTecnici";
import { useReverseGeocode } from "@/hooks/useReverseGeocode";
import { cn } from "@/lib/utils";

// Fix icone Leaflet con Vite
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

// ── Icona SVG personalizzata per tecnico ──────────────────────────────────────
function createTecnicoIcon(initials: string, color: string, stale: boolean): L.DivIcon {
  const bg = stale ? "#9ca3af" : color.replace("bg-", "").split(" ")[0];
  // Uso un colore CSS hardcoded basato sul nome del colore Tailwind
  const cssColor = stale ? "#9ca3af" : "#3b82f6";

  return L.divIcon({
    className: "",
    html: `<div style="
      width:32px;height:32px;border-radius:50%;
      background:${cssColor};
      color:white;font-weight:bold;font-size:11px;
      display:flex;align-items:center;justify-content:center;
      border:2px solid white;
      box-shadow:0 2px 4px rgba(0,0,0,.3);
      opacity:${stale ? 0.5 : 1};
    ">${initials}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -20],
  });
}

// ── Popup content con indirizzo reverse-geocodificato ────────────────────────
function TecnicoPopupContent({
  t,
  stale,
  onPercorso,
}: {
  t: TecnicoLivePosition;
  stale: boolean;
  onPercorso?: () => void;
}) {
  const { address, isLoading: isGeoLoading } = useReverseGeocode(t.lat, t.lng);

  return (
    <div className="text-xs space-y-1 min-w-[150px]">
      <p className="font-semibold">{t.fullName}</p>
      {stale ? (
        <Badge variant="secondary" className="text-[10px]">Offline</Badge>
      ) : (
        <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px]">
          In linea
        </Badge>
      )}
      <p className="text-muted-foreground text-[10px]">
        {isGeoLoading ? "Rilevamento indirizzo…" : (address ?? "Indirizzo non disponibile")}
      </p>
      {t.speed != null && (
        <p className="text-muted-foreground">
          Velocità: {Math.round(t.speed * 3.6)} km/h
        </p>
      )}
      {t.battery_level != null && (
        <p className="text-muted-foreground">Batteria: {t.battery_level}%</p>
      )}
      <p className="text-muted-foreground">
        {t.staleSec < 60 ? `${t.staleSec}s fa` : `${Math.floor(t.staleSec / 60)}m fa`}
      </p>
      {onPercorso && (
        <Button
          size="sm"
          variant="outline"
          className="w-full h-6 text-[10px] mt-1"
          onClick={onPercorso}
        >
          Percorso
        </Button>
      )}
    </div>
  );
}

// ── Auto-fit bounds ───────────────────────────────────────────────────────────
function FitBounds({ tecnici }: { tecnici: TecnicoLivePosition[] }) {
  const map = useMap();
  const fittedRef = useRef(false);

  useEffect(() => {
    if (fittedRef.current || tecnici.length === 0) return;
    const bounds = L.latLngBounds(tecnici.map((t) => [t.lat, t.lng]));
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40] });
      fittedRef.current = true;
    }
  }, [tecnici, map]);

  return null;
}

interface MappaLiveAdminProps {
  tecnici: TecnicoLivePosition[];
  geofences?: CantiereGeofence[];
  height?: string;
  onTecnicoClick?: (userId: string) => void;
  className?: string;
}

/**
 * Mappa Leaflet live dei tecnici — usata nel tab GPS admin.
 * Renderizzata con React.lazy + Suspense dal parent.
 */
export function MappaLiveAdmin({
  tecnici,
  geofences = [],
  height = "480px",
  onTecnicoClick,
  className,
}: MappaLiveAdminProps) {
  const center: [number, number] =
    tecnici.length > 0
      ? [
          tecnici.reduce((s, t) => s + t.lat, 0) / tecnici.length,
          tecnici.reduce((s, t) => s + t.lng, 0) / tecnici.length,
        ]
      : [41.9028, 12.4964]; // Roma fallback

  return (
    <div
      className={cn("rounded-lg overflow-hidden border", className)}
      style={{ height }}
    >
      <MapContainer
        center={center}
        zoom={tecnici.length > 0 ? 13 : 6}
        style={{ height: "100%", width: "100%" }}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {tecnici.length > 0 && <FitBounds tecnici={tecnici} />}

        {/* Geofence circles */}
        {geofences.map((g) => (
          <Circle
            key={g.id}
            center={[g.center_lat, g.center_lng]}
            radius={g.radius_mt}
            pathOptions={{
              color: "#f59e0b",
              fillColor: "#fef3c7",
              fillOpacity: 0.3,
              weight: 2,
              dashArray: "6",
            }}
          >
            <Popup>{g.nome}</Popup>
          </Circle>
        ))}

        {/* Tecnici markers */}
        {tecnici.map((t) => {
          const stale = t.staleSec > STALE_THRESHOLD_SEC;
          const initials = t.fullName
            .split(" ")
            .map((w) => w[0])
            .slice(0, 2)
            .join("")
            .toUpperCase();

          return (
            <Marker
              key={t.userId}
              position={[t.lat, t.lng]}
              icon={createTecnicoIcon(initials, t.avatarColor, stale)}
              eventHandlers={{
                click: () => onTecnicoClick?.(t.userId),
              }}
            >
              <Popup>
                <TecnicoPopupContent
                  t={t}
                  stale={stale}
                  onPercorso={onTecnicoClick ? () => onTecnicoClick(t.userId) : undefined}
                />
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
