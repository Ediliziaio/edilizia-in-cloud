/**
 * Budget contro consuntivo, calcolato sullo STESSO conto economico della
 * scheda CE (cg_get_ce_safe sui mesi chiusi), non su un calcolo a parte.
 *
 * Prima la scheda Budget usava una RPC sua: per la Demo 2 il 22/10/2026 dava
 * un EBITDA da inizio anno di 661.787 € contro i 530.795 € del CE dell'anno, e
 * dei totali (EBITDA, utile) non c'era il budget. Qui:
 *  - consuntivo = CE dei mesi chiusi (gennaio → mese scorso);
 *  - previsione = consuntivo ÷ mesi chiusi × 12 (anno in corso); anno chiuso =
 *    consuntivo; anno futuro = nessuna previsione;
 *  - i totali A…L del budget si ricavano dalle voci con le stesse formule del CE.
 */

import type { VoceCE } from "@/hooks/controlloGestione/useCEriclassificato";

export type SemaforoBudget = "verde" | "giallo" | "rosso" | "grigio";

/** Schema del CE riclassificato: ordine, etichette e tipo di riga. */
export const SCHEMA_CE: { codice: string; label: string; tipo: VoceCE["tipo"] }[] = [
  { codice: "01", label: "Ricavi delle vendite", tipo: "voce" },
  { codice: "02", label: "Variazione lavori in corso", tipo: "voce" },
  { codice: "A", label: "Valore della produzione", tipo: "subtot" },
  { codice: "03", label: "Acquisti materie", tipo: "voce" },
  { codice: "04", label: "Variazione magazzino", tipo: "voce" },
  { codice: "B", label: "Costo materie prime", tipo: "subtot" },
  { codice: "05", label: "Costi produttivi", tipo: "voce" },
  { codice: "C", label: "Costo del venduto", tipo: "subtot" },
  { codice: "D", label: "Primo margine", tipo: "subtot" },
  { codice: "06", label: "Costo del personale", tipo: "voce" },
  { codice: "07", label: "Costi commerciali", tipo: "voce" },
  { codice: "08", label: "Costi amministrativi", tipo: "voce" },
  { codice: "08b", label: "Costi non classificati", tipo: "voce" },
  { codice: "E", label: "MOL / EBITDA", tipo: "subtot_grasso" },
  { codice: "09", label: "Ammortamenti", tipo: "voce" },
  { codice: "F", label: "EBIT", tipo: "subtot_grasso" },
  { codice: "10", label: "Oneri tributari", tipo: "voce" },
  { codice: "G", label: "Risultato operativo", tipo: "subtot" },
  { codice: "11", label: "Oneri finanziari", tipo: "voce" },
  { codice: "12", label: "Proventi finanziari", tipo: "voce" },
  { codice: "H", label: "Risultato gestionale", tipo: "subtot_grasso" },
  { codice: "13", label: "Ricavi straordinari", tipo: "voce" },
  { codice: "14", label: "Costi straordinari", tipo: "voce" },
  { codice: "I", label: "Utile prima delle imposte", tipo: "subtot" },
  { codice: "15", label: "Imposte (stimate)", tipo: "voce" },
  { codice: "L", label: "Utile netto", tipo: "subtot_grasso" },
];

/** Voci di costo: per queste spendere più del budget è un peggioramento. */
export const CODICI_COSTO = new Set(["03", "04", "05", "06", "07", "08", "08b", "09", "10", "11", "14", "15"]);
/** Voci che portano soldi: ricavi e proventi. */
export const CODICI_RICAVO = new Set(["01", "02", "12", "13"]);

/** Calcola i totali A…L a partire dalle voci, con le formule del CE. */
export function calcolaTotaliCE(voci: Record<string, number>): Record<string, number> {
  const v = (c: string) => voci[c] ?? 0;
  const A = v("01") + v("02");
  const B = v("03") + v("04");
  const C = B + v("05");
  const D = A - C;
  const E = D - v("06") - v("07") - v("08") - v("08b");
  const F = E - v("09");
  const G = F - v("10");
  const H = G - v("11") + v("12");
  const I = H + v("13") - v("14");
  const L = I - v("15");
  return { ...voci, A, B, C, D, E, F, G, H, I, L };
}

/**
 * Mesi chiusi dell'anno: anno passato 12, anno in corso il mese scorso
 * (al 22 ottobre: 9, gennaio-settembre), anno futuro 0.
 */
