/**
 * Preventivatore Verticalizzato Serramentisti — FASE 2.2
 *
 * Tipi TypeScript per il data model famiglie/assi/valori introdotto dalla
 * migration 20260917000002. Narrowing rigoroso: i JSONB vengono tipizzati
 * come `Record<string, unknown>` per forzare i consumer a fare type-check
 * prima di usarli (niente `any`).
 */

/** Modalità di calcolo prezzo a livello famiglia. */
export type ModalitaPrezzoBase = "pz" | "mq" | "griglia" | "misura_libera";

/**
 * Strategia di gestione del prezzo base.
 *  - "vendita":         l'utente carica direttamente il prezzo di vendita
 *                       (nessun margine calcolato). Tipico delle aziende
 *                       che impongono un prezzo di cartellino fisso.
 *  - "acquisto_markup": l'utente carica il prezzo di ACQUISTO dal fornitore
 *                       e definisce un markup (percentuale o fisso €/pz).
 *                       Il prezzo di vendita viene derivato tramite
 *                       `applyMarkup()` (src/lib/priceMarkup.ts).
 */
export type PrezzoBaseMode = "vendita" | "acquisto_markup";

/**
 * Tipo di markup applicato quando prezzo_base_mode = "acquisto_markup".
 *  - "none":        nessun ricarico (vendita = acquisto).
 *  - "percentuale": vendita = acquisto * (1 + markup_valore/100).
 *  - "fisso_pz":    vendita = acquisto + markup_valore (€ al pezzo).
 */
export type MarkupTipo = "none" | "percentuale" | "fisso_pz";

/** Tipo di maggiorazione applicata da un valore di asse. */
export type MaggiorazioneTipo =
  | "none"
  | "percentuale"
  | "fisso_pz"
  | "fisso_mq"
  | "fisso_ml"
  | "fisso_mc";

/** Tipo di asse: lista discreta di valori o flag booleano. */
export type AxisTipo = "discrete" | "boolean";

export interface ArticleFamily {
  id: string;
  company_id: string;
  vertical: string;
  categoria_id: string | null;
  nome: string;
  descrizione: string | null;
  immagine_url: string | null;
  pdf_scheda_url: string | null;
  modalita_prezzo_base: ModalitaPrezzoBase;
  /**
   * Strategia gestione prezzo: "vendita" diretto o "acquisto_markup" con
   * calcolo derivato. Aggiunto dalla migration 20260421000002. Retrocompat:
   * righe pre-migration hanno "vendita" per default.
   */
  prezzo_base_mode: PrezzoBaseMode;
  prezzo_base_vendita: number;
  prezzo_base_acquisto: number;
  /** Tipo markup quando prezzo_base_mode="acquisto_markup". */
  markup_tipo: MarkupTipo;
  /** Valore markup (percentuale oppure euro al pezzo a seconda di markup_tipo). */
  markup_valore: number;
  vat_rate: number;
  unit_of_measure: string;
  posa_tariffa_default_id: string | null;
  posa_quantita_default: number;
  griglia_asse_x_label: string;
  griglia_asse_y_label: string;
  griglia_unita: string;
  attivo: boolean;
  sort_order: number;
  custom_field_values: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface FamilyAxis {
  id: string;
  family_id: string;
  company_id: string;
  nome: string;
  codice: string;
  descrizione: string | null;
  tipo: AxisTipo;
  obbligatorio: boolean;
  sort_order: number;
  created_at: string;
}

export interface AxisValue {
  id: string;
  axis_id: string;
  company_id: string;
  valore: string;
  label: string;
  descrizione: string | null;
  is_default: boolean;
  maggiorazione_tipo: MaggiorazioneTipo;
  maggiorazione_valore: number;
  maggiorazione_acquisto: number;
  sort_order: number;
  attivo: boolean;
  created_at: string;
}

/** Famiglia arricchita con tutti i suoi assi + valori ammessi per ogni asse. */
export interface FamilyWithAxes extends ArticleFamily {
  axes: (FamilyAxis & { values: AxisValue[] })[];
}

/**
 * Configurazione scelta per un'istanza di famiglia in un quote_item:
 * mappa `axis.codice → value.id`.
 * Serializzata nel JSONB `quote_items.valori_assi` (FASE 5).
 */
export type AxisSelection = Record<string, string>;
