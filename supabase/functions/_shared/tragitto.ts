/**
 * Tragitto in auto tra due o più punti, con HERE quando Google non c'è.
 *
 * Il calcolo dei km nelle prenotazioni (scheda appuntamento dell'opportunità e
 * finestra dell'appuntamento) passa dall'azione «directions» di maps-proxy, che
 * parlava solo con Google: la chiave Google non è mai stata configurata (la
 * ricerca indirizzi è già su HERE dal 11/06/2026), quindi la distanza dalla base
 * del calendario non compariva mai, senza nessun errore visibile. Qui il calcolo
 * con HERE Routing v8, con la stessa forma di risposta di Google.
 * Nessuna dipendenza da Deno: si prova con i test di Vitest.
 */

export interface PuntoGeografico {
  lat: number;
  lng: number;
}

export interface TrattaStradale {
  distance_m: number;
  duration_s: number;
  distance_text: string;
  duration_text: string;
}

/** «850 m», «5,2 km». */
export function testoDistanza(metri: number): string {
  if (!Number.isFinite(metri) || metri <= 0) return "0 m";
  if (metri < 1000) return `${Math.round(metri)} m`;
  return `${(metri / 1000).toFixed(1).replace(".", ",")} km`;
}

/** «12 min», «1 ora 5 min». */
export function testoDurata(secondi: number): string {
  if (!Number.isFinite(secondi) || secondi <= 0) return "0 min";
  const minuti = Math.max(1, Math.round(secondi / 60));
  if (minuti < 60) return `${minuti} min`;
  const ore = Math.floor(minuti / 60);
  const resto = minuti % 60;
  return `${ore} ${ore === 1 ? "ora" : "ore"}${resto ? ` ${resto} min` : ""}`;
}

interface SezioneHere {
  summary?: { duration?: number; length?: number };
}

/** Le sezioni di una risposta HERE diventano tratte con i testi già pronti. */
export function tratteDaSezioniHere(sezioni: SezioneHere[] | undefined | null): TrattaStradale[] {
  return (sezioni ?? []).map((s) => {
    const distance_m = Math.round(Number(s.summary?.length ?? 0));
    const duration_s = Math.round(Number(s.summary?.duration ?? 0));
    return { distance_m, duration_s, distance_text: testoDistanza(distance_m), duration_text: testoDurata(duration_s) };
  });
}

/** L'indirizzo della richiesta a HERE: partenza, arrivo e tappe intermedie. */
export function urlPercorsoHere(punti: PuntoGeografico[], chiave: string): string {
  const origine = punti[0];
  const arrivo = punti[punti.length - 1];
  const params = new URLSearchParams({
    transportMode: "car",
    origin: `${origine.lat},${origine.lng}`,
    destination: `${arrivo.lat},${arrivo.lng}`,
    return: "summary",
    lang: "it-IT",
    apiKey: chiave,
  });
  let url = `https://router.hereapi.com/v8/routes?${params}`;
  for (const v of punti.slice(1, -1)) url += `&via=${v.lat},${v.lng}`;
  return url;
}

/**
 * Chiede a HERE il percorso. Torna le tratte, o null se HERE non risponde o non
 * trova la strada (chi chiama ripiega sulla stima in linea d'aria).
 */
export async function percorsoHere(
  punti: PuntoGeografico[],
  chiave: string,
  chiama: typeof fetch = fetch,
  attesaMs = 8000,
): Promise<TrattaStradale[] | null> {
  if (punti.length < 2 || !chiave) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), attesaMs);
  try {
    const res = await chiama(urlPercorsoHere(punti, chiave), { signal: ctrl.signal });
    if (!res.ok) return null;
    const dati = await res.json() as { routes?: Array<{ sections?: SezioneHere[] }> };
    const tratte = tratteDaSezioniHere(dati.routes?.[0]?.sections);
    return tratte.length > 0 ? tratte : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
