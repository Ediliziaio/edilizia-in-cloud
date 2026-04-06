import { Suspense, lazy } from "react";
import {
  MapPin, Clock, Navigation, Loader2, Route, ExternalLink,
  AlertCircle, CheckCircle2, ChevronUp, ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { buildNavigationUrl } from "@/lib/routing";
import type { InterventoConCoords } from "@/hooks/usePercorsoOttimizzato";
import type { RouteResult } from "@/lib/routing";

const PercorsoMap = lazy(() =>
  import("./PercorsoMap").then((m) => ({ default: m.PercorsoMap }))
);

// ── Mappa ottimizzata (polyline OSRM) ─────────────────────────────────────────
const OsrmRouteMap = lazy(() =>
  import("./OsrmRouteMap").then((m) => ({ default: m.OsrmRouteMap }))
);

interface PercorsoOttimizzatoPanelProps {
  status: "idle" | "geocoding" | "optimizing" | "routing" | "done" | "error";
  orderedInterventi: InterventoConCoords[];
  routeCoordinates: [number, number][];
  routeResult: RouteResult | null;
  errorMessage: string | null;
  nonGeocodificati: number;
  startLat?: number | null;
  startLng?: number | null;
  onOttimizza: () => void;
  onReorder?: (from: number, to: number) => void;
  className?: string;
}

const STATUS_LABEL: Record<string, string> = {
  idle: "",
  geocoding: "Geocodifica indirizzi…",
  optimizing: "Calcolo percorso ottimale…",
  routing: "Calcolo tracciato stradale…",
  done: "",
  error: "",
};

/**
 * Panel UX ottimizzazione percorso — usato nella pagina tecnico TecnicoPercorso.
 * Dark-themed per coerenza con l'area tecnico.
 */
export function PercorsoOttimizzatoPanel({
  status,
  orderedInterventi,
  routeCoordinates,
  routeResult,
  errorMessage,
  nonGeocodificati,
  startLat,
  startLng,
  onOttimizza,
  onReorder,
  className,
}: PercorsoOttimizzatoPanelProps) {
  const isProcessing = ["geocoding", "optimizing", "routing"].includes(status);
  const isDone = status === "done";

  // ── Navigazione esterna ───────────────────────────────────────────────────
  const handleNavigazioneEsterna = () => {
    const waypoints = orderedInterventi
      .filter((i) => i.lat != null && i.lng != null)
      .map((i) => ({ lat: i.lat!, lng: i.lng! }));

    if (waypoints.length === 0) return;

    const labels = orderedInterventi
      .filter((i) => i.lat != null && i.lng != null)
      .map((i) => i.subject);

    const { googleMaps } = buildNavigationUrl(waypoints, labels);
    window.open(googleMaps, "_blank", "noopener");
  };

  return (
    <div className={`space-y-4 ${className ?? ""}`}>
      {/* ── Bottone ottimizza ─────────────────────────────────────────────── */}
      <Button
        onClick={onOttimizza}
        disabled={isProcessing}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11 text-sm font-medium gap-2"
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {STATUS_LABEL[status]}
          </>
        ) : (
          <>
            <Route className="h-4 w-4" />
            {isDone ? "Ricalcola percorso" : "Ottimizza percorso"}
          </>
        )}
      </Button>

      {/* ── Warning non geocodificati ─────────────────────────────────────── */}
      {nonGeocodificati > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-900/30 border border-amber-500/30">
          <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-300 text-xs">
            {nonGeocodificati} {nonGeocodificati === 1 ? "intervento non ha" : "interventi non hanno"} coordinate
            valide e {nonGeocodificati === 1 ? "è stato escluso" : "sono stati esclusi"} dal percorso.
            Verifica gli indirizzi.
          </p>
        </div>
      )}

      {/* ── Messaggio errore ─────────────────────────────────────────────── */}
      {errorMessage && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-900/30 border border-red-500/30">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-red-300 text-xs">{errorMessage}</p>
        </div>
      )}

      {/* ── Riepilogo percorso ────────────────────────────────────────────── */}
      {isDone && routeResult && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-green-900/30 border border-green-500/30">
          <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
          <div className="flex-1">
            <p className="text-green-300 text-xs font-medium">Percorso ottimizzato</p>
            <p className="text-green-400 text-[11px] mt-0.5">
              {Math.round(routeResult.distanceMeters / 1000 * 10) / 10} km ·{" "}
              {routeResult.durationLabel}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1 border-green-600 text-green-300 hover:bg-green-900/50"
            onClick={handleNavigazioneEsterna}
          >
            <ExternalLink className="h-3 w-3" />
            Naviga
          </Button>
        </div>
      )}

      {/* ── Mappa OSRM ───────────────────────────────────────────────────── */}
      {isDone && routeCoordinates.length > 1 && (
        <Suspense
          fallback={
            <div className="h-56 flex items-center justify-center rounded-xl bg-slate-800">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          }
        >
          <OsrmRouteMap
            routeCoordinates={routeCoordinates}
            waypoints={orderedInterventi
              .filter((i) => i.lat != null && i.lng != null)
              .map((i) => ({ lat: i.lat!, lng: i.lng!, label: i.subject }))}
            startLat={startLat ?? null}
            startLng={startLng ?? null}
            height="240px"
          />
        </Suspense>
      )}

      {/* ── Lista interventi ordinata ─────────────────────────────────────── */}
      {(isDone || status === "error") && orderedInterventi.length > 0 && (
        <div className="space-y-2">
          <p className="text-slate-400 text-xs font-medium px-0.5">
            Ordine di visita ottimizzato
          </p>
          {orderedInterventi.map((item, idx) => (
            <div
              key={item.id}
              className="flex items-start gap-3 p-3 rounded-xl bg-slate-800 border border-slate-700"
            >
              {/* Numero ordine */}
              <div className="flex flex-col items-center gap-1 shrink-0">
                <span className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                  {idx + 1}
                </span>
                {idx < orderedInterventi.length - 1 && (
                  <div className="w-px h-4 bg-slate-600" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium leading-tight truncate">
                  {item.subject}
                </p>

                {item.indirizzo_intervento && (
                  <div className="flex items-center gap-1 mt-1">
                    <MapPin className="h-3 w-3 text-slate-500 shrink-0" />
                    <p className="text-slate-400 text-xs truncate">
                      {item.indirizzo_intervento}
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {item.data_intervento_prevista && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-slate-500" />
                      <span className="text-slate-400 text-xs">
                        {format(
                          new Date(item.data_intervento_prevista),
                          "HH:mm",
                          { locale: it }
                        )}
                      </span>
                    </div>
                  )}

                  {item.arrivoStimato && (
                    <Badge
                      variant="outline"
                      className="text-[10px] h-4 px-1.5 bg-blue-900/30 text-blue-300 border-blue-500/30 gap-1"
                    >
                      <Navigation className="h-2.5 w-2.5" />
                      Arrivo ~{item.arrivoStimato}
                    </Badge>
                  )}

                  {item.lat == null && (
                    <Badge
                      variant="outline"
                      className="text-[10px] h-4 px-1.5 bg-amber-900/20 text-amber-400 border-amber-500/30"
                    >
                      Indirizzo mancante
                    </Badge>
                  )}
                </div>
              </div>

              {onReorder && (
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => idx > 0 && onReorder(idx, idx - 1)}
                    disabled={idx === 0}
                    className="p-0.5 rounded text-slate-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label="Sposta su"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => idx < orderedInterventi.length - 1 && onReorder(idx, idx + 1)}
                    disabled={idx === orderedInterventi.length - 1}
                    className="p-0.5 rounded text-slate-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label="Sposta giù"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
