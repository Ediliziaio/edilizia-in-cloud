import { arrayBufferToBase64 } from "./base64.ts";

export type ErroreMapsGoogle =
  | "chiave_mancante"
  | "chiave_non_valida"
  | "api_non_abilitata"
  | "fatturazione"
  | "restrizioni"
  | "quota"
  | "satellite_static_non_disponibile"
  | "timeout"
  | "non_disponibile";

const MESSAGGI: Record<ErroreMapsGoogle, string> = {
  chiave_mancante:
    "Google Maps non è ancora collegato. Chiedi all’amministratore di configurare il servizio.",
  chiave_non_valida:
    "La credenziale Google Maps non è valida. Chiedi all’amministratore di verificare il collegamento.",
  api_non_abilitata:
    "Il servizio richiesto di Google Maps non è abilitato nel progetto. Chiedi all’amministratore di verificarlo.",
  fatturazione:
    "Google Maps richiede una fatturazione attiva. Chiedi all’amministratore di verificare l’account Google.",
  restrizioni:
    "Google non consente a questo server di usare la mappa. Chiedi all’amministratore di verificare le restrizioni della credenziale.",
  quota:
    "Google Maps ha raggiunto il limite di utilizzo. Riprova più tardi o chiedi all’amministratore di verificare la quota.",
  satellite_static_non_disponibile:
    "La vista satellitare statica non è disponibile per questo account Google. Usa la mappa interattiva del configuratore.",
  timeout: "Google Maps non ha risposto in tempo. Riprova tra qualche secondo.",
  non_disponibile:
    "Vista Google non disponibile. Puoi inserire misure rilevate o riprovare.",
};

export const messaggioMapsGoogle = (codice: ErroreMapsGoogle) =>
  MESSAGGI[codice];

/** Il testo del provider serve solo a classificare: non esce mai dalla funzione. */
export function classificaErroreMapsGoogle(
  status: number,
  testo = "",
): ErroreMapsGoogle {
  const t = testo.slice(0, 4000).toLowerCase();
  if (/satellite and hybrid map types are not available/.test(t)) return "satellite_static_non_disponibile";
  if (status === 429 || /quota|over_query_limit|resource_exhausted/.test(t)) {
    return "quota";
  }
  if (/billing|billable|payment|fatturazione/.test(t)) return "fatturazione";
  if (
    /invalid.{0,30}(api.?key|key)|api.?key.{0,30}(invalid|expired)|api_key_invalid/
      .test(t)
  ) return "chiave_non_valida";
  if (/referer|referrer|ip address|ip_address|restriction|blocked/.test(t)) {
    return "restrizioni";
  }
  if (
    /not.{0,30}(enabled|activated)|has not been used|not authorized to use this api|api_not_activated/
      .test(t)
  ) return "api_non_abilitata";
  return status === 401 ? "chiave_non_valida" : "non_disponibile";
}

type EsitoMappa =
  | { dataUrl: string; codice?: never; status: number }
  | {
    dataUrl: null;
    codice: ErroreMapsGoogle;
    status: number;
    diagnostica?: string;
  };

/** Solo per log server: nessuna chiave, URL, IP o coordinata del richiedente. */
export function diagnosticaMapsGoogle(testo: string, url: string): string {
  let t = testo.slice(0, 4000);
  const chiave = new URL(url).searchParams.get("key");
  if (chiave) t = t.replaceAll(chiave, "[chiave]");
  return t.replace(/AIza[\w-]+/g, "[chiave]")
    .replace(/https?:\/\/[^\s"<>]+/gi, "[url]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]")
    .replace(/\b[0-9a-f]*:[0-9a-f:]+\b/gi, "[ip]")
    .replace(/[-+]?\d{1,3}\.\d{3,}/g, "[coordinate]")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, 320);
}

/** Non restituisce URL, chiavi o eccezioni; diagnostica redatta solo per log server. */
export async function scaricaMappaStatica(
  url: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = 10000,
): Promise<EsitoMappa> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetcher(url, { signal: controller.signal });
    const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim()
      .toLowerCase();
    if (!res.ok || !/^image\/(png|jpeg|webp)$/.test(mime)) {
      const testo = await res.text();
      return {
        dataUrl: null,
        codice: classificaErroreMapsGoogle(res.status, testo),
        status: res.status,
        ...(new URL(url).hostname === "maps.googleapis.com"
          ? { diagnostica: `${mime}: ${diagnosticaMapsGoogle(testo, url)}` }
          : {}),
      };
    }
    const bytes = await res.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 8 * 1024 * 1024) {
      return { dataUrl: null, codice: "non_disponibile", status: res.status };
    }
    return {
      dataUrl: `data:${mime};base64,${arrayBufferToBase64(bytes)}`,
      status: res.status,
    };
  } catch {
    return {
      dataUrl: null,
      codice: controller.signal.aborted ? "timeout" : "non_disponibile",
      status: 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function testaGoogleMaps(
  leggiChiave: () => Promise<string>,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: boolean; message: string }> {
  const key = await leggiChiave();
  if (!key) {
    return { ok: false, message: messaggioMapsGoogle("chiave_mancante") };
  }
  try {
    const res = await fetcher(
      `https://maps.googleapis.com/maps/api/geocode/json?address=Roma&key=${
        encodeURIComponent(key)
      }`,
      { signal: AbortSignal.timeout(10000) },
    );
    const json = await res.json();
    if (!res.ok || json.status !== "OK") {
      return {
        ok: false,
        message: messaggioMapsGoogle(
          classificaErroreMapsGoogle(
            res.status,
            `${json.status ?? ""} ${json.error_message ?? ""}`,
          ),
        ),
      };
    }
    const statica = await scaricaMappaStatica(
      `https://maps.googleapis.com/maps/api/staticmap?center=41.9028,12.4964&zoom=10&size=32x32&maptype=satellite&key=${
        encodeURIComponent(key)
      }`,
      fetcher,
    );
    return statica.dataUrl !== null
      ? {
        ok: true,
        message: "Google Maps: geocoding e vista satellitare funzionanti.",
      }
      : { ok: false, message: messaggioMapsGoogle(statica.codice) };
  } catch {
    return { ok: false, message: messaggioMapsGoogle("non_disponibile") };
  }
}
