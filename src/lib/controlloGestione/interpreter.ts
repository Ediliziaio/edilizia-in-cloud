/**
 * Interpreter — Layer di interpretazione operativa per Controllo di Gestione.
 *
 * Trasforma KPI grezzi in frasi operative per l'imprenditore italiano:
 * "MOL in calo del 12%" → cosa fare adesso, su quali cantieri, con che impatto.
 *
 * Pattern: ogni regola è una funzione PURA che riceve uno `Snapshot` e ritorna
 * 0..N `Insight`. Tutte le regole sono dichiarative, deterministiche e
 * testabili in isolamento. Nessuna chiamata di rete, nessuno stato.
 */

import type { CEriclassificato, BEPResult, VoceCE } from "@/hooks/controlloGestione/useCEriclassificato";
import type { SPResult, RatingResult } from "@/hooks/controlloGestione/useStatoPatrimoniale";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { formatNumero } from "@/lib/controlloGestione/formatCG";

export type Severity = "success" | "info" | "warning" | "danger";
export type InsightCategory =
  | "redditivita" | "liquidita" | "rating" | "bep"
  | "cashflow" | "cantieri" | "crediti" | "fiscale";

export interface Insight {
  id: string;
  category: InsightCategory;
  severity: Severity;
  title: string;
  body: string;
  amount?: number;
  trend_pct?: number;
  drilldown?: { label: string; href: string };
  metric_codes?: string[];
}

// Storico rating (riga di cg_rating_snapshot)
export interface RatingSnapshotRow {
  data_snapshot: string;
  classe_rating: string;
  scoring_totale: number;
}

// Cantiere lite per regole
export interface CantiereLite {
  id: string;
  nome: string;
  margine_pct: number | null;
  margine_eur: number | null;
}

// Scadenza lite per regole
export interface ScadenzaLite {
  id: string;
  tipo: "cliente" | "fornitore" | "tributo";
  cliente_nome?: string;
  importo: number;
  giorni_scadenza: number;
  /** Data di scadenza (YYYY-MM-DD), per dire «scaduta dal …». */
  scadenza?: string;
}

export interface Snapshot {
  ce_anno_corr: CEriclassificato;
  ce_anno_prec: CEriclassificato | null;
  sp: SPResult;
  rating: RatingResult;
  rating_storico: RatingSnapshotRow[];
  bep: BEPResult;
  cantieri_attivi: CantiereLite[];
  scadenzario: ScadenzaLite[];
  saldo_banche: number;
  cashflow_30gg: number;
}

type Rule = (s: Snapshot) => Insight | Insight[] | null;

// ── Helper di estrazione voci CE ────────────────────────────────────────────
const getVoce = (ce: CEriclassificato | null, codice: string): number => {
  if (!ce) return 0;
  return ce.voci.find((v: VoceCE) => v.codice === codice)?.valore ?? 0;
};

const getRicaviYTD = (s: Snapshot): number => getVoce(s.ce_anno_corr, "01");

// ─────────────────────────────────────────────────────────────────────────────
// REGOLE
// ─────────────────────────────────────────────────────────────────────────────

const ruleMolInCalo: Rule = (s) => {
  if (!s.ce_anno_prec) return null;
  const ebitdaCorr = getVoce(s.ce_anno_corr, "E");
  const ebitdaPrec = getVoce(s.ce_anno_prec, "E");
  if (ebitdaPrec <= 0) return null;
  const delta = ((ebitdaCorr - ebitdaPrec) / ebitdaPrec) * 100;
  if (delta >= -5) return null;
  return {
    id: "mol-in-calo",
    category: "redditivita",
    severity: delta < -15 ? "danger" : "warning",
    title: `MOL in calo del ${formatNumero(Math.abs(delta), 1)}% rispetto all'anno scorso`,
    body:
      `EBITDA passato da ${formatCurrency(ebitdaPrec)} a ${formatCurrency(ebitdaCorr)}. ` +
      `Verifica subappalti, materie prime e costo personale per individuare la causa principale.`,
    amount: ebitdaCorr - ebitdaPrec,
    trend_pct: delta,
    drilldown: { label: "Vedi dettaglio costi", href: "/azienda/costi" },
    metric_codes: ["E"],
  };
};

