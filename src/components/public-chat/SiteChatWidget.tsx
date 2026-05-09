/**
 * SiteChatWidget — wrapper che monta PublicChatWidget sull'app EiC stessa
 * (login, landing pages pubbliche).
 *
 * Il widget_token può essere passato:
 * 1. Via env var VITE_PUBLIC_CHAT_TOKEN (build-time, deploy-aware)
 * 2. Via prop esplicita (per debug/testing)
 * 3. Tramite RPC `get_platform_chatbot_token()` (NON ancora implementata)
 *
 * Si nasconde automaticamente quando l'utente è loggato (no widget per
 * sessioni autenticate, hanno già la chat Silvio dentro l'app).
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

// Default fallback token (Demo Azienda S.r.l. — pubblico, lead capture per ediliziaincloud.com)
// Override via env VITE_PUBLIC_CHAT_TOKEN per usare un widget diverso.
const DEFAULT_PLATFORM_TOKEN = "859db08e-494d-4b15-ba85-7da57849df87";

export function SiteChatWidget({ widgetToken, forceShow, position }: Props) {
  // Token: prop > env var > default hardcoded
  const tokenFromEnv = (import.meta as { env?: Record<string, string> }).env?.VITE_PUBLIC_CHAT_TOKEN;
  const token = widgetToken ?? tokenFromEnv ?? DEFAULT_PLATFORM_TOKEN;

  // Auth check: hide se utente loggato (a meno di forceShow)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

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

  if (!token) {
    if (typeof window !== "undefined" && window.location.hostname === "localhost") {
      console.info(
        "[SiteChatWidget] No widget_token configured. " +
        "Set VITE_PUBLIC_CHAT_TOKEN in .env to enable.",
      );
    }
    return null;
  }

  if (isAuthenticated === null) {
    // Loading auth state — non mostrare flicker
    return null;
  }

  if (isAuthenticated && !forceShow) {
    // User loggato — usa Silvio interno, non il widget pubblico
    return null;
  }

  return <PublicChatWidget widgetToken={token} position={position ?? "bottom-right"} />;
}
