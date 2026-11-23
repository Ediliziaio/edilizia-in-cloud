import { coordinate, metriInLinea, type Coordinate, type PercorsoStradale, type Tratta } from "../../../shared/mappa-operativa/calcoli.ts";

const stringaPunti = (punti: Coordinate[]) => punti.map(p => `${p.lng},${p.lat}`).join(";");
const valore = (metri: unknown, secondi: unknown): Tratta | null =>
  typeof metri === "number" && Number.isFinite(metri) && metri >= 0 &&
  typeof secondi === "number" && Number.isFinite(secondi) && secondi >= 0 ? { metri, secondi } : null;

export function endpoint(base: string, percorso: string) {
  const url = new URL(base.replace(/\/+$/, "") + "/" + percorso);
  const sviluppo = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (["nominatim.openstreetmap.org", "router.project-osrm.org", "routing.openstreetmap.de"].includes(url.hostname)) {
    throw new Error("Usare un servizio cartografico dedicato");
  }
  if (url.protocol !== "https:" && !sviluppo) throw new Error("Endpoint HTTPS richiesto");
  return url;
}

async function leggi<T>(url: URL, headers?: HeadersInit, token?: string, accetta400?: (dati: T) => boolean): Promise<T> {
  const richiesta = new Headers(headers);
  if (token) richiesta.set("Authorization", `Bearer ${token}`);
  const risposta = await fetch(url, { headers: richiesta, signal: AbortSignal.timeout(6500), redirect: "error" });
  if (risposta.ok) return await risposta.json();
  if (risposta.status === 400 && accetta400) {
    const dati: T = await risposta.json();
    if (accetta400(dati)) return dati;
  }
  throw new Error("Provider cartografico non disponibile");
}

type LineaGeoJson = { coordinates: [number, number][] };

function puntiLinea(linee: LineaGeoJson[]) {
  const punti: Coordinate[] = [];
  for (const linea of linee) {
    if (!Array.isArray(linea.coordinates)) return [];
    for (const [lng, lat] of linea.coordinates) {
      const punto = coordinate(lat, lng);
      if (!punto) return [];
      const ultimo = punti.at(-1);
      if (!ultimo || ultimo.lat !== punto.lat || ultimo.lng !== punto.lng) punti.push(punto);
    }
  }
  return punti;
}

const raggioAggancio = 500;

export async function percorsoOsrm(
  base: string, profilo: string, punti: Coordinate[], token?: string,
): Promise<PercorsoStradale> {
  const url = endpoint(base, `route/v1/${profilo}/${stringaPunti(punti)}`);
  url.search = new URLSearchParams({
    overview: "full", geometries: "geojson", steps: punti.length > 2 ? "true" : "false",
    radiuses: punti.map(() => raggioAggancio).join(";"),
  }).toString();
  const data = await leggi<{ code: string; message?: string; waypoints?: { distance?: number; location?: [number, number] }[];
    routes?: Array<{ legs: { distance: number; duration: number; steps?: { geometry?: LineaGeoJson }[] }[]; geometry?: LineaGeoJson }> }>(
    url, undefined, token, risposta => risposta.code === "NoSegment" || risposta.code === "NoRoute");
  const vuoto: PercorsoStradale = { tratte: punti.slice(1).map((): null => null), geometria: [] };
  if (data.code === "NoSegment") {
    const indice = Number(data.message?.match(/\bcoordinate\s+(\d+)\b/i)?.[1]);
    const puntiFuoriCopertura = Number.isInteger(indice) && indice >= 0 && indice < punti.length ? [indice] : [];
    return { ...vuoto, problema: "fuori_copertura", puntiFuoriCopertura };
  }
  if (data.code === "NoRoute") return { ...vuoto, problema: "nessun_percorso" };
  const route = data.routes?.[0];
  if (!route || data.code !== "Ok") return vuoto;
  const puntiFuoriCopertura = punti.flatMap((punto, indice) => {
    const aggancio = data.waypoints?.[indice];
    const posizione = coordinate(aggancio?.location?.[1], aggancio?.location?.[0]);
    return ((aggancio?.distance ?? 0) > raggioAggancio || (posizione && metriInLinea(punto, posizione) > raggioAggancio))
      ? [indice] : [];
  });
  if (puntiFuoriCopertura.length) return { ...vuoto, problema: "fuori_copertura", puntiFuoriCopertura };
  const tratte = punti.slice(1).map((_, i) => valore(route.legs[i]?.distance, route.legs[i]?.duration));
  const geometria = puntiLinea(route.geometry ? [route.geometry] : []);
  const geometrieTratte = tratte.map((tratta, i) => {
    if (!tratta?.metri) return [];
    if (tratte.length === 1) return geometria;
    const linee = route.legs[i]?.steps?.map(step => step.geometry) ?? [];
    return linee.every(linea => !!linea?.coordinates?.length) ? puntiLinea(linee as LineaGeoJson[]) : [];
  });
  return { tratte, geometria, geometrieTratte };
}

