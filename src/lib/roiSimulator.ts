/**
 * Simulatore ROI di vendita — modello di calcolo (puro, testabile, riusabile).
 *
 * Strumento che il venditore usa DURANTE la trattativa per mostrare al cliente
 * quanto gli costa NON cambiare e che EdiliziaInCloud "non costa, fa guadagnare".
 *
 * EVOLUZIONE (round controllo di gestione): il modello non è più un generico
 * calcolatore di "ore perse". La proposta di valore è ancorata alle FUNZIONI
 * reali di EdiliziaInCloud e la leva dominante è il **margine recuperato** grazie
 * al controllo di gestione in tempo reale (commesse, conto economico, bilanci) —
 * tipicamente l'1–3% del fatturato. Le altre leve (tempo amministrativo, rischi
 * evitati, software eliminato, eventuale crescita) si sommano sopra.
 *
 * Tutto il calcolo vive qui (nessuna logica nel componente) così è condiviso fra
 * la pagina standalone, il dialog dal deal e la generazione PDF/email.
 * `RoiInputs` → persistito in `crm_roi_simulations.inputs`,
 * `RoiResults` → persistito in `crm_roi_simulations.results` (schema jsonb
 * flessibile: i campi nuovi non richiedono migrazioni).
 *
 * COMPAT: `RoiResults` continua a esporre gli alias legacy
 * (`softwareAnnuo`, `oreSettimanaTotali`, `costoErroriAnnuo`, `costoAttualeAnnuo`,
 * `costoConEicAnnuo`, `risparmioAnnuo`, `risparmioMensile`, `paybackGiorni`) così
 * il generatore PDF/email del round precedente continua a funzionare senza
 * modifiche. Il round PDF potrà passare ad enumerare `leve[]`.
 */

/** Una leva di valore del breakdown "Da dove arriva il valore". */
export interface RoiLeva {
  /** Chiave stabile (margine | tempo | rischio | software | crescita). */
  key: "margine" | "tempo" | "rischio" | "software" | "crescita";
  /** Titolo leggibile della leva. */
  label: string;
  /** Funzione reale di EdiliziaInCloud che genera questo valore. */
  funzione: string;
  /** Valore annuo €. */
  valore: number;
}

/** Input grezzi dello scenario (ciò che il venditore inserisce/regola). */
export interface RoiInputs {
  // ── La tua azienda ──
  /** Fatturato annuo €. Base della leva "margine recuperato". */
  fatturatoAnnuo: number;
  /** Margine medio attuale % (solo contesto, non entra nel calcolo). */
  marginePct: number;
  /** Costo dell'intero stack di strumenti/abbonamenti attuali, €/mese
   * (gestionale, marketing, email/SMS/WhatsApp, CRM, timbrature, call center…),
   * tutti eliminati con EiC. */
  softwareMensile: number;

  // ── Tempo perso ogni settimana (ore) ──
  oreFatturazione: number;
  orePreventivi: number;
  oreCantieri: number;
  oreRicercaDocumenti: number;
  oreDoppieImmissioni: number;

  // ── Costi / rischi ──
  /** Costo orario medio del personale, €. */
  costoOrario: number;
  /** Costo annuo stimato di errori, sanzioni e ritardi, €/anno. */
  erroriAnnui: number;

  // ── Investimento ──
  /** Canone EdiliziaInCloud, €/mese (default = piano reale). */
  abbonamentoMensile: number;

  // ── Crescita (opzionale, dietro toggle) ──
  /** Abilita la leva crescita (più lavori vinti). */
  abilitaCrescita: boolean;
  /** Preventivi emessi al mese. */
  preventiviMese: number;
  /** Valore medio di un preventivo, €. */
  valoreMedioPreventivo: number;
  /** Tasso di chiusura attuale, %. */
  tassoChiusuraPct: number;
  /** Incremento % di preventivi grazie a velocità/professionalità. */
  upliftPreventiviPct: number;

  // ── Assunzioni regolabili (pannello avanzate) ──
  /** Settimane lavorative/anno usate per annualizzare le ore. */
  settimaneAnno: number;
  /** % di tempo amministrativo recuperato con EiC (0..100). */
  pctTempoRecuperato: number;
  /** % di errori/sanzioni/ritardi evitati con EiC (0..100). */
  pctRischioEvitato: number;
  /** % del fatturato recuperata come margine col controllo di gestione (0..10). */
  pctMargineRecuperato: number;
}

/** Output calcolato dello scenario. */
export interface RoiResults {
  // ── Tempo / leve base ──
  /** Somma delle 5 voci di tempo perso, h/settimana. */
  oreSettimana: number;
  /** Valore del tempo amministrativo recuperato, €/anno. */
  valoreTempo: number;
  /** Margine recuperato col controllo di gestione, €/anno (leva principale). */
  valoreMargine: number;
  /** Errori/sanzioni/ritardi evitati, €/anno. */
  valoreRischio: number;
  /** Più lavori vinti (0 se la crescita è disattivata), €/anno. */
  valoreCrescita: number;
  /** Software/gestionali eliminati, €/anno. */
  softwareEliminato: number;

