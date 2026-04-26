/**
 * Tipi TypeScript del modulo Fotovoltaico — Wave 1.
 * Allineati allo schema DB (vedi migration 20261027120000_fv_modulo_wave1.sql).
 */

// ─── Archetipi cliente (§6.1) ──────────────────────────────────────────────
export type FvArchetipo =
  | "privato_prima"
  | "privato_seconda"
  | "privato_isee"
  | "pmi"
  | "condominio"     // W2
  | "cer"            // W2
  | "industriale_grande"; // W3

// ─── Stati progetto ─────────────────────────────────────────────────────────
export type FvStatoProgetto =
  | "bozza"
  | "configurato"
  | "emesso"
  | "firmato"
  | "annullato";

// ─── Profili autoconsumo (§15.1) ────────────────────────────────────────────
export type FvProfiloAutoconsumoCodice =
  | "sera"
  | "misto"
  | "giorno"
  | "sempre"
  | "pmi_diurno"
  | "pmi_h24";

// ─── Tipologia immobile ─────────────────────────────────────────────────────
export type FvTipologiaImmobile =
  | "residenziale"
  | "capannone"
  | "ufficio"
  | "agricolo"
  | "altro";

// ─── Fonte dati tetto ───────────────────────────────────────────────────────
export type FvFonteDatiTetto = "solar_api" | "pvgis" | "manuale";
export type FvQualitaDatiTetto = "high" | "medium" | "low" | "manual";

// ─── Tariffa tipo ───────────────────────────────────────────────────────────
export type FvTariffaTipo = "monoraria" | "bioraria" | "trioraria";

// ─── Categoria componente FV (§8.4) ─────────────────────────────────────────
export type FvCategoriaComponente =
  | "pannello"
  | "inverter"
  | "accumulo"
  | "wallbox"
  | "ottimizzatore"
  | "struttura"
  | "cavi"
  | "altro";

// ─── Scenario finanziamento (§21) ───────────────────────────────────────────
export type FvScenarioFinanziamento =
  | "cash"
  | "prestito"
  | "leasing"
  | "cessione";

// ─── Tipo incentivo (§16) ───────────────────────────────────────────────────
export type FvTipoIncentivo =
  | "detrazione_irpef"
  | "fondo_perduto"
  | "tariffa_incentivante"
  | "sconto_iva"
  | "deducibilita_fiscale"
  | "informativa";

// ─── Codici incentivi 2026 (§16) ────────────────────────────────────────────
export type FvCodiceIncentivo =
  | "DETR_50_PRIMA"
  | "DETR_36_SECONDA"
  | "REDDITO_ENERGETICO"
  | "IVA_10"
  | "RID"
  | "CER_INFO"
  | "AMMORTAMENTO_PMI"
  | "TRANSIZIONE_5_0";

// ─── Tipo PDF ──────────────────────────────────────────────────────────────
export type FvTipoPdf = "vendita" | "tecnico" | "mobile";

// ─── Tipo servizio (§7.3 layer 3) ──────────────────────────────────────────
export type FvTipoServizio =
  | "pratica_gse"
  | "allaccio_e_distribuzione"
  | "asseverazione"
  | "smaltimento_amianto"
  | "opere_edili_accessorie"
  | "smaltimento_imballaggi"
  | "oneri_sicurezza"
  | "altro";

// ─── Entità DB ──────────────────────────────────────────────────────────────

