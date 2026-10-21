/**
 * Formati del Controllo di Gestione: percentuali e importi sempre all'italiana
 * («11,4%», «4,66 Mln €»), anche nei testi che arrivano già scritti dal
 * database (i motivi del rating scrivevano «1346331.55 €»).
 */

// useGrouping "always": il CLDR italiano non mette il punto sotto le 5 cifre
// («6612 €» accanto a «530.795 €»). Come formatCurrency.
const SEMPRE = { useGrouping: "always" } as unknown as Intl.NumberFormatOptions;

const PCT_CACHE = new Map<number, Intl.NumberFormat>();
function nf(decimali: number): Intl.NumberFormat {
  let f = PCT_CACHE.get(decimali);
  if (!f) {
    f = new Intl.NumberFormat("it-IT", { ...SEMPRE, minimumFractionDigits: decimali, maximumFractionDigits: decimali });
    PCT_CACHE.set(decimali, f);
  }
  return f;
}

/** «11,4%». Con `segno` i positivi hanno il «+» davanti. null/NaN → «—». */
export function formatPct(valore: number | null | undefined, decimali = 1, segno = false): string {
  if (valore == null || !Number.isFinite(valore)) return "—";
  const testo = nf(decimali).format(valore);
  return `${segno && valore > 0 ? "+" : ""}${testo}%`;
}

/** Numero semplice all'italiana con i decimali scelti: «1,20». */
export function formatNumero(valore: number | null | undefined, decimali = 1): string {
  if (valore == null || !Number.isFinite(valore)) return "—";
  return nf(decimali).format(valore);
}

const EURO_INTERO = new Intl.NumberFormat("it-IT", { ...SEMPRE, maximumFractionDigits: 0 });

/**
 * Importo per i riquadri: sopra il milione «4,66 Mln €», sotto «530.795 €»
 * (senza centesimi). Il valore pieno va nel `title` del riquadro.
 */
export function formatEuroRiquadro(valore: number | null | undefined): string {
  if (valore == null || !Number.isFinite(valore)) return "—";
  const abs = Math.abs(valore);
  if (abs >= 1_000_000) return `${nf(2).format(valore / 1_000_000)} Mln €`;
  return `${EURO_INTERO.format(Math.round(valore))} €`;
}

/**
 * Legge un importo scritto a mano: «12.500,50», «12500,5», «12500.50», «€ 1.000».
 * Vuoto = 0. Testo non numerico = null.
 */
export function leggiImporto(testo: string): number | null {
  const pulito = testo.trim().replace(/\s|€/g, "");
  if (!pulito) return 0;
  let normalizzato = pulito;
  if (pulito.includes(",")) {
    normalizzato = pulito.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(pulito)) {
    // «120.000» senza virgola: punti delle migliaia, non decimali.
    normalizzato = pulito.replace(/\./g, "");
  }
  const n = Number(normalizzato);
  return Number.isFinite(n) ? n : null;
}

const EURO_PIENO = new Intl.NumberFormat("it-IT", { ...SEMPRE, minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Riscrive all'italiana gli importi dentro un testo già composto altrove
 * (es. «differenza 1346331.55 €» → «differenza 1.346.331,55 €»). Tocca solo
 * i numeri seguiti da «€» o «EUR», per non stravolgere date o codici.
 */
export function formatImportiNelTesto(testo: string): string {
  return testo.replace(/(?<![\d.,])(-?\d+(?:[.,]\d{1,2})?)(\s?)(€|EUR\b)/g, (match, numero: string, _spazio: string, valuta: string) => {
    const n = Number(numero.replace(",", "."));
    if (!Number.isFinite(n)) return match;
    return `${EURO_PIENO.format(n)} ${valuta}`;
  });
}
