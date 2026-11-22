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
