export type FvQualityLevel = "ok" | "warning" | "critical";

export interface FvTemplateQualityItem {
  level: FvQualityLevel;
  title: string;
  detail: string;
  section?: string;
}

export interface FvGaranziaConversione {
  titolo: string;
  descrizione: string;
  icona?: "shield" | "award" | "clock" | "tools" | "battery" | "sun" | "custom";
}

export interface FvFaqItem {
  domanda: string;
  risposta: string;
}

export interface FvUspItem {
  titolo: string;
  descrizione: string;
}

export interface FvCronoprogrammaFase {
  fase: string;
  durata: string;
  descrizione: string;
}

export interface FvListinoMacrocategoriaMedia {
  nome?: string | null;
  descrizione?: string | null;
  descrizione_estesa?: string | null;
  immagine_url?: string | null;
  verticali_abilitati?: string[] | null;
  attivo?: boolean | null;
}

export interface FvTemplateQualityInput {
  presentazione_impresa_html?: string | null;
  valore_proposta_html?: string | null;
  recensioni?: Array<Record<string, unknown>> | null;
  certificazioni?: Array<Record<string, unknown>> | null;
  cantieri_galleria?: Array<Record<string, unknown>> | null;
  garanzie_conversione?: FvGaranziaConversione[] | null;
  faq_items?: FvFaqItem[] | null;
  condizioni_legali_attivo?: boolean | null;
  condizioni_legali_testo?: string | null;
  margine_target_pct?: number | null;
  costo_kwp_base?: number | null;
  costo_accumulo_kwh?: number | null;
  costo_pratiche_default?: number | null;
  manutenzione_annua_eur?: number | null;
  cpl_max_sostenibile?: number | null;
  capacita_installazioni_mese?: number | null;
  zona_servita_note?: string | null;
  noleggio_operativo_attivo?: boolean | null;
  noleggio_durata_default_mesi?: number | null;
  noleggio_fattore_default?: number | null;
  noleggio_aliquota_fiscale_pct?: number | null;
  noleggio_note_legali?: string | null;
  listino_macrocategorie_fv?: FvListinoMacrocategoriaMedia[] | null;
}

// I testi di serie del modello Fotovoltaico: li legge il cliente finché l'azienda non
// li cambia. Riscritti il 22/09/2026 in parole semplici e senza promesse che l'azienda
// potrebbe non mantenere: prima c'erano «Reperibilità 7 giorni su 7, linea diretta con
// il titolare per tutta la vita dell'impianto», un «Albo installatori GSE», «KYC online
// 5 minuti», sigle (CILA, TICA, RID, payback) e, fra le domande, una nota per l'azienda
// («Il PDF deve indicare quali pratiche sono incluse…») stampata al cliente.
export const DEFAULT_FV_GARANZIE: FvGaranziaConversione[] = [
  {
    icona: "sun",
    titolo: "Produzione stimata su dati dichiarati",
    descrizione: "La calcoliamo sull'irraggiamento della tua zona e sul tuo tetto, e nel preventivo scriviamo da dove arrivano i numeri.",
  },
  {
    icona: "tools",
    titolo: "Sopralluogo tecnico prima dell'ordine",
    descrizione: "Misure, fissaggi, passaggio dei cavi e quadro elettrico si verificano sul posto, prima di ordinare i componenti.",
  },
  {
    icona: "battery",
    titolo: "Batteria dimensionata sui tuoi consumi",
    descrizione: "La proponiamo quando i consumi della sera la ripagano. Se non conviene, te lo diciamo.",
  },
  {
    icona: "shield",
    titolo: "Pratiche e documenti tracciati",
    descrizione: "Sai sempre a che punto è ogni pratica, e alla fine ricevi tutti i documenti dell'impianto.",
  },
];

