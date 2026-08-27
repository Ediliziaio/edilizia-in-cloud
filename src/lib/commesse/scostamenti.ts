/**
 * scostamenti — logica pura per l'analisi *preventivo vs consuntivo* per commessa.
 *
 * Sorgente dati: vista `v_ordine_marginalita` (security_invoker=true, tenant-safe),
 * la STESSA usata da `MarginalitaCantieri`, `MarginalitaWidget` e dal modulo
 * Controllo di Gestione (`cg_get_marginalita_commesse`). Qui NON si ricalcola il
 * margine: si usano `margine`/`margine_perc` già prodotti dalla vista, così i
 * numeri restano identici su tutte le superfici (dashboard, pagina, Silvio).
 *
 * Semantica colonne (verificata su prod):
 *   preventivo = valore del contratto (ricavo)   → `preventivo_totale` || `preventivo_contratto`
 *   consuntivo = costi diretti sostenuti          → acquisti + errori
 *   margine    = preventivo − consuntivo
 *   margine_perc = margine / preventivo × 100
 *
 * Tutto è puro e testabile: nessun fetch, nessun React. Postgres restituisce le
 * colonne `numeric` come STRINGHE → `num()` coerce in modo sicuro.
 */

/** Soglia di marginalità "sana" (%). ≥ → verde; [0, soglia) → giallo; < 0 → rosso. */
export const SOGLIA_VERDE_PERC = 15;

/** Errori/rilavorazioni ≥ 2% del preventivo → diventano un segnale di causa. */
export const INCIDENZA_ERRORI_SEGNALE = 0.02;
/** Consuntivo ≥ 85% del preventivo (senza sforamento) → margine a rischio. */
export const INCIDENZA_COSTI_ALTA = 0.85;

/** Riga grezza dalla vista `v_ordine_marginalita`. Numerici tollerati come stringa. */
export interface OrdineMarginalitaRow {
  id: string;
  order_code: string | null;
  description: string | null;
  cliente_nome: string | null;
  preventivo_contratto: number | string | null;
  preventivo_totale: number | string | null;
  variazioni_approvate: number | string | null;
  costo_acquisti: number | string | null;
  costo_errori: number | string | null;
  consuntivo: number | string | null;
  margine: number | string | null;
  margine_perc: number | string | null;
}

export type SemaforoMarginalita = "verde" | "giallo" | "rosso" | "grigio";

/** Tipologia di causa che spiega uno scostamento negativo o a rischio. */
export type CausaScostamento = "sforamento" | "errori" | "incidenza_alta";

/** Segnale di causa derivato dai soli dati della vista (nessuna scrittura/tabella). */
export interface SegnaleCausa {
  tipo: CausaScostamento;
  gravita: "alta" | "media";
  /** Etichetta pronta per UI/chat. */
  label: string;
  /** Valore associato (importo € o incidenza 0..n), utile per badge/tooltip. */
  valore: number;
}

/** Riga commessa con scostamento calcolato. */
export interface ScostamentoCommessa {
  id: string;
  orderCode: string | null;
  description: string;
  cliente: string | null;
  preventivo: number;
  consuntivo: number;
  costoAcquisti: number;
  costoErrori: number;
  variazioni: number;
  margine: number;
  marginePerc: number;
  /** consuntivo / preventivo (0..n). 0 se preventivo non disponibile. */
  incidenzaCosti: number;
  semaforo: SemaforoMarginalita;
  isInPerdita: boolean;
  /** Cause derivate (sforamento, errori, incidenza alta), ordinate per gravità. */
  cause: SegnaleCausa[];
}

export interface ScostamentiSummary {
  /** Commesse con preventivo (valore contratto) > 0. */
  nCommesse: number;
  /** Commesse con consuntivazione avviata (consuntivo > 0). */
  nConCosti: number;
  /** Commesse in perdita (margine < 0). */
  nInPerdita: number;
  /** Commesse con margine 0..soglia (consuntivate, non in perdita ma sotto soglia). */
  nSottoSoglia: number;
  /** Commesse con segnale "errori/rilavorazioni" significativo. */
  nConErrori: number;
  /** Commesse con costi oltre il preventivo (sforamento). */
  nConSforamento: number;
  preventivoTotale: number;
  consuntivoTotale: number;
  margineTotale: number;
  /** Margine medio ponderato = margineTotale / preventivoTotale × 100. */
  margineMedioPerc: number;
  /** Commessa con marginalità peggiore tra quelle consuntivate. */
  peggiore: ScostamentoCommessa | null;
}

export interface ComputeScostamentiOptions {
  /** Includi solo commesse con preventivo strettamente > a questo valore. Default 0. */
  minPreventivo?: number;
}

