/**
 * Simulatore ROI di vendita — modello di calcolo (puro, testabile, riusabile).
 *
 * Strumento che il venditore usa DURANTE la trattativa per mostrare al cliente
 * quanto gli costa NON cambiare e che EdiliziaInCloud "non costa, fa guadagnare".
 *
 * Tutto il calcolo vive qui (nessuna logica nel componente) così è condiviso fra
 * la pagina standalone, il dialog dal deal e — round 2 — la generazione PDF/email.
 * `RoiInputs` → persistito in `crm_roi_simulations.inputs`,
 * `RoiResults` → persistito in `crm_roi_simulations.results`.
 */

/** Voci di tempo perso/settimana, spacchettate per attività. */
export interface RoiHoursBreakdown {
  /** Fatturazione & DDT */
  fatturazione: number;
  /** Preventivi */
  preventivi: number;
  /** Gestione cantieri */
  cantieri: number;
  /** Ricerca documenti */
  ricercaDocumenti: number;
  /** Doppie immissioni dati */
  doppieImmissioni: number;
}

/** Assunzioni regolabili del modello (pannello "avanzate"). */
export interface RoiAssumptions {
  /** % di tempo recuperato con EdiliziaInCloud (0..1). Default 0.70 */
  risparmioTempo: number;
  /** % di errori/ritardi evitati con EdiliziaInCloud (0..1). Default 0.80 */
  risparmioErrori: number;
  /** Settimane lavorative/anno usate per annualizzare le ore. Default 47 */
  settimaneAnno: number;
}

/** Input grezzi dello scenario (ciò che il venditore inserisce/regola). */
export interface RoiInputs {
  /** Costo dei software/gestionali attuali, €/mese. */
  softwareMensile: number;
  /** Ore/settimana perse, spacchettate per attività. */
  hours: RoiHoursBreakdown;
  /** Costo orario medio del personale, €. */
  costoOrario: number;
  /** Costo annuo stimato di errori e ritardi, €/anno. */
  erroriAnnui: number;
  /** Canone EdiliziaInCloud, €/mese (default = piano reale). */
  abbonamentoMensile: number;
  /** Assunzioni regolabili. */
  assumptions: RoiAssumptions;
}

/** Output calcolato dello scenario. */
export interface RoiResults {
  // ── Costo attuale (senza EdiliziaInCloud) ──
  softwareAnnuo: number;
  oreSettimanaTotali: number;
  costoTempoAnnuo: number;
  costoErroriAnnuo: number;
  costoAttualeAnnuo: number;
  // ── Con EdiliziaInCloud ──
  abbonamentoAnnuo: number;
  costoTempoConEic: number;
  costoErroriConEic: number;
  costoConEicAnnuo: number;
  // ── Guadagno ──
  /** Risparmio netto/anno = costoAttuale − costoConEic (può essere negativo). */
  risparmioAnnuo: number;
  /** Risparmio mensile equivalente. */
  risparmioMensile: number;
  /** Giorni per ripagare il canone annuo col risparmio. 0 se non ripaga. */
  paybackGiorni: number;
  /** ROI % = risparmioNetto / costoAnnuoEiC. 0 se costo EiC = 0. */
  roiPercent: number;
}

export const DEFAULT_ASSUMPTIONS: RoiAssumptions = {
  risparmioTempo: 0.7,
  risparmioErrori: 0.8,
  settimaneAnno: 47,
};

/**
 * Input di default ragionevoli per una piccola impresa edile italiana.
 * `abbonamentoMensile` viene tipicamente sovrascritto dal prezzo del piano reale.
 */
export const DEFAULT_INPUTS: RoiInputs = {
  softwareMensile: 80,
  hours: {
    fatturazione: 3,
    preventivi: 3,
    cantieri: 2,
    ricercaDocumenti: 2,
    doppieImmissioni: 2,
  },
  costoOrario: 25,
  erroriAnnui: 3000,
  abbonamentoMensile: 149,
  assumptions: { ...DEFAULT_ASSUMPTIONS },
};

/** Fallback usato quando il prezzo del piano reale non è disponibile. */
export const DEFAULT_PLAN_PRICE_MONTHLY = DEFAULT_INPUTS.abbonamentoMensile;

/** Clamp difensivo: nessun NaN/negativo entra nel calcolo. */
function num(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Clamp 0..1 per le percentuali di risparmio. */
function pct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function sumHours(hours: RoiHoursBreakdown): number {
  return (
    num(hours.fatturazione) +
    num(hours.preventivi) +
    num(hours.cantieri) +
    num(hours.ricercaDocumenti) +
    num(hours.doppieImmissioni)
  );
}

/**
 * Calcola lo scenario ROI. Funzione PURA, nessun side-effect, mai NaN né
 * divisione per zero (il payback è 0 quando il risparmio è ≤ 0).
 */
export function computeRoi(inputs: RoiInputs): RoiResults {
  const settimane = num(inputs.assumptions?.settimaneAnno) || DEFAULT_ASSUMPTIONS.settimaneAnno;
  const risparmioTempo = pct(inputs.assumptions?.risparmioTempo ?? DEFAULT_ASSUMPTIONS.risparmioTempo);
  const risparmioErrori = pct(inputs.assumptions?.risparmioErrori ?? DEFAULT_ASSUMPTIONS.risparmioErrori);

  // ── Costo attuale ──
  const softwareAnnuo = num(inputs.softwareMensile) * 12;
  const oreSettimanaTotali = sumHours(inputs.hours);
  const costoTempoAnnuo = oreSettimanaTotali * settimane * num(inputs.costoOrario);
  const costoErroriAnnuo = num(inputs.erroriAnnui);
  const costoAttualeAnnuo = softwareAnnuo + costoTempoAnnuo + costoErroriAnnuo;

  // ── Con EdiliziaInCloud ──
  // Il vecchio software viene sostituito → costo software residuo = 0.
  const abbonamentoAnnuo = num(inputs.abbonamentoMensile) * 12;
  const costoTempoConEic = costoTempoAnnuo * (1 - risparmioTempo);
  const costoErroriConEic = costoErroriAnnuo * (1 - risparmioErrori);
  const costoConEicAnnuo = abbonamentoAnnuo + costoTempoConEic + costoErroriConEic;

  // ── Guadagno ──
  const risparmioAnnuo = costoAttualeAnnuo - costoConEicAnnuo;
  const risparmioMensile = risparmioAnnuo / 12;
  // Payback: quanti giorni di risparmio servono a coprire il canone annuo.
  // Definito solo se c'è un risparmio positivo (altrimenti non si ripaga mai).
  const paybackGiorni =
    risparmioAnnuo > 0 ? Math.round((365 * abbonamentoAnnuo) / risparmioAnnuo) : 0;
  const roiPercent = costoConEicAnnuo > 0 ? (risparmioAnnuo / costoConEicAnnuo) * 100 : 0;

  return {
    softwareAnnuo,
    oreSettimanaTotali,
    costoTempoAnnuo,
    costoErroriAnnuo,
    costoAttualeAnnuo,
    abbonamentoAnnuo,
    costoTempoConEic,
    costoErroriConEic,
    costoConEicAnnuo,
    risparmioAnnuo,
    risparmioMensile,
    paybackGiorni,
    roiPercent,
  };
}