export const DEFAULT_FV_FAQ: FvFaqItem[] = [
  {
    domanda: "Il risparmio indicato è garantito?",
    risposta: "No: è una stima calcolata sui tuoi consumi, sull'irraggiamento della zona e sulle ipotesi scritte nel preventivo. Il sopralluogo conferma i dati tecnici.",
  },
  {
    domanda: "Conviene sempre aggiungere la batteria?",
    risposta: "No. La consigliamo quando si consuma molto la sera e il risparmio in più ripaga la spesa in tempi ragionevoli.",
  },
  {
    domanda: "E se il tetto non è adatto?",
    risposta: "Il preventivo resta in attesa della verifica tecnica: non ordiniamo nulla finché i dubbi sul tetto non sono risolti.",
  },
  {
    domanda: "Le pratiche sono comprese?",
    risposta: "Nel preventivo trovi le pratiche comprese nel prezzo. Se per il tuo impianto ne serve un'altra, te lo scriviamo prima della firma.",
  },
];

export const DEFAULT_FV_USP: FvUspItem[] = [
  {
    titolo: "Un referente dall'inizio alla fine",
    descrizione: "La stessa persona ti segue dal sopralluogo all'allaccio, e resta il tuo contatto anche dopo.",
  },
  {
    titolo: "Le pratiche le seguiamo noi",
    descrizione: "Comune, distributore di rete e GSE: prepariamo e inviamo i documenti, tu firmi solo quello che serve.",
  },
  {
    titolo: "Installatori abilitati",
    descrizione: "L'impianto lo montano tecnici abilitati agli impianti elettrici, con la qualifica per le fonti rinnovabili.",
  },
  {
    titolo: "Assistenza dopo l'installazione",
    descrizione: "Se l'impianto produce meno del previsto o l'app segnala un errore, ci chiami e interveniamo.",
  },
];

export const DEFAULT_FV_CRONOPROGRAMMA: FvCronoprogrammaFase[] = [
  {
    fase: "Firma e avvio delle pratiche",
    durata: "Settimana 1",
    descrizione: "Prepariamo e inviamo le pratiche per il Comune e la richiesta di allaccio al distributore di rete.",
  },
  {
    fase: "Sopralluogo e progetto definitivo",
    durata: "Settimana 1-2",
    descrizione: "Verifichiamo tetto, fissaggi e quadro elettrico e confermiamo il progetto dell'impianto.",
  },
  {
    fase: "Ordine dei componenti",
    durata: "Settimana 3-4",
    descrizione: "Ordiniamo pannelli, inverter ed eventuale batteria e li controlliamo prima della posa.",
  },
  {
    fase: "Installazione",
    durata: "Settimana 5",
    descrizione: "Pannelli sul tetto, inverter, batteria e quadro: di solito bastano uno o due giorni di lavoro.",
  },
  {
    fase: "Allaccio e collaudo",
    durata: "Settimana 6-8",
    descrizione: "Il distributore collega l'impianto alla rete; noi lo collaudiamo e attiviamo la convenzione con il GSE per l'energia che immetti in rete.",
  },
  {
    fase: "Consegna dei documenti",
    durata: "Alla fine dei lavori",
    descrizione: "Ti consegniamo i documenti per la detrazione, le garanzie e il manuale, e ti mostriamo l'app di monitoraggio.",
  },
];

export type FvCommercialStatus = "ready" | "review" | "blocked";

export interface FvCommercialIssue {
  code:
    | "missing_consumption"
    | "low_consumption"
    | "missing_roof_data"
    | "roof_capacity_exceeded"
    | "missing_price_list"
    | "missing_labor_rate"
    | "mock_roof_data"
    | "oversized_without_storage"
    | "weak_payback"
    | "low_margin";
  level: "critical" | "warning";
  message: string;
}

export interface FvCommercialReadinessInput {
  consumo_annuo_kwh: number | null;
  costo_kwh_attuale: number | null;
  potenza_kwp: number | null;
  potenza_max_kwp: number | null;
  numero_pannelli_scelti: number | null;
  numero_pannelli_max: number | null;
  produzione_annua_stimata_kwh: number | null;
  con_accumulo: boolean;
  capacita_accumulo_kwh?: number | null;
  listinoCompleto: boolean;
  tariffaInstallazioneConfigurata: boolean;
  tettoMock: boolean;
  payback_anni?: number | null;
  margine_pct?: number | null;
}

export interface FvCommercialReadiness {
  status: FvCommercialStatus;
  score: number;
  issues: FvCommercialIssue[];
  nextAction: string;
}

