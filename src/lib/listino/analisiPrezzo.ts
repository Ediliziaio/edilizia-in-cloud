/**
 * Analisi prezzi — la matematica, e solo quella.
 *
 * Lo standard professionale con cui si compone il prezzo di una lavorazione:
 *
 *   costo diretto   = Σ (quantità × prezzo unitario) dei componenti
 *   spese generali  = costo diretto × SG%              (tipicamente 15%)
 *   utile           = (costo diretto + SG) × utile%    (tipicamente 10%)
 *   prezzo          = costo diretto + SG + utile
 *
 * L'incidenza manodopera è la quota di manodopera sul PREZZO finale: è il
 * numero che si confronta con la congruità DURC, quindi va calcolato sul
 * prezzo applicato e non sul solo costo.
 *
 * Nessuna dipendenza: è puro perché è aritmetica contabile e deve essere
 * verificabile dai test senza rete né database.
 */

export type TipoComponente = "manodopera" | "materiale" | "nolo" | "altro";

export interface ComponenteAnalisi {
  tipo: TipoComponente;
  quantita: number;
  prezzo_unitario: number;
}

export interface RisultatoAnalisi {
  costoDiretto: number;
  costoManodopera: number;
  costoMateriali: number;
  costoNoli: number;
  costoAltro: number;
  speseGenerali: number;
  utile: number;
  /** Costo aziendale pieno: diretto + spese generali. Senza utile. */
  costoAziendale: number;
  prezzoTotale: number;
  /** Manodopera / prezzo totale, in percento. 0 se il prezzo è zero. */
  incidenzaManodoperaPct: number;
}

/** Due decimali, da documento contabile. EPSILON evita lo 0,005 che cade male. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calcolaAnalisi(
  componenti: ComponenteAnalisi[],
  speseGeneraliPct: number,
  utilePct: number,
): RisultatoAnalisi {
  const somma = (tipo?: TipoComponente) =>
    componenti
      .filter((c) => (tipo ? c.tipo === tipo : true))
      .reduce((s, c) => s + (c.quantita || 0) * (c.prezzo_unitario || 0), 0);

  const costoDiretto = somma();
  const costoManodopera = somma("manodopera");
  const speseGenerali = costoDiretto * (speseGeneraliPct / 100);
  // L'utile si applica su costo + spese generali: è così che si compone
  // un'analisi vera, non sul solo costo diretto.
  const utile = (costoDiretto + speseGenerali) * (utilePct / 100);
  const prezzoTotale = costoDiretto + speseGenerali + utile;

  return {
    costoDiretto: round2(costoDiretto),
    costoManodopera: round2(costoManodopera),
    costoMateriali: round2(somma("materiale")),
    costoNoli: round2(somma("nolo")),
    costoAltro: round2(somma("altro")),
    speseGenerali: round2(speseGenerali),
    utile: round2(utile),
    costoAziendale: round2(costoDiretto + speseGenerali),
    prezzoTotale: round2(prezzoTotale),
    incidenzaManodoperaPct:
      prezzoTotale > 0 ? round2((costoManodopera / prezzoTotale) * 100) : 0,
  };
}