export async function matriceOsrm(base: string, profilo: string, altri: Coordinate[], meta: Coordinate, ritorno = false, token?: string) {
  const url = endpoint(base, `table/v1/${profilo}/${stringaPunti([meta, ...altri])}`);
  const indici = altri.map((_, i) => i + 1).join(";");
  url.search = new URLSearchParams({
    annotations: "duration,distance", sources: ritorno ? "0" : indici, destinations: ritorno ? indici : "0",
  }).toString();
  const data = await leggi<{
    code: string; durations?: (number | null)[][]; distances?: (number | null)[][];
  }>(url, undefined, token);
  return altri.map((_, i) => {
    const [a, b] = ritorno ? [0, i] : [i, 0];
    return data.code === "Ok" ? valore(data.distances?.[a]?.[b], data.durations?.[a]?.[b]) : null;
  });
}

// ── HERE Routing/Matrix v8 — fallback quando non c'è un server OSRM dedicato ──
// Usano HERE_API_KEY (la stessa chiave della geocodifica) e replicano la forma di
// percorsoOsrm/matriceOsrm, così il resto della edge non cambia. HERE rifiuta gli
// host pubblici OSRM/Nominatim per policy, ma ha i suoi servizi di routing a chiave.
const HERE_ROUTER = "https://router.hereapi.com/v8/routes";
const HERE_MATRIX = "https://matrix.router.hereapi.com/v8/matrix";
const modoHere = (profilo: string) => (profilo === "furgone" ? "truck" : "car");

/** Decodifica la "flexible polyline" di HERE (solo lat/lng, scarta l'eventuale 3ª dim). */
function decodeFlexiblePolyline(encoded: string): Coordinate[] {
  const T = [62,-1,-1,63,52,53,54,55,56,57,58,59,60,61,-1,-1,-1,-1,-1,-1,-1,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,-1,-1,-1,-1,-1,-1,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51];
  let i = 0;
  const unsigned = (): bigint => {
    let r = 0n, shift = 0n;
    for (;;) {
      if (i >= encoded.length) throw new Error("polyline troncata");
      const c = encoded.charCodeAt(i++) - 45;
      const v = c >= 0 && c < T.length ? T[c] : -1;
      if (v < 0) throw new Error("polyline non valida");
      r |= BigInt(v & 0x1f) << shift;
      if ((v & 0x20) === 0) return r;
      shift += 5n;
    }
  };
  const signed = (v: bigint): bigint => ((v & 1n) ? ~(v >> 1n) : (v >> 1n));
  if (unsigned() !== 1n) throw new Error("versione polyline non supportata");
  const header = Number(unsigned());
  const fattore = Math.pow(10, header & 15);
  const terzaDim = (header >> 4) & 7;
  const punti: Coordinate[] = [];
  let lat = 0n, lng = 0n;
  while (i < encoded.length) {
    lat += signed(unsigned());
    lng += signed(unsigned());
    if (terzaDim) unsigned();
    punti.push({ lat: Number(lat) / fattore, lng: Number(lng) / fattore });
  }
  return punti;
}

type LuogoHere = { originalLocation?: { lat: number; lng: number }; location?: { lat: number; lng: number } };
type SezioneHere = {
  summary?: { length?: number; duration?: number };
  polyline?: string;
  departure?: { place?: LuogoHere };
  arrival?: { place?: LuogoHere };
};

