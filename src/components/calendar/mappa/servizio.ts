import { supabase } from "@/integrations/supabase/client";
import { segmentiPercorso, type Coordinate, type PercorsoStradale, type ProblemaPercorso, type Tappa, type Tratta } from "../../../../shared/mappa-operativa/calcoli";

export const tilesMappa = import.meta.env.VITE_MAPPA_OPERATIVA_TILE_URL?.trim() as string | undefined;
// Sfondo predefinito: OpenFreeMap (vettoriale, senza chiave, uso commerciale consentito).
// Se non è configurata né una STYLE_URL né una TILE_URL raster, la mappa ha comunque uno
// sfondo per tutte le aziende, senza bisogno di variabili d'ambiente. Una STYLE_URL o una
// TILE_URL esplicite continuano a prevalere.
const STILE_PREDEFINITO = "https://tiles.openfreemap.org/styles/liberty";
export const stileMappa = (import.meta.env.VITE_MAPPA_OPERATIVA_STYLE_URL?.trim() as string | undefined)
  || (tilesMappa ? undefined : STILE_PREDEFINITO);
export const fonteCartografica = stileMappa
  ? /^https:\/\/tiles\.openfreemap\.org\//.test(stileMappa) ? "openfreemap" : "tile_configurati"
  : tilesMappa
    ? /^https:\/\/(?:[a-z0-9-]+\.)?maptiler\.com\//i.test(tilesMappa) ? "maptiler" : "tile_configurati"
    : "leaflet";
export function formatoKm(metri: number) {
  return `${(metri / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} km`;
}

export type Ambito = "vendite" | "lavori" | "campo";
export type Profilo = "auto" | "furgone";
export type PuntoIndirizzo = Coordinate & { etichetta: string; civico: string | null; cap: string | null };
export type TipoCandidato = "vendite" | "operai" | "squadre";
export type PropostaMappa = { id: string; nome: string; tipo: TipoCandidato; giorno: string; inizio: string; fine: string };
export type PropostaAppuntamentoMappa = PropostaMappa & { destinazione?: { punto: Coordinate; indirizzo?: string } };
export type PropostaCommessaMappa = PropostaMappa & { company: string; orderId: string };
export type CandidatoMappa = {
  id: string; nome: string; fonte: string; aggiornato?: string; metri: number; secondi: number | null;
  margineArrivo?: number | null; margineRientro?: number | null;
  motivo?: "ritardo" | "rientro" | "da_verificare" | "irraggiungibile";
};
export type EsitoVicini = {
  metodo: "linea" | "strada"; motivo?: string; senzaOrigine: string[]; valutati: number; totale: number;
  risultati: CandidatoMappa[]; esclusi?: CandidatoMappa[];
};

const messaggi: Record<string, string> = {
  quota: "Quota del servizio raggiunta. Riprovare più tardi.",
  non_configurato: "Servizio cartografico da configurare.",
  non_disponibile: "Servizio cartografico temporaneamente non disponibile.",
};

export async function servizioMappa<T>(company: string, ambito: Ambito, richiesta: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const { data, error } = await supabase.functions.invoke("mappa-operativa", { body: { company, ambito, ...richiesta }, signal });
  if (error) {
    const risposta = error.context instanceof Response ? await error.context.json().catch((): null => null) : null;
    throw new Error(risposta?.error ?? "Servizio cartografico temporaneamente non disponibile.");
  }
  if (!data || data.stato) throw new Error(messaggi[data?.stato] ?? messaggi.non_disponibile);
  return data as T;
}

type Blocco = { punti: Coordinate[]; inizio: number };
export type PercorsoCalcolato = {
  tratte: (Tratta | null)[];
  geometrieTratte: Coordinate[][];
  panoramiche: Coordinate[][];
  problemiTratte: (ProblemaPercorso | null)[];
  fuoriCopertura: number[];
  errori: string[];
};