export interface FvProgetto {
  id: string;
  company_id: string;
  cliente_id: string | null;
  numero: string;
  titolo: string;
  stato: FvStatoProgetto;
  archetipo: FvArchetipo;
  // dati immobile
  indirizzo: string;
  comune: string | null;
  provincia: string | null;
  cap: string | null;
  regione: string | null;
  popolazione_comune: number | null;
  latitudine: number | null;
  longitudine: number | null;
  tipologia_immobile: FvTipologiaImmobile | null;
  superficie_immobile_mq: number | null;
  prima_casa: boolean | null;
  anno_costruzione: number | null;
  ha_impianto_esistente: boolean;
  // consumi
  consumo_annuo_kwh: number | null;
  bolletta_caricata_url: string | null;
  profilo_consumo: FvProfiloAutoconsumoCodice | null;
  costo_kwh_attuale: number;
  tariffa_tipo: FvTariffaTipo;
  isee: number | null;
  numero_figli: number;
  reddito_annuo_dichiarato: number | null;
  // analisi tetto
  fonte_dati_tetto: FvFonteDatiTetto | null;
  qualita_dati_tetto: FvQualitaDatiTetto | null;
  imagery_date: string | null;
  ore_sole_annue: number | null;
  superficie_tetto_disponibile_mq: number | null;
  numero_pannelli_max: number | null;
  potenza_max_kwp: number | null;
  // configurazione
  numero_pannelli_scelti: number | null;
  potenza_kwp: number | null;
  con_accumulo: boolean;
  capacita_accumulo_kwh: number | null;
  con_wallbox: boolean;
  con_ottimizzatori: boolean;
  // finanziario
  produzione_annua_kwh: number | null;
  autoconsumo_pct: number | null;
  costo_totale_netto: number | null;
  prezzo_vendita_iva_inclusa: number | null;
  iva_aliquota: number;
  margine_eur: number | null;
  margine_pct: number | null;
  incentivi_applicati: FvIncentivoApplicato[] | null;
  capienza_irpef_ok: boolean | null;
  capienza_irpef_warning: string | null;
  scenario_finanziamento: FvScenarioFinanziamento;
  risparmio_anno1: number | null;
  payback_anni: number | null;
  npv_25_anni: number | null;
  irr_pct: number | null;
  co2_evitata_25_anni_kg: number | null;
  // output
  pdf_vendita_url: string | null;
  pdf_tecnico_url: string | null;
  pdf_mobile_url: string | null;
  opportunita_crm_id: string | null;
  ordine_id: string | null;
  // metadata
  created_at: string;
  updated_at: string;
  emesso_il: string | null;
  firmato_il: string | null;
  annullato: boolean;
  annullato_il: string | null;
  annullato_motivo: string | null;
  created_by: string | null;
  ultima_modifica_by: string | null;
  versione: number;
  versione_padre_id: string | null;
}

export interface FvPannelloLayout {
  id: string;
  progetto_id: string;
  segment_index: number | null;
  centro_lat: number;
  centro_lng: number;
  azimuth_deg: number | null;
  tilt_deg: number | null;
  orientamento: "LANDSCAPE" | "PORTRAIT";
  larghezza_m: number;
  altezza_m: number;
  produzione_annua_kwh: number | null;
  attivo: boolean;
  origine: FvFonteDatiTetto | "pvgis_stimato";
  created_at: string;
}

export interface FvComponente {
  id: string;
  progetto_id: string;
  articolo_id: string | null;
  categoria: FvCategoriaComponente;
  descrizione: string;
  marca: string | null;
  modello: string | null;
  quantita: number;
  unita_misura: string;
  prezzo_unitario_netto: number;
  prezzo_unitario_vendita: number;
  margine_pct: number | null;
  potenza_unitaria_w: number | null;
  potenza_unitaria_kw: number | null;
  capacita_kwh: number | null;
  garanzia_anni: number | null;
  ordinamento: number;
  created_at: string;
}

export interface FvManodopera {
  id: string;
  progetto_id: string;
  tariffa_id: string | null;
  descrizione: string;
  ore: number;
  tariffa_oraria_netta: number;
  tariffa_oraria_vendita: number;
  margine_pct: number | null;
  ordinamento: number;
  created_at: string;
}

export interface FvServizio {
  id: string;
  progetto_id: string;
  tipo: FvTipoServizio;
  descrizione: string;
  quantita: number;
  prezzo_netto: number;
  prezzo_vendita: number;
  ordinamento: number;
  note_operative: string | null;
  created_at: string;
}