const ruleMolEsplosivo: Rule = (s) => {
  if (!s.ce_anno_prec) return null;
  const ebitdaCorr = getVoce(s.ce_anno_corr, "E");
  const ebitdaPrec = getVoce(s.ce_anno_prec, "E");
  if (ebitdaPrec <= 0) return null;
  const delta = ((ebitdaCorr - ebitdaPrec) / ebitdaPrec) * 100;
  if (delta < 25) return null;
  return {
    id: "mol-esplosivo",
    category: "redditivita",
    severity: "success",
    title: `MOL in crescita del ${formatNumero(delta, 0)}% rispetto all'anno scorso`,
    body:
      `EBITDA salito da ${formatCurrency(ebitdaPrec)} a ${formatCurrency(ebitdaCorr)}. ` +
      `Approfitta del momento: consolida la liquidità, riduci i debiti e investi in formazione.`,
    amount: ebitdaCorr - ebitdaPrec,
    trend_pct: delta,
    metric_codes: ["E"],
  };
};

const ruleEbitMargineRischio: Rule = (s) => {
  const ebit = getVoce(s.ce_anno_corr, "F");
  const ricavi = getRicaviYTD(s);
  if (ricavi <= 0) return null;
  const ebitMargine = (ebit / ricavi) * 100;
  if (ebitMargine >= 5) return null;
  return {
    id: "ebit-margine-rischio",
    category: "redditivita",
    severity: ebitMargine < 0 ? "danger" : "warning",
    title: `EBIT al ${formatNumero(ebitMargine, 1)}% — sotto soglia di sicurezza`,
    body:
      `L'EBIT è ${formatCurrency(ebit)} su ${formatCurrency(ricavi)} di ricavi. ` +
      `Sotto il 5% non c'è margine per imprevisti. Rivedi prezzi e costi fissi entro 30 giorni.`,
    drilldown: { label: "Apri CE Riclassificato", href: "/azienda/controllo-gestione" },
  };
};

const ruleRatingPeggiorato: Rule = (s) => {
  const storico = s.rating_storico;
  if (storico.length < 6) return null;
  const oggi = storico[0].classe_rating;
  const seiMesiFa = storico[Math.min(5, storico.length - 1)].classe_rating;
  const ordine = ["CCC", "B", "BB", "BBB", "A", "AA", "AAA"];
  const deltaClassi = ordine.indexOf(oggi) - ordine.indexOf(seiMesiFa);
  if (deltaClassi >= 0) return null;
  const impattoTasso = -deltaClassi * 0.7;
  return {
    id: "rating-peggiorato",
    category: "rating",
    severity: deltaClassi <= -2 ? "danger" : "warning",
    title: `Rating sceso da ${seiMesiFa} a ${oggi} negli ultimi 6 mesi`,
    body:
      `Se chiedi un finanziamento ora, il tasso aumenterà di circa +${formatNumero(impattoTasso, 1)} ` +
      `punti. Su 100k€ a 5 anni sono circa ${formatCurrency(100000 * (impattoTasso / 100) * 5)} ` +
      `di interessi in più.`,
    drilldown: { label: "Apri Rating Bancario", href: "/azienda/controllo-gestione" },
  };
};

const ruleRatingMigliorato: Rule = (s) => {
  const storico = s.rating_storico;
  if (storico.length < 6) return null;
  const oggi = storico[0].classe_rating;
  const seiMesiFa = storico[Math.min(5, storico.length - 1)].classe_rating;
  const ordine = ["CCC", "B", "BB", "BBB", "A", "AA", "AAA"];
  const deltaClassi = ordine.indexOf(oggi) - ordine.indexOf(seiMesiFa);
  if (deltaClassi <= 0) return null;
  return {
    id: "rating-migliorato",
    category: "rating",
    severity: "success",
    title: `Rating salito da ${seiMesiFa} a ${oggi} negli ultimi 6 mesi`,
    body:
      `Approfitta della finestra: ora le banche ti propongono tassi migliori. ` +
      `Valuta rinegoziazione mutui esistenti o nuove linee di credito a condizioni più vantaggiose.`,
  };
};