  // ── Aggregati ──
  /** Canone EiC annuo, €. */
  canoneAnno: number;
  /** Valore generato = tempo + margine + rischio + crescita, €/anno. */
  valoreGeneratoAnnuo: number;
  /** "Quanto ti costa restare com'è" = valore generato + software, €/anno. */
  costoInazioneAnnuo: number;

  // ── Guadagno ──
  /** Guadagno netto = costo dell'inazione − canone, €/anno. */
  guadagnoNettoAnnuo: number;
  /** Guadagno netto mensile equivalente. */
  guadagnoNettoMensile: number;
  /** Guadagno netto giornaliero equivalente. */
  guadagnoNettoGiornaliero: number;
  /** ROI: ogni 1€ investito ne genera X. 0 se canone = 0. */
  roiMultiplo: number;
  /** Giorni per ripagare il canone annuo. 0 se non si ripaga. */
  paybackGiorni: number;

  /** Breakdown ordinato per valore decrescente (cuore della UI/PDF). */
  leve: RoiLeva[];

  // ── Alias legacy (compat PDF/email round 1) ──
  /** = softwareEliminato */
  softwareAnnuo: number;
  /** = oreSettimana */
  oreSettimanaTotali: number;
  /** = valoreRischio */
  costoErroriAnnuo: number;
  /** = costoInazioneAnnuo */
  costoAttualeAnnuo: number;
  /** = canoneAnno (con EiC paghi solo il canone, tutto il resto è recuperato) */
  costoConEicAnnuo: number;
  /** = guadagnoNettoAnnuo */
  risparmioAnnuo: number;
  /** = guadagnoNettoMensile */
  risparmioMensile: number;
}

/** Valori di default delle assunzioni regolabili. */
export const DEFAULT_ASSUMPTIONS = {
  settimaneAnno: 47,
  pctTempoRecuperato: 65,
  pctRischioEvitato: 80,
  pctMargineRecuperato: 2.0,
} as const;

/**
 * Input di default ragionevoli per una piccola impresa edile italiana.
 * `abbonamentoMensile` viene tipicamente sovrascritto dal prezzo del piano reale.
 */
export const DEFAULT_INPUTS: RoiInputs = {
  // Azienda
  fatturatoAnnuo: 400000,
  marginePct: 12,
  // Stack realistico oggi: gestionale + marketing + email/SMS/WhatsApp + CRM +
  // timbrature + call center → tutti sostituiti da EdiliziaInCloud.
  softwareMensile: 180,
  // Tempo perso (h/sett)
  oreFatturazione: 3,
  orePreventivi: 3,
  oreCantieri: 2,
  oreRicercaDocumenti: 2,
  oreDoppieImmissioni: 2,
  // Costi / rischi
  costoOrario: 25,
  erroriAnnui: 3000,
  // Investimento
  abbonamentoMensile: 149,
  // Crescita (opzionale)
  abilitaCrescita: false,
  preventiviMese: 8,
  valoreMedioPreventivo: 15000,
  tassoChiusuraPct: 25,
  upliftPreventiviPct: 20,
  // Assunzioni
  settimaneAnno: DEFAULT_ASSUMPTIONS.settimaneAnno,
  pctTempoRecuperato: DEFAULT_ASSUMPTIONS.pctTempoRecuperato,
  pctRischioEvitato: DEFAULT_ASSUMPTIONS.pctRischioEvitato,
  pctMargineRecuperato: DEFAULT_ASSUMPTIONS.pctMargineRecuperato,
};

/** Fallback usato quando il prezzo del piano reale non è disponibile. */
export const DEFAULT_PLAN_PRICE_MONTHLY = DEFAULT_INPUTS.abbonamentoMensile;

/** Clamp difensivo: nessun NaN/negativo/Infinity entra nel calcolo. */
function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Clamp percentuale in [0, max]. Default max 100. */
function pct(value: unknown, max = 100): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n > max ? max : n;
}

/** Somma le 5 voci di tempo perso (h/settimana), con clamp difensivo. */
export function sumHours(inputs: Partial<RoiInputs>): number {
  return (
    num(inputs.oreFatturazione) +
    num(inputs.orePreventivi) +
    num(inputs.oreCantieri) +
    num(inputs.oreRicercaDocumenti) +
    num(inputs.oreDoppieImmissioni)
  );
}

/**
 * Calcola lo scenario ROI. Funzione PURA, nessun side-effect, mai NaN né
 * divisione per zero. Tutti gli input sono clampati difensivamente, così
 * tollera anche simulazioni salvate legacy/parziali (campi mancanti → default).
 */
