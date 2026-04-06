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
 * Registra il Service Worker sw-fleet-track.js e gli invia comandi.
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

  // ── Invia token aggiornato al SW quando cambia ────────────────────────────
  useEffect(() => {
    if (!swRef.current?.active) return;

    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (token) {
        swRef.current!.active!.postMessage({
          type: "UPDATE_TOKEN",
          payload: { jwtToken: token },
        });
      }
    });
  });

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
  }, [user?.id, effectiveCompany?.id]);

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

    setState((s) => ({ ...s, status: "active", errorMessage: null }));
  }, [state.hasConsent, effectiveCompany?.id, user?.id]);

  // ── stopTracking ──────────────────────────────────────────────────────────
  const stopTracking = useCallback(() => {
    if (!swRef.current?.active) return;
    swRef.current.active.postMessage({ type: "STOP_TRACKING" });
    setState((s) => ({ ...s, status: "idle" }));
  }, []);

  return {
    ...state,
    startTracking,
    stopTracking,
    giveConsent,
    revokeConsent,
  };
}