const ruleBepNonRaggiunto: Rule = (s) => {
  if (s.bep.gia_raggiunto) return null;
  if (s.bep.giorni_residui && s.bep.giorni_residui > 0) {
    const ricaviYTD = getRicaviYTD(s);
    const mancanti = (s.bep.bep_fatturato_minimo ?? 0) - ricaviYTD;
    return {
      id: "bep-in-corso",
      category: "bep",
      severity: s.bep.giorni_residui > 90 ? "warning" : "info",
      title: `Punto di pareggio previsto tra ${s.bep.giorni_residui} giorni`,
      body:
        `Devi ancora fatturare ${formatCurrency(Math.max(mancanti, 0))} per coprire i costi fissi. ` +
        `Margine di contribuzione attuale: ${formatNumero(s.bep.margine_contribuzione_pct, 1)}%.`,
    };
  }
  return {
    id: "bep-non-raggiungibile",
    category: "bep",
    severity: "danger",
    title: "Punto di pareggio non raggiungibile a questo ritmo",
    body:
      `A ritmo attuale i ricavi non copriranno i costi fissi entro l'anno. ` +
      `Margine di contribuzione: ${formatNumero(s.bep.margine_contribuzione_pct, 1)}%. ` +
      `Aumenta i prezzi o riduci i costi variabili.`,
  };
};

const ruleBepEarly: Rule = (s) => {
  if (!s.bep.gia_raggiunto || !s.bep.bep_giorno_anno) return null;
  if (s.bep.bep_giorno_anno > 240) return null;
  return {
    id: "bep-early",
    category: "bep",
    severity: "success",
    title: `Punto di pareggio raggiunto in anticipo (giorno ${s.bep.bep_giorno_anno} dell'anno)`,
    body:
      `Hai coperto i costi fissi prima della fine dell'anno. Tutto il fatturato da qui in avanti ` +
      `contribuisce al margine. Valuta accantonamenti e investimenti.`,
  };
};

const ruleLiquiditaCritica: Rule = (s) => {
  const ac = s.sp.attivo.attivo_circolante;
  const pc = s.sp.passivo.pas_corrente;
  if (pc <= 0) return null;
  const acPc = ac / pc;
  if (acPc >= 1.0) return null;
  return {
    id: "liquidita-critica",
    category: "liquidita",
    severity: acPc < 0.7 ? "danger" : "warning",
    title: "Attività correnti sotto le passività correnti",
    body:
      `Le attività entro 12 mesi (${formatCurrency(ac)}) sono inferiori alle passività entro 12 mesi ` +
      `(${formatCurrency(pc)}). Indice: ${formatNumero(acPc, 2)}. Fai cassa: solleciti incassi e rimanda ` +
      `pagamenti non urgenti.`,
    drilldown: { label: "Apri Scadenzario", href: "/azienda/scadenzario" },
  };
};

const ruleLiquiditaSottoTrenta: Rule = (s) => {
  if (s.cashflow_30gg >= 0) return null;
  return {
    id: "liquidita-sotto-trenta",
    category: "cashflow",
    severity: "danger",
    title: "Cassa in negativo nei prossimi 30 giorni",
    body:
      `Saldo banche attuale ${formatCurrency(s.saldo_banche)}, proiezione 30 giorni ` +
      `${formatCurrency(s.cashflow_30gg)}. Sollecita incassi prioritari oggi stesso.`,
    drilldown: { label: "Apri Tesoreria", href: "/azienda/tesoreria" },
  };
};