export function computeRoi(inputs: Partial<RoiInputs>): RoiResults {
  // ── Assunzioni (con fallback ai default se mancanti) ──
  const settimaneAnno = num(inputs.settimaneAnno) || DEFAULT_ASSUMPTIONS.settimaneAnno;
  const pctTempoRecuperato = pct(inputs.pctTempoRecuperato ?? DEFAULT_ASSUMPTIONS.pctTempoRecuperato);
  const pctRischioEvitato = pct(inputs.pctRischioEvitato ?? DEFAULT_ASSUMPTIONS.pctRischioEvitato);
  const pctMargineRecuperato = pct(
    inputs.pctMargineRecuperato ?? DEFAULT_ASSUMPTIONS.pctMargineRecuperato,
    10, // il margine recuperato è 0..10% del fatturato, non 0..100
  );

  // ── Leve di valore ──
  const oreSettimana = sumHours(inputs);
  const valoreTempo = oreSettimana * settimaneAnno * num(inputs.costoOrario) * (pctTempoRecuperato / 100);
  // Leva principale: margine recuperato col controllo di gestione (% del fatturato).
  const valoreMargine = num(inputs.fatturatoAnnuo) * (pctMargineRecuperato / 100);
  const valoreRischio = num(inputs.erroriAnnui) * (pctRischioEvitato / 100);
  const valoreCrescita = inputs.abilitaCrescita
    ? num(inputs.preventiviMese) * 12 * (pct(inputs.upliftPreventiviPct) / 100) *
      num(inputs.valoreMedioPreventivo) * (pct(inputs.tassoChiusuraPct) / 100)
    : 0;

  const softwareEliminato = num(inputs.softwareMensile) * 12;
  const canoneAnno = num(inputs.abbonamentoMensile) * 12;

  // ── Aggregati ──
  const valoreGeneratoAnnuo = valoreTempo + valoreMargine + valoreRischio + valoreCrescita;
  const costoInazioneAnnuo = valoreGeneratoAnnuo + softwareEliminato;

  // ── Guadagno ──
  const guadagnoNettoAnnuo = costoInazioneAnnuo - canoneAnno;
  const guadagnoNettoMensile = guadagnoNettoAnnuo / 12;
  const guadagnoNettoGiornaliero = guadagnoNettoAnnuo / 365;
  const roiMultiplo = canoneAnno > 0 ? guadagnoNettoAnnuo / canoneAnno : 0;
  const paybackGiorni =
    canoneAnno > 0 && guadagnoNettoAnnuo > 0
      ? Math.round((365 * canoneAnno) / guadagnoNettoAnnuo)
      : 0;

  // ── Breakdown "Da dove arriva il valore" (ordinato per valore decrescente) ──
  const leve: RoiLeva[] = [
    {
      key: "margine",
      label: "Controllo di gestione e margini",
      funzione: "Commesse, conto economico, bilanci e controllo di gestione in tempo reale",
      valore: valoreMargine,
    },
    {
      key: "tempo",
      label: "Tempo amministrativo recuperato",
      funzione: "Fatturazione, DDT, preventivi, rapportini di cantiere, timbrature, magazzino, prima nota",
      valore: valoreTempo,
    },
    {
      key: "rischio",
      label: "Errori, sanzioni e ritardi evitati",
      funzione: "Scadenzario, compliance SDI, gestione permessi e documenti",
      valore: valoreRischio,
    },
    {
      key: "software",
      label: "Strumenti e abbonamenti eliminati",
      funzione: "Un'unica piattaforma al posto di gestionale, marketing, email/SMS/WhatsApp, CRM, timbrature, call center",
      valore: softwareEliminato,
    },
  ];
  if (valoreCrescita > 0) {
    leve.push({
      key: "crescita",
      label: "Più lavori vinti",
      funzione: "Marketing, pubblicità AI, social, email/SMS/WhatsApp e call center che portano nuovi clienti",
      valore: valoreCrescita,
    });
  }
  leve.sort((a, b) => b.valore - a.valore);

  return {
    oreSettimana,
    valoreTempo,
    valoreMargine,
    valoreRischio,
    valoreCrescita,
    softwareEliminato,
    canoneAnno,
    valoreGeneratoAnnuo,
    costoInazioneAnnuo,
    guadagnoNettoAnnuo,
    guadagnoNettoMensile,
    guadagnoNettoGiornaliero,
    roiMultiplo,
    paybackGiorni,
    leve,
    // ── Alias legacy ──
    softwareAnnuo: softwareEliminato,
    oreSettimanaTotali: oreSettimana,
    costoErroriAnnuo: valoreRischio,
    costoAttualeAnnuo: costoInazioneAnnuo,
    costoConEicAnnuo: canoneAnno,
    risparmioAnnuo: guadagnoNettoAnnuo,
    risparmioMensile: guadagnoNettoMensile,
  };
}
