export type Semaforo = "verde" | "giallo" | "rosso" | "grigio";

export interface CommessaRiga {
  id: string;
  order_code: string | null;
  description: string;
  cliente: string | null;
  status: string | null;
  pct_avanzamento: number;
  work_start: string | null;
  work_end: string | null;
  preventivo: number;
  consuntivo: number;
  costo_acquisti: number;
  costo_errori: number;
  variazioni: number;
  /** Costo manodopera (squadra interna + squadre esterne) — soldi. */
  costo_manodopera: number;
  /** Ore lavorate dalla squadra interna (le squadre esterne sono a corpo → 0 ore). */
  ore_manodopera: number;
  margine: number;
  margine_perc: number;
  costo_atteso: number | null;
  margine_atteso: number | null;
  margine_atteso_perc: number | null;
  semaforo: Semaforo;
  /** False finché non esiste almeno un costo diretto registrato. */
  dati_economici_completi: boolean;
}

export interface CommesseKPI {
  n_commesse: number;
  n_in_corso: number;
  n_completate: number;
  preventivo_totale: number;
  consuntivo_totale: number;
  margine_totale: number;
  margine_atteso_totale: number;
  n_in_perdita: number;
  n_da_completare: number;
  preventivo_valutabile: number;
}

export interface MarginalitaCommesseResult {
  meta: {
    company_id: string;
    anno: number | null;
    status_filter: string | null;
    generato_il: string;
  };
  kpi: CommesseKPI;
  righe: CommessaRiga[];
}

/** Shared normalization: SQL progress is 0–100; approved variations count once.
 * Never mutate the RPC result/cache. Missing costs do not create 100% profit.
 */
export function normalizeMarginalitaCommesse(input: MarginalitaCommesseResult, labById: ReadonlyMap<string, { costo: number; ore: number }> = new Map()): MarginalitaCommesseResult {
  const result = { ...input, kpi: { ...input.kpi }, righe: (input.righe ?? []).map(row => ({ ...row })) };
  const righe = result.righe;
  for (const r of righe) {
    // La RPC storica espone il contratto base in `preventivo` e le varianti
    // a parte, mentre il margine della vista le include già. Ricostruiamo il
    // ricavo totale una volta sola per avere denominatori coerenti.
    r.preventivo = Number(r.preventivo ?? 0) + Number(r.variazioni ?? 0);
    const l = labById.get(r.id);
    r.costo_manodopera = l?.costo ?? 0;
    r.ore_manodopera = l?.ore ?? 0;

    // FIX conteggi: `percentuale_avanzamento` è 0–100 in tutta l'app (SalTab,
    // Campo, PDF), ma la RPC la tratta come frazione 0–1 → `pct_avanz >= 1` è
    // vero per QUALSIASI commessa avviata, quindi la proiezione di costo/margine
    // a fine lavori non estrapola mai (mostra il margine attuale come fosse
    // finale). Normalizziamo a 0–1 e ricalcoliamo con la scala corretta.
    const pct01 = Math.min(Math.max(r.pct_avanzamento ?? 0, 0), 100) / 100;
    r.pct_avanzamento = pct01;
    r.dati_economici_completi = r.preventivo > 0 && r.consuntivo > 0;
    // Sotto il 20% di avanzamento l'estrapolazione lineare (consuntivo / %) è
    // troppo rumorosa — un cantiere al 5% con un acquisto anticipato proietta
    // un costo ×20 e un margine assurdo. Sotto soglia → "non valutabile": lo
    // sforo reale resta comunque visibile nel margine attuale (colonna Margine ora).
    const PROJ_MIN_PCT = 0.2;
    const costoAtteso =
      !r.dati_economici_completi
        ? null
        : pct01 >= 1
          ? r.consuntivo
          : pct01 >= PROJ_MIN_PCT
            ? r.consuntivo / pct01
            : null;
    const margineAtteso =
      costoAtteso !== null ? r.preventivo - costoAtteso : null;
    r.costo_atteso = costoAtteso;
    r.margine_atteso = margineAtteso;
    r.margine_atteso_perc =
      margineAtteso !== null && r.preventivo !== 0
        ? (margineAtteso / r.preventivo) * 100
        : null;
    r.semaforo =
      margineAtteso === null
        ? "grigio"
        : r.preventivo > 0 && margineAtteso / r.preventivo >= 0.15
          ? "verde"
          : margineAtteso < 0
            ? "rosso"
            : "giallo";
  }
  // Tutti i KPI economici vengono ricostruiti dalle righe normalizzate. Le
  // commesse senza costi restano nel portafoglio, ma non gonfiano margine e
  // percentuale come falsi utili del 100%.
  const valutabili = righe.filter((r) => r.dati_economici_completi);
  result.kpi.preventivo_totale = righe.reduce((s, r) => s + r.preventivo, 0);
  result.kpi.preventivo_valutabile = valutabili.reduce((s, r) => s + r.preventivo, 0);
  result.kpi.consuntivo_totale = valutabili.reduce((s, r) => s + r.consuntivo, 0);
  result.kpi.margine_totale = valutabili.reduce((s, r) => s + r.margine, 0);
  result.kpi.n_da_completare = righe.length - valutabili.length;
  result.kpi.margine_atteso_totale = valutabili.reduce((s, r) => s + (r.margine_atteso ?? 0), 0);
  result.kpi.n_in_perdita = valutabili.filter((r) => (r.margine_atteso ?? 0) < 0).length;
  // Stessa svista di scala su in corso/completate: con pct 0–100 la RPC vedeva
  // "completata" qualsiasi commessa ≥1% (mostrava 0 in corso · 22 completate).
  result.kpi.n_in_corso = righe.filter((r) => r.pct_avanzamento > 0 && r.pct_avanzamento < 1).length;
  result.kpi.n_completate = righe.filter((r) => r.pct_avanzamento >= 1).length;
  return result;
}
