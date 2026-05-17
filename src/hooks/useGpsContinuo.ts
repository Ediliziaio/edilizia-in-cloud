import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { TrackingStatus } from "@/types/fleet";
import { GPS_CONSENT_VERSION } from "@/types/fleet";

const SW_URL = "/sw-fleet-track.js";
const SW_SCOPE = "/";

export interface GpsContinuoState {
  status: TrackingStatus;
  /** Ultima posizione nota */
  lastLat: number | null;
  lastLng: number | null;
  lastAccuracy: number | null;
  lastRecordedAt: string | null;
  /** Errore leggibile */
  errorMessage: string | null;
  /** Consenso GDPR già dato in questa sessione */
  hasConsent: boolean;
}

export interface GpsContinuoActions {
  startTracking: () => Promise<void>;
  stopTracking: () => void;
  giveConsent: () => Promise<void>;
  revokeConsent: () => Promise<void>;
}

/**
 * Hook per il tracciamento GPS continuo del tecnico (lato app campo).
 *
 * Architettura:
 *  - Il watchPosition gira nel main thread (Geolocation API non disponibile nei SW)
 *  - Ogni posizione viene inviata al SW sw-fleet-track.js via postMessage GPS_POSITION_FROM_MAIN
 *  - Il SW gestisce il buffer e il flush verso l'edge function batch-gps-positions
 *
 * Richiede il consenso GDPR prima di avviare il tracciamento.
 */
