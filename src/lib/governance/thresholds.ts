/**
 * #40 — Governance: soglie configurabili per azienda + valutatori puri.
 *
 * Modello dati + logica pura (zero dipendenze React/Supabase) per:
 *   1. Doppia approvazione preventivi oltre un importo soglia.
 *   2. Alert di scostamento SAL (avanzamento dichiarato vs costi consumati).
 *   3. Soglia di marginalità "sana" delle commesse (oggi hardcoded a 15%).
 *   4. Rincari d'acquisto: quando un carico di magazzino costa più del solito.
 *
 * La persistenza è su `company_governance_settings` (1 riga per company,
 * colonne flat). Qui mappiamo riga DB ⇄ config tipizzata e valutiamo le soglie.
 * Tutto testabile in isolamento — i componenti/hook consumano queste funzioni.
 */

// ── Modello config ───────────────────────────────────────────────────────────

export interface GovernanceThresholds {
  /** Preventivi: oltre la soglia serve una seconda approvazione (doppia firma). */
  preventivoDoppiaApprovazione: {
    enabled: boolean;
    importoSoglia: number; // € (al netto IVA), confronto >= soglia
  };
  /** SAL: alert quando i costi consumati divergono dall'avanzamento dichiarato. */
  salScostamento: {
    enabled: boolean;
    tolleranzaPerc: number; // ±% di scostamento tollerato
  };
  /** Marginalità commesse: sotto questa % la commessa è "a rischio". */
  marginalita: {
    enabled: boolean;
    sogliaMinimaPerc: number; // % di margine considerata sana
  };
  /**
   * Rincari d'acquisto: un carico pagato più del costo medio della giacenza.
   * Il confronto è prezzo pagato ADESSO contro il medio PRIMA del carico — non il
   * medio nuovo contro quello vecchio (su una giacenza grande un acquisto a +40%
   * muove il medio di mezzo punto e il rincaro non si vedrebbe), e non l'ultimo
   * prezzo pagato (un acquisto d'urgenza da un fornitore caro diventerebbe il
   * riferimento, e il rincaro vero dopo di lui sembrerebbe un ribasso).
   */
  rincaroAcquisti: {
    enabled: boolean;
    sogliaPerc: number;  // % sopra il medio oltre la quale è un rincaro
    minimoEuro: number;  // spesa in più di quel carico sotto la quale si tace
  };
}

export const DEFAULT_GOVERNANCE_THRESHOLDS: GovernanceThresholds = {
  preventivoDoppiaApprovazione: { enabled: false, importoSoglia: 50000 },
  salScostamento: { enabled: false, tolleranzaPerc: 5 },
  marginalita: { enabled: true, sogliaMinimaPerc: 15 },
  rincaroAcquisti: { enabled: true, sogliaPerc: 15, minimoEuro: 50 },
};

/** Limiti di sicurezza per i valori configurabili. */
const LIMITS = {
  importoSogliaMax: 100_000_000,
  percMax: 100,
  // Un rincaro può essere anche di molto più del 100%: il prezzo che raddoppia è
  // +100%, e chi vuole essere avvisato solo oltre il triplo deve poterlo scrivere.
  rincaroPercMax: 10_000,
  rincaroMinimoEuroMax: 10_000_000,
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function num(v: number | string | null | undefined, fallback = 0): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(n, min), max);
}

function bool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === 1 || v === "1") return true;
  if (v === "false" || v === 0 || v === "0") return false;
  return fallback;
}

// ── Riga DB ⇄ config ─────────────────────────────────────────────────────────

export interface GovernanceSettingsRow {
  company_id?: string;
  preventivo_doppia_firma_enabled?: boolean | null;
  preventivo_soglia_importo?: number | string | null;
  sal_scostamento_enabled?: boolean | null;
  sal_tolleranza_perc?: number | string | null;
  marginalita_alert_enabled?: boolean | null;
  marginalita_soglia_perc?: number | string | null;
  rincaro_acquisti_enabled?: boolean | null;
  rincaro_soglia_perc?: number | string | null;
  rincaro_minimo_euro?: number | string | null;
}

