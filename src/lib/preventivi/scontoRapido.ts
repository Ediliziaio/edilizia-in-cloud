/**
 * Lo sconto «veloce» dei preventivi (06/10/2026): i tasti 0 / 5 / 10 % e «arriva a € X», cioè lo sconto che porta
 * il totale IVA inclusa a una cifra tonda, quella che il cliente ha in testa. Funzioni pure: nessuna interfaccia,
 * nessun database. Lo sconto si calcola sull'imponibile (IVA esclusa), come fa il preventivo.
 */

/** I tasti veloci, in percentuale. */
export const SCONTI_VELOCI = [0, 5, 10] as const;

const arrotonda = (n: number): number => Math.round(n * 100) / 100;

/**
 * Decimali tenuti nella percentuale dello sconto. Il preventivo salva SOLO la percentuale e il totale si ricalcola
 * da lì: con due decimali, su 150.000 € di imponibile un centesimo di punto sposta il totale di una quindicina di
 * euro, e «arriva a 160.000 €» finirebbe a 159.996,90. Con otto il totale torna alla cifra scritta, al centesimo.
 */
const DECIMALI_PERCENTUALE = 8;
const arrotondaPercentuale = (p: number): number => {
  const scala = 10 ** DECIMALI_PERCENTUALE;
  return Math.round(p * scala) / scala;
};

export type EsitoArrivaA =
  | { esito: "ok"; pct: number; importo: number }
  /** Il totale senza sconto è già pari o sotto la cifra voluta: non serve nessuno sconto. */
  | { esito: "gia-sotto"; totaleSenzaSconto: number }
  | { esito: "non-valido" };

/**
 * Lo sconto che porta il totale (IVA inclusa) a `totaleVoluto`. `lordo` è l'imponibile prima dello sconto, IVA
 * esclusa; `ivaPct` l'aliquota in vigore. La percentuale tiene otto decimali, così il totale del preventivo
 * (che parte da lì) coincide con la cifra voluta al centesimo; `importo` è quanto toglie davvero, in euro e
 * centesimi.
 */
export function scontoPerArrivareA(lordo: number, ivaPct: number, totaleVoluto: number): EsitoArrivaA {
  if (![lordo, ivaPct, totaleVoluto].every(Number.isFinite) || lordo <= 0 || totaleVoluto <= 0 || ivaPct < 0) {
    return { esito: "non-valido" };
  }
  const fattore = 1 + ivaPct / 100;
  const totaleSenzaSconto = arrotonda(lordo * fattore);
  if (totaleVoluto >= totaleSenzaSconto) return { esito: "gia-sotto", totaleSenzaSconto };
  const pct = arrotondaPercentuale(((lordo - totaleVoluto / fattore) / lordo) * 100);
  return { esito: "ok", pct, importo: arrotonda((lordo * pct) / 100) };
}

/** Un tasto veloce: la percentuale e l'importo (IVA esclusa) che toglie. */
export function scontoDaPercentuale(lordo: number, pct: number): { pct: number; importo: number } {
  return { pct, importo: arrotonda((Math.max(0, lordo) * pct) / 100) };
}

/**
 * Il totale scritto come lo scrive chi lo scrive: «24.500», «24500,50», «24.500,50», «24 500 €», «€ 24500».
 * Il punto è il separatore delle migliaia quando seguono tre cifre («24.500» = ventiquattromilacinquecento),
 * altrimenti il decimale. Vuoto, zero, negativo o illeggibile = null.
 */
export function totaleDaTesto(testo: string): number | null {
  const senzaSimboli = testo.replace(/[€\s]/g, "");
  if (senzaSimboli === "" || !/^[\d.,]+$/.test(senzaSimboli)) return null;
  let normale: string;
  if (senzaSimboli.includes(",")) {
    // «24.500,50»: i punti sono migliaia, la virgola è il decimale.
    normale = senzaSimboli.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(senzaSimboli)) {
    normale = senzaSimboli.replace(/\./g, "");
  } else {
    normale = senzaSimboli;
  }
  const valore = arrotonda(Number(normale));
  // Dopo l'arrotondamento: «0,004» sono zero centesimi, non una cifra.
  return Number.isFinite(valore) && valore > 0 ? valore : null;
}
