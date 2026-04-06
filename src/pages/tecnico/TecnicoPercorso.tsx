import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, MapPin, Route, Loader2, Navigation, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePercorsoOttimizzato } from "@/hooks/usePercorsoOttimizzato";
import type { InterventoConCoords } from "@/hooks/usePercorsoOttimizzato";
import { PercorsoOttimizzatoPanel } from "@/components/fleet/PercorsoOttimizzatoPanel";

/**
 * TecnicoPercorso — "Il mio percorso di oggi"
 * Route: /tecnico/percorso
 * Carica gli interventi del giorno, ottimizza il percorso con TSP + OSRM,
 * mostra stima tempi e link navigazione esterna.
 */
export default function TecnicoPercorso() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Posizione attuale del tecnico
  const [currentLat, setCurrentLat] = useState<number | null>(null);
  const [currentLng, setCurrentLng] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "loading" | "ok" | "denied" | "error">("idle");

  const percorso = usePercorsoOttimizzato();

  const today = format(new Date(), "yyyy-MM-dd");
  const todayLabel = format(new Date(), "EEEE d MMMM yyyy", { locale: it });
  const domaniStr = format(new Date(Date.now() + 86_400_000), "yyyy-MM-dd");

  // ── Carica interventi di oggi ────────────────────────────────────────────
  const { data: interventi = [], isLoading, isError } = useQuery<InterventoConCoords[]>({
    queryKey: ["tecnico-percorso-interventi", user?.id, today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(
          "id, subject, status, priority, tipo, indirizzo_intervento, data_intervento_prevista, lat_intervento, lng_intervento"
        )
        .eq("assigned_to", user!.id)
        .in("tipo", ["intervento", "emergenza"])
        .neq("status", "risolto")
        .gte("data_intervento_prevista", `${today}T00:00:00.000Z`)
        .lt("data_intervento_prevista", `${domaniStr}T00:00:00.000Z`)
        .order("data_intervento_prevista", { ascending: true });

      if (error) throw error;

      return (data ?? []).map((t) => ({
        id: t.id as string,
        subject: (t.subject as string) ?? "",
        indirizzo_intervento: t.indirizzo_intervento as string | null,
        data_intervento_prevista: t.data_intervento_prevista as string | null,
        status: t.status as string,
        priority: t.priority as string,
        lat: t.lat_intervento as number | null,
        lng: t.lng_intervento as number | null,
      }));
    },
    enabled: !!user,
  });

  // ── Richiedi posizione GPS ───────────────────────────────────────────────
  const requestGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsStatus("error");
      return;
    }
    setGpsStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCurrentLat(pos.coords.latitude);
        setCurrentLng(pos.coords.longitude);
        setGpsStatus("ok");
      },
      (err) => {
        setGpsStatus(err.code === 1 ? "denied" : "error");
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }, []);

  useEffect(() => {
    requestGps();
  }, [requestGps]);

  // ── Avvia ottimizzazione ─────────────────────────────────────────────────
  const handleOttimizza = useCallback(() => {
    const lat = currentLat ?? 41.9028; // fallback Roma se GPS non disponibile
    const lng = currentLng ?? 12.4964;
    percorso.ottimizza(lat, lng, interventi);
  }, [currentLat, currentLng, interventi, percorso]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 pb-24">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-800">
        <button
          onClick={() => navigate("/tecnico")}
          className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center active:bg-slate-700 transition-colors"
        >
          <ChevronLeft className="h-5 w-5 text-white" />
        </button>
        <div>
          <h1 className="text-white font-bold text-lg leading-tight">Il mio percorso</h1>
          <p className="text-slate-400 text-xs capitalize">{todayLabel}</p>
        </div>
      </div>

      <div className="px-4 pt-5 space-y-5">
        {/* ── GPS Status ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          {gpsStatus === "loading" && (
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Rilevamento posizione…
            </div>
          )}
          {gpsStatus === "ok" && (
            <div className="flex items-center gap-1.5 text-green-400 text-xs">
              <Navigation className="h-3.5 w-3.5" />
              Posizione rilevata
            </div>
          )}
          {(gpsStatus === "denied" || gpsStatus === "error") && (
            <div className="flex items-center gap-1.5 text-amber-400 text-xs">
              <AlertCircle className="h-3.5 w-3.5" />
              GPS non disponibile — verrà usata una posizione approssimativa
            </div>
          )}
        </div>

        {/* ── Interventi di oggi ──────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white text-sm font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-400" />
              Interventi oggi
            </h2>
            <span className="text-slate-400 text-xs">
              {interventi.length} {interventi.length === 1 ? "intervento" : "interventi"}
            </span>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-xl bg-slate-800 animate-pulse" />
              ))}
            </div>
          ) : isError ? (
            <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4 text-center">
              <AlertCircle className="h-5 w-5 text-red-400 mx-auto mb-1" />
              <p className="text-red-300 text-sm">Errore nel caricamento degli interventi.</p>
              <button
                className="mt-2 text-xs text-red-400 underline"
                onClick={() => window.location.reload()}
              >
                Riprova
              </button>
            </div>
          ) : interventi.length === 0 ? (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 text-center">
              <Route className="h-8 w-8 text-slate-600 mx-auto mb-2" />
              <p className="text-white font-medium text-sm">Nessun intervento oggi</p>
              <p className="text-slate-400 text-xs mt-1">Non ci sono interventi programmati per oggi.</p>
            </div>
          ) : (
            /* Lista compatta solo se non ancora ottimizzato */
            percorso.status === "idle" && (
              <div className="space-y-2">
                {interventi.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 p-3 rounded-xl bg-slate-800 border border-slate-700"
                  >
                    <MapPin className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{item.subject}</p>
                      {item.indirizzo_intervento && (
                        <p className="text-slate-400 text-xs truncate mt-0.5">
                          {item.indirizzo_intervento}
                        </p>
                      )}
                      {item.data_intervento_prevista && (
                        <p className="text-slate-500 text-[10px] mt-0.5">
                          {format(
                            new Date(item.data_intervento_prevista),
                            "HH:mm",
                            { locale: it }
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </section>

        {/* ── Pannello ottimizzazione ─────────────────────────────────────── */}
        {interventi.length > 0 && (
          <PercorsoOttimizzatoPanel
            status={percorso.status}
            orderedInterventi={percorso.orderedInterventi}
            routeCoordinates={percorso.routeCoordinates}
            routeResult={percorso.routeResult}
            errorMessage={percorso.errorMessage}
            nonGeocodificati={percorso.nonGeocodificati}
            startLat={currentLat}
            startLng={currentLng}
            onOttimizza={handleOttimizza}
          />
        )}
      </div>
    </div>
  );
}
