/**
 * FotovoltaicoWizard — constants
 * Estratto da FotovoltaicoWizard.tsx (MP-MKT-001).
 */
import type { FvTabDef } from "@/types/fotovoltaico";
import type { WizardData } from "./types";

export const TOTAL_STEPS = 8;

export const TABS: FvTabDef[] = [
  { num: 1, small: "Fase 1", label: "Cliente" },
  { num: 2, small: "Fase 2", label: "Immobile" },
  { num: 3, small: "Fase 3", label: "Consumi" },
  { num: 4, small: "Fase 4", label: "Tetto" },
  { num: 5, small: "Fase 5", label: "Configurazione" },
  { num: 6, small: "Fase 6", label: "Anteprima finanziaria" },
  { num: 7, small: "Fase 7", label: "Vista impresa" },
  { num: 8, small: "Fase 8", label: "Genera preventivo" },
];

// ─── Range coordinate Italia ──────────────────────────────────────────────
// Italia continentale + isole (Pantelleria/Lampedusa estremo sud 35.5°,
// Tarvisio estremo nord-est 46.6°). Con padding margine.
export const ITALIA_LAT_MIN = 35.0;
export const ITALIA_LAT_MAX = 47.5;
export const ITALIA_LNG_MIN = 6.0;
export const ITALIA_LNG_MAX = 19.0;

// ─── Persistenza locale draft (anti data-loss) ───────────────────────────
export const LS_KEY_PREFIX = "fv_wizard_draft_v1_";
export const LS_KEY_NEW = `${LS_KEY_PREFIX}new`;
/** Scarta draft più vecchi di 7 giorni */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Default INITIAL wizard data ──────────────────────────────────────────
export const INITIAL: WizardData = {
  cliente_nome: "",
  cliente_cognome: "",
  cliente_telefono: "",
  cliente_email: "",
  cliente_id: null,
  archetipo: "privato_prima",
  indirizzo: "",
  comune: "",
  provincia: "",
  cap: "",
  regione: "",
  popolazione_comune: null,
  latitudine: null,
  longitudine: null,
  tipologia_immobile: "residenziale",
  superficie_immobile_mq: null,
  prima_casa: true,
  consumo_annuo_kwh: null,
  costo_kwh_attuale: 0.32,
  tariffa_tipo: "monoraria",
  profilo_consumo: "misto",
  isee: null,
  numero_figli: 0,
  reddito_annuo_dichiarato: null,
  fonte_dati_tetto: "solar_api",
  ore_sole_annue: null,
  superficie_tetto_disponibile_mq: null,
  numero_pannelli_max: null,
  potenza_max_kwp: null,
  qualita_dati_tetto: null,
  imagery_date: null,
  tetto_mock: false,
  layout_tetto: null,
  azimut_tetto: null,
  inclinazione_tetto: null,
  perdita_ombreggiamento_pct: 0,
  numero_pannelli_scelti: 16,
  potenza_kwp: 8.64,
  con_accumulo: false,
  capacita_accumulo_kwh: 0,
  con_wallbox: false,
  con_ottimizzatori: false,
  pannello_id: null,
  inverter_id: null,
  accumulo_id: null,
  kit_bundle_id: null,
  kit_nome: null,
  kit_prezzo: null,
  tariffa_installazione_id: null,
  finanziamento_modalita: "rate",
  tabella_finanziamento_id: null,
  durata_mesi_scelta: 84,
};