export async function calcolaPercorso(company: string, ambito: Ambito, tappe: Tappa[], profilo: Profilo,
  { signal, onParziale }: { signal?: AbortSignal; onParziale?: (dati: PercorsoCalcolato) => void } = {},
): Promise<PercorsoCalcolato> {
  const tratte: (Tratta | null)[] = tappe.slice(1).map((): null => null);
  const geometrieTratte = tratte.map((): Coordinate[] => []);
  const panoramiche = new Map<number, Coordinate[]>();
  const errori = new Set<string>();
  const fuoriCopertura = new Set<number>();
  const problemiTratte = tratte.map((): ProblemaPercorso | null => null);
  const recuperi: Blocco[] = [];
  const limiteRecuperi = 12;
  const piani = segmentiPercorso(tappe);
  const fotografia = (): PercorsoCalcolato => {
    const esito: PercorsoCalcolato = {
      tratte: [...tratte], geometrieTratte: [...geometrieTratte], problemiTratte: [...problemiTratte],
      panoramiche: [...panoramiche].sort(([a], [b]) => a - b).map(([, linea]) => linea),
      fuoriCopertura: [...fuoriCopertura].sort((a, b) => a - b), errori: [...errori].sort(),
    };
    for (const indice of fuoriCopertura) {
      for (const tratto of [indice - 1, indice]) {
        if (tratto < 0 || tratto >= esito.tratte.length) continue;
        esito.tratte[tratto] = null;
        esito.geometrieTratte[tratto] = [];
        esito.problemiTratte[tratto] = "fuori_copertura";
      }
    }
    return esito;
  };
  const aggiungi = (esito: PercorsoStradale, inizio: number, numeroTratte: number) => {
    let coperturaParziale = false;
    for (let j = 0; j < numeroTratte; j++) {
      const tratta = esito.tratte[j] ?? null;
      tratte[inizio + j] = tratta;
      if (!tratta?.metri) continue;
      const linea = esito.geometrieTratte?.[j] ?? [];
      const punti = linea.length >= 2 || numeroTratte > 1 ? linea : esito.geometria;
      if (punti.length >= 2) geometrieTratte[inizio + j] = punti;
      else coperturaParziale = true;
    }
    if (coperturaParziale && esito.geometria.length >= 2) panoramiche.set(inizio, esito.geometria);
  };
  async function calcolaBlocco({ punti, inizio }: Blocco) {
    signal?.throwIfAborted();
    let esito: PercorsoStradale;
    try {
      esito = await servizioMappa<PercorsoStradale>(company, ambito, {
        azione: "percorso", punti, profilo,
        revisione: tappe.slice(inizio, inizio + punti.length).map(t => [t.id, t.inizio, t.fine]),
      }, signal);
      signal?.throwIfAborted();
    } catch (e) {
      signal?.throwIfAborted();
      errori.add(e instanceof Error ? e.message : messaggi.non_disponibile);
      return;
    }
    const indici = [...new Set(esito.puntiFuoriCopertura ?? [])]
      .filter(i => Number.isInteger(i) && i >= 0 && i < punti.length).sort((a, b) => a - b);
    if (indici.length) {
      let da = 0;
      for (const indice of [...indici, punti.length]) {
        if (indice < punti.length) fuoriCopertura.add(inizio + indice);
        if (indice - da > 1) recuperi.push({ punti: punti.slice(da, indice), inizio: inizio + da });
        da = indice + 1;
      }
      return;
    }
    if (punti.length > 2 && esito.tratte.every(t => !t)) {
      const meta = Math.floor((punti.length - 1) / 2);
      recuperi.push({ punti: punti.slice(0, meta + 1), inizio }, { punti: punti.slice(meta), inizio: inizio + meta });
      return;
    }
    if (esito.problema) problemiTratte[inizio] = esito.problema;
    aggiungi(esito, inizio, punti.length - 1);
  }
  async function eseguiBlocchi(blocchi: Blocco[]) {
    let prossimo = 0;
    await Promise.all(Array.from({ length: Math.min(2, blocchi.length) }, async () => {
      while (prossimo < blocchi.length) {
        await calcolaBlocco(blocchi[prossimo++]);
        signal?.throwIfAborted();
        if (onParziale && tratte.some(Boolean)) onParziale(fotografia());
      }
    }));
  }
  const principali: Blocco[] = [];
  for (let i = 0; i < piani.length; i++) {
    const primo = piani[i];
    if (!primo.da.punto || !primo.a.punto) continue;
    if (primo.da.punto.lat === primo.a.punto.lat && primo.da.punto.lng === primo.a.punto.lng) {
      tratte[i] = { metri: 0, secondi: 0 };
      continue;
    }
    const inizio = i;
    const punti = [primo.da.punto, primo.a.punto];
    while (punti.length < 25 && piani[i + 1]?.a.punto) {
      const p = piani[i + 1].a.punto!;
      const ultimo = punti[punti.length - 1];
      if (p.lat === ultimo.lat && p.lng === ultimo.lng) break;
      punti.push(p);
      i++;
    }
    principali.push({ punti, inizio });
  }
  await eseguiBlocchi(principali);
  let residui = limiteRecuperi;
  while (recuperi.length && residui > 0) {
    // L’ordine dei recuperi non dipende dalla velocità delle risposte.
    const blocchi = recuperi.sort((a, b) => a.inizio - b.inizio).splice(0, residui);
    residui -= blocchi.length;
    await eseguiBlocchi(blocchi);
  }
  if (recuperi.length) errori.add("Alcune tratte restano da verificare. Controlla le tappe e ricalcola.");
  return fotografia();
}
