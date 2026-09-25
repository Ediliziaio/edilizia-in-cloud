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
  { num: 5, small: "Fase 5", label: "Configurazione", breve: "Impianto" },
  { num: 6, small: "Fase 6", label: "Anteprima finanziaria", breve: "Finanza" },
  { num: 7, small: "Fase 7", label: "Vista impresa", breve: "Impresa" },
  { num: 8, small: "Fase 8", label: "Genera preventivo", breve: "Genera" },
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
  prezzo_vendita_manuale: null,
  iva_aliquota: 0.1,
  layout_overlay: null,
  tariffa_installazione_id: null,
  prodotti_extra: [],
  manodopera_righe: [],
  servizi_righe: [],
  finanziamento_modalita: "rate",
  sconto_tipo: "pct",
  sconto_valore: null,
  tabella_finanziamento_id: null,
  durata_mesi_scelta: 84,
  modalita_pagamento: {
    tranche: [
      { label: "Acconto alla firma", pct: 30 },
      { label: "All'avvio dei lavori", pct: 40 },
      { label: "Saldo a fine lavori", pct: 30 },
    ],
    note: null,
    anticipo_pct: 0,
  },
};

/** Preset rapidi per la modalità di pagamento diretto (Fase 6). */
export const PAGAMENTO_PRESETS: Array<{
  id: string;
  label: string;
  tranche: Array<{ label: string; pct: number }>;
}> = [
  {
    id: "30-40-30",
    label: "30 / 40 / 30",
    tranche: [
      { label: "Acconto alla firma", pct: 30 },
      { label: "All'avvio dei lavori", pct: 40 },
      { label: "Saldo a fine lavori", pct: 30 },
    ],
  },
  {
    id: "40-60",
    label: "40 / 60",
    tranche: [
      { label: "Acconto alla firma", pct: 40 },
      { label: "Saldo a fine lavori", pct: 60 },
    ],
  },
  {
    id: "50-50",
    label: "50 / 50",
    tranche: [
      { label: "Acconto alla firma", pct: 50 },
      { label: "Saldo a fine lavori", pct: 50 },
    ],
  },
  {
    id: "30-30-30-10",
    label: "30 / 30 / 30 / 10",
    tranche: [
      { label: "Acconto alla firma", pct: 30 },
      { label: "Consegna materiali", pct: 30 },
      { label: "Fine installazione", pct: 30 },
      { label: "Collaudo / allaccio", pct: 10 },
    ],
  },
  {
    id: "unica",
    label: "Unica soluzione",
    tranche: [{ label: "Pagamento a fine lavori", pct: 100 }],
  },
];