export function useGpsContinuo(): GpsContinuoState & GpsContinuoActions {
  const { effectiveCompany, user } = useAuth();
  const [state, setState] = useState<GpsContinuoState>({
    status: "idle",
    lastLat: null,
    lastLng: null,
    lastAccuracy: null,
    lastRecordedAt: null,
    errorMessage: null,
    hasConsent: false,
  });

  const swRef = useRef<ServiceWorkerRegistration | null>(null);
  // Ref per il watchId della Geolocation API nel main thread
  const geoWatchIdRef = useRef<number | null>(null);

  // ── Verifica consenso al mount ─────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id || !effectiveCompany?.id) return;

    supabase
      .from("tecnico_gps_consent" as never)
      .select("id")
      .eq("user_id", user.id)
      .eq("company_id", effectiveCompany.id)
      .eq("version", GPS_CONSENT_VERSION)
      .is("revoked_at", null)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setState((s) => ({ ...s, hasConsent: true }));
        }
      });
  }, [user?.id, effectiveCompany?.id]);

  // ── Registra SW e ascolta messaggi ────────────────────────────────────────
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register(SW_URL, { scope: SW_SCOPE })
      .then((reg) => {
        swRef.current = reg;
      })
      .catch((err) => {
        console.warn("[useGpsContinuo] SW registration failed:", err);
      });

    const handler = (event: MessageEvent) => {
      const { type, payload } = event.data || {};

      if (type === "TRACKING_STATUS") {
        setState((s) => ({
          ...s,
          status: payload.status ?? s.status,
          errorMessage: payload.message ?? null,
        }));
      } else if (type === "GPS_POSITION") {
        setState((s) => ({
          ...s,
          lastLat: payload.lat ?? s.lastLat,
          lastLng: payload.lng ?? s.lastLng,
          lastAccuracy: payload.accuracy ?? s.lastAccuracy,
          lastRecordedAt: payload.recorded_at ?? s.lastRecordedAt,
        }));
      }
    };

    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);

  // ── Invia token aggiornato al SW quando la sessione cambia ────────────────
  // Usa onAuthStateChange per aggiornare il token solo alla vera variazione
  // (evita il re-send su ogni render che causava il bug precedente).
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token && swRef.current?.active) {
        swRef.current.active.postMessage({
          type: "UPDATE_TOKEN",
          payload: { jwtToken: session.access_token },
        });
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── giveConsent ───────────────────────────────────────────────────────────
  const giveConsent = useCallback(async () => {
    if (!user?.id || !effectiveCompany?.id) return;

    const { error } = await (supabase
      .from("tecnico_gps_consent" as never)
      .upsert({
        user_id: user.id,
        company_id: effectiveCompany.id,
        version: GPS_CONSENT_VERSION,
        consented_at: new Date().toISOString(),
        revoked_at: null,
      }, { onConflict: "user_id,company_id,version" }) as unknown as Promise<{ error: unknown }>);

    if (!error) {
      setState((s) => ({
        ...s,
        hasConsent: true,
        status: "idle",
        errorMessage: null,
      }));
    }
  }, [user?.id, effectiveCompany?.id]);

  // ── stopTracking ──────────────────────────────────────────────────────────
  // S2-02: spostato PRIMA di revokeConsent per chiudere ciclo deps
  const stopTracking = useCallback(() => {
    // Ferma watchPosition nel main thread
    if (geoWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(geoWatchIdRef.current);
      geoWatchIdRef.current = null;
    }
    // Notifica il SW
    if (swRef.current?.active) {
      swRef.current.active.postMessage({ type: "STOP_TRACKING" });
    }
    setState((s) => ({ ...s, status: "idle" }));
  }, []);

  // ── revokeConsent ─────────────────────────────────────────────────────────
  const revokeConsent = useCallback(async () => {
    if (!user?.id || !effectiveCompany?.id) return;

    stopTracking();

    await (supabase
      .from("tecnico_gps_consent" as never)
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("company_id", effectiveCompany.id)
      .eq("version", GPS_CONSENT_VERSION)
      .is("revoked_at", null) as unknown as Promise<unknown>);

    setState((s) => ({
      ...s,
      hasConsent: false,
      status: "idle",
    }));
  }, [user?.id, effectiveCompany?.id, stopTracking]);

  // ── startTracking ─────────────────────────────────────────────────────────
  const startTracking = useCallback(async () => {
    if (!state.hasConsent) {
      setState((s) => ({ ...s, status: "consent_pending" }));
      return;
    }
    if (!effectiveCompany?.id || !user?.id) return;
    if (!("serviceWorker" in navigator)) {
      setState((s) => ({
        ...s,
        status: "error",
        errorMessage: "Service Worker non supportato da questo browser",
      }));
      return;
    }
    if (!("geolocation" in navigator)) {
      setState((s) => ({
        ...s,
        status: "error",
        errorMessage: "Geolocation API non disponibile su questo dispositivo",
      }));
      return;
    }

    const { data } = await supabase.auth.getSession();
    const jwtToken = data.session?.access_token;
    if (!jwtToken) {
      setState((s) => ({
        ...s,
        status: "error",
        errorMessage: "Sessione scaduta: effettua di nuovo il login",
      }));
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

    const sw = await navigator.serviceWorker.ready;
    swRef.current = sw;

    // 1. Avvia il SW in modalità tracking (gestisce buffer + flush HTTP)
    sw.active?.postMessage({
      type: "START_TRACKING",
      payload: {
        supabaseUrl,
        anonKey,
        jwtToken,
        companyId: effectiveCompany.id,
        userId: user.id,
      },
    });

    // 2. Avvia watchPosition nel main thread — i SW non hanno Geolocation API.
    //    Ogni posizione viene inoltrata al SW via GPS_POSITION_FROM_MAIN.
    geoWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (sw.active) {
          sw.active.postMessage({
            type: "GPS_POSITION_FROM_MAIN",
            payload: {
              coords: {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                speed: pos.coords.speed,
                heading: pos.coords.heading,
              },
              timestamp: pos.timestamp,
            },
          });
        }
      },
      (err) => {
        const msg =
          err.code === 1 ? "Permesso GPS negato"
          : err.code === 2 ? "Posizione non disponibile"
          : "Timeout GPS";
        setState((s) => ({
          ...s,
          status: err.code === 1 ? "denied" : "error",
          errorMessage: msg,
        }));
        if (err.code === 1) {
          // Permesso negato: ferma tutto
          if (geoWatchIdRef.current !== null) {
            navigator.geolocation.clearWatch(geoWatchIdRef.current);
            geoWatchIdRef.current = null;
          }
          sw.active?.postMessage({ type: "STOP_TRACKING" });
        }
      },
      { enableHighAccuracy: true, maximumAge: 5_000 }
    );

    setState((s) => ({ ...s, status: "active", errorMessage: null }));
    // S2-02: stopTracking non e' chiamato in startTracking — solo geoWatchIdRef inline
  }, [state.hasConsent, effectiveCompany?.id, user?.id]);

  return {
    ...state,
    startTracking,
    stopTracking,
    giveConsent,
    revokeConsent,
  };
}