/** Normalizza/clampa una config (parziale o "sporca") sui valori validi. */
export function normalizeGovernanceThresholds(
  raw?: Partial<GovernanceThresholds> | null,
): GovernanceThresholds {
  const d = DEFAULT_GOVERNANCE_THRESHOLDS;
  const p = raw?.preventivoDoppiaApprovazione;
  const s = raw?.salScostamento;
  const m = raw?.marginalita;
  const r = raw?.rincaroAcquisti;
  return {
    preventivoDoppiaApprovazione: {
      enabled: bool(p?.enabled, d.preventivoDoppiaApprovazione.enabled),
      importoSoglia: clamp(
        num(p?.importoSoglia, d.preventivoDoppiaApprovazione.importoSoglia),
        0,
        LIMITS.importoSogliaMax,
      ),
    },
    salScostamento: {
      enabled: bool(s?.enabled, d.salScostamento.enabled),
      tolleranzaPerc: clamp(
        num(s?.tolleranzaPerc, d.salScostamento.tolleranzaPerc),
        0,
        LIMITS.percMax,
      ),
    },
    marginalita: {
      enabled: bool(m?.enabled, d.marginalita.enabled),
      sogliaMinimaPerc: clamp(
        num(m?.sogliaMinimaPerc, d.marginalita.sogliaMinimaPerc),
        0,
        LIMITS.percMax,
      ),
    },
    rincaroAcquisti: {
      enabled: bool(r?.enabled, d.rincaroAcquisti.enabled),
      sogliaPerc: clamp(
        num(r?.sogliaPerc, d.rincaroAcquisti.sogliaPerc),
        0,
        LIMITS.rincaroPercMax,
      ),
      minimoEuro: clamp(
        num(r?.minimoEuro, d.rincaroAcquisti.minimoEuro),
        0,
        LIMITS.rincaroMinimoEuroMax,
      ),
    },
  };
}

/** Riga DB (o null/errore) → config tipizzata, con fallback ai default. */
export function governanceFromRow(row?: GovernanceSettingsRow | null): GovernanceThresholds {
  if (!row) return { ...DEFAULT_GOVERNANCE_THRESHOLDS };
  return normalizeGovernanceThresholds({
    preventivoDoppiaApprovazione: {
      enabled: bool(row.preventivo_doppia_firma_enabled, false),
      importoSoglia: num(row.preventivo_soglia_importo, DEFAULT_GOVERNANCE_THRESHOLDS.preventivoDoppiaApprovazione.importoSoglia),
    },
    salScostamento: {
      enabled: bool(row.sal_scostamento_enabled, false),
      tolleranzaPerc: num(row.sal_tolleranza_perc, DEFAULT_GOVERNANCE_THRESHOLDS.salScostamento.tolleranzaPerc),
    },
    marginalita: {
      enabled: bool(row.marginalita_alert_enabled, true),
      sogliaMinimaPerc: num(row.marginalita_soglia_perc, DEFAULT_GOVERNANCE_THRESHOLDS.marginalita.sogliaMinimaPerc),
    },
    rincaroAcquisti: {
      enabled: bool(row.rincaro_acquisti_enabled, true),
      sogliaPerc: num(row.rincaro_soglia_perc, DEFAULT_GOVERNANCE_THRESHOLDS.rincaroAcquisti.sogliaPerc),
      minimoEuro: num(row.rincaro_minimo_euro, DEFAULT_GOVERNANCE_THRESHOLDS.rincaroAcquisti.minimoEuro),
    },
  });
}

/** Config → riga DB (per upsert). Esclude company_id (lo aggiunge il chiamante). */
export function governanceToRow(cfg: GovernanceThresholds): Omit<GovernanceSettingsRow, "company_id"> {
  const n = normalizeGovernanceThresholds(cfg);
  return {
    preventivo_doppia_firma_enabled: n.preventivoDoppiaApprovazione.enabled,
    preventivo_soglia_importo: n.preventivoDoppiaApprovazione.importoSoglia,
    sal_scostamento_enabled: n.salScostamento.enabled,
    sal_tolleranza_perc: n.salScostamento.tolleranzaPerc,
    marginalita_alert_enabled: n.marginalita.enabled,
    marginalita_soglia_perc: n.marginalita.sogliaMinimaPerc,
    rincaro_acquisti_enabled: n.rincaroAcquisti.enabled,
    rincaro_soglia_perc: n.rincaroAcquisti.sogliaPerc,
    rincaro_minimo_euro: n.rincaroAcquisti.minimoEuro,
  };
}

