/**
 * Tipi di dominio per Listini Serramenti Avanzati.
 *
 * Interfacce PURE (nessun import da React/Supabase) per essere usabili sia
 * client sia in edge functions. Schema boundary: DB → mapper → questi tipi.
 */

/** Materiale tipico dei profili infissi */
export type MaterialeProfilo =
  | "pvc"
  | "alluminio"
  | "legno"
  | "legno_alluminio"
  | "acciaio";

/**
 * Fornitore infissi dell'azienda (es. Veka, Finstral, Schuco).
 * Ogni azienda ha i suoi fornitori privati.
 */
export interface SupplierCatalog {
  id: string;
  company_id: string;
  nome: string;
  codice_interno: string | null;
  /** Sconto di default applicato ai prezzi listino (0..1, es. 0.55 = −55%) */
  sconto_default: number;
  note: string | null;
  attivo: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Linea prodotto / profilo di un fornitore (es. Veka 70, Veka 76, Veka 82).
 * Tipicamente 2-5 linee per fornitore.
 */
export interface SupplierProductLine {
  id: string;
  company_id: string;
  supplier_catalog_id: string;
  nome: string;
  materiale: MaterialeProfilo;
  /** Ricarico di default sulla vendita (0..N, es. 1.0 = +100%) */
  ricarico_default: number;
  /** Tariffa manodopera default associata (FK tariffe_aziendali.id) */
  manodopera_tariffa_id: string | null;
  /** Override sconto fornitore per questa linea (NULL = usa quello del supplier) */
  sconto_override: number | null;
  note: string | null;
  attivo: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Input formula prezzo serramenti per una cella specifica della griglia.
 * Usato dal wizard preventivo e dall'AI server-side per calcolo coerente.
 */
export interface PricingInput {
  /** Prezzo di listino cella L×H (valore dalla griglia fornitore) */
  prezzo_listino: number;
  /** Sconto fornitore effettivo (0..1) — da SupplierProductLine.sconto_override
   *  o SupplierCatalog.sconto_default */
  sconto_fornitore: number;
  /** Ricarico azienda (0..N) — da SupplierProductLine.ricarico_default */
  ricarico_azienda: number;
  /** Somma maggiorazioni % delle varianti selezionate (colore, vetro, telaio, ecc.) */
  maggiorazioni_percentuali: number;
  /** Somma maggiorazioni fisse € delle varianti */
  maggiorazioni_fisse: number;
  /** Manodopera (posa) — calcolata a parte, aggiunta al totale */
  manodopera: number;
}

/** Output della formula prezzo */
export interface PricingOutput {
  /** Prezzo acquisto effettivo = listino × (1 − sconto) */
  prezzo_acquisto: number;
  /** Prezzo vendita PRIMA della posa = acquisto × (1 + ricarico) × (1 + Σmagg%) + Σmaggfix */
  prezzo_vendita_no_posa: number;
  /** Prezzo vendita TOTALE cliente = prezzo_vendita_no_posa + manodopera */
  prezzo_vendita_totale: number;
  /** Margine lordo % = (vendita_no_posa − acquisto) / vendita_no_posa */
  margine_percentuale: number;
}

/**
 * Metadata di una cella griglia extended (con axis_config + tracking fornitore).
 * Mappa 1:1 con listino_griglia dopo la migration STEP 3.
 */
export interface GridCell {
  id?: string;
  family_id: string;
  /** Configurazione assi che identifica la fascia/variante.
   *  Esempio: { profilo: "square_plus", colore: "bianco" }.
   *  Se NULL/empty → cella "base" standard. */
  axis_config: Record<string, string> | null;
  valore_x: number; // larghezza mm
  valore_y: number; // altezza mm
  prezzo_vendita: number; // prezzo listino fornitore (PRIMA di sconto+ricarico)
  prezzo_acquisto: number | null;
  supplier_catalog_id: string | null;
  supplier_product_line_id: string | null;
  note: string | null;
}

/**
 * Tipologia serramento nel catalogo base (seed pronto).
 * 20 tipologie standard (finestre, porte balcone, porte ingresso, scorrevoli).
 */
export interface TipologiaSerramento {
  slug: string;
  nome: string;
  categoria: "finestra" | "porta_balcone" | "porta_ingresso" | "scorrevole" | "fisso";
  ante: number | null; // 1, 2, 3, 4, null (vasistas, fisso)
  descrizione: string;
  icon_svg: string; // JSX-compatible SVG inline
  /** Modalità prezzo base — DEVE essere coerente con CHECK constraint DB
   *  (article_families.modalita_prezzo_base). */
  modalita_prezzo_base_default: "pz" | "mq" | "griglia" | "misura_libera";
  unit_of_measure_default: string;
  area_max_mq: number | null; // vincolo fornitore tipico (2.25 m²)
}
