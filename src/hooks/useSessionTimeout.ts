/**
 * useSessionTimeout — v8.6.99
 *
 * Auto-logout dopo 45 giorni dal login (TTL assoluto, non "idle").
 *
 * Funzionamento:
 *  - Al login (signInWithPassword successo + OTP verificato), salva
 *    `session_started_at` in localStorage con timestamp now()
 *  - Al boot dell'app + ogni 15min controlla: se now() - session_started_at
 *    > 45gg → forza signOut e clear localStorage
 *  - Logout manuale → clear flag
 *
 * NB: questo è un timer LATO CLIENT. Per sicurezza vera serve anche
 * settare il refresh_token TTL lato Supabase Dashboard a 45gg.
 */
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "eic_session_started_at";
const SESSION_TTL_DAYS = 45;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 15 * 60 * 1000; // ogni 15 min

/** Da chiamare al login completato (dopo OTP verificato). */
export function markSessionStarted(): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch { /* ignore */ }
}

/** Da chiamare al logout. */
export function clearSessionStarted(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

/** Restituisce true se la sessione è oltre i 45 giorni. */
function isSessionExpired(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false; // nessuna sessione tracciata → non scaduta
    const startedAt = parseInt(raw, 10);
    if (!Number.isFinite(startedAt)) return false;
    return Date.now() - startedAt > SESSION_TTL_MS;
  } catch {
    return false;
  }
}

/** Hook globale: forza logout se la sessione supera i 45 giorni. */
export function useSessionTimeout(): void {
  useEffect(() => {
    let alive = true;

    const enforceTimeout = async () => {
      if (!alive) return;
      if (isSessionExpired()) {
        clearSessionStarted();
        try {
          await supabase.auth.signOut();
        } catch { /* ignore */ }
        if (typeof window !== "undefined") {
          window.location.href = "/login?session_expired=1";
        }
      }
    };

    // v8.6.101 — Auto-mark session start su QUALSIASI new sign-in
    // (SSO, OAuth, cross-subdomain handoff, password+OTP). Senza questo,
    // il TTL 45gg viene applicato SOLO al flow password+OTP che chiamava
    // esplicitamente markSessionStarted() in LoginForm.
    const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        try {
          if (!localStorage.getItem(STORAGE_KEY)) {
            localStorage.setItem(STORAGE_KEY, String(Date.now()));
          }
        } catch { /* ignore */ }
      } else if (event === "SIGNED_OUT") {
        clearSessionStarted();
      }
    });

    // Check immediato al mount
    void enforceTimeout();

    // Check periodico
    const interval = window.setInterval(() => {
      void enforceTimeout();
    }, CHECK_INTERVAL_MS);

    // Check al visibility change (tab torna in foreground)
    const onVisible = () => {
      if (document.visibilityState === "visible") void enforceTimeout();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      authSub.subscription.unsubscribe();
    };
  }, []);
}