// ── Valutatore 1: approvazione preventivo ────────────────────────────────────

export interface ApprovazionePreventivoEsito {
  richiedeApprovazione: boolean;
  importo: number;
  importoSoglia: number;
  motivo: string | null;
}

/**
 * Valuta se un preventivo richiede una seconda approvazione.
 * Soglia <= 0 o feature off ⇒ mai richiesta. Confronto importo >= soglia.
 */
export function valutaApprovazionePreventivo(
  cfg: GovernanceThresholds,
  importo: number | string | null | undefined,
): ApprovazionePreventivoEsito {
  const imp = num(importo);
  const soglia = cfg.preventivoDoppiaApprovazione.importoSoglia;
  const attiva = cfg.preventivoDoppiaApprovazione.enabled && soglia > 0;
  const richiede = attiva && imp >= soglia;
  return {
    richiedeApprovazione: richiede,
    importo: imp,
    importoSoglia: soglia,
    motivo: richiede
      ? `Importo oltre la soglia di doppia approvazione (€ ${Math.round(soglia).toLocaleString("it-IT")}).`
      : null,
  };
}

// ── Valutatore 2: scostamento SAL ────────────────────────────────────────────

export type SeveritaScostamento = "ok" | "attenzione" | "critico";

export interface ScostamentoSalEsito {
  alert: boolean;
  severita: SeveritaScostamento;
  /** costiPerc − avanzamentoPerc. Positivo ⇒ consumo budget oltre l'avanzamento. */
  scostamentoPerc: number;
  tolleranzaPerc: number;
  messaggio: string | null;
}

/**
 * Confronta l'avanzamento lavori dichiarato (%) con i costi consumati (%):
 * se la divergenza supera la tolleranza configurata, segnala un alert.
 * Oltre il doppio della tolleranza ⇒ "critico".
 */
export function valutaScostamentoSal(
  cfg: GovernanceThresholds,
  input: { avanzamentoPerc: number | string | null | undefined; costiPerc: number | string | null | undefined },
): ScostamentoSalEsito {
  const avanz = num(input.avanzamentoPerc);
  const costi = num(input.costiPerc);
  const scost = Math.round((costi - avanz) * 10) / 10; // 1 decimale
  const toll = cfg.salScostamento.tolleranzaPerc;

  if (!cfg.salScostamento.enabled || toll <= 0) {
    return { alert: false, severita: "ok", scostamentoPerc: scost, tolleranzaPerc: toll, messaggio: null };
  }

  const abs = Math.abs(scost);
  const alert = abs > toll;
  const severita: SeveritaScostamento = !alert ? "ok" : abs > toll * 2 ? "critico" : "attenzione";

  let messaggio: string | null = null;
  if (alert) {
    messaggio = scost > 0
      ? `Costi avanti di ${abs.toFixed(1)}% rispetto all'avanzamento dichiarato (tolleranza ±${toll}%).`
      : `Avanzamento dichiarato avanti di ${abs.toFixed(1)}% rispetto ai costi (tolleranza ±${toll}%).`;
  }

  return { alert, severita, scostamentoPerc: scost, tolleranzaPerc: toll, messaggio };
}

/**
 * Scostamento SAL a livello di commessa: ricava i costi% da costo previsto e
 * consuntivo e applica le soglie. Torna `null` quando NON ha senso mostrarlo:
 * feature spenta, avanzamento mancante o sotto il 15% (lì la stima è rumore,
 * come la proiezione del margine), o costo previsto assente. Quando torna un
 * esito, chi lo usa mostra l'alert solo se `esito.alert`.
 */
