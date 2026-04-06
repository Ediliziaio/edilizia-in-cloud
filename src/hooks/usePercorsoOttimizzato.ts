import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { forwardGeocode } from "@/lib/geocoding";
import { nearestNeighborTSP } from "@/lib/tsp";
import { getOsrmRoute } from "@/lib/routing";
import type { RouteResult } from "@/lib/routing";

export interface InterventoConCoords {
  id: string;
  subject: string;
  indirizzo_intervento: string | null;
  data_intervento_prevista: string | null;
  status: string;
  priority: string;
  /** Coordinate geocodificate (null se non trovate) */
  lat: number | null;
  lng: number | null;
  /** Stima di arrivo calcolata dopo routing */
  arrivoStimato?: string | null;
}

type OptimizationStatus =
  | "idle"
  | "geocoding"
  | "optimizing"
  | "routing"
  | "done"
  | "error";

export interface PercorsoOttimizzatoState {
  status: OptimizationStatus;
  /** Interventi nell'ordine ottimizzato */
  orderedInterventi: InterventoConCoords[];
  /** Polyline OSRM decodificata */
  routeCoordinates: [number, number][];
  /** Risultato routing completo */
  routeResult: RouteResult | null;
  errorMessage: string | null;
  /** Numero di interventi senza coordinate (non geocodificati) */
  nonGeocodificati: number;
}

export interface PercorsoOttimizzatoActions {
  ottimizza: (
    startLat: number,
    startLng: number,
    interventi: InterventoConCoords[]
  ) => Promise<void>;
  reset: () => void;
}

const INITIAL_STATE: PercorsoOttimizzatoState = {
  status: "idle",
  orderedInterventi: [],
  routeCoordinates: [],
  routeResult: null,
  errorMessage: null,
  nonGeocodificati: 0,
};

/**
 * Hook che combina: forward geocoding → TSP nearest-neighbor → OSRM routing.
 * Aggiorna le coordinate degli interventi su Supabase (tickets.lat/lng) quando geocodificate.
 */
export function usePercorsoOttimizzato(): PercorsoOttimizzatoState & PercorsoOttimizzatoActions {
  const [state, setState] = useState<PercorsoOttimizzatoState>(INITIAL_STATE);

  const ottimizza = useCallback(async (
    startLat: number,
    startLng: number,
    interventi: InterventoConCoords[]
  ) => {
    if (interventi.length === 0) {
      setState((s) => ({
        ...s,
        status: "idle",
        errorMessage: "Nessun intervento da ottimizzare",
      }));
      return;
    }

    setState((s) => ({ ...s, status: "geocoding", errorMessage: null }));

    // ── Fase 1: Geocodifica interventi senza coordinate ─────────────────────
    const enriched: InterventoConCoords[] = [];
    let nonGeocodificati = 0;

    for (const intervento of interventi) {
      if (intervento.lat != null && intervento.lng != null) {
        enriched.push(intervento);
        continue;
      }

      if (!intervento.indirizzo_intervento) {
        enriched.push({ ...intervento, lat: null, lng: null });
        nonGeocodificati++;
        continue;
      }

      const coords = await forwardGeocode(intervento.indirizzo_intervento);
      if (coords) {
        enriched.push({ ...intervento, lat: coords.lat, lng: coords.lng });

        // Salva in DB (fire-and-forget)
        supabase
          .from("tickets")
          .update({ lat_intervento: coords.lat, lng_intervento: coords.lng })
          .eq("id", intervento.id)
          .then(({ error }) => {
            if (error) console.warn("[usePercorsoOttimizzato] update coords:", error);
          });
      } else {
        enriched.push({ ...intervento, lat: null, lng: null });
        nonGeocodificati++;
      }
    }

    // Filtra solo quelli con coordinate valide per TSP/routing
    const conCoords = enriched.filter(
      (i): i is InterventoConCoords & { lat: number; lng: number } =>
        i.lat != null && i.lng != null
    );

    if (conCoords.length === 0) {
      setState((s) => ({
        ...s,
        status: "error",
        orderedInterventi: enriched,
        nonGeocodificati,
        errorMessage: "Nessun intervento ha coordinate valide. Verifica gli indirizzi.",
      }));
      return;
    }

    // ── Fase 2: TSP nearest-neighbor ────────────────────────────────────────
    setState((s) => ({ ...s, status: "optimizing" }));

    const startPoint = { lat: startLat, lng: startLng };
    const ordered = nearestNeighborTSP(startPoint, conCoords);

    // Aggiungi gli interventi senza coordinate alla fine
    const senzaCoords = enriched.filter(
      (i) => i.lat == null || i.lng == null
    );
    const orderedAll = [...ordered, ...senzaCoords];

    // ── Fase 3: OSRM routing ────────────────────────────────────────────────
    setState((s) => ({ ...s, status: "routing" }));

    const waypoints = [
      startPoint,
      ...ordered.map((i) => ({ lat: i.lat, lng: i.lng })),
    ];

    const routeResult = await getOsrmRoute(waypoints);

    // Stima tempi di arrivo
    let cumulativeSec = 0;
    const legsPerStop = routeResult
      ? Math.floor(routeResult.durationSec / ordered.length)
      : null;

    const orderedWithTimes = orderedAll.map((item, idx) => {
      if (legsPerStop && idx < ordered.length) {
        cumulativeSec += legsPerStop;
        const now = new Date();
        now.setSeconds(now.getSeconds() + cumulativeSec);
        return {
          ...item,
          arrivoStimato: now.toLocaleTimeString("it-IT", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
      }
      return { ...item, arrivoStimato: null };
    });

    setState({
      status: "done",
      orderedInterventi: orderedWithTimes,
      routeCoordinates: routeResult?.coordinates ?? [],
      routeResult: routeResult,
      errorMessage:
        routeResult == null
          ? "Percorso ottimizzato ma il tracciato stradale non è disponibile. Controlla la connessione."
          : null,
      nonGeocodificati,
    });
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return { ...state, ottimizza, reset };
}
