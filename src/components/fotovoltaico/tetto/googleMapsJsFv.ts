import { supabase } from "@/integrations/supabase/client";
import type { PosizioneMappaFv } from "../../../../supabase/functions/_shared/fvMappa";

export type EventoMapsFv = { remove: () => void };
export type MappaGoogleFvApi = {
  getCenter: () => { toJSON: () => PosizioneMappaFv } | undefined;
  getZoom: () => number | undefined;
  setCenter: (p: PosizioneMappaFv) => void;
  setZoom: (zoom: number) => void;
  setOptions: (opzioni: Record<string, unknown>) => void;
  addListener: (evento: string, callback: () => void) => EventoMapsFv;
  unbindAll: () => void;
};
export type LibreriaMapsFv = {
  MaxZoomService?: new () => {
    getMaxZoomAtLatLng: (centro: PosizioneMappaFv, callback: (result: {status?: string; zoom?: number}) => void) => void;
  };
  Map: new (
    host: HTMLElement,
    opzioni: Record<string, unknown>,
  ) => MappaGoogleFvApi;
  event?: {
    trigger: (mappa: MappaGoogleFvApi, nome: string) => void;
    clearInstanceListeners: (mappa: MappaGoogleFvApi) => void;
  };
};
type FinestraGoogleFv = Window & {
  google?: { maps?: LibreriaMapsFv };
  __eicFvMapsReady?: () => void;
  gm_authFailure?: () => void;
};
let caricamento: Promise<LibreriaMapsFv> | null = null;
const erroriAutenticazione = new Set<() => void>();
let handlerInstallato = false;
export function ascoltaErroreGoogleFv(callback: () => void) {
  erroriAutenticazione.add(callback);
  return () => {
    erroriAutenticazione.delete(callback);
  };
}

/** Solo SDK ufficiale e chiave browser dedicata; non usa immagini Static né tile scaricati. */
export function caricaGoogleMapsFv(): Promise<LibreriaMapsFv> {
  if (caricamento) return caricamento;
  caricamento = (async () => {
    const ambiente = window as FinestraGoogleFv;
    if (!handlerInstallato) {
      const precedente = ambiente.gm_authFailure;
      ambiente.gm_authFailure = () => {
        for (const callback of erroriAutenticazione) callback();
        precedente?.();
      };
      handlerInstallato = true;
    }
    if (ambiente.google?.maps?.Map) return ambiente.google.maps;
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 15000);
    let data: { configured?: boolean; key?: string; message?: string } | null =
      null;
    try {
      const risposta = await supabase.functions.invoke("maps-proxy", {
        body: { action: "browserconfig" },
        signal: controller.signal,
      });
      if (risposta.error) {
        throw Error(
          "Collegamento alla mappa non disponibile. Verifica la sessione e riprova.",
        );
      }
      data = risposta.data;
    } finally {
      clearTimeout(timer);
    }
    if (
      !data?.configured || typeof data.key !== "string" ||
      !/^AIza[\w-]{35}$/.test(data.key)
    ) {
      throw Error(
        data?.message ||
          "La mappa interattiva Google non è ancora collegata. Puoi continuare con le misure rilevate.",
      );
    }
    return await new Promise<LibreriaMapsFv>((resolve, reject) => {
      const script = document.createElement("script");
      const timeout = setTimeout(
        () =>
          termina(
            "Google Maps non ha risposto in tempo. Riprova tra qualche secondo.",
          ),
        20000,
      );
      const termina = (errore?: string) => {
        clearTimeout(timeout);
        delete ambiente.__eicFvMapsReady;
        if (errore || !ambiente.google?.maps?.Map) {
          script.remove();
          reject(Error(errore || "Google Maps non è disponibile. Riprova."));
        } else resolve(ambiente.google.maps);
      };
      ambiente.__eicFvMapsReady = () => termina();
      script.id = "eic-fv-google-maps";
      script.async = true;
      script.referrerPolicy = "strict-origin-when-cross-origin";
      const url = new URL("https://maps.googleapis.com/maps/api/js");
      url.search = new URLSearchParams({
        key: data.key!,
        v: "quarterly",
        loading: "async",
        callback: "__eicFvMapsReady",
        language: "it",
        region: "IT",
      }).toString();
      script.src = url.toString();
      const nonce = document.querySelector<HTMLScriptElement>("script[nonce]")
        ?.nonce;
      if (nonce) script.nonce = nonce;
      script.onerror = () =>
        termina(
          "La mappa Google non è raggiungibile. Controlla la connessione e riprova.",
        );
      document.head.appendChild(script);
    });
  })().catch((errore: unknown) => {
    caricamento = null;
    throw errore;
  });
  return caricamento;
}