export interface FvIncentivoCatalogo {
  id: string;
  codice: FvCodiceIncentivo | string;
  nome: string;
  descrizione_breve: string | null;
  descrizione_lunga: string | null;
  tipo: FvTipoIncentivo;
  aliquota: number | null;
  plafond_max_eur: number | null;
  durata_anni: number | null;
  condizioni: Record<string, unknown> | null;
  cumulabile_con: string[] | null;
  non_cumulabile_con: string[] | null;
  attivo: boolean;
  data_inizio_validita: string | null;
  data_fine_validita: string | null;
  ordinamento: number;
  fonte_normativa: string | null;
  link_normativa: string | null;
  ultima_modifica: string;
}

export interface FvIncentivoApplicato {
  codice: string;
  nome: string;
  tipo: FvTipoIncentivo;
  importo_eur: number | null;
  durata_anni: number | null;
  info?: string;
}

export interface FvParametroCalcolo {
  chiave: string;
  valore: number;
  unita: string | null;
  descrizione: string | null;
  categoria: string | null;
  ultima_modifica: string;
}

export interface FvProfiloAutoconsumo {
  id: string;
  codice: FvProfiloAutoconsumoCodice;
  nome_visualizzato: string;
  emoji: string | null;
  descrizione: string | null;
  autoconsumo_no_accumulo: number;
  autoconsumo_accumulo_5kwh: number;
  autoconsumo_accumulo_10kwh: number;
  autoconsumo_accumulo_15kwh: number;
  ordinamento: number;
  attivo: boolean;
}

// ─── Strutture dati derivate (non DB) ──────────────────────────────────────

export interface FvSolarLead {
  archetipo: FvArchetipo;
  indirizzo: string;
  latitudine: number | null;
  longitudine: number | null;
  comune: string | null;
  provincia: string | null;
  popolazione_comune: number | null;
  prima_casa: boolean;
  superficie_immobile_mq: number;
  consumo_annuo_kwh: number;
  costo_kwh_attuale: number;
  profilo_consumo: FvProfiloAutoconsumoCodice;
  isee: number | null;
  reddito_annuo_dichiarato: number | null;
}

export interface FvRoofAnalysis {
  fonte: FvFonteDatiTetto;
  qualita: FvQualitaDatiTetto;
  imagery_date: string | null;
  ore_sole_annue: number;
  superficie_tetto_disponibile_mq: number;
  numero_pannelli_max: number;
  potenza_max_kwp: number;
  layout_suggerito: Array<{
    centro_lat: number;
    centro_lng: number;
    azimuth_deg: number;
    tilt_deg: number;
    orientamento: "LANDSCAPE" | "PORTRAIT";
    produzione_annua_kwh: number;
    segment_index: number;
  }>;
  // raw response per debugging
  raw_response?: Record<string, unknown>;
}

export interface FvSolarConfiguration {
  numero_pannelli: number;
  potenza_kwp: number;
  con_accumulo: boolean;
  capacita_accumulo_kwh: number;
  con_wallbox: boolean;
  con_ottimizzatori: boolean;
  componenti: Array<Omit<FvComponente, "id" | "progetto_id" | "created_at">>;
  manodopera: Array<Omit<FvManodopera, "id" | "progetto_id" | "created_at">>;
  servizi: Array<Omit<FvServizio, "id" | "progetto_id" | "created_at">>;
  costo_totale_netto: number;
  prezzo_vendita_iva_inclusa: number;
  iva_aliquota: number;
  margine_eur: number;
  margine_pct: number;
}

export interface FvFinancialScenario {
  produzione_annua_kwh: number;
  autoconsumo_pct: number;
  energia_autoconsumata_kwh: number;
  energia_immessa_rete_kwh: number;
  risparmio_bolletta_anno1_eur: number;
  ricavi_rid_anno1_eur: number;
  detrazione_anno_eur: number;
  cassa_anno_per_anno: Array<{
    anno: number;
    flusso: number;
    cumulato: number;
    produzione_kwh?: number;
    risparmio_eur?: number;
    detrazione_eur?: number;
    manutenzione_eur?: number;
    sostituzione_inverter_eur?: number;
  }>;
  cassa_mese_anno1: Array<{
    mese: number;
    flusso: number;
    produzione_kwh: number;
  }>;
  payback_anni: number | null;
  npv_25_anni: number;
  irr_pct: number | null;
  risparmio_totale_25_anni: number;
  capienza_irpef_ok: boolean;
  capienza_irpef_recuperabile_pct: number;
  capienza_irpef_warning: string | null;
  // sensitivity
  sensitivity_minus15: { payback_anni: number | null; npv: number };
  sensitivity_plus15: { payback_anni: number | null; npv: number };
  // what-if
  scenario_auto_elettrica: { payback_anni: number | null; npv: number; autoconsumo: number } | null;
  scenario_pompa_calore: { payback_anni: number | null; npv: number; autoconsumo: number } | null;
  // confronti alternative
  confronto_btp_25anni: { tasso: number; montante: number; delta_vs_fv: number };
  confronto_deposito_25anni: { tasso: number; montante: number; delta_vs_fv: number };
  // incentivi
  incentivi: FvIncentivoApplicato[];
  // co2
  co2_evitata_25_anni_kg: number;
}