const ruleCantieriInPerdita: Rule = (s) => {
  // Cantieri APERTI sotto il 5% di margine atteso; «in perdita» = sotto zero.
  // Il titolo dice entrambi: la Dashboard conta le commesse in perdita (sotto
  // zero, aperte e chiuse) e i due numeri sembravano in contraddizione.
  const sottoSoglia = s.cantieri_attivi.filter((c) => c.margine_pct !== null && c.margine_pct < 5);
  if (sottoSoglia.length === 0) return null;
  const inPerdita = sottoSoglia.filter((c) => (c.margine_pct ?? 0) < 0);
  const margineTotale = sottoSoglia.reduce((acc, c) => acc + (c.margine_eur ?? 0), 0);
  const top3 = [...sottoSoglia]
    .sort((a, b) => (a.margine_pct ?? 0) - (b.margine_pct ?? 0))
    .slice(0, 3);
  return {
    id: "cantieri-in-perdita",
    category: "cantieri",
    severity: inPerdita.length > 0 ? "danger" : "warning",
    title: `${sottoSoglia.length} cantieri aperti con margine sotto il 5%` +
      (inPerdita.length > 0 ? `, di cui ${inPerdita.length} in perdita` : ""),
    body:
      `I più critici: ${top3.map((c) => `${c.nome} (${formatNumero(c.margine_pct ?? 0, 1)}%)`).join(", ")}. ` +
      `Margine atteso di questi cantieri, sommato: ${formatCurrency(margineTotale)}. Rivedi costi e varianti non fatturate.`,
    drilldown: { label: "Apri le commesse", href: "/azienda/controllo-gestione/commesse" },
  };
};

const ruleCreditiInsoluti60gg: Rule = (s) => {
  const insoluti = s.scadenzario.filter((sc) => sc.tipo === "cliente" && sc.giorni_scadenza > 60);
  if (insoluti.length === 0) return null;
  const totale = insoluti.reduce((a, sc) => a + sc.importo, 0);
  const top = [...insoluti].sort((a, b) => b.importo - a.importo).slice(0, 3);
  return {
    id: "crediti-insoluti-60gg",
    category: "crediti",
    severity: totale > 50000 ? "danger" : "warning",
    title: `${formatCurrency(totale)} da incassare, scaduti da oltre 60 giorni`,
    body:
      `${insoluti.length} ${insoluti.length === 1 ? "scadenza ancora aperta" : "scadenze ancora aperte"}, anche di anni precedenti. ` +
      `Le più grandi: ${top.map((t) => `${t.cliente_nome ?? "Cliente"}: ${formatCurrency(t.importo)}${t.scadenza ? ` (scaduta il ${formatDateShort(t.scadenza)})` : ""}`).join("; ")}. ` +
      `Sollecita ora, o segna come incassato quello che è già arrivato.`,
    drilldown: { label: "Apri Solleciti", href: "/azienda/scadenzario?filter=insoluti" },
  };
};

const ruleConcentrazioneClienti: Rule = (s) => {
  if (s.cantieri_attivi.length < 3) return null;
  const totRicavi = getRicaviYTD(s);
  if (totRicavi <= 0) return null;
  // Approx: prendiamo il primo cantiere (= cliente) per peso. Heuristica.
  const top = s.cantieri_attivi[0];
  if (!top || !top.margine_eur) return null;
  // Stima fatturato del cantiere top = margine_eur / margine_pct * 100 (se disponibile)
  const fattTop = top.margine_pct && top.margine_pct > 0
    ? (top.margine_eur / top.margine_pct) * 100
    : top.margine_eur * 4;
  const pctTop = (fattTop / totRicavi) * 100;
  if (pctTop < 35) return null;
  return {
    id: "concentrazione-clienti",
    category: "redditivita",
    severity: pctTop > 50 ? "danger" : "warning",
    title: `${top.nome} pesa il ${formatNumero(pctTop, 0)}% del fatturato`,
    body:
      `Concentrazione del rischio elevata. Se questo cliente rallenta, l'impatto è devastante. ` +
      `Diversifica nei prossimi 6 mesi: target massimo 25% per singolo cliente.`,
  };
};

