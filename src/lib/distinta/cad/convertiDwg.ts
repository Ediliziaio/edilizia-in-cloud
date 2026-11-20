import { ENDPOINT_DWG_LOCALE, MAX_DWG_BYTE, MAX_DXF_CONVERTITO_BYTE, UUID_CAD, type ProvenienzaConversioneDwg } from "./protocolloDwg";
import { riconosciFormato } from "./leggiDxf";

export interface RisultatoConversioneDwg { file: File; provenienza: ProvenienzaConversioneDwg }
export function conversioneDwgLocaleDisponibile(): boolean {
  return import.meta.env.DEV && typeof location !== "undefined" && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
}

/** Trasporto same-origin solo locale; nessun endpoint esterno dedotto o attivato in produzione. */
export async function convertiDwgLocale(file: File, companyId: string, signal: AbortSignal, orderId?: string): Promise<RisultatoConversioneDwg> {
  const locale = conversioneDwgLocaleDisponibile();
  if (!locale && (!orderId || !UUID_CAD.test(orderId) || !/^https:\/\//.test(import.meta.env.VITE_SUPABASE_URL ?? ""))) throw new Error("Conversione automatica DWG non attiva in questo ambiente. Carica un DXF.");
  if (!UUID_CAD.test(companyId)) throw new Error("Azienda non disponibile per la lettura CAD.");
  if (!file.size || file.size > (locale ? MAX_DWG_BYTE : 4*1024*1024)) throw new Error(locale ? "Carica un DWG non vuoto, fino a 64 MB." : "Il DWG online deve essere non vuoto e fino a 4 MB. Per file più grandi carica un DXF.");
  signal.throwIfAborted();
  if (riconosciFormato(new Uint8Array(await file.slice(0, 64).arrayBuffer())) !== "dwg") throw new Error("Il contenuto del file non è un DWG.");
  const originale = await file.arrayBuffer();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", originale))).map(b => b.toString(16).padStart(2, "0")).join("");
  signal.throwIfAborted();
  const requestId = crypto.randomUUID();
  let endpoint = ENDPOINT_DWG_LOCALE;
  const headers: Record<string,string> = { "Content-Type": "application/octet-stream", "X-Eic-Cad-Company": companyId, "X-Eic-Cad-Request": requestId, "X-Eic-Cad-Size": String(file.size) };
  if (!locale) {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw new Error("Accedi nuovamente per leggere il disegno della commessa.");
    endpoint = new URL("/functions/v1/cad-leggi-commessa", import.meta.env.VITE_SUPABASE_URL).href;
    headers.Authorization = `Bearer ${data.session.access_token}`;
    headers.apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY; headers["X-Eic-Cad-Order"] = orderId!;
  }
  signal.throwIfAborted();
  const response = await fetch(endpoint, { method: "POST", body: file, signal: AbortSignal.any([signal, AbortSignal.timeout(240_000)]), credentials: "omit", redirect: "error",
    headers });
  if (!response.ok) throw new Error(response.status === 503 ? "Il motore DWG locale non è disponibile. Puoi riprovare o caricare un DXF."
    : response.status === 429 ? "È già in corso una conversione CAD. Attendi o annullala prima di riprovare."
      : response.status === 413 ? "Il DWG supera i limiti di conversione: usa una porzione del disegno."
        : "DWG non convertito: verifica il file o esportalo in DXF dal CAD.");
  const motore = response.headers.get("X-Eic-Cad-Engine") ?? "";
  const avvisi = response.headers.get("X-Eic-Cad-Warnings");
  if ((!locale && response.headers.get("X-Eic-Cad-Order") !== orderId) || response.headers.get("X-Eic-Cad-Company") !== companyId || response.headers.get("X-Eic-Cad-Request") !== requestId
    || response.headers.get("X-Eic-Cad-Sha256") !== hash || Number(response.headers.get("X-Eic-Cad-Input-Size")) !== file.size
    || !/^application\/dxf(?:;|$)/i.test(response.headers.get("Content-Type") ?? "") || !/^[A-Za-z0-9 ._-]{1,80}$/.test(motore) || !["0", "1"].includes(avvisi ?? "")) {
    await response.body?.cancel(); throw new Error("La conversione non corrisponde a questo file e a questa azienda. Riprova il caricamento.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Il convertitore non ha restituito il disegno.");
  const chunks: Uint8Array<ArrayBuffer>[] = []; let size = 0;
  try {
    for (;;) {
      signal.throwIfAborted(); const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_DXF_CONVERTITO_BYTE) { await reader.cancel(); throw new Error("Il DXF convertito è troppo grande. Carica una porzione del DWG."); }
      chunks.push(new Uint8Array(value));
    }
  } finally { reader.releaseLock(); }
  if (!size) throw new Error("Il DXF convertito è vuoto.");
  const dxf = new File(chunks, file.name.replace(/\.[^.]+$/, "") + ".dxf", { type: "application/dxf", lastModified: file.lastModified });
  if (riconosciFormato(new Uint8Array(await dxf.slice(0, 64).arrayBuffer())) !== "dxf") throw new Error("Il risultato non è un DXF leggibile.");
  signal.throwIfAborted();
  return { file: dxf, provenienza: { ...(!locale ? { trattamento: "servizio" as const } : {}), formato_originale: "dwg", formato_lettura: "dxf", sha256_originale: hash, motore, segnalazioni: avvisi === "1" } };
}
