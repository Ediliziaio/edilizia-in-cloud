import { coordinate, type Coordinate, type Tratta } from "../../../shared/mappa-operativa/calcoli.ts";

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

async function leggi<T>(url: URL, headers?: HeadersInit, token?: string): Promise<T> {
  const richiesta = new Headers(headers);
  if (token) richiesta.set("Authorization", `Bearer ${token}`);
  const risposta = await fetch(url, { headers: richiesta, signal: AbortSignal.timeout(6500), redirect: "error" });
  if (!risposta.ok) throw new Error("Provider cartografico non disponibile");
  return await risposta.json();
}

export async function percorsoOsrm(
  base: string, profilo: string, punti: Coordinate[], token?: string,
): Promise<{ tratte: (Tratta | null)[]; geometria: Coordinate[] }> {
  const url = endpoint(base, `route/v1/${profilo}/${stringaPunti(punti)}`);
  url.search = new URLSearchParams({ overview: "simplified", geometries: "geojson", steps: "false" }).toString();
  const data = await leggi<{ code: string; routes?: Array<{
    legs: { distance: number; duration: number }[]; geometry?: { coordinates: [number, number][] };
  }> }>(url, undefined, token);
  const route = data.routes?.[0];
  if (!route || data.code !== "Ok") return { tratte: punti.slice(1).map((): null => null), geometria: [] };
  return {
    tratte: punti.slice(1).map((_, i) => valore(route.legs[i]?.distance, route.legs[i]?.duration)),
    geometria: (route.geometry?.coordinates ?? []).flatMap(([lng, lat]) => {
      const punto = coordinate(lat, lng);
      return punto ? [punto] : [];
    }),
  };
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
