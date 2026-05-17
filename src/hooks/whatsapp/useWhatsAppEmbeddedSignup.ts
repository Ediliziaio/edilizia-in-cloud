// useWhatsAppEmbeddedSignup — Meta Embedded Signup flow per collegare un numero
// WhatsApp Business con un click (in alternativa all'inserimento manuale di
// Phone Number ID + Access Token).
//
// Flusso:
//  1. Backend (`whatsapp-embedded-config`) restituisce meta_app_id +
//     whatsapp_config_id (Embedded Signup Config approvato lato Meta).
//  2. Frontend carica il Facebook JS SDK on-demand (1 sola volta per sessione).
//  3. `FB.login()` viene lanciato con `feature: 'whatsapp_embedded_signup'` +
//     il config_id. Meta apre la popup di onboarding (verifica numero, OTP, ecc.).
//  4. Al callback (`authResponse.code` + sessionInfo `phone_number_id` /
//     `waba_id`) chiamiamo `whatsapp-connect` con `{ code, company_id, purpose }`.
//     L'edge function gestisce internamente lo scambio code→access_token tramite
//     Graph API e l'upsert su `ai_whatsapp_numbers`.
//
// Note:
// - Il super_admin deve aver configurato `meta_app_id` e `whatsapp_config_id`
//   in platform_settings (vedi AdminSettingsIntegrations).
// - Se uno dei due manca, il flusso non parte e mostriamo un messaggio per
//   ricadere sul wizard manuale.
// - FB SDK è caricato lazy una sola volta; cache nel modulo via Promise singleton.

import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { isNative } from "@/lib/mobile/platform";
import { WA_NUMBERS_KEY, type WAPurpose } from "./useWhatsAppNumbers";

/**
 * Embedded Signup è supportato solo su web: in Capacitor (iOS/Android) la
 * popup `FB.login` apre un browser system-level e il postMessage al window
 * opener non funziona dalla webview, il che lascia il flusso appeso.
 * Su mobile bisogna usare il wizard manuale.
 */
export const isEmbeddedSignupSupported = !isNative;

// ── FB SDK loader (singleton) ─────────────────────────────────────────────
const FB_SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";
const FB_SDK_VERSION = "v21.0";

declare global {
  interface Window {
    // deno-lint-ignore no-explicit-any
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

let fbSdkPromise: Promise<void> | null = null;
let lastInitAppId: string | null = null;

function loadFacebookSdk(appId: string): Promise<void> {
  // Se l'SDK è già stato caricato per LO STESSO appId, riusiamo la Promise.
  if (fbSdkPromise && lastInitAppId === appId) return fbSdkPromise;

  // Cambio appId (multi-tenant in-session): scarta la cache e re-init pulito.
  if (lastInitAppId && lastInitAppId !== appId) {
    fbSdkPromise = null;
  }

  fbSdkPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Window non disponibile"));
      return;
    }

    const initFB = () => {
      if (!window.FB) {
        reject(new Error("Facebook SDK non disponibile dopo il caricamento"));
        return;
      }
      try {
        window.FB.init({
          appId,
          autoLogAppEvents: true,
          xfbml: false,
          version: FB_SDK_VERSION,
        });
        lastInitAppId = appId;
        resolve();
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };

    // Se l'SDK è già caricato e inizializzato → basta re-init con nuovo appId
    if (window.FB) {
      initFB();
      return;
    }

    // Chaining di fbAsyncInit esistente (es. Meta Pixel già installato)
    const prevAsyncInit = window.fbAsyncInit;
    window.fbAsyncInit = () => {
      try {
        prevAsyncInit?.();
      } catch (e) {
        console.warn("[whatsapp-embedded] fbAsyncInit precedente ha sollevato:", e);
      }
      initFB();
    };

    const existing = document.getElementById("facebook-jssdk");
    if (existing) {
      // script presente ma SDK non ancora inizializzato → aspettiamo fbAsyncInit
      return;
    }
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = FB_SDK_SRC;
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => reject(new Error("Caricamento Facebook SDK fallito"));
    document.head.appendChild(script);
  });

  return fbSdkPromise;
}

// ── Risposta FB.login(): authResponse opzionale con code + sessionInfo ────
interface FbAuthResponse {
  code?: string;
  accessToken?: string;
  userID?: string;
}

interface FbLoginResponse {
  authResponse?: FbAuthResponse | null;
  status?: string;
}

interface EmbeddedConfigResponse {
  meta_app_id: string | null;
  whatsapp_config_id: string | null;
  is_configured: boolean;
}

// Sessione: il sessionInfoVersion 3 invia un messaggio postMessage al parent
// con phone_number_id + waba_id. Lo catturiamo con un listener temporaneo.
interface MetaSessionInfo {
  phone_number_id?: string;
  waba_id?: string;
}

async function fetchEmbeddedConfig(companyId: string): Promise<EmbeddedConfigResponse> {
  const { data, error } = await supabase.functions.invoke("whatsapp-embedded-config", {
    body: { company_id: companyId },
  });
  if (error) throw error;
  if (!data) throw new Error("Risposta vuota da whatsapp-embedded-config");
  return data as EmbeddedConfigResponse;
}

