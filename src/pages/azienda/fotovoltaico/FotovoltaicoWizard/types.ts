/**
 * FotovoltaicoWizard — types
 * Estratto da FotovoltaicoWizard.tsx (MP-MKT-001).
 *
 * Definisce shape del wizard (WizardData) + persistenza locale (PersistedDraft).
 * I tipi fotovoltaici-specific (FvArchetipo, FvTariffaTipo, FvProfiloAutoconsumoCodice,
 * FvTabDef) sono in `@/types/fotovoltaico` — qui solo lo state wizard.
 */
import type {
  FvArchetipo, FvProfiloAutoconsumoCodice, FvTariffaTipo,
} from "@/lib/fotovoltaico/tipi";

export interface WizardData {
  // Step 1: Cliente
  cliente_nome: string;
  cliente_cognome: string;
  cliente_telefono: string;
  cliente_email: string;
  cliente_id: string | null;
  archetipo: FvArchetipo;
  // Step 2: Immobile
  indirizzo: string;
  comune: string;
  provincia: string;
  cap: string;
  regione: string;
  popolazione_comune: number | null;
  latitudine: number | null;
  longitudine: number | null;
  tipologia_immobile: string;
  superficie_immobile_mq: number | null;
  prima_casa: boolean;
  // Step 3: Consumi
  consumo_annuo_kwh: number | null;
  // F12: nullable — il campo può essere svuotato dall'utente (era forzato a 0).
  costo_kwh_attuale: number | null;
  tariffa_tipo: FvTariffaTipo;
  profilo_consumo: FvProfiloAutoconsumoCodice;
  isee: number | null;
  numero_figli: number;
  reddito_annuo_dichiarato: number | null;
  // Step 4: Tetto
  fonte_dati_tetto: "solar_api" | "pvgis" | "manuale";
  ore_sole_annue: number | null;
  superficie_tetto_disponibile_mq: number | null;
  numero_pannelli_max: number | null;
  potenza_max_kwp: number | null;
  qualita_dati_tetto: string | null;
  imagery_date: string | null;
  /** True se i dati tetto provengono dal mock dev (no GOOGLE_SOLAR_API_KEY). */
  tetto_mock: boolean;
  /** Layout reale pannelli (coordinate Google Solar API) — transitorio, per la vista in app. */
  layout_tetto: Array<{
    centro_lat: number;
    centro_lng: number;
    orientamento?: "LANDSCAPE" | "PORTRAIT";
    segment_index?: number;
  }> | null;
  /** Orientamento prevalente reale del tetto (etichetta "SE 152°") da Solar API. */
  azimut_tetto: string | null;
  /** Inclinazione (pendenza) reale della falda prevalente, in gradi. */
  inclinazione_tetto: number | null;
  /**
   * Ombreggiamento da ostacoli VICINI (alberi, edifici adiacenti) come FRAZIONE 0..1
   * (es. 0.10 = 10%). Default 0 = nessuno. L'orizzonte lontano è già in PVGIS H(i)_y.
   */
  perdita_ombreggiamento_pct: number;
  // Step 5: Configurazione
  numero_pannelli_scelti: number;
  potenza_kwp: number;
  con_accumulo: boolean;
  capacita_accumulo_kwh: number;
  con_wallbox: boolean;
  con_ottimizzatori: boolean;
  pannello_id: string | null;
  inverter_id: string | null;
  accumulo_id: string | null;
  /** Kit/bundle scelto dal listino (Fase 5): alternativa alla configurazione manuale.
   *  Se valorizzato, kWp/accumulo/prezzo arrivano dal kit e il salvataggio crea
   *  un'unica voce-kit col prezzo offerta (niente pannello/inverter separati). */
  kit_bundle_id: string | null;
  kit_nome: string | null;
  kit_prezzo: number | null;
  /** Editor layout manuale dei moduli sulla foto satellitare (stile Reonic):
   *  offset x/y in %, rotazione in gradi, numero colonne. null = overlay centrato. */
  layout_overlay: { x: number; y: number; rot: number; cols: number } | null;
  /** Tariffa di manodopera scelta (FK a tariffe_aziendali). Se null usa default 30/40. */
  tariffa_installazione_id: string | null;
  /** Prodotti extra dal listino generale (caldaia, clima, colonnina, …):
   *  salvati in fv_componenti_progetto con categoria='altro' insieme ai
   *  componenti principali (stesso flusso delete+insert dello Step 5). */
  prodotti_extra: Array<{
    listino_id: string | null;
    descrizione: string;
    quantita: number;
    prezzo_vendita: number;
    prezzo_acquisto: number | null;
  }>;
  // Step 6: Finanziamento
  finanziamento_modalita: "cash" | "rate" | "zero" | "noleggio";
  /** Sconto commerciale (fv_progetti.sconto_tipo/sconto_valore): 'pct' = %
   *  sul prezzo netto, 'importo' = € fissi. L'edge fa il clamp server-side
   *  sulle discount_rules e scrive sconto_eur_applicato. */
  sconto_tipo: "pct" | "importo";
  sconto_valore: number | null;
  tabella_finanziamento_id: string | null;
  durata_mesi_scelta: number | null;
  /** Step 6: Modalità di pagamento diretto (acconto / SAL / saldo) — come negli
   *  altri preventivi. Le % delle tranche sommano a 100; gli importi € si
   *  calcolano sul prezzo di vendita IVA inclusa al momento del render/PDF.
   *  null = usa lo schema di default (30/40/30). */
  modalita_pagamento: {
    tranche: Array<{ label: string; pct: number }>;
    note: string | null;
    /** Modalità finanziata (rate/zero): % di anticipo in contanti alla firma;
     *  il resto è il capitale finanziato. Ignorato in modalità cash/noleggio. */
    anticipo_pct?: number;
  } | null;
}

export interface PersistedDraft {
  step: number;
  data: WizardData;
  completedSteps: number[];
  savedAt: number;
}