export async function percorsoHere(apiKey: string, profilo: string, punti: Coordinate[]): Promise<PercorsoStradale> {
  const vuoto: PercorsoStradale = { tratte: punti.slice(1).map((): null => null), geometria: [] };
  if (punti.length < 2) return vuoto;
  const p = new URLSearchParams({
    transportMode: modoHere(profilo),
    origin: `${punti[0].lat},${punti[0].lng}`,
    destination: `${punti[punti.length - 1].lat},${punti[punti.length - 1].lng}`,
    return: "polyline,summary", apikey: apiKey,
  });
  for (const v of punti.slice(1, -1)) p.append("via", `${v.lat},${v.lng}`);
  const risposta = await fetch(`${HERE_ROUTER}?${p.toString()}`, { signal: AbortSignal.timeout(8000), redirect: "error" });
  if (!risposta.ok) {
    if (risposta.status === 400) return { ...vuoto, problema: "nessun_percorso" };
    throw new Error("Provider cartografico non disponibile");
  }
  const data = await risposta.json() as { routes?: Array<{ sections: SezioneHere[] }> };
  const sezioni = data.routes?.[0]?.sections;
  if (!sezioni?.length) return { ...vuoto, problema: "nessun_percorso" };
  const lontano = (place?: LuogoHere) => {
    const orig = coordinate(place?.originalLocation?.lat, place?.originalLocation?.lng);
    const snap = coordinate(place?.location?.lat, place?.location?.lng);
    return !!orig && !!snap && metriInLinea(orig, snap) > raggioAggancio;
  };
  const fuori: number[] = [];
  sezioni.forEach((s, i) => {
    if (lontano(s.departure?.place) && !fuori.includes(i)) fuori.push(i);
    if (lontano(s.arrival?.place) && !fuori.includes(i + 1)) fuori.push(i + 1);
  });
  if (fuori.length) return { ...vuoto, problema: "fuori_copertura", puntiFuoriCopertura: fuori.sort((a, b) => a - b) };
  const tratte = sezioni.map(s => valore(s.summary?.length, s.summary?.duration));
  const geometrieTratte = sezioni.map(s => { try { return s.polyline ? decodeFlexiblePolyline(s.polyline) : []; } catch { return []; } });
  return { tratte, geometria: geometrieTratte.flat(), geometrieTratte };
}

export async function matriceHere(apiKey: string, profilo: string, altri: Coordinate[], meta: Coordinate, ritorno = false): Promise<(Tratta | null)[]> {
  if (!altri.length) return [];
  const origins = (ritorno ? altri : [meta]).map(p => ({ lat: p.lat, lng: p.lng }));
  const destinations = (ritorno ? [meta] : altri).map(p => ({ lat: p.lat, lng: p.lng }));
  const risposta = await fetch(`${HERE_MATRIX}?async=false&apikey=${apiKey}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(9000), redirect: "error",
    body: JSON.stringify({ origins, destinations, regionDefinition: { type: "autoCircle" },
      transportMode: modoHere(profilo), matrixAttributes: ["travelTimes", "distances"] }),
  });
  if (!risposta.ok) throw new Error("Provider cartografico non disponibile");
  const data = await risposta.json() as { matrix?: { numDestinations?: number; travelTimes?: number[]; distances?: number[]; errorCodes?: number[] } };
  const m = data.matrix;
  if (!m?.distances || !m?.travelTimes) return altri.map((): null => null);
  const nd = m.numDestinations ?? destinations.length;
  return altri.map((_, i) => {
    const [o, d] = ritorno ? [i, 0] : [0, i];
    const idx = o * nd + d;
    return (m.errorCodes?.[idx] ?? 0) === 0 ? valore(m.distances![idx], m.travelTimes![idx]) : null;
  });
}

export async function cercaIndirizzo(base: string, indirizzo: string, token?: string) {
  const url = endpoint(base, "search");
  url.search = new URLSearchParams({ q: indirizzo, limit: "5", format: "jsonv2", addressdetails: "1",
    "accept-language": "it", countrycodes: "it" }).toString();
  const risultati = await leggi<{ lat: string; lon: string; display_name: string; address?: { house_number?: string; postcode?: string } }[]>(url, {
    "User-Agent": "EdiliziaInCloud-OperationalMap/1.0 (support@ediliziaincloud.com)",
  }, token);
  return risultati.flatMap(r => {
    const punto = coordinate(Number(r.lat), Number(r.lon));
    return punto && typeof r.display_name === "string"
      ? [{ ...punto, etichetta: r.display_name, civico: r.address?.house_number ?? null, cap: r.address?.postcode ?? null }] : [];
  });
}
