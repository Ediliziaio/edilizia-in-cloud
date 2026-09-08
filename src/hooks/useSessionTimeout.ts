/**
 * useSessionTimeout — v8.6.99
 *
 * Auto-logout dopo 45 giorni DALL'ULTIMO ACCESSO (TTL assoluto, non "idle").
 *
 * L'orologio parte da `last_sign_in_at` della sessione, cioe' dal dato che
 * scrive GoTrue quando l'utente si autentica davvero. Il marker in
 * localStorage resta solo come rete di sicurezza per le sessioni che non
 * espongono quel campo.
 *
 * Perche' il server e non il marker locale (incidente dell'8 settembre 2026):
 * il marker veniva scritto UNA VOLTA SOLA — `markSessionStarted()` ha un solo
 * chiamante, il ramo OTP via email del LoginForm, e il listener qui sotto lo
 * scriveva solo `if (!localStorage.getItem(...))`. Chi entra con la sola
 * password e chiude la scheda invece di premere «Esci» non lo aggiornava mai:
 * l'orologio restava fermo al suo PRIMO accesso in assoluto e 45 giorni dopo
 * veniva buttato fuori nel mezzo del lavoro, anche avendo fatto login la
 * mattina stessa. Verificato sui log di produzione: RPC di cambio azienda a
 * 11:20:37 andata a buon fine, `POST /auth/v1/logout?scope=global` a 11:20:41.
 * `last_sign_in_at` non ha questo problema: e' sempre l'accesso vero piu'
 * recente, su qualunque browser.
 *
 * Il controllo scatta al mount, ogni 15 minuti e a ogni ritorno in foreground.
 * Senza sessione attiva non fa nulla: sloggare chi e' gia' fuori serviva solo
 * a far ricaricare la pagina di login.
 *
 * NB: questo e' un timer LATO CLIENT. Per sicurezza vera serve anche
 * settare il refresh_token TTL lato Supabase Dashboard a 45gg.
 */
import { useEffect, useRef } from "react";
import type { Session } from "@supabase/supabase-js";
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

/** Millisecondi dell'ultimo accesso vero, se la sessione lo dichiara. */
function istanteUltimoAccesso(session: Session | null): number | null {
  const dichiarato = session?.user?.last_sign_in_at;
  if (typeof dichiarato !== "string") return null;
  const istante = Date.parse(dichiarato);
  return Number.isFinite(istante) ? istante : null;
}

/** Millisecondi del marker locale, se presente e leggibile. */
function istanteMarkerLocale(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const istante = parseInt(raw, 10);
    return Number.isFinite(istante) ? istante : null;
  } catch {
    return null;
  }
}

/**
 * True se sono passati piu' di 45 giorni dall'ultimo accesso.
 * Senza sessione non si decide nulla: chi e' gia' fuori non va sloggato.
 */
export function isSessionExpired(session: Session | null): boolean {
  if (!session) return false;
  const inizio = istanteUltimoAccesso(session) ?? istanteMarkerLocale();
  if (inizio === null) return false; // nessun riferimento affidabile → non scaduta
  return Date.now() - inizio > SESSION_TTL_MS;
}

/** Hook globale: forza logout se la sessione supera i 45 giorni. */
export function useSessionTimeout(): void {
  // La sessione corrente arriva dagli eventi auth: chiamare getSession() qui
  // competerebbe con AuthContext sul lock dello storage.
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    let alive = true;

    const enforceTimeout = async () => {
      if (!alive) return;
      if (!isSessionExpired(sessionRef.current)) return;
      clearSessionStarted();
      try {
        await supabase.auth.signOut();
      } catch { /* ignore */ }
      if (typeof window !== "undefined") {
        window.location.href = "/login?session_expired=1";
      }
    };

    // Listener leggero: usa l'INITIAL_SESSION di Supabase invece di chiamare
    // getSession() al boot, cosi' non compete con AuthContext sul lock storage.
    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;

      if (event === "SIGNED_OUT") {
        sessionRef.current = null;
        clearSessionStarted();
        return;
      }

      sessionRef.current = session ?? null;
      if (!session) return;

      try {
        if (event === "SIGNED_IN") {
          // Autenticazione vera appena avvenuta: l'orologio riparte SEMPRE da
          // adesso, qualunque sia la schermata di login usata.
          localStorage.setItem(STORAGE_KEY, String(Date.now()));
        } else if (event === "INITIAL_SESSION" && !localStorage.getItem(STORAGE_KEY)) {
          // Sessione ripristinata da storage: si semina il marker solo se manca,
          // altrimenti un semplice ricaricamento azzererebbe il TTL.
          localStorage.setItem(STORAGE_KEY, String(Date.now()));
        }
      } catch { /* ignore */ }

      // Un evento auth puo' portare una sessione gia' oltre i 45 giorni.
      void enforceTimeout();
    });

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
