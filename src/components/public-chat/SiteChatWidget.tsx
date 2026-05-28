/**
 * SiteChatWidget — wrapper che monta PublicChatWidget sull'app EiC stessa
 * (login, landing pages pubbliche).
 *
 * Il widget_token può essere passato:
 * 1. Via env var VITE_PUBLIC_CHAT_TOKEN (build-time, deploy-aware)
 * 2. Via prop esplicita (per debug/testing)
 * 3. Tramite RPC `get_platform_chatbot_token()` server-side (preferito in prod)
 *
 * Si nasconde automaticamente quando l'utente è loggato (no widget per
 * sessioni autenticate, hanno già la chat Silvio dentro l'app).
 *
 * v8.6.52 — Fix bug "chat non si carica":
 *   - Pre-validazione token via RPC get_chatbot_config PRIMA di renderizzare
 *     il widget. Se il token non esiste in DB (404 widget_not_found), niente
 *     widget invece di mostrare un errore tecnico all'utente.
 *   - Probe risolve anche il caso di env var VITE_PUBLIC_CHAT_TOKEN non
 *     configurata in build di prod → fallback grazioso.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PublicChatWidget } from "./PublicChatWidget";

interface Props {
  /** Override del widget_token (default: VITE_PUBLIC_CHAT_TOKEN env) */
  widgetToken?: string;
  /** Forza visualizzazione anche se l'utente è loggato (debug) */
  forceShow?: boolean;
  /** Posizione (default: bottom-right) */
  position?: "bottom-right" | "bottom-left";
}

// Default fallback token (seed migration 20270518110000 — Domus Group widget per ediliziaincloud.com).
// Override via VITE_PUBLIC_CHAT_TOKEN per usare un widget diverso (es. brand secondario).
const DEFAULT_PLATFORM_TOKEN = "859db08e-494d-4b15-ba85-7da57849df87";

export function SiteChatWidget({ widgetToken, forceShow, position }: Props) {
  // Token: prop > env var > default hardcoded
  const tokenFromEnv = (import.meta as { env?: Record<string, string> }).env?.VITE_PUBLIC_CHAT_TOKEN;
  const token = widgetToken ?? tokenFromEnv ?? DEFAULT_PLATFORM_TOKEN;

  // Auth check: hide se utente loggato (a meno di forceShow)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  // v8.6.52 — Token validity probe: evita di mostrare un widget rotto
  // quando il token configurato non corrisponde a nessuna riga in
  // public_chatbot_settings (es. seed migration non applicato).
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (forceShow) {
      setIsAuthenticated(false);
      return;
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setIsAuthenticated(!!data.session);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (mounted) setIsAuthenticated(!!session);
      },
    );

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [forceShow]);

  // v8.6.52 — Probe lightweight del token via RPC get_chatbot_config.
  // Cachato in sessionStorage per evitare ping ridondante ad ogni navigazione.
  useEffect(() => {
    if (!token) {
      setTokenValid(false);
      return;
    }
    // 2026-05-28 Velocity: skip RPC durante prerendering CF Pages.
    // Il PrerenderBot di Cloudflare Pages monta tutti i componenti per ogni
    // pagina pre-renderizzata (180+ pagine). Senza questo skip si genera un
    // flood di chiamate get_chatbot_config (1 per pagina) → saturazione DB
    // proprio mentre gli utenti veri provano a fare login. Il widget non è
    // visibile nelle pagine prerendered comunque (è dinamico client-only).
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    if (ua.includes("PrerenderBot") || ua.includes("HeadlessChrome") || ua.includes("Prerender")) {
      setTokenValid(false);
      return;
    }
    const cacheKey = `chat-widget-token-valid:${token}`;
    const cached = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(cacheKey) : null;
    if (cached === "1") {
      setTokenValid(true);
      return;
    }
    if (cached === "0") {
      setTokenValid(false);
      return;
    }
    let mounted = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc("get_chatbot_config", { p_widget_token: token })
      .then((res: { data?: { ok?: boolean } | null; error?: { message?: string } }) => {
        if (!mounted) return;
        const ok = !res.error && !!res.data?.ok;
        setTokenValid(ok);
        try {
          sessionStorage.setItem(cacheKey, ok ? "1" : "0");
        } catch { /* sessionStorage might be blocked */ }
        if (!ok && typeof window !== "undefined" && window.location.hostname === "localhost") {
          console.info(
            "[SiteChatWidget] widget_token non valido (no row in public_chatbot_settings).",
            "Esegui migration 20270518110000_seed_public_chatbot_default.sql",
            "oppure setta VITE_PUBLIC_CHAT_TOKEN con un token configurato.",
          );
        }
      })
      .catch(() => {
        if (mounted) setTokenValid(false);
      });
    return () => { mounted = false; };
  }, [token]);

  if (!token) {
    if (typeof window !== "undefined" && window.location.hostname === "localhost") {
      console.info(
        "[SiteChatWidget] No widget_token configured. " +
        "Set VITE_PUBLIC_CHAT_TOKEN in .env to enable.",
      );
    }
    return null;
  }

  if (isAuthenticated === null || tokenValid === null) {
    // Loading auth state / token probe — non mostrare flicker
    return null;
  }

  if (isAuthenticated && !forceShow) {
    // User loggato — usa Silvio interno, non il widget pubblico
    return null;
  }

  if (!tokenValid) {
    // Token non configurato in DB → niente widget rotto, solo silenzio
    return null;
  }

  return <PublicChatWidget widgetToken={token} position={position ?? "bottom-right"} />;
}