const ruleCostoPersonaleEsploso: Rule = (s) => {
  if (!s.ce_anno_prec) return null;
  const cpCorr = getVoce(s.ce_anno_corr, "06");
  const cpPrec = getVoce(s.ce_anno_prec, "06");
  if (cpPrec <= 0) return null;
  const delta = ((cpCorr - cpPrec) / cpPrec) * 100;
  if (delta < 20) return null;
  return {
    id: "costo-personale-esploso",
    category: "redditivita",
    severity: delta > 40 ? "danger" : "warning",
    title: `Costo del personale +${formatNumero(delta, 0)}% YoY`,
    body:
      `Da ${formatCurrency(cpPrec)} a ${formatCurrency(cpCorr)}. Verifica se è dovuto a nuove ` +
      `assunzioni programmate (ok) o ad aumenti contrattuali / straordinari (rivedi pianificazione).`,
    drilldown: { label: "Apri Personale", href: "/azienda/personale" },
    metric_codes: ["06"],
  };
};

const ruleOneriFinanziariAlti: Rule = (s) => {
  const of = getVoce(s.ce_anno_corr, "11");
  const ricavi = getRicaviYTD(s);
  if (ricavi <= 0) return null;
  const incidenza = (of / ricavi) * 100;
  if (incidenza < 3) return null;
  return {
    id: "oneri-finanziari-alti",
    category: "fiscale",
    severity: incidenza > 6 ? "danger" : "warning",
    title: `Oneri finanziari al ${formatNumero(incidenza, 1)}% del fatturato`,
    body:
      `${formatCurrency(of)} di interessi e spese bancarie su ${formatCurrency(ricavi)} di ricavi. ` +
      `Sopra il 3% indica indebitamento elevato. Valuta consolidamento o estinzione anticipata.`,
    drilldown: { label: "Apri Tesoreria", href: "/azienda/tesoreria" },
    metric_codes: ["11"],
  };
};

const ruleIndipendenzaFinanziariaBassa: Rule = (s) => {
  const mp = s.sp.passivo.mezzi_propri;
  const totPas = s.sp.passivo.totale;
  if (totPas <= 0) return null;
  const indipendenza = mp / totPas;
  if (indipendenza >= 0.20) return null;
  return {
    id: "indipendenza-bassa",
    category: "rating",
    severity: indipendenza < 0.10 ? "danger" : "warning",
    title: `Mezzi propri al ${formatNumero((indipendenza * 100), 1)}% del totale passivo`,
    body:
      `Sotto il 20% le banche ti vedono "fragile". Valuta aumento di capitale, ricapitalizzazione ` +
      `con utili a nuovo, o riduzione del debito a breve.`,
  };
};

const ruleUtileNegativo: Rule = (s) => {
  const utile = getVoce(s.ce_anno_corr, "L");
  if (utile >= 0) return null;
  return {
    id: "utile-negativo",
    category: "redditivita",
    severity: "danger",
    title: `Bilancio in perdita di ${formatCurrency(Math.abs(utile))}`,
    body:
      `L'esercizio ${s.ce_anno_corr.meta.anno} sta chiudendo in rosso. Tre azioni urgenti: ` +
      `(1) blocca nuovi investimenti, (2) accelera incassi scaduti, (3) rivedi i contratti più dispendiosi.`,
    drilldown: { label: "Apri CE Riclassificato", href: "/azienda/controllo-gestione" },
    metric_codes: ["L"],
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Registry + runner
// ─────────────────────────────────────────────────────────────────────────────

const rules: Rule[] = [
  ruleMolInCalo,
  ruleMolEsplosivo,
  ruleEbitMargineRischio,
  ruleRatingPeggiorato,
  ruleRatingMigliorato,
  ruleBepNonRaggiunto,
  ruleBepEarly,
  ruleLiquiditaCritica,
  ruleLiquiditaSottoTrenta,
  ruleCantieriInPerdita,
  ruleCreditiInsoluti60gg,
  ruleConcentrazioneClienti,
  ruleCostoPersonaleEsploso,
  ruleOneriFinanziariAlti,
  ruleIndipendenzaFinanziariaBassa,
  ruleUtileNegativo,
];

export function runRules(snapshot: Snapshot): Insight[] {
  return rules.flatMap((rule) => {
    const out = rule(snapshot);
    if (!out) return [];
    return Array.isArray(out) ? out : [out];
  });
}

/** Numero totale di regole registrate (per debug/test). */
export const RULES_COUNT = rules.length;
