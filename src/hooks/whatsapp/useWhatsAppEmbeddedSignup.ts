// useWhatsAppEmbeddedSignup — Meta Embedded Signup flow per collegare un numero
// WhatsApp Business con un click (in alternativa all'inserimento manuale di
// Phone Number ID + Access Token).
//
// Flusso:
//  1. Backend (`whatsapp-embedded-config`) restituisce meta_app_id +
//     whatsapp_config_id (Embedded Signup Config approvato lato Meta).
//  2. Frontend carica il Facebook JS SDK on-demand (1 sola volta per sessione).
//  3. `FB.login()` viene lanciato con il config_id di una configurazione con
//     variante «Iscrizione integrata di WhatsApp» (v4: `extras: { setup: {} }`).
//     Con una configurazione «General» il popup risponde solo "Si è verificato
//     un errore". Meta apre la popup di onboarding (verifica numero, OTP, ecc.).
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
import { readInvokeError } from "@/lib/readInvokeError";
import { usePaymentGateStore } from "@/store/paymentGateStore";
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
// Ultima versione dell'API Graph indicata da Meta per l'iscrizione integrata v4.
const FB_SDK_VERSION = "v26.0";

declare global {
  interface Window {
    // deno-lint-ignore no-explicit-any
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

let fbSdkPromise: Promise<void> | null = null;
let lastInitAppId: string | null = null;

// Timeout esplicito sul caricamento SDK. Senza, se il browser blocca lo script
// silenziosamente (es. CSP, AdBlocker, network filter aziendale) la Promise
// resta pending in eterno e l'UI mostra "Caricamento Meta..." per sempre.
// Con timeout l'utente vede un errore comprensibile e può intervenire.
const SDK_LOAD_TIMEOUT_MS = 10_000;

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

    // Diagnostic log SEMPRE attivo (anche in prod via console.error che NON
    // viene strippato da esbuild drop in vite.config). Aiuta a debuggare
    // problemi di CSP/AdBlock/CORS reali in produzione.
    console.error("[wa-embedded] loadFacebookSdk start — appId=" + appId);

    // Timeout di sicurezza
    const timeoutId = window.setTimeout(() => {
      // Reset cache così un nuovo tentativo può ripartire
      fbSdkPromise = null;
      console.error("[wa-embedded] SDK timeout 10s — window.FB present?", !!window.FB, "script tag present?", !!document.getElementById("facebook-jssdk"));
      reject(
        new Error(
          "Timeout caricamento Facebook SDK (10s). Possibili cause: CSP che blocca connect.facebook.net, ad-blocker attivo, o connessione lenta. Riprova oppure usa la modalità manuale.",
        ),
      );
    }, SDK_LOAD_TIMEOUT_MS);

    const initFB = () => {
      if (!window.FB) {
        clearTimeout(timeoutId);
        console.error("[wa-embedded] initFB called but window.FB is undefined");
        reject(new Error("Facebook SDK non disponibile dopo il caricamento"));
        return;
      }
      try {
        console.error("[wa-embedded] FB.init({ appId, version }) chiamato");
        window.FB.init({
          appId,
          autoLogAppEvents: true,
          xfbml: false,
          version: FB_SDK_VERSION,
        });
        lastInitAppId = appId;
        clearTimeout(timeoutId);
        console.error("[wa-embedded] FB.init OK — SDK pronto");
        resolve();
      } catch (e) {
        clearTimeout(timeoutId);
        console.error("[wa-embedded] FB.init threw:", e);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };

    // Se l'SDK è già caricato e inizializzato → basta re-init con nuovo appId
    if (window.FB) {
      console.error("[wa-embedded] window.FB già presente — re-init");
      initFB();
      return;
    }

    // Chaining di fbAsyncInit esistente (es. Meta Pixel già installato)
    const prevAsyncInit = window.fbAsyncInit;
    window.fbAsyncInit = () => {
      try {
        prevAsyncInit?.();
      } catch (e) {
        console.warn("[wa-embedded] fbAsyncInit precedente ha sollevato:", e);
      }
      console.error("[wa-embedded] fbAsyncInit callback firing → initFB");
      initFB();
    };

    const existing = document.getElementById("facebook-jssdk");
    if (existing) {
      // script presente ma SDK non ancora inizializzato → aspettiamo fbAsyncInit
      console.error("[wa-embedded] script tag già presente, aspetto fbAsyncInit");
      return;
    }
    console.error("[wa-embedded] inietto <script src='" + FB_SDK_SRC + "'>");
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = FB_SDK_SRC;
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      console.error("[wa-embedded] script.onload fired — window.FB?", !!window.FB);
    };
    script.onerror = (e) => {
      clearTimeout(timeoutId);
      fbSdkPromise = null;
      console.error("[wa-embedded] script.onerror fired:", e);
      reject(
        new Error(
          "Caricamento Facebook SDK fallito (script.onerror). Verifica che connect.facebook.net sia raggiungibile (CSP, ad-blocker, firewall).",
        ),
      );
    };
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
  // Il motivo vero (per esempio l'add-on WhatsApp non attivo) sta nel corpo della risposta.
  if (error) throw new Error(await readInvokeError(error));
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

// Esito del messaggio che il popup di Meta manda alla nostra pagina.
// Quando fallisce, Meta non chiude in silenzio: manda event "CANCEL" con
// data.error_code / error_message / session_id. Prima lo scartavamo
// (resolve(null)) e chi collegava restava con il solo "Si è verificato un
// errore" del popup, senza un codice da capire o da girare al supporto Meta.
type EsitoPopupMeta =
  | { tipo: "finito"; info: MetaSessionInfo }
  | { tipo: "annullato"; passo?: string; codice?: string; messaggio?: string; sessione?: string }
  | { tipo: "scaduto" };

// Listener temporaneo per il messaggio "session info" dell'Embedded Signup.
// Meta invia un postMessage con `{ type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH',
// data: { phone_number_id, waba_id } }` al window padre. Timeout di 180s per
// dare margine ai flussi mobile (OTP via SMS può essere lento).
function waitForSessionInfo(timeoutMs = 180_000): Promise<EsitoPopupMeta> {
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
      const evento = String(payload?.event ?? "");
      const dati = payload?.data ?? {};
      // "FINISH" e le sue varianti (solo WABA, app WhatsApp Business) chiudono
      // tutte il flusso con successo.
      if (evento.startsWith("FINISH")) {
        chiudi();
        resolve({
          tipo: "finito",
          info: { phone_number_id: dati.phone_number_id, waba_id: dati.waba_id },
        });
      } else if (evento === "CANCEL" || evento === "ERROR") {
        chiudi();
        resolve({
          tipo: "annullato",
          passo: dati.current_step,
          codice: dati.error_code != null ? String(dati.error_code) : undefined,
          messaggio: dati.error_message,
          sessione: dati.session_id,
        });
      }
    };
    const chiudi = () => {
      window.removeEventListener("message", handler);
      clearTimeout(timer);
    };
    window.addEventListener("message", handler);
    const timer = setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve({ tipo: "scaduto" });
    }, timeoutMs);
  });
}

