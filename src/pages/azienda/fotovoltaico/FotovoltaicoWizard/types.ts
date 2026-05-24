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
} from "@/types/fotovoltaico";

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
  costo_kwh_attuale: number;
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
  /** Tariffa di manodopera scelta (FK a tariffe_aziendali). Se null usa default 30/40. */
  tariffa_installazione_id: string | null;
  // Step 6: Finanziamento
  finanziamento_modalita: "cash" | "rate" | "zero" | "noleggio";
  tabella_finanziamento_id: string | null;
  durata_mesi_scelta: number | null;
}

export interface PersistedDraft {
  step: number;
  data: WizardData;
  completedSteps: number[];
  savedAt: number;
}