/** Coercion sicura: numero finito oppure 0 (gestisce numeric-as-string di Postgres). */
export function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Classifica la marginalità in un semaforo.
 * `grigio` = non valutabile (consuntivazione non avviata).
 */
export function classifySemaforo(
  marginePerc: number,
  hasConsuntivo: boolean,
): SemaforoMarginalita {
  if (!hasConsuntivo) return "grigio";
  if (marginePerc < 0) return "rosso";
  if (marginePerc < SOGLIA_VERDE_PERC) return "giallo";
  return "verde";
}

/**
 * Deriva i segnali di causa di uno scostamento dai soli dati della vista
 * (nessuna scrittura, nessuna tabella aggiuntiva). Risponde a "perché va male":
 *   - sforamento     → i costi hanno superato il valore di contratto
 *   - errori         → costi per errori/rilavorazioni ≥ 2% del preventivo
 *   - incidenza_alta → costi che hanno già eroso ≥ 85% del preventivo
 * Ordinati per gravità (alta prima).
 */
export function analizzaCause(s: {
  preventivo: number;
  consuntivo: number;
  costoErrori: number;
  margine: number;
  incidenzaCosti: number;
}): SegnaleCausa[] {
  const out: SegnaleCausa[] = [];

  // 1) Sforamento: costi oltre il preventivo (overrun conclamato).
  if (s.consuntivo > s.preventivo) {
    out.push({
      tipo: "sforamento",
      gravita: "alta",
      label: `Costi oltre il preventivo di ${formatEuroCompact(s.consuntivo - s.preventivo)}`,
      valore: s.consuntivo - s.preventivo,
    });
  }

  // 2) Errori/rilavorazioni con incidenza significativa sul preventivo.
  if (s.costoErrori > 0 && s.preventivo > 0) {
    const incid = s.costoErrori / s.preventivo;
    if (incid >= INCIDENZA_ERRORI_SEGNALE) {
      // Grave se gli errori da soli erodono/superano il margine residuo.
      const gravita: "alta" | "media" =
        s.margine < 0 || s.costoErrori >= Math.max(s.margine, 0) ? "alta" : "media";
      out.push({
        tipo: "errori",
        gravita,
        label: `Errori/rilavorazioni ${formatEuroCompact(s.costoErrori)} (${(incid * 100).toFixed(1)}% del preventivo)`,
        valore: s.costoErrori,
      });
    }
  }

  // 3) Incidenza costi alta (solo se NON già in sforamento conclamato).
  if (s.consuntivo <= s.preventivo && s.incidenzaCosti >= INCIDENZA_COSTI_ALTA) {
    out.push({
      tipo: "incidenza_alta",
      gravita: "media",
      label: `Costi al ${(s.incidenzaCosti * 100).toFixed(0)}% del preventivo`,
      valore: s.incidenzaCosti,
    });
  }

  // Gravità alta prima (sort stabile: mantiene l'ordine di emissione a parità).
  return out.sort((a, b) => (a.gravita === b.gravita ? 0 : a.gravita === "alta" ? -1 : 1));
}

/** Mappa una riga grezza della vista in una riga di scostamento. */
export function toScostamento(row: OrdineMarginalitaRow): ScostamentoCommessa {
  const preventivo = num(row.preventivo_totale) || num(row.preventivo_contratto);
  const consuntivo = num(row.consuntivo);
  const margine = num(row.margine);
  const marginePerc = num(row.margine_perc);
  const hasConsuntivo = consuntivo > 0;
  const description = (row.description ?? "").trim() || "Commessa senza descrizione";
  const costoErrori = num(row.costo_errori);
  const incidenzaCosti = preventivo > 0 ? consuntivo / preventivo : 0;

  return {
    id: row.id,
    orderCode: row.order_code ?? null,
    description,
    cliente: row.cliente_nome ?? null,
    preventivo,
    consuntivo,
    costoAcquisti: num(row.costo_acquisti),
    costoErrori,
    variazioni: num(row.variazioni_approvate),
    margine,
    marginePerc,
    incidenzaCosti,
    semaforo: classifySemaforo(marginePerc, hasConsuntivo),
    isInPerdita: margine < 0,
    cause: analizzaCause({ preventivo, consuntivo, costoErrori, margine, incidenzaCosti }),
  };
}

/** Ordinamento "rischio prima": in perdita → margine % crescente → consuntivo decrescente. */
function byRischio(a: ScostamentoCommessa, b: ScostamentoCommessa): number {
  if (a.isInPerdita !== b.isInPerdita) return a.isInPerdita ? -1 : 1;
  if (a.marginePerc !== b.marginePerc) return a.marginePerc - b.marginePerc;
  return b.consuntivo - a.consuntivo;
}

/**
 * Calcola gli scostamenti per commessa, ordinati dal più a rischio.
 * Esclude le commesse senza valore di contratto (preventivo ≤ minPreventivo).
 */
