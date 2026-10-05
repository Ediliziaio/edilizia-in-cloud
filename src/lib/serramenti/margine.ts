/**
 * Il margine del preventivo serramenti: vendita netta meno i costi d'acquisto di
 * tutte le voci. Lo mostra l'anteprima a destra (vista impresa) con le stesse
 * regole dello step Economia.
 *
 * Il costo di una posizione (serramento o accessorio) si calcola dal listino con
 * le stesse regole del suo prezzo (`calcolaCostoPosizione`: misure, varianti,
 * sconti fornitore, posa): lo fornisce chi chiama (`useCostoPosizioneListino`),
 * così questa funzione resta PURA. Per i servizi vale il costo scritto sulla riga.
 * Se un costo manca non si dà una percentuale: «100%» con un costo mancante
 * sarebbe falso.
 *
 * NB: lo step Economia ha ancora la sua copia inline di questo conto
 * (`marginCalc` in StepEconomia.tsx); quando la sessione che lo sta toccando ha
 * finito va sostituita con `calcolaMargine`, perché le due regole non divergano.
 */
import type { SrProgettoDetail } from "@/types/serramenti";

/** I campi di una posizione che servono a calcolarne il costo dal listino. */
export interface RigaCostoListino {
  id: string;
  family_id?: string | null;
  listino_voce_id?: string | null;
  larghezza_mm?: number | null;
  altezza_mm?: number | null;
  quantita?: number | null;
  valori_assi?: unknown;
  posa_esclusa?: boolean | null;
}

export interface CalcoloMargine {
  costoTotale: number;
  vendita: number;
  margine: number;
  marginePct: number | null;
  margineMinPct: number;
  sottoTarget: boolean;
  costiCompleti: boolean;
  righeConVendita: number;
  righeConCosto: number;
  righeSenzaCosto: number;
  /** Il costo di ogni voce per id (serramento, accessorio, servizio); `null` = non noto. */
  costoPerRiga: Map<string, number | null>;
}

export interface ArgomentiMargine {
  detail: Pick<SrProgettoDetail, "serramenti" | "accessori"> & Partial<Pick<SrProgettoDetail, "servizi">>;
  /** True col prezzo scritto a mano: le voci possono essere a 0 € ma avere un costo. */
  prezzoManuale: boolean;
  /** Imponibile dopo lo sconto (`imponibile_netto` di `calcolaTotale`). */
  venditaNetta: number;
  /** Il costo d'acquisto di una posizione dal listino; `null` = il listino non lo sa. */
  costoPosizione: (riga: RigaCostoListino) => number | null;
  /** Margine minimo da regola sconti; 0 = nessun controllo. */
  margineMinPct?: number;
}

export function calcolaMargine({
  detail, prezzoManuale, venditaNetta, costoPosizione, margineMinPct = 0,
}: ArgomentiMargine): CalcoloMargine {
  let costoTotale = 0;
  let righeConVendita = 0;
  let righeConCosto = 0;
  let righeSenzaCosto = 0;
  const costoPerRiga = new Map<string, number | null>();

  const conta = (id: string, venditaRiga: number, costoRiga: number | null) => {
    // Col prezzo scritto a mano le voci possono essere a 0 € ma avere un costo:
    // il margine è prezzo scritto meno i costi di tutte le voci.
    if (venditaRiga <= 0 && !prezzoManuale) {
      costoPerRiga.set(id, null);
      return;
    }
    righeConVendita += 1;
    if (costoRiga != null && costoRiga > 0) {
      costoTotale += costoRiga;
      righeConCosto += 1;
      costoPerRiga.set(id, costoRiga);
    } else {
      righeSenzaCosto += 1;
      costoPerRiga.set(id, null);
    }
  };

  detail.serramenti.forEach((s) => {
    conta(s.id, Number(s.prezzo_totale ?? (s.prezzo_unitario ?? 0) * (s.quantita ?? 1)), costoPosizione(s));
  });
  detail.accessori.forEach((a) => {
    conta(a.id, Number(a.prezzo_totale ?? (a.prezzo_unitario ?? 0) * (a.quantita ?? 1)), costoPosizione(a));
  });
  (detail.servizi ?? []).forEach((m) => {
    conta(
      m.id,
      Number(m.prezzo_totale_vendita ?? (m.prezzo_unitario_vendita ?? 0) * (m.quantita ?? 1)),
      m.prezzo_totale_costo ?? Number(m.prezzo_unitario_costo ?? 0) * (m.quantita ?? 1),
    );
  });

  const margine = venditaNetta - costoTotale;
  const costiCompleti = righeConVendita > 0 && righeSenzaCosto === 0 && costoTotale > 0;
  const marginePct = costiCompleti && venditaNetta > 0 ? (margine / venditaNetta) * 100 : null;
  const sottoTarget = marginePct != null && marginePct < margineMinPct;
  return {
    costoTotale,
    vendita: venditaNetta,
    margine,
    marginePct,
    margineMinPct,
    sottoTarget,
    costiCompleti,
    righeConVendita,
    righeConCosto,
    righeSenzaCosto,
    costoPerRiga,
  };
}
