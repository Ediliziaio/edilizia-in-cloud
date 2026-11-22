import { supabase } from "@/integrations/supabase/client";
import { segmentiPercorso, type Coordinate, type Tappa, type Tratta } from "../../../../shared/mappa-operativa/calcoli";

export const tilesMappa = import.meta.env.VITE_MAPPA_OPERATIVA_TILE_URL?.trim() as string | undefined;
export function formatoKm(metri: number) {
  return `${(metri / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} km`;
}

export type Ambito = "vendite" | "lavori" | "campo";
export type Profilo = "auto" | "furgone";
export type PuntoIndirizzo = Coordinate & { etichetta: string; civico: string | null; cap: string | null };
export type EsitoVicini = {
  metodo: "linea" | "strada"; motivo?: string; senzaOrigine: string[]; valutati: number; totale: number;
  risultati: { id: string; nome: string; fonte: string; aggiornato?: string; metri: number; secondi: number | null }[];
};

const messaggi: Record<string, string> = {
  quota: "Quota del servizio raggiunta. Riprovare più tardi.",
  non_configurato: "Servizio cartografico da configurare.",
  non_disponibile: "Servizio cartografico temporaneamente non disponibile.",
};

export async function servizioMappa<T>(company: string, ambito: Ambito, richiesta: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("mappa-operativa", { body: { company, ambito, ...richiesta } });
  if (error) {
    const risposta = error.context instanceof Response ? await error.context.json().catch((): null => null) : null;
    throw new Error(risposta?.error ?? "Servizio cartografico temporaneamente non disponibile.");
  }
  if (!data || data.stato) throw new Error(messaggi[data?.stato] ?? messaggi.non_disponibile);
  return data as T;
}

export async function calcolaPercorso(company: string, ambito: Ambito, tappe: Tappa[], profilo: Profilo) {
  const tratte: (Tratta | null)[] = tappe.slice(1).map((): null => null);
  const geometrie: Coordinate[][] = [];
  const errori = new Set<string>();
  const piani = segmentiPercorso(tappe);
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
    const esegui = (coordinate: Coordinate[], offset: number) => servizioMappa<{ tratte: (Tratta | null)[]; geometria: Coordinate[] }>(
      company, ambito, { azione: "percorso", punti: coordinate, profilo,
        revisione: tappe.slice(offset, offset + coordinate.length).map(t => [t.id, t.inizio, t.fine]) });
    try {
      const esito = await esegui(punti, inizio);
      esito.tratte.forEach((t, j) => { tratte[inizio + j] = t; });
      if (esito.geometria.length) geometrie.push(esito.geometria);
      // Una tappa isolata può far fallire l'intera route OSRM. Prova le tratte
      // singole solo per questo caso, preservando i risultati parziali.
      if (punti.length > 2 && esito.tratte.every(t => !t)) {
        for (let j = 0; j < punti.length - 1; j++) {
          const singola = await esegui(punti.slice(j, j + 2), inizio + j);
          tratte[inizio + j] = singola.tratte[0] ?? null;
          if (singola.geometria.length) geometrie.push(singola.geometria);
        }
      }
    } catch (e) { errori.add(e instanceof Error ? e.message : messaggi.non_disponibile); }
  }
  return { tratte, geometrie, errori: [...errori] };
}