/** Messaggio leggibile per un popup Meta chiuso senza codice OAuth. */
function messaggioEsitoMeta(esito: EsitoPopupMeta): string {
  if (esito.tipo === "annullato" && (esito.codice || esito.messaggio)) {
    return (
      `Meta ha interrotto il collegamento: ${esito.messaggio ?? "errore senza descrizione"}` +
      (esito.codice ? ` (codice ${esito.codice})` : "") +
      (esito.sessione ? ` — ID sessione Meta: ${esito.sessione}` : "")
    );
  }
  if (esito.tipo === "annullato") {
    return `Collegamento annullato nel popup di Meta${esito.passo ? ` (al passo «${esito.passo}»)` : ""}.`;
  }
  return "Onboarding annullato o codice OAuth non ricevuto";
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
      console.error("[wa-embedded] connect.mutate START — companyId=" + companyId);
      if (!companyId) throw new Error("Azienda non disponibile");
      if (!isEmbeddedSignupSupported) {
        throw new Error(
          "Embedded Signup non supportato su mobile. Usa il wizard manuale (Phone Number ID + Token).",
        );
      }

      // 1. Recupera config Meta lato server
      console.error("[wa-embedded] fase 1 → fetchEmbeddedConfig");
      const cfg = await fetchEmbeddedConfig(companyId);
      console.error("[wa-embedded] config received:", { is_configured: cfg.is_configured, has_app_id: !!cfg.meta_app_id, has_config_id: !!cfg.whatsapp_config_id });
      if (!cfg.is_configured || !cfg.meta_app_id || !cfg.whatsapp_config_id) {
        throw new Error(
          "Meta App ID o WhatsApp Config ID non configurati. Chiedi al super_admin di completare le platform settings.",
        );
      }

      // 2. Carica FB SDK
      console.error("[wa-embedded] fase 2 → setPhase(loading-sdk) + loadFacebookSdk");
      setPhase("loading-sdk");
      try {
        await loadFacebookSdk(cfg.meta_app_id);
      } catch (sdkErr) {
        console.error("[wa-embedded] loadFacebookSdk failed:", sdkErr);
        throw sdkErr;
      }
      if (!window.FB) {
        console.error("[wa-embedded] window.FB undefined dopo loadFacebookSdk");
        throw new Error("Facebook SDK non disponibile");
      }

      // 3. Lancia popup Embedded Signup + cattura sessionInfo in parallelo.
      // Iscrizione integrata v4: `extras: { setup: {} }`. I prodotti stanno
      // nella configurazione di Facebook Login for Business (variante
      // «Iscrizione integrata di WhatsApp») e le informazioni di sessione
      // arrivano sempre, senza sessionInfoVersion. La chiamata v2 di prima
      // (`feature: 'whatsapp_embedded_signup'`) Meta la spegne a ottobre 2026.
      console.error("[wa-embedded] fase 3 → setPhase(popup) + FB.login(config_id=" + cfg.whatsapp_config_id + ")");
      setPhase("popup");
      const sessionInfoPromise = waitForSessionInfo();
      const loginResponse: FbLoginResponse = await new Promise((resolve) => {
        window.FB.login(
          (response: FbLoginResponse) => {
            console.error("[wa-embedded] FB.login callback fired:", { status: response?.status, hasCode: !!response?.authResponse?.code });
            resolve(response);
          },
          {
            config_id: cfg.whatsapp_config_id,
            response_type: "code",
            override_default_response_type: true,
            extras: { setup: {} },
          },
        );
      });

      const attendiEsito = (ms: number) =>
        Promise.race<EsitoPopupMeta>([
          sessionInfoPromise,
          new Promise<EsitoPopupMeta>((r) => setTimeout(() => r({ tipo: "scaduto" }), ms)),
        ]);

      const authCode = loginResponse?.authResponse?.code;
      if (!authCode) {
        // Il messaggio di Meta con il motivo arriva insieme al callback: gli
        // diamo un attimo, così l'errore mostrato è il suo e non un generico
        // "annullato".
        const esito = await attendiEsito(1500);
        console.error("[wa-embedded] no authCode — status=" + loginResponse?.status, esito);
        throw new Error(messaggioEsitoMeta(esito));
      }
      // Il codice di Meta scade dopo 30 secondi: le informazioni di sessione
      // sono solo suggerimenti per il server, non vanno aspettate oltre.
      const esitoSessione = await attendiEsito(5000);
      const sessionInfo: MetaSessionInfo = esitoSessione.tipo === "finito" ? esitoSessione.info : {};
      console.error("[wa-embedded] sessionInfo:", sessionInfo);

      // 4. Scambio code lato server (whatsapp-connect gestisce tutto)
      console.error("[wa-embedded] fase 4 → whatsapp-connect");
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
      if (error) {
        console.error("[wa-embedded] whatsapp-connect error:", error);
        throw new Error(await readInvokeError(error));
      }
      if (data?.error) {
        console.error("[wa-embedded] whatsapp-connect data.error:", data.error);
        throw new Error(data.error);
      }
      console.error("[wa-embedded] SUCCESS");
      return { purpose, ...sessionInfo } satisfies EmbeddedSignupResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...WA_NUMBERS_KEY, companyId] });
      toast.success("Numero WhatsApp collegato tramite Meta Embedded Signup.");
      setPhase("idle");
    },
    onError: (err: Error) => {
      // Un blocco di pagamento (add-on WhatsApp non attivo) ha già aperto la
      // sua finestra con l'offerta: un toast la coprirebbe.
      const gate = usePaymentGateStore.getState();
      if (!(gate.open && Date.now() - gate.apertoAt < 3000)) {
        toast.error(`Connessione Meta fallita: ${err.message}`);
      }
      setPhase("idle");
    },
  });

  return { connect, phase, reset };
}
