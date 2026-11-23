/**
 * Fattura contro listino del fornitore (23/11/2026): la voce pagata più del prezzo pattuito.
 * Il listino di un fornitore di calcestruzzo non aveva codici, e la fattura scriveva le voci
 * a modo suo: «126 CLS RCK35 S4 XC1XC2» è la «CLS Rck C 28/35 S4 XC1 XC2» del listino. Le
 * voci si riconoscono, in quest'ordine:
 *   1. codice uguale, quando c'è su tutti e due;
 *   2. calcestruzzo: stessa classe di resistenza (Rck), consistenza (S1-S5) ed esposizione (XC1…);
 *   3. descrizione uguale, lettere e cifre.
 * Sempre con la stessa unità di misura, e solo se la voce del listino è una sola: nel dubbio
 * niente confronto, mai un avviso sbagliato.
 */
import { soloAlfanumerico, unitaCanonica } from "./normalizza.ts";

export interface RigaPrezzo { numero: number | string; descrizione: string; codice: string | null; um: string | null; prezzo: number | null }
export interface VoceListino { id: string; codice: string | null; descrizione: string; unita: string | null; prezzo: number; sconto_pct: number; listinoScadutoIl?: string | null }
export interface ConfrontoListino {
  numero: number | string;
  descrizione: string;
  prezzoFattura: number;
  prezzoListino: number;
  voce: VoceListino;
  esito: "piu_caro" | "in_linea" | "piu_basso";
  differenzaPct: number;
}

/** «C 28/35», «RCK35», «Rck 35», «C30/37 S4 XC1XC2» → «35|S4|XC1,XC2». Null se non è calcestruzzo. */
export function chiaveCalcestruzzo(descrizione: string): string | null {
  const s = descrizione.toUpperCase();
  if (!/\b(CLS|CALCESTRUZZO|RCK)\b|\bC\s*\d{2}\s*[/-]\s*\d{2}\b/.test(s)) return null;
  // «C 28/35» e «C 28-35» sono la stessa classe: conta il secondo numero (Rck).
  const rck = s.match(/\bRCK\s*C?\s*\d{0,2}\s*[/-]?\s*(\d{2})\b/)?.[1] ?? s.match(/\bC\s*\d{2}\s*[/-]\s*(\d{2})\b/)?.[1] ?? s.match(/RCK\s*(\d{2})/)?.[1];
  if (!rck) return null;
  const consistenza = s.match(/\bS([1-5])\b/)?.[1] ?? s.match(/S([1-5])(?=\s*X|\b)/)?.[1] ?? "";
  const esposizione = [...new Set([...s.matchAll(/X(?:0|[CDFSA]\d)/g)].map((m) => m[0]))].sort().join(",");
  return `${rck}|S${consistenza}|${esposizione}`;
}

/**
 * La chiave di una voce di fattura per gli abbinamenti ricordati: il codice, se c'è, altrimenti
 * la descrizione; solo lettere e cifre. Gemella di `listino_equivalenza_chiave` in SQL.
 */
export function chiaveEquivalenza(codice: string | null | undefined, descrizione: string | null | undefined): string | null {
  const c = soloAlfanumerico(codice);
  if (c) return `C:${c}`;
  const d = soloAlfanumerico(descrizione);
  return d.length >= 3 ? `D:${d}` : null;
}

/** Abbinamenti fatti a mano e ricordati: chiave della voce di fattura → voce del listino. */
export type EquivalenzeListino = ReadonlyMap<string, string>;

const prezzoNetto = (v: VoceListino) => Math.round(v.prezzo * (1 - (v.sconto_pct || 0) / 100) * 10000) / 10000;

export function voceDelListino(r: RigaPrezzo, voci: VoceListino[], equivalenze?: EquivalenzeListino): VoceListino | null {
  // 0. Un abbinamento fatto da una persona vale più di qualsiasi regola, anche con l'unità scritta diversa.
  if (equivalenze?.size) {
    for (const k of [chiaveEquivalenza(r.codice, null), chiaveEquivalenza(null, r.descrizione)]) {
      const id = k ? equivalenze.get(k) : undefined;
      const voce = id ? voci.find((v) => v.id === id) : undefined;
      if (voce) return voce;
    }
  }
  const um = unitaCanonica(r.um);
  const stessaUnita = voci.filter((v) => !um || !unitaCanonica(v.unita) || unitaCanonica(v.unita) === um);
  const unica = (xs: VoceListino[]) => (xs.length === 1 ? xs[0] : null);
  const codice = soloAlfanumerico(r.codice);
  if (codice) {
    const perCodice = stessaUnita.filter((v) => v.codice && soloAlfanumerico(v.codice) === codice);
    if (perCodice.length) return unica(perCodice);
  }
  const cls = chiaveCalcestruzzo(r.descrizione);
  if (cls) return unica(stessaUnita.filter((v) => chiaveCalcestruzzo(v.descrizione) === cls));
  const testo = soloAlfanumerico(r.descrizione);
  if (testo.length < 6) return null;
  return unica(stessaUnita.filter((v) => soloAlfanumerico(v.descrizione) === testo));
}

/** Le voci della fattura confrontate col listino. Mezzo punto percentuale o un centesimo di tolleranza. */
export function confrontaConListino(righe: RigaPrezzo[], voci: VoceListino[], equivalenze?: EquivalenzeListino): ConfrontoListino[] {
  const esiti: ConfrontoListino[] = [];
  for (const r of righe) {
    if (r.prezzo == null || !Number.isFinite(r.prezzo) || r.prezzo <= 0) continue;
    const voce = voceDelListino(r, voci, equivalenze);
    if (!voce) continue;
    const listino = prezzoNetto(voce);
    if (!(listino > 0)) continue;
    const tolleranza = Math.max(0.01, listino * 0.005);
    const diff = r.prezzo - listino;
    esiti.push({
      numero: r.numero, descrizione: r.descrizione, prezzoFattura: r.prezzo, prezzoListino: listino, voce,
      esito: diff > tolleranza ? "piu_caro" : diff < -tolleranza ? "piu_basso" : "in_linea",
      differenzaPct: Math.round((diff / listino) * 1000) / 10,
    });
  }
  return esiti;
}