export function scostamentoSalCommessa(
  cfg: GovernanceThresholds,
  input: { avanzamentoPerc: number | null | undefined; costoPrevisto: number; costoConsuntivo: number },
): ScostamentoSalEsito | null {
  if (!cfg.salScostamento.enabled) return null;
  if (input.avanzamentoPerc == null) return null;
  const av = num(input.avanzamentoPerc);
  if (av < 15) return null;
  if (!(input.costoPrevisto > 0)) return null;
  const costiPerc = Math.round((input.costoConsuntivo / input.costoPrevisto) * 1000) / 10;
  return valutaScostamentoSal(cfg, { avanzamentoPerc: av, costiPerc });
}

// ── Valutatore 3: marginalità commessa ───────────────────────────────────────

export type SemaforoMargine = "verde" | "giallo" | "rosso";

export interface MarginalitaEsito {
  semaforo: SemaforoMargine;
  inPerdita: boolean;
  sottoSoglia: boolean;
  sogliaMinimaPerc: number;
}

/**
 * Semaforo marginalità in base alla soglia configurata:
 *  margine < 0 ⇒ rosso (in perdita); 0..soglia ⇒ giallo (a rischio); ≥ soglia ⇒ verde.
 * Se l'alert è disattivato, "giallo" non scatta (solo perdita = rosso).
 */
export function valutaMarginalita(
  cfg: GovernanceThresholds,
  marginePerc: number | string | null | undefined,
): MarginalitaEsito {
  const m = num(marginePerc);
  const soglia = cfg.marginalita.sogliaMinimaPerc;
  const inPerdita = m < 0;
  const sottoSoglia = cfg.marginalita.enabled && !inPerdita && m < soglia;
  const semaforo: SemaforoMargine = inPerdita ? "rosso" : sottoSoglia ? "giallo" : "verde";
  return { semaforo, inPerdita, sottoSoglia, sogliaMinimaPerc: soglia };
}

// ── Valutatore 4: rincaro d'acquisto ─────────────────────────────────────────

export interface RincaroEsito {
  /** Vero quando questo carico va segnalato come rincaro. */
  rincaro: boolean;
  /** Di quanto il prezzo pagato sta sopra il medio della giacenza (%). */
  scostamentoPerc: number;
  /** Quanto si è speso in più su questo carico rispetto al medio (€). */
  spesaInPiu: number;
  messaggio: string | null;
}

/**
 * Specchio in TypeScript di `public.magazzino_e_rincaro`: la decisione vera la
 * prende il database al momento del carico (è lì che il prezzo pagato e il medio
 * di prima sono entrambi in mano). Qui serve per mostrare l'esempio nelle
 * impostazioni e per spiegare una riga già annotata, con le stesse regole:
 *  - senza un medio di partenza non c'è un "solito" da confrontare;
 *  - oltre la soglia % sopra il medio;
 *  - E con una spesa in più oltre il minimo in euro.
 */
export function valutaRincaro(
  cfg: GovernanceThresholds,
  input: {
    medioPrima: number | string | null | undefined;
    prezzoPagato: number | string | null | undefined;
    quantita: number | string | null | undefined;
  },
): RincaroEsito {
  const medio = num(input.medioPrima);
  const prezzo = num(input.prezzoPagato);
  const qta = num(input.quantita);
  const scostamentoPerc = medio > 0 ? Math.round(((prezzo - medio) / medio) * 1000) / 10 : 0;
  const spesaInPiu = medio > 0 && qta > 0 ? Math.round(qta * (prezzo - medio) * 100) / 100 : 0;

  const { enabled, sogliaPerc, minimoEuro } = cfg.rincaroAcquisti;
  const rincaro =
    enabled &&
    medio > 0 &&
    prezzo > 0 &&
    qta > 0 &&
    prezzo > medio * (1 + sogliaPerc / 100) &&
    spesaInPiu >= minimoEuro;

  return {
    rincaro,
    scostamentoPerc,
    spesaInPiu,
    messaggio: rincaro
      ? `Pagato ${scostamentoPerc.toFixed(1)}% sopra il costo medio della giacenza: € ${spesaInPiu.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} di spesa in più su questo carico.`
      : null,
  };
}