export function mesiChiusi(anno: number, oggi: Date = new Date()): number {
  const annoOggi = oggi.getFullYear();
  if (anno < annoOggi) return 12;
  if (anno > annoOggi) return 0;
  return oggi.getMonth(); // getMonth() 0-based = numero di mesi interi già finiti
}

/** Semaforo dello scostamento: entro 5% verde, entro 15% giallo, oltre rosso. */
export function semaforoScostamento(codice: string, budget: number, previsione: number): SemaforoBudget {
  if (budget === 0) return "grigio";
  const pct = ((previsione - budget) / Math.abs(budget)) * 100;
  // Per i costi «peggio» è spendere di più; per ricavi e margini incassare meno.
  const peggioramento = CODICI_COSTO.has(codice) ? pct : -pct;
  if (peggioramento <= 5) return "verde";
  if (peggioramento <= 15) return "giallo";
  return "rosso";
}

export interface RigaBudget {
  codice: string;
  label: string;
  tipo: VoceCE["tipo"];
  budget: number;
  consuntivo: number;
  previsione: number;
  scostamento: number;
  scostamentoPct: number | null;
  semaforo: SemaforoBudget;
  /** true se uno scostamento positivo è un bene (ricavi, margini, utile). */
  piuEMeglio: boolean;
}

export interface RiepilogoBudget {
  righe: RigaBudget[];
  mesiChiusi: number;
  haBudget: boolean;
  ricavi: { budget: number; previsione: number };
  costi: { budget: number; previsione: number };
  utile: { budget: number; previsione: number };
}

/**
 * Mette insieme budget inserito e consuntivo del CE.
 * @param budgetPerCodice importi di budget annui per voce (solo voci, non totali)
 * @param consuntivoVoci voci del CE sui mesi chiusi (cg_get_ce_safe 1→mesiChiusi)
 */
export function costruisciBudget(
  budgetPerCodice: Record<string, number>,
  consuntivoVoci: VoceCE[] | null | undefined,
  nMesiChiusi: number,
): RiepilogoBudget {
  const consPerCodice: Record<string, number> = {};
  for (const v of consuntivoVoci ?? []) {
    if (!/^[A-Z]$/.test(v.codice)) consPerCodice[v.codice] = Number(v.valore) || 0;
  }
  const prevPerCodice: Record<string, number> = {};
  for (const [c, val] of Object.entries(consPerCodice)) {
    prevPerCodice[c] = nMesiChiusi > 0 ? (val / nMesiChiusi) * 12 : 0;
  }
  const bud = calcolaTotaliCE(budgetPerCodice);
  const cons = calcolaTotaliCE(consPerCodice);
  const prev = calcolaTotaliCE(prevPerCodice);

  const righe: RigaBudget[] = SCHEMA_CE.map(({ codice, label, tipo }) => {
    const b = round2(bud[codice] ?? 0);
    const c = round2(cons[codice] ?? 0);
    const p = nMesiChiusi > 0 ? round2(prev[codice] ?? 0) : 0;
    const haConfronto = b !== 0 && nMesiChiusi > 0;
    const scost = haConfronto ? round2(p - b) : 0;
    return {
      codice,
      label,
      tipo,
      budget: b,
      consuntivo: c,
      previsione: p,
      scostamento: scost,
      scostamentoPct: haConfronto ? (scost / Math.abs(b)) * 100 : null,
      semaforo: haConfronto ? semaforoScostamento(codice, b, p) : "grigio",
      piuEMeglio: !CODICI_COSTO.has(codice),
    };
  });

  const sommaCosti = (rec: Record<string, number>) =>
    [...CODICI_COSTO].reduce((s, c) => s + (rec[c] ?? 0), 0);
  const sommaRicavi = (rec: Record<string, number>) =>
    [...CODICI_RICAVO].reduce((s, c) => s + (rec[c] ?? 0), 0);

  return {
    righe,
    mesiChiusi: nMesiChiusi,
    haBudget: Object.values(budgetPerCodice).some((x) => Number(x) !== 0),
    ricavi: { budget: round2(sommaRicavi(bud)), previsione: round2(sommaRicavi(prev)) },
    costi: { budget: round2(sommaCosti(bud)), previsione: round2(sommaCosti(prev)) },
    utile: { budget: round2(bud.L), previsione: round2(prev.L) },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const MESI_BREVI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

/** «gen–set» per i mesi chiusi; «—» se non ce ne sono. */
export function etichettaMesiChiusi(n: number): string {
  if (n <= 0) return "—";
  if (n === 1) return "gennaio";
  return `gen–${MESI_BREVI[n - 1]}`;
}
