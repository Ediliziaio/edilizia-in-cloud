/**
 * Tipi unificati per il Preventivatore Unificato (Sprint A).
 *
 * `CatalogItem` è la vista polimorfica di prodotto usata dal nuovo dialog a
 * tre stadi (Macrocategoria → Prodotto → Configura). Il discriminated union
 * su `source` permette al configuratore di scegliere il renderer giusto
 * senza che il resto dell'app conosca la distinzione Famiglia vs Articolo.
 */

import type { FamilyWithAxes } from "@/types/articleFamily";

/** Sorgente dati dell'item del catalogo. */
export type CatalogItemSource = "family" | "article";

/** Modalità di prezzo unificata (super-set di quelle di famiglia e articolo). */
export type ModalitaPrezzoUnified = "pz" | "mq" | "griglia" | "misura_libera";

/**
 * Shape minimo delle righe di `article_templates` che ci servono nel flusso
 * Preventivatore. Evita di importare la Row completa (~40 colonne inutili).
 */
export interface ArticleTemplateLite {
  id: string;
  company_id: string;
  name: string;
  sku: string | null;
  marca: string | null;
  modello: string | null;
  description: string | null;
  categoria_id: string | null;
  modalita_prezzo: string;
  prezzo_vendita: number | null;
  prezzo_acquisto_netto: number | null;
  vat_rate: number | null;
  unit_of_measure: string | null;
  immagine_url: string | null;
  pdf_scheda_url: string | null;
  ha_montaggio: boolean | null;
  montaggio_tariffa_id: string | null;
  montaggio_tipo: string | null;
  attivo: boolean | null;
  sort_order: number | null;
  /**
   * Flag "posa legata": se true, la riga montaggio auto-generata resta
   * legata alla riga prodotto (delete cascade + sync qty).
   * La colonna viene creata dalla migration Step 3; fino ad allora può essere
   * `null`, trattato come `true` (default dalla spec §4.3).
   */
  posa_linked: boolean | null;
}

export interface CatalogItemCommon {
  id: string;
  company_id: string;
  nome: string;
  descrizione: string | null;
  immagine_url: string | null;
  pdf_scheda_url: string | null;
  categoria_id: string | null;
  modalita_prezzo: ModalitaPrezzoUnified;
  prezzo_base_vendita: number;
  unit_of_measure: string;
  attivo: boolean;
  sort_order: number;
}

export interface CatalogItemFamily extends CatalogItemCommon {
  source: "family";
  /** Payload completo della famiglia, con assi+valori, per il configuratore. */
  family: FamilyWithAxes;
  /** true se `posa_tariffa_default_id != null` sulla famiglia. */
  ha_posa_automatica: boolean;
  /** Flag letto da `article_families.posa_linked` (default true). */
  posa_linked: boolean;
}

export interface CatalogItemArticle extends CatalogItemCommon {
  source: "article";
  /** Payload originale dell'articolo singolo (Row). */
  article: ArticleTemplateLite;
  sku: string | null;
  marca: string | null;
  /** true se `montaggio_tariffa_id != null` sull'articolo. */
  ha_montaggio_automatico: boolean;
  /** Flag letto da `article_templates.posa_linked` (default true). */
  posa_linked: boolean;
}

export type CatalogItem = CatalogItemFamily | CatalogItemArticle;

/**
 * Categoria di catalogo arricchita col conteggio di prodotti (famiglie +
 * articoli) appartenenti ad essa. Usata dallo Stadio 1 (CategoryGrid) per
 * mostrare solo le categorie popolate e il loro counter.
 */
export interface CatalogCategory {
  id: string;
  nome: string;
  icona: string | null;
  colore: string | null;
  immagine_url: string | null;
  sort_order: number;
  /** Macrocategoria di appartenenza (NULL = legacy / nessuna). */
  macrocategoria_id: string | null;
  count_families: number;
  count_articles: number;
  total: number;
}

/**
 * Macrocategoria di catalogo (livello superiore alle CatalogCategory).
 * Usata dallo Stadio 1 del Preventivatore quando esiste >1 macrocat:
 * l'utente prima sceglie la macrocategoria (es. "PIU' LUCE", "Sistema X")
 * e poi vede le categorie/modelli al suo interno.
 */
export interface CatalogMacrocategory {
  id: string;
  nome: string;
  descrizione: string | null;
  icona: string | null;
  colore: string | null;
  sort_order: number;
  /** Numero di categorie sotto la macrocategoria (con ≥1 prodotto). */
  count_categories: number;
  /** Numero TOTALE di prodotti annidati (sommatoria su tutte le categorie). */
  count_products: number;
}

/**
 * Risultato di una selezione di configurazione da ProductConfigurator verso
 * QuoteBuilder. Un singolo prodotto può produrre 1 riga (solo prodotto) o
 * 2 righe (prodotto + posa linked).
 *
 * Il `client_temp_id` (UUID generato client-side) identifica la riga prodotto
 * finché non viene persistita: se c'è una riga figlia posa, punterà a quel
 * tempId via `parent_temp_id`. Il layer di persistenza farà il mapping
 * `temp_id → quote_items.id` prima del SAVE.
 */
export interface ConfiguredItem {
  /** UUID generato in AddItemDialog per questa riga. */
  client_temp_id: string;
  /** Se non-null, questa riga è figlia di un'altra con quel client_temp_id. */
  parent_temp_id: string | null;
  /** QuoteItemPro serializzato (campi di dominio). */
  quote_item: import("@/types/quoteItem").QuoteItemPro;
}