export function computeScostamenti(
  rows: OrdineMarginalitaRow[],
  opts: ComputeScostamentiOptions = {},
): ScostamentoCommessa[] {
  const minPreventivo = opts.minPreventivo ?? 0;
  return rows
    .map(toScostamento)
    .filter((s) => s.preventivo > minPreventivo)
    .sort(byRischio);
}

/** Aggregato di portafoglio (KPI) calcolato su tutte le commesse con preventivo > 0. */
export function summarizeScostamenti(rows: OrdineMarginalitaRow[]): ScostamentiSummary {
  const all = rows.map(toScostamento).filter((s) => s.preventivo > 0);
  const conCosti = all.filter((s) => s.consuntivo > 0);

  const preventivoTotale = all.reduce((s, r) => s + r.preventivo, 0);
  const consuntivoTotale = all.reduce((s, r) => s + r.consuntivo, 0);
  const margineTotale = all.reduce((s, r) => s + r.margine, 0);
  const margineMedioPerc = preventivoTotale > 0 ? (margineTotale / preventivoTotale) * 100 : 0;

  const nInPerdita = all.filter((s) => s.isInPerdita).length;
  const nSottoSoglia = conCosti.filter(
    (s) => !s.isInPerdita && s.marginePerc < SOGLIA_VERDE_PERC,
  ).length;
  const nConErrori = all.filter((s) => s.cause.some((c) => c.tipo === "errori")).length;
  const nConSforamento = all.filter((s) => s.cause.some((c) => c.tipo === "sforamento")).length;

  const peggiore = conCosti.length
    ? conCosti.reduce((worst, s) => (s.marginePerc < worst.marginePerc ? s : worst))
    : null;

  return {
    nCommesse: all.length,
    nConCosti: conCosti.length,
    nInPerdita,
    nSottoSoglia,
    nConErrori,
    nConSforamento,
    preventivoTotale,
    consuntivoTotale,
    margineTotale,
    margineMedioPerc,
    peggiore,
  };
}

/** Formatta un importo in EUR all'italiana, senza decimali (compatto per chat/UI). */
export function formatEuroCompact(n: number): string {
  return Math.round(num(n)).toLocaleString("it-IT") + " €";
}

/** Emoji semaforo per messaggi di chat (Silvio / WhatsApp). */
export function semaforoEmoji(s: SemaforoMarginalita): string {
  switch (s) {
    case "verde":
      return "🟢";
    case "giallo":
      return "🟡";
    case "rosso":
      return "🔴";
    default:
      return "⚪";
  }
}

/**
 * Riepilogo testuale degli scostamenti per la chat (Silvio).
 * `top` = commesse più a rischio (già ordinate) da elencare.
 */
export function formatScostamentiForChat(
  summary: ScostamentiSummary,
  top: ScostamentoCommessa[],
): string {
  if (summary.nCommesse === 0) {
    return "Non ho trovato commesse con un preventivo associato da analizzare.";
  }

  const head = [
    `📊 *Marginalità commesse*`,
    "",
    `Preventivo: ${formatEuroCompact(summary.preventivoTotale)}`,
    `Consuntivo: ${formatEuroCompact(summary.consuntivoTotale)}`,
    `Margine: ${formatEuroCompact(summary.margineTotale)} (${summary.margineMedioPerc.toFixed(1)}%)`,
  ];

  if (summary.nInPerdita > 0) {
    head.push(`🔴 ${summary.nInPerdita} in perdita · 🟡 ${summary.nSottoSoglia} sotto soglia`);
  } else if (summary.nSottoSoglia > 0) {
    head.push(`🟡 ${summary.nSottoSoglia} sotto soglia (< ${SOGLIA_VERDE_PERC}%)`);
  } else {
    head.push(`✅ Nessuna commessa in perdita`);
  }

  // Cause ricorrenti di portafoglio (perché vanno male).
  const noteCause: string[] = [];
  if (summary.nConSforamento > 0) noteCause.push(`📈 ${summary.nConSforamento} con sforamento costi`);
  if (summary.nConErrori > 0) noteCause.push(`⚠️ ${summary.nConErrori} con errori/rilavorazioni`);
  if (noteCause.length) head.push(noteCause.join(" · "));

  const lines = top.map((c) => {
    const nome = c.orderCode ? `#${c.orderCode}` : c.description.slice(0, 28);
    const base = `${semaforoEmoji(c.semaforo)} ${nome} — ${formatEuroCompact(c.margine)} (${c.marginePerc.toFixed(1)}%)`;
    // Mostra la causa principale (più grave) sotto la riga.
    return c.cause[0] ? `${base}\n   ↳ ${c.cause[0].label}` : base;
  });

  return [...head, ...(lines.length ? ["", "Più a rischio:", ...lines] : [])].join("\n");
}