export interface FvEconomicsGuardInput {
  prezzo_vendita_netto?: number | null;
  costo_totale_netto?: number | null;
  margine_eur?: number | null;
  margine_pct?: number | null;
  margine_target_pct?: number | null;
  cpl_max_sostenibile?: number | null;
  payback_anni?: number | null;
  rata_mensile_eur?: number | null;
  risparmio_mensile_eur?: number | null;
  /** Righe vendute senza costo d'acquisto: il margine non si conosce. */
  costi_incompleti?: boolean | null;
}

export interface FvEconomicsGuardIssue {
  code:
    | "missing_costs"
    | "missing_margin_target"
    | "margin_below_target"
    | "missing_cpl_limit"
    | "cpl_too_high_for_margin"
    | "weak_payback"
    | "monthly_cashflow_gap";
  level: "critical" | "warning";
  message: string;
}

export interface FvEconomicsGuard {
  status: FvCommercialStatus;
  score: number;
  issues: FvEconomicsGuardIssue[];
  metrics: {
    margine_eur: number | null;
    margine_pct: number | null;
    margine_target_pct: number | null;
    margine_delta_pct: number | null;
    cpl_max_sostenibile: number | null;
    cpl_to_margin_ratio: number | null;
    costo_netto_mensile: number | null;
  };
  nextAction: string;
}

export type FvRentalStatus = "recommended" | "review" | "not_eligible";

export interface FvNoleggioOperativoInput {
  archetipo?: string | null;
  investimentoNetto?: number | null;
  risparmioAnno1?: number | null;
  durataMesi?: number | null;
  manutenzioneAnnua?: number | null;
  aliquotaRisparmioFiscale?: number | null;
  fattoreCanone?: number | null;
}

export interface FvNoleggioOperativoScenario {
  eligible: boolean;
  status: FvRentalStatus;
  durata_mesi: number;
  anticipo_eur: number;
  canone_mensile: number;
  risparmio_mensile: number;
  beneficio_fiscale_mensile: number;
  manutenzione_inclusa_mensile: number;
  costo_effettivo_mensile: number;
  copertura_canone_pct: number;
  nextAction: string;
}

export type FvServiceRowTipo =
  | "pratica_gse"
  | "allaccio_e_distribuzione"
  | "asseverazione"
  | "smaltimento_amianto"
  | "opere_edili_accessorie"
  | "smaltimento_imballaggi"
  | "oneri_sicurezza"
  | "altro";

export interface FvServiceCatalogItem {
  codice: string;
  descrizione: string;
  prezzo_netto_default: number;
  margine_pct_default?: number | null;
  note_operative?: string | null;
  ordinamento?: number | null;
}

export interface FvServiceRow {
  tipo: FvServiceRowTipo;
  descrizione: string;
  quantita: number;
  prezzo_netto: number;
  prezzo_vendita: number;
  ordinamento: number;
  note_operative: string | null;
}

