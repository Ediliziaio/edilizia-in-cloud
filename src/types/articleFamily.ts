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

/**
 * Modalità di gestione della manodopera (ex "posa") a livello famiglia.
 *  - "tariffa":  usa `posa_tariffa_default_id` (legacy — tariffa aziendale).
 *  - "manuale":  importi fissati direttamente sulla famiglia
 *                (manodopera_costo_acquisto + manodopera_prezzo_vendita).
 *                Tipico: tariffa a corpo per questo articolo, senza dover
 *                creare una tariffa aziendale dedicata.
 *  - "nessuna":  nessuna riga manodopera auto-generata al preventivo.
 *
 * Migration `20260421000030_manodopera_manuale_columns`.
 */
export type ManodoperaModalita = "tariffa" | "manuale" | "nessuna";

/** Unità di misura ammesse per la modalità manodopera manuale. */
export type ManodoperaUnita = "pz" | "ml" | "mq" | "h" | "a_corpo";

export interface ArticleFamily {
  id: string;
  company_id: string;
  vertical: string;
  /**
   * FK diretto a listino_macrocategorie. È il nuovo standard dopo il refactor
   * 20270513200000 — il livello "categoria" intermedio è stato deprecato.
   * NULL = articolo non assegnato a nessuna macrocategoria.
   */
  macrocategoria_id: string | null;
  /**
   * @deprecated dal 20270513200000. Mantenuto per retrocompat lettura su
   * articoli pre-refactor. Le nuove creazioni scrivono solo macrocategoria_id.
   * La colonna DB verrà droppata in una migration separata dopo verifica.
   */
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
  /**
   * Primo sconto in cascata (%) sul prezzo lordo del listino fornitore.
   * Range [0, 100]. 0 = nessuno sconto. Aggiunto dalla migration
   * 20260421000006. Ignorato se prezzo_base_mode !== "acquisto_markup".
   * Esempio: 55 = -55%.
   */
  sconto_fornitore_1: number;
  /**
   * Secondo sconto in cascata (%) applicato DOPO il primo.
   * Range [0, 100]. 0 = nessuno sconto.
   * Esempio tipico serramentisti IT: 55% + 3% (il +3% è cumulativo dopo il 55%).
   */
  sconto_fornitore_2: number;
  /**
   * IVA di VENDITA (%): aliquota addebitata al cliente in fattura.
   * Range [0, 100]. 0 = reverse charge / vendita estero.
   * Applicata a prezzo_base_vendita (che è al netto).
   */
  vat_rate: number;
  /**
   * IVA di ACQUISTO (%): aliquota pagata al fornitore.
   * Range [0, 100]. 0 = acquisto intra-UE / estero con reverse charge.
   * Può differire da vat_rate — tipico quando si compra estero (0%) e si
   * rivende in Italia (22%). Aggiunta dalla migration 20260421000003.
   */
  vat_rate_acquisto: number;
  unit_of_measure: string;
  posa_tariffa_default_id: string | null;
  posa_quantita_default: number;
  /**
   * Modalità di gestione manodopera (ex "posa"). Aggiunta dalla migration
   * 20260421000030. Default 'nessuna' per nuove righe; backfill ha messo
   * 'tariffa' dove esisteva `posa_tariffa_default_id`, 'nessuna' altrove.
   * Retrocompat: righe pre-migration letto come 'tariffa' se posa_tariffa
   * default_id != null, altrimenti 'nessuna' — vedi lettura difensiva nei
   * consumer.
   */
  manodopera_modalita: ManodoperaModalita;
  /**
   * Costo di montaggio (€) pagato al subappaltatore/dipendente. Usato solo
   * se `manodopera_modalita === 'manuale'`. Unità = `manodopera_unita`.
   */
  manodopera_costo_acquisto: number;
  /**
   * Prezzo di vendita (€) della manodopera al cliente. Usato solo se
   * `manodopera_modalita === 'manuale'`. Unità = `manodopera_unita`.
   */
  manodopera_prezzo_vendita: number;
  /** Unità di misura manodopera in modalità manuale. */
  manodopera_unita: ManodoperaUnita;
  griglia_asse_x_label: string;
  griglia_asse_y_label: string;
  griglia_unita: string;
  attivo: boolean;
  sort_order: number;
  custom_field_values: Record<string, unknown>;
  /**
   * Timestamp soft-delete. NULL = riga attiva/archiviata. NOT NULL = cestino,
   * verra' purgata dopo 15 giorni dal job pg_cron. Aggiunto dalla migration
   * 20260421000004.
   */
  deleted_at: string | null;
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