// Origin allowlist per i postMessage di Embedded Signup. Meta invia da
// www.facebook.com e da m.facebook.com (mobile web fallback).
const ALLOWED_META_ORIGINS = new Set([
  "https://www.facebook.com",
  "https://web.facebook.com",
  "https://m.facebook.com",
  "https://business.facebook.com",
]);

function isMetaOrigin(origin: string): boolean {
  if (ALLOWED_META_ORIGINS.has(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    return host === "facebook.com" || host.endsWith(".facebook.com");
  } catch {
    return false;
  }
}

// Listener temporaneo per il messaggio "session info" dell'Embedded Signup.
// Meta invia un postMessage con `{ type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH',
// data: { phone_number_id, waba_id } }` al window padre. Aumentato il timeout
// a 180s per dare margine ai flussi mobile (OTP via SMS può essere lento).
function waitForSessionInfo(timeoutMs = 180_000): Promise<MetaSessionInfo | null> {
  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      // SECURITY: accetta solo postMessage provenienti da domini Meta.
      // Senza questo check, qualsiasi iframe/popup di terze parti potrebbe
      // iniettare phone_number_id/waba_id arbitrari (spoof degli hint).
      if (!isMetaOrigin(event.origin)) return;

      if (typeof event.data !== "object" || event.data === null) {
        // Meta a volte invia il payload come string JSON
        if (typeof event.data !== "string") return;
      }
      let payload = event.data;
      if (typeof payload === "string") {
        try { payload = JSON.parse(payload); } catch { return; }
      }
      if (payload?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (payload?.event === "FINISH" || payload?.event === "FINISH_ONLY_WABA") {
        window.removeEventListener("message", handler);
        clearTimeout(timer);
        resolve({
          phone_number_id: payload?.data?.phone_number_id,
          waba_id: payload?.data?.waba_id,
        });
      } else if (payload?.event === "CANCEL" || payload?.event === "ERROR") {
        window.removeEventListener("message", handler);
        clearTimeout(timer);
        resolve(null);
      }
    };
    window.addEventListener("message", handler);
    const timer = setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve(null);
    }, timeoutMs);
  });
}

export interface EmbeddedSignupResult {
  purpose: WAPurpose;
  phone_number_id?: string;
  waba_id?: string;
}

export function useWhatsAppEmbeddedSignup() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<"idle" | "loading-sdk" | "popup" | "connecting">("idle");

  const reset = useCallback(() => setPhase("idle"), []);

  const connect = useMutation({
    mutationFn: async ({ purpose, display_name }: { purpose: WAPurpose; display_name?: string }) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      if (!isEmbeddedSignupSupported) {
        throw new Error(
          "Embedded Signup non supportato su mobile. Usa il wizard manuale (Phone Number ID + Token).",
        );
      }

      // 1. Recupera config Meta lato server
      const cfg = await fetchEmbeddedConfig(companyId);
      if (!cfg.is_configured || !cfg.meta_app_id || !cfg.whatsapp_config_id) {
        throw new Error(
          "Meta App ID o WhatsApp Config ID non configurati. Chiedi al super_admin di completare le platform settings.",
        );
      }

      // 2. Carica FB SDK
      setPhase("loading-sdk");
      await loadFacebookSdk(cfg.meta_app_id);
      if (!window.FB) throw new Error("Facebook SDK non disponibile");

      // 3. Lancia popup Embedded Signup + cattura sessionInfo in parallelo
      setPhase("popup");
      const sessionInfoPromise = waitForSessionInfo();
      const loginResponse: FbLoginResponse = await new Promise((resolve) => {
        window.FB.login(
          (response: FbLoginResponse) => resolve(response),
          {
            config_id: cfg.whatsapp_config_id,
            response_type: "code",
            override_default_response_type: true,
            extras: {
              feature: "whatsapp_embedded_signup",
              sessionInfoVersion: 3,
            },
          },
        );
      });

      const authCode = loginResponse?.authResponse?.code;
      if (!authCode) {
        throw new Error("Onboarding annullato o codice OAuth non ricevuto");
      }
      const sessionInfo = (await sessionInfoPromise) ?? {};

      // 4. Scambio code lato server (whatsapp-connect gestisce tutto)
      setPhase("connecting");
      const { data, error } = await supabase.functions.invoke("whatsapp-connect", {
        body: {
          company_id: companyId,
          code: authCode,
          meta_app_id: cfg.meta_app_id,
          purpose,
          display_name,
          // Hint ottimistici dal sessionInfo: il backend può usarli se la
          // chiamata Graph fallisce nel lookup phone numbers (fallback safety).
          phone_number_id: sessionInfo.phone_number_id,
          waba_id: sessionInfo.waba_id,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return { purpose, ...sessionInfo } satisfies EmbeddedSignupResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...WA_NUMBERS_KEY, companyId] });
      toast.success("Numero WhatsApp collegato tramite Meta Embedded Signup.");
      setPhase("idle");
    },
    onError: (err: Error) => {
      toast.error(`Connessione Meta fallita: ${err.message}`);
      setPhase("idle");
    },
  });

  return { connect, phase, reset };
}
