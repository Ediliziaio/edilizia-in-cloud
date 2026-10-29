/**
 * Revisioni del preventivo con computo (29/10/2026): una fotografia delle voci
 * (quantità, prezzo, importo) e del totale, per rispondere al cliente che chiede
 * «cosa è cambiato dalla versione di martedì?». Si confronta con il computo di
 * adesso o tra due revisioni.
 */
import { arrotondaDecimale, calcolaVoce, type BozzaComputo } from "./editorNativo";
import type { RevisioneComputo, VoceRevisione } from "./revisioniSchema";

export const MAX_REVISIONI = 20;

export function fotografaRevisione(bozza: BozzaComputo, nome: string): RevisioneComputo {
  const voci: VoceRevisione[] = bozza.voci.map(v => {
    const c = calcolaVoce(v);
    return { id: v.id, descrizione: v.descrizione.trim().split("\n")[0].slice(0, 300) || "Lavorazione", unita: v.unita, quantita: c.quantita, prezzo: c.prezzo, importo: c.importo, opzionale: !!v.opzionale };
  });
  const totale = arrotondaDecimale(voci.reduce((t, v) => t + (v.opzionale ? 0 : v.importo ?? 0), 0));
  return { id: crypto.randomUUID(), nome: nome.trim().slice(0, 80) || "Revisione", data: new Date().toISOString(), totale, voci };
}

/** Il nome della prossima revisione: «Rev. 1», «Rev. 2»… dopo l'ultima numerata. */
export function prossimaRevisione(revisioni: RevisioneComputo[]): string {
  const n = revisioni.reduce((max, r) => Math.max(max, Number(/rev\.?\s*(\d+)/i.exec(r.nome)?.[1] ?? 0)), 0);
  return `Rev. ${n + 1}`;
}

export type DifferenzaVoce =
  | { tipo: "aggiunta"; dopo: VoceRevisione; delta: number }
  | { tipo: "tolta"; prima: VoceRevisione; delta: number }
  | { tipo: "cambiata"; prima: VoceRevisione; dopo: VoceRevisione; cosa: string[]; delta: number };

const uguale = (a: number | null, b: number | null) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 0.005);

export function confrontaRevisioni(prima: RevisioneComputo, dopo: RevisioneComputo): { differenze: DifferenzaVoce[]; delta: number } {
  const vecchie = new Map(prima.voci.map(v => [v.id, v]));
  const nuove = new Map(dopo.voci.map(v => [v.id, v]));
  const peso = (v: VoceRevisione) => (v.opzionale ? 0 : v.importo ?? 0);
  const differenze: DifferenzaVoce[] = [];
  for (const d of dopo.voci) {
    const p = vecchie.get(d.id);
    if (!p) { differenze.push({ tipo: "aggiunta", dopo: d, delta: peso(d) }); continue; }
    const cosa = [
      p.descrizione !== d.descrizione && "descrizione", !uguale(p.quantita, d.quantita) && "quantità", p.unita !== d.unita && "unità",
      !uguale(p.prezzo, d.prezzo) && "prezzo", p.opzionale !== d.opzionale && (d.opzionale ? "diventata opzionale" : "non più opzionale"),
    ].filter((x): x is string => !!x);
    if (cosa.length) differenze.push({ tipo: "cambiata", prima: p, dopo: d, cosa, delta: arrotondaDecimale(peso(d) - peso(p)) });
  }
  for (const p of prima.voci) if (!nuove.has(p.id)) differenze.push({ tipo: "tolta", prima: p, delta: -peso(p) });
  return { differenze, delta: arrotondaDecimale(dopo.totale - prima.totale) };
}