export function shouldSuggestFvAccumulo(profiloConsumo: string | null | undefined): boolean {
  return profiloConsumo === "sera" || profiloConsumo === "misto";
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundRatio(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function calcolaFvEconomicsGuard(input: FvEconomicsGuardInput): FvEconomicsGuard {
  const venditaNetta = finiteNumber(input.prezzo_vendita_netto);
  const costoNetto = finiteNumber(input.costo_totale_netto);
  // Senza costi d'acquisto (listino senza prezzi, kit, prezzo a corpo) il margine
  // non si conosce: resta vuoto invece di uscire da un costo inventato.
  const costiNoti = costoNetto != null && costoNetto > 0 && !input.costi_incompleti;
  const margineEur = !costiNoti
    ? null
    : finiteNumber(input.margine_eur) ??
      (venditaNetta != null && costoNetto != null ? roundMoney(venditaNetta - costoNetto) : null);
  const marginePct = !costiNoti
    ? null
    : finiteNumber(input.margine_pct) ??
      (venditaNetta != null && venditaNetta > 0 && margineEur != null
        ? roundRatio(margineEur / venditaNetta)
        : null);
  const targetPct = finiteNumber(input.margine_target_pct);
  const cplMax = finiteNumber(input.cpl_max_sostenibile);
  const payback = finiteNumber(input.payback_anni);
  const rata = finiteNumber(input.rata_mensile_eur);
  const risparmioMensile = finiteNumber(input.risparmio_mensile_eur);
  const costoNettoMensile =
    rata != null && risparmioMensile != null ? Math.max(0, roundMoney(rata - risparmioMensile)) : null;
  const marginDeltaPct =
    marginePct != null && targetPct != null ? roundRatio(marginePct - targetPct) : null;
  const cplToMarginRatio =
    cplMax != null && margineEur != null && margineEur > 0 ? roundRatio(cplMax / margineEur) : null;

  const issues: FvEconomicsGuardIssue[] = [];

  // Si preventiva anche senza listino: blocca solo la mancanza del prezzo, non
  // quella dei costi d'acquisto (senza, il margine resta semplicemente vuoto).
  if (venditaNetta == null || venditaNetta <= 0) {
    issues.push({
      code: "missing_costs",
      level: "critical",
      message: "Manca il prezzo di vendita: scrivi il prezzo a corpo o ricalcola lo scenario prima di emettere.",
    });
  }

  if (targetPct == null || targetPct <= 0) {
    issues.push({
      code: "missing_margin_target",
      level: "warning",
      message: "Margine target non configurato nel template FV.",
    });
  } else if (marginePct != null && marginePct < targetPct) {
    issues.push({
      code: "margin_below_target",
      level: targetPct - marginePct >= 0.05 ? "critical" : "warning",
      message: `Margine ${(marginePct * 100).toFixed(1)}% sotto target ${(targetPct * 100).toFixed(1)}%.`,
    });
  }

  if (cplMax == null || cplMax <= 0) {
    issues.push({
      code: "missing_cpl_limit",
      level: "warning",
      message: "CPL massimo sostenibile non impostato: non collegare questa offerta alle campagne.",
    });
  } else if (cplToMarginRatio != null && cplToMarginRatio > 0.25) {
    issues.push({
      code: "cpl_too_high_for_margin",
      level: "critical",
      message: "Il CPL massimo assorbe oltre il 25% del margine lordo: rischio scala non sostenibile.",
    });
  }

  if (payback != null && payback > 12) {
    issues.push({
      code: "weak_payback",
      level: "warning",
      message: "Payback oltre 12 anni: offerta fragile in trattativa e retargeting.",
    });
  }

  if (costoNettoMensile != null && costoNettoMensile > 250) {
    issues.push({
      code: "monthly_cashflow_gap",
      level: costoNettoMensile > 400 ? "critical" : "warning",
      message: "La rata resta molto piu alta del risparmio mensile: prepara gestione obiezione prezzo.",
    });
  }

  const critical = issues.filter((issue) => issue.level === "critical").length;
  const warnings = issues.filter((issue) => issue.level === "warning").length;
  const status: FvCommercialStatus =
    critical > 0 ? "blocked" : warnings >= 2 ? "review" : "ready";
  const score = Math.max(0, 100 - critical * 35 - warnings * 10);
  const nextAction =
    status === "blocked"
      ? "Blocca emissione o scala budget finche' margine, CPL e payback non tornano."
      : status === "review"
        ? "Rivedi offerta, finanziamento o messaggio commerciale prima di aumentare budget."
        : "Puoi scalare campagne e inviare l'offerta con controllo economico coerente.";

  return {
    status,
    score,
    issues,
    metrics: {
      margine_eur: margineEur,
      margine_pct: marginePct,
      margine_target_pct: targetPct,
      margine_delta_pct: marginDeltaPct,
      cpl_max_sostenibile: cplMax,
      cpl_to_margin_ratio: cplToMarginRatio,
      costo_netto_mensile: costoNettoMensile,
    },
    nextAction,
  };
}

const FV_RENTAL_ARCHETYPES = new Set(["pmi", "industriale_grande", "condominio", "cer"]);

export function calcolaFvNoleggioOperativo(
  input: FvNoleggioOperativoInput,
): FvNoleggioOperativoScenario {
  const durata = Math.max(36, Math.min(144, Math.round(finiteNumber(input.durataMesi) ?? 84)));
  const investimento = Math.max(0, finiteNumber(input.investimentoNetto) ?? 0);
  const risparmioMensile = roundMoney(Math.max(0, finiteNumber(input.risparmioAnno1) ?? 0) / 12);
  const manutenzioneMensile = roundMoney(Math.max(0, finiteNumber(input.manutenzioneAnnua) ?? 0) / 12);
  const aliquotaFiscale = Math.min(
    0.45,
    Math.max(0, finiteNumber(input.aliquotaRisparmioFiscale) ?? 0.24),
  );
  const eligible = FV_RENTAL_ARCHETYPES.has(String(input.archetipo ?? ""));

  if (!eligible || investimento <= 0) {
    return {
      eligible: false,
      status: "not_eligible",
      durata_mesi: durata,
      anticipo_eur: 0,
      canone_mensile: 0,
      risparmio_mensile: risparmioMensile,
      beneficio_fiscale_mensile: 0,
      manutenzione_inclusa_mensile: manutenzioneMensile,
      costo_effettivo_mensile: 0,
      copertura_canone_pct: 0,
      nextAction: "Il noleggio operativo e' pensato per aziende, condomini o comunita energetiche: per privati usa cash, tasso zero o finanziamento.",
    };
  }

  // Stima prudente: canone = capitale + costo capitale/servizio + manutenzione inclusa.
  const defaultRentalFactor = durata <= 60 ? 1.12 : durata <= 84 ? 1.18 : durata <= 120 ? 1.26 : 1.34;
  const rentalFactor = Math.min(
    1.8,
    Math.max(1, finiteNumber(input.fattoreCanone) ?? defaultRentalFactor),
  );
  const canoneMensile = roundMoney((investimento * rentalFactor) / durata + manutenzioneMensile);
  const beneficioFiscaleMensile = roundMoney(canoneMensile * aliquotaFiscale);
  const costoEffettivoMensile = roundMoney(Math.max(0, canoneMensile - risparmioMensile - beneficioFiscaleMensile));
  const coperturaCanonePct =
    canoneMensile > 0 ? roundRatio((risparmioMensile + beneficioFiscaleMensile) / canoneMensile) : 0;
  const status: FvRentalStatus =
    coperturaCanonePct >= 0.9 ? "recommended" : coperturaCanonePct >= 0.65 ? "review" : "not_eligible";
  const nextAction =
    status === "recommended"
      ? "Scenario adatto a proposta aziendale: zero anticipo, canone coperto da risparmio e beneficio fiscale stimato."
      : status === "review"
        ? "Scenario da rivedere: confronta durata, canone e consumi prima di proporlo come alternativa principale."
        : "Noleggio poco sostenibile con questi numeri: il canone non e' coperto da risparmio e beneficio fiscale.";

  return {
    eligible: true,
    status,
    durata_mesi: durata,
    anticipo_eur: 0,
    canone_mensile: canoneMensile,
    risparmio_mensile: risparmioMensile,
    beneficio_fiscale_mensile: beneficioFiscaleMensile,
    manutenzione_inclusa_mensile: manutenzioneMensile,
    costo_effettivo_mensile: costoEffettivoMensile,
    copertura_canone_pct: coperturaCanonePct,
    nextAction,
  };
}

const FV_SERVICE_TYPES = new Set<FvServiceRowTipo>([
  "pratica_gse",
  "allaccio_e_distribuzione",
  "asseverazione",
  "smaltimento_amianto",
  "opere_edili_accessorie",
  "smaltimento_imballaggi",
  "oneri_sicurezza",
  "altro",
]);

function toFvServiceTipo(codice: string): FvServiceRowTipo {
  return FV_SERVICE_TYPES.has(codice as FvServiceRowTipo)
    ? (codice as FvServiceRowTipo)
    : "altro";
}

function clampMargin(value: number | null): number {
  if (value == null || !Number.isFinite(value)) return 0.35;
  return Math.min(0.8, Math.max(0, value));
}

function venditaFromNetto(netto: number, marginePct: number): number {
  if (marginePct >= 0.8) return roundMoney(netto * 5);
  return roundMoney(netto / (1 - marginePct));
}

/**
 * Costruisce le righe servizi/pratiche SOLO dal catalogo servizi FV dell'azienda.
 * Nessun valore di ripiego inventato: se il catalogo è vuoto ritorna [] (il
 * commerciale/azienda configura i servizi in anagrafica). `costoPraticheDefault`
 * è mantenuto per compatibilità di firma ma non viene più usato.
 */
export function buildFvServiceRows(input: {
  catalogo?: FvServiceCatalogItem[] | null;
  costoPraticheDefault?: number | null;
}): FvServiceRow[] {
  const catalogo = input.catalogo?.filter((item) => item.prezzo_netto_default > 0) ?? [];
  return catalogo.map((item, index) => {
    const netto = roundMoney(item.prezzo_netto_default);
    const margine = clampMargin(item.margine_pct_default ?? null);
    return {
      tipo: toFvServiceTipo(item.codice),
      descrizione: item.descrizione,
      quantita: 1,
      prezzo_netto: netto,
      prezzo_vendita: venditaFromNetto(netto, margine),
      ordinamento: item.ordinamento ?? index + 1,
      note_operative: item.note_operative ?? null,
    };
  });
}

function plainText(value: unknown): string {
  return String(value ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasReadableText(value: unknown, minLength = 12): boolean {
  return plainText(value).length >= minLength;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function inferFvProductCategory(value: unknown): "pannello" | "inverter" | "accumulo" | "other" {
  const text = plainText(value).toLowerCase();
  if (/pannell|modul|fotovolta/.test(text)) return "pannello";
  if (/inverter/.test(text)) return "inverter";
  if (/accumul|batter/.test(text)) return "accumulo";
  return "other";
}

function isActiveFvListinoMacro(value: FvListinoMacrocategoriaMedia): boolean {
  if (value.attivo === false) return false;
  const verticali = value.verticali_abilitati;
  return !Array.isArray(verticali) || verticali.length === 0 || verticali.includes("fotovoltaico");
}

export function buildFvTemplateQualityItems(
  template: FvTemplateQualityInput,
): FvTemplateQualityItem[] {
  const items: FvTemplateQualityItem[] = [];
  const garanzie = template.garanzie_conversione ?? [];
  const faq = template.faq_items ?? [];

  if (!hasReadableText(template.presentazione_impresa_html, 80)) {
    items.push({
      level: "critical",
      section: "Valore",
      title: "Presentazione azienda debole",
      detail: "Spiega esperienza, metodo di sopralluogo, gestione pratiche e post-vendita.",
    });
  }
  if (!hasReadableText(template.valore_proposta_html, 60)) {
    items.push({
      level: "warning",
      section: "Valore",
      title: "Proposta di valore da chiarire",
      detail: "Aggiungi cosa rende l'offerta diversa: analisi bolletta, payback, pratiche, garanzie.",
    });
  }
  if (arrayLength(template.recensioni) === 0 && arrayLength(template.cantieri_galleria) === 0) {
    items.push({
      level: "warning",
      section: "Fiducia",
      title: "Prova sociale assente",
      detail: "Inserisci almeno recensioni reali o cantieri galleria per ridurre diffidenza sul prezzo.",
    });
  }
  if (arrayLength(template.certificazioni) === 0) {
    items.push({
      level: "warning",
      section: "Fiducia",
      title: "Certificazioni mancanti",
      detail: "Mostra qualifiche FER, partner tecnici, certificazioni o requisiti aziendali verificabili.",
    });
  }
  if (
    garanzie.filter((g) => hasReadableText(g.titolo, 6) && hasReadableText(g.descrizione, 30))
      .length < 4
  ) {
    items.push({
      level: "critical",
      section: "Conversione",
      title: "Garanzie FV insufficienti",
      detail: "Servono almeno 4 garanzie concrete: sopralluogo, produzione, pratiche, componenti o assistenza.",
    });
  }
  if (faq.filter((f) => hasReadableText(f.domanda, 10) && hasReadableText(f.risposta, 35)).length < 4) {
    items.push({
      level: "warning",
      section: "Conversione",
      title: "FAQ obiezioni da completare",
      detail: "Anticipa dubbi su accumulo, tempi, pratiche, incentivi, garanzie e varianti.",
    });
  }
  // Dal 20/09/2026 condizioni accese e vuote non significano «senza condizioni»:
  // nel PDF esce il testo di base del fotovoltaico. Va riletto e adattato, ma il
  // documento è completo: un avviso, non un errore.
  if (template.condizioni_legali_attivo !== false && !hasReadableText(template.condizioni_legali_testo, 60)) {
    items.push({
      level: "warning",
      section: "Contratto",
      title: "Condizioni: esce il testo di base del settore",
      detail: "Rileggilo e adattalo: validita, acconto, saldo, esclusioni, sopralluogo e varianti.",
    });
  }
  if (template.margine_target_pct == null || template.margine_target_pct < 0.2) {
    items.push({
      level: "warning",
      section: "Economia",
      title: "Margine target non definito",
      detail: "Imposta un margine minimo/target per capire se l'offerta si puo' scalare.",
    });
  }
  if (template.costo_kwp_base == null || template.costo_kwp_base <= 0) {
    items.push({
      level: "warning",
      section: "Economia",
      title: "Costo base kWp mancante",
      detail: "Aggiungi un costo base per kWp per controllare subito coerenza e margine.",
    });
  }
  if (template.costo_accumulo_kwh == null || template.costo_accumulo_kwh <= 0) {
    items.push({
      level: "warning",
      section: "Economia",
      title: "Costo accumulo non impostato",
      detail: "Definisci costo/kWh accumulo per evitare offerte batteria fuori margine.",
    });
  }
  if (template.costo_pratiche_default == null || template.costo_pratiche_default <= 0) {
    items.push({
      level: "warning",
      section: "Economia",
      title: "Costo pratiche non impostato",
      detail: "GSE, distributore, dichiarazioni e documenti finali devono avere un costo default.",
    });
  }
  if (template.cpl_max_sostenibile == null || template.cpl_max_sostenibile <= 0) {
    items.push({
      level: "warning",
      section: "Marketing",
      title: "CPL massimo sostenibile mancante",
      detail: "Serve per collegare preventivatore, pubblicita e margine reale delle campagne.",
    });
  }
  if (template.capacita_installazioni_mese == null || template.capacita_installazioni_mese <= 0) {
    items.push({
      level: "warning",
      section: "Operations",
      title: "Capacita commerciale/installativa mancante",
      detail: "Indica quanti impianti puoi gestire al mese prima di scalare budget e vendite.",
    });
  }
  if (!hasReadableText(template.zona_servita_note, 8)) {
    items.push({
      level: "warning",
      section: "Marketing",
      title: "Zona servita non definita",
      detail: "Specifica comuni/province coperte per evitare offerte e campagne fuori area.",
    });
  }
  if (template.noleggio_operativo_attivo) {
    const durata = finiteNumber(template.noleggio_durata_default_mesi);
    const fattore = finiteNumber(template.noleggio_fattore_default);
    const aliquota = finiteNumber(template.noleggio_aliquota_fiscale_pct);
    if (durata == null || durata < 36 || durata > 144 || fattore == null || fattore < 1 || fattore > 1.8 || aliquota == null || aliquota <= 0 || !hasReadableText(template.noleggio_note_legali, 40)) {
      items.push({
        level: "warning",
        section: "Finanza",
        title: "Noleggio operativo da completare",
        detail: "Se lo proponi alle aziende, configura durata, fattore canone, beneficio fiscale stimato e nota legale/fiscale per il PDF.",
      });
    }
  }
  const fvListinoMacros = (template.listino_macrocategorie_fv ?? []).filter(isActiveFvListinoMacro);
  const requiredMacroCategories: Array<"pannello" | "inverter" | "accumulo"> = [
    "pannello",
    "inverter",
    "accumulo",
  ];
  const essentialMacrosReady = requiredMacroCategories.every((category) =>
    fvListinoMacros.some((macro) =>
      inferFvProductCategory(macro.nome) === category &&
      hasReadableText(macro.immagine_url, 12) &&
      (hasReadableText(macro.descrizione_estesa, 40) || hasReadableText(macro.descrizione, 40)),
    ),
  );
  if (!essentialMacrosReady) {
    items.push({
      level: "warning",
      section: "Listino",
      title: "Macro-categorie FV da completare nel listino",
      detail: "Le immagini del PDF non stanno nel template: abilita pannelli, inverter e accumulo nel listino prodotti con foto e descrizione estesa.",
    });
  }

  if (items.length === 0) {
    return [
      {
        level: "ok",
        title: "Template FV pronto",
        detail: "Contenuti, fiducia, condizioni e default economici risultano completi.",
      },
    ];
  }

  return items;
}

export function calcolaFvCommercialReadiness(
  input: FvCommercialReadinessInput,
): FvCommercialReadiness {
  const issues: FvCommercialIssue[] = [];

  if (!input.consumo_annuo_kwh || input.consumo_annuo_kwh <= 0) {
    issues.push({
      code: "missing_consumption",
      level: "critical",
      message: "Inserisci consumo annuo da bolletta o stima verificabile.",
    });
  } else if (input.consumo_annuo_kwh < 1500) {
    issues.push({
      code: "low_consumption",
      level: "warning",
      message: "Consumo basso: verifica se il cliente ha EV, pompa di calore o consumi futuri.",
    });
  }

  if (!input.potenza_max_kwp && !input.numero_pannelli_max) {
    issues.push({
      code: "missing_roof_data",
      level: "critical",
      message: "Analisi tetto non disponibile: serve Solar API, PVGIS o dato manuale.",
    });
  }

  const overKwp =
    input.potenza_kwp != null &&
    input.potenza_max_kwp != null &&
    input.potenza_kwp > input.potenza_max_kwp + 0.01;
  const overPanels =
    input.numero_pannelli_scelti != null &&
    input.numero_pannelli_max != null &&
    input.numero_pannelli_scelti > input.numero_pannelli_max;
  if (overKwp || overPanels) {
    issues.push({
      code: "roof_capacity_exceeded",
      level: "critical",
      message: "La configurazione supera la capacita stimata del tetto.",
    });
  }

  if (!input.listinoCompleto) {
    issues.push({
      code: "missing_price_list",
      level: "critical",
      message: "Listino incompleto: seleziona pannello, inverter e accumulo se previsto.",
    });
  }

  if (!input.tariffaInstallazioneConfigurata) {
    issues.push({
      code: "missing_labor_rate",
      level: "warning",
      message: "Tariffa installazione non configurata: il margine usa fallback standard.",
    });
  }

  if (input.tettoMock) {
    issues.push({
      code: "mock_roof_data",
      level: "warning",
      message: "Dati tetto stimati: conferma con sopralluogo prima di inviare offerta finale.",
    });
  }

  if (
    input.produzione_annua_stimata_kwh != null &&
    input.consumo_annuo_kwh != null &&
    input.produzione_annua_stimata_kwh > input.consumo_annuo_kwh * 1.7 &&
    !input.con_accumulo
  ) {
    issues.push({
      code: "oversized_without_storage",
      level: "warning",
      message: "Impianto sovradimensionato senza accumulo: spiega energia immessa e RID.",
    });
  }

  if (input.payback_anni != null && input.payback_anni > 12) {
    issues.push({
      code: "weak_payback",
      level: "warning",
      message: "Payback oltre 12 anni: valuta taglia, accumulo o modalita di pagamento.",
    });
  }

  if (input.margine_pct != null && input.margine_pct < 0.25) {
    issues.push({
      code: "low_margin",
      level: "warning",
      message: "Margine stimato sotto target: non scalare budget senza revisione prezzo.",
    });
  }

  const critical = issues.filter((issue) => issue.level === "critical").length;
  const warnings = issues.filter((issue) => issue.level === "warning").length;
  const score = Math.max(0, 100 - critical * 35 - warnings * 10);
  const status: FvCommercialStatus =
    critical > 0 ? "blocked" : warnings >= 3 ? "review" : "ready";
  const nextAction =
    status === "blocked"
      ? "Correggi i blocchi prima di preparare l'offerta."
      : status === "review"
        ? "Rivedi warning commerciali e tecnici prima dell'invio."
        : "Pronto per offerta cliente con configurazione coerente.";

  return { status, score, issues, nextAction };
}
