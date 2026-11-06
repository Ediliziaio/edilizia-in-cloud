/**
 * Regole della pagina Marginalità cantieri e del suo dettaglio, in un posto solo:
 * badge e filtri devono dire la stessa cosa, e ogni commessa sta in una sola fascia.
 */

/** Da qui in su una commessa è «Sana», salvo un target aziendale più alto. */
export const SOGLIA_SANO_PCT = 25;

export type FasciaMargine = "incompleto" | "perdita" | "sotto_target" | "da_monitorare" | "sano";

function numero(value: number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Ricavo, costi registrati e prelievi valorizzati sono necessari per un margine affidabile. */
export function margineAffidabile(row: { preventivo_totale: number | null; consuntivo: number | null; movimenti_magazzino_senza_costo?: number | null }): boolean {
  return numero(row.preventivo_totale) > 0 && numero(row.consuntivo) > 0 && numero(row.movimenti_magazzino_senza_costo) <= 0;
}

export function fasciaMargine(opts: { affidabile: boolean; nettoPct: number; targetPct: number }): FasciaMargine {
  if (!opts.affidabile) return "incompleto";
  if (opts.nettoPct < 0) return "perdita";
  if (opts.nettoPct < opts.targetPct) return "sotto_target";
  if (opts.nettoPct < Math.max(SOGLIA_SANO_PCT, opts.targetPct)) return "da_monitorare";
  return "sano";
}

export interface CostiCommessa {
  costo_acquisti: number | null;
  costo_materiali_magazzino: number | null;
  costo_manodopera?: number | null;
  costo_provvigioni?: number | null;
  costo_diretto?: number | null;
  costo_rimborsi_km?: number | null;
  costo_errori: number | null;
  consuntivo: number | null;
}

export interface VoceCosto {
  chiave: string;
  etichetta: string;
  importo: number;
}

/**
 * Le voci che compongono il consuntivo di v_ordine_marginalita. Se non tornano col
 * totale, la differenza resta visibile come «Altri costi»: il dettaglio deve sempre
 * spiegare tutto il consuntivo.
 */
export function vociConsuntivo(row: CostiCommessa): VoceCosto[] {
  const voci: VoceCosto[] = [
    { chiave: "acquisti", etichetta: "Acquisti impegnati (ODA)", importo: numero(row.costo_acquisti) },
    { chiave: "magazzino", etichetta: "Materiali prelevati da scorta", importo: numero(row.costo_materiali_magazzino) },
    { chiave: "manodopera", etichetta: "Manodopera e ditte esterne", importo: numero(row.costo_manodopera) },
    { chiave: "diretti", etichetta: "Altri costi diretti", importo: numero(row.costo_diretto) },
    { chiave: "provvigioni", etichetta: "Provvigioni", importo: numero(row.costo_provvigioni) },
    { chiave: "rimborsi", etichetta: "Rimborsi chilometrici", importo: numero(row.costo_rimborsi_km) },
    { chiave: "errori", etichetta: "Costi errori / rilavorazioni", importo: numero(row.costo_errori) },
  ];
  const somma = voci.reduce((totale, voce) => totale + voce.importo, 0);
  const resto = Math.round((numero(row.consuntivo) - somma) * 100) / 100;
  if (Math.abs(resto) >= 0.01) voci.push({ chiave: "altro", etichetta: "Altri costi", importo: resto });
  return voci.filter((voce) => voce.importo !== 0);
}

/** Il nome del profilo cliente; se la commessa non ne ha uno, quello scritto sulla commessa. */
export function nomeClienteCommessa(
  clienteProfilo: string | null | undefined,
  commessa?: { client_company?: string | null; client_name?: string | null } | null,
): string {
  const scelto = [clienteProfilo, commessa?.client_company, commessa?.client_name]
    .map((valore) => (valore ?? "").trim())
    .find(Boolean);
  return scelto ?? "";
}

export interface AvanzamentoCommessa {
  work_state?: "open" | "completed" | "support" | "cancelled";
  /** Da 0 a 1, come in useMarginalitaCommesse. */
  pct_avanzamento: number;
  margine_atteso_perc: number | null;
}

/**
 * Solo per i lavori aperti, iniziati e non finiti. La proiezione è quella del Controllo
 * di gestione: sotto il 20% di avanzamento non esiste, e allora si dice solo che il
 * margine è provvisorio.
 */
export function notaAvanzamento(riga: AvanzamentoCommessa | null | undefined): string | null {
  if (!riga || (riga.work_state && riga.work_state !== "open")) return null;
  const pct = numero(riga.pct_avanzamento);
  if (pct <= 0 || pct >= 1) return null;
  const avanzamento = `Avanzamento ${Math.round(pct * 100)}%`;
  return riga.margine_atteso_perc === null
    ? `${avanzamento}: margine provvisorio`
    : `${avanzamento} · proiezione a fine lavori ${riga.margine_atteso_perc.toFixed(1)}%`;
}

export interface CommessaPerSede {
  id: string;
  preventivo_totale: number | null;
  consuntivo: number | null;
  movimenti_magazzino_senza_costo?: number | null;
  margine: number | null;
  created_at: string;
}

export interface MargineSede {
  ricavi: number;
  costi: number;
  margine: number;
  margine_pct: number;
  incidenza_ricavi: number;
  incidenza_margine: number;
  delta_incidenza: number;
}

/**
 * Il margine di ogni sede dalle stesse commesse della tabella, così i conti tornano.
 * Valgono solo le commesse con ricavo e costi: le altre sarebbero un falso utile del 100%.
 */
export function margineRealeSedi(
  commesse: CommessaPerSede[],
  sedePerCommessa: ReadonlyMap<string, string | null>,
  periodo?: { da?: string | null; a?: string | null },
): Map<string, MargineSede> {
  const da = periodo?.da?.slice(0, 10);
  const a = periodo?.a?.slice(0, 10);
  const perSede = new Map<string, { ricavi: number; costi: number; margine: number }>();
  for (const commessa of commesse) {
    const sede = sedePerCommessa.get(commessa.id);
    const giorno = commessa.created_at.slice(0, 10);
    if (!sede || !margineAffidabile(commessa) || (da && giorno < da) || (a && giorno > a)) continue;
    const totali = perSede.get(sede) ?? { ricavi: 0, costi: 0, margine: 0 };
    totali.ricavi += numero(commessa.preventivo_totale);
    totali.costi += numero(commessa.consuntivo);
    totali.margine += numero(commessa.margine);
    perSede.set(sede, totali);
  }
  const voci = [...perSede.values()];
  const totRicavi = voci.reduce((t, v) => t + v.ricavi, 0);
  const totMargine = voci.reduce((t, v) => t + v.margine, 0);
  const risultato = new Map<string, MargineSede>();
  for (const [sede, v] of perSede) {
    const quotaRicavi = totRicavi > 0 ? v.ricavi / totRicavi : 0;
    const quotaMargine = totMargine > 0 ? v.margine / totMargine : 0;
    risultato.set(sede, {
      ...v,
      margine_pct: v.ricavi > 0 ? (v.margine / v.ricavi) * 100 : 0,
      incidenza_ricavi: quotaRicavi * 100,
      incidenza_margine: quotaMargine * 100,
      delta_incidenza: (quotaMargine - quotaRicavi) * 100,
    });
  }
  return risultato;
}