// ─── Costanti dominio ──────────────────────────────────────────────────────

/** Italia bounding box: lat 35-48, lng 6-19 (§13.5). */
export const FV_ITALIA_LAT_MIN = 35;
export const FV_ITALIA_LAT_MAX = 48;
export const FV_ITALIA_LNG_MIN = 6;
export const FV_ITALIA_LNG_MAX = 19;

/** Distribuzione mensile produzione FV per macro-regione (§14.3). */
export const FV_DISTRIBUZIONE_MENSILE = {
  nord: [0.035, 0.05, 0.08, 0.095, 0.12, 0.13, 0.135, 0.12, 0.095, 0.07, 0.04, 0.03],
  centro: [0.04, 0.055, 0.085, 0.10, 0.115, 0.125, 0.13, 0.115, 0.10, 0.075, 0.045, 0.035],
  sud: [0.045, 0.06, 0.09, 0.10, 0.115, 0.12, 0.125, 0.115, 0.10, 0.08, 0.05, 0.04],
  isole: [0.05, 0.06, 0.09, 0.10, 0.115, 0.12, 0.125, 0.115, 0.10, 0.08, 0.05, 0.045],
} as const;

/** Province → macroregione per distribuzione mensile (semplificazione W1). */
export const FV_PROVINCE_NORD = new Set([
  "TO","VC","NO","CN","AT","AL","BI","VB", // Piemonte
  "AO", // VdA
  "MI","BG","BS","CO","CR","LC","LO","MN","MB","PV","SO","VA", // Lombardia
  "VR","VI","BL","TV","VE","PD","RO", // Veneto
  "TN","BZ", // TAA
  "GO","PN","TS","UD", // FVG
  "GE","IM","SP","SV", // Liguria
  "BO","FC","FE","MO","PC","PR","RA","RE","RN", // ER
]);
export const FV_PROVINCE_SUD = new Set([
  "AQ","CH","PE","TE", // Abruzzo
  "CB","IS", // Molise
  "AV","BN","CE","NA","SA", // Campania
  "BA","BT","BR","FG","LE","TA", // Puglia
  "CS","CZ","KR","RC","VV", // Calabria
  "MT","PZ", // Basilicata
]);
export const FV_PROVINCE_ISOLE = new Set([
  "AG","CL","CT","EN","ME","PA","RG","SR","TP", // Sicilia
  "CA","NU","OR","SS","SU", // Sardegna
]);

/** Restituisce 'nord' | 'centro' | 'sud' | 'isole' per la provincia data. */
export function macroregionePerProvincia(
  provincia: string | null
): keyof typeof FV_DISTRIBUZIONE_MENSILE {
  if (!provincia) return "centro";
  const p = provincia.toUpperCase();
  if (FV_PROVINCE_NORD.has(p)) return "nord";
  if (FV_PROVINCE_SUD.has(p)) return "sud";
  if (FV_PROVINCE_ISOLE.has(p)) return "isole";
  return "centro";
}

/** Soglie ARERA bolletta "Mario Rossi" reference (§14.6). */
export const FV_BOLLETTA_RIFERIMENTO_KWH_ANNO_RESIDENZIALE = 3500;
export const FV_BOLLETTA_RIFERIMENTO_KWH_ANNO_PMI_PICCOLA = 12000;
