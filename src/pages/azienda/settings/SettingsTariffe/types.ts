/**
 * SettingsTariffe — types
 * Estratto da SettingsTariffe.tsx (MP-IMP-001 Fase 4).
 */

// FASE 6: tipo esteso con tariffe serramentista + unita_fatturazione canonica.
export type TipoTariffa =
  | "posa" | "trasporto" | "tiro_piano" | "smaltimento" | "nolo" | "pratica"
  | "manodopera" | "sopralluogo" | "progettazione" | "ponteggio"
  | "lattoneria" | "sigillatura" | "contorno" | "falso_telaio"
  | "altro";

export type UnitaFatturazione =
  | "pz" | "mq" | "ml" | "mc" | "kg" | "gg" | "h" | "a_corpo" | "km" | "piano";

export interface Tariffa {
  id: string;
  company_id: string;
  nome: string;
  tipo: TipoTariffa;
  /** Legacy: colonna `unita` CHECK (pz/mq/ml/mc/h/piano/km/fisso). Resta per retro-compat. */
  unita?: string;
  /** FASE 6: source-of-truth UM. */
  unita_fatturazione?: UnitaFatturazione;
  prezzo_vendita?: number;
  /** Legacy alias di costo_interno. */
  prezzo_costo?: number;
  /** FASE 6: costo interno (posatore, attrezzatura, etc.). */
  costo_interno?: number;
  vertical_associato?: string | null;
  descrizione?: string | null;
  attivo?: boolean;
  piano_base?: number;
  prezzo_piano_aggiuntivo?: number;
  /** Codice articolo/voce (es. dal prezzario regionale). Opzionale. */
  codice?: string | null;
  /** Prezzario di provenienza (es. "Prezzario Regione Lombardia 2024"). NULL = inserita a mano. */
  fonte?: string | null;
  /** Incidenza manodopera frazionaria 0..1 (obbligo base d'asta nei lavori pubblici). NULL = non specificata. */
  incidenza_manodopera_pct?: number | null;
}

export interface TipoDef {
  value: TipoTariffa;
  label: string;
  group: "lavorazione" | "logistica" | "servizi" | "nolo" | "finiture" | "altro";
  hint: string;
}

export type PresetId =
  | "essenziale" | "serramentista" | "edile" | "impiantista" | "servizi"
  | "bagno" | "fotovoltaico" | "pittura" | "tetti_ripasso" | "tetti_rifacimento"
  | "scavi" | "piscine";

export interface TariffaSeed extends Omit<Tariffa, "id" | "company_id"> {
  presets: PresetId[];
}
