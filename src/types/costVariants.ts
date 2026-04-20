/**
 * Tipi per Sprint B — Varianti Costo Manodopera.
 *
 * Il data model separa:
 *   · tariffa_costi_varianti           → catalogo delle varianti di costo per tariffa
 *   · preventivo_manodopera_assegnazioni → scelta variante per singola riga di preventivo
 *
 * Il commerciale NON vede questi dati. La UI protegge tutto via `useUserPermissions`
 * e il DB lo rinforza con RLS che richiedono `has_role(company_admin | super_admin)`.
 */

export type ModalitaContabile =
  | "dipendente"
  | "subappalto_fatturato"
  | "subappalto_forfait"
  | "forfait"
  | "altro";

export const MODALITA_CONTABILE_LABELS: Record<ModalitaContabile, string> = {
  dipendente: "Dipendente",
  subappalto_fatturato: "Subappalto fatturato",
  subappalto_forfait: "Subappalto forfait",
  forfait: "Forfait",
  altro: "Altro",
};

/** Icona emoji di default per ogni modalità (usata nel dropdown). */
export const MODALITA_CONTABILE_ICONS: Record<ModalitaContabile, string> = {
  dipendente: "🏢",
  subappalto_fatturato: "🤝",
  subappalto_forfait: "📄",
  forfait: "💶",
  altro: "⚙️",
};

export interface TariffaCostoVariante {
  id: string;
  company_id: string;
  tariffa_id: string;
  nome: string;
  descrizione: string | null;
  modalita_contabile: ModalitaContabile;
  /** FK debole — nessun REFERENCES nel DB, vedi migration per rationale. */
  fornitore_id: string | null;
  /** FK debole — nessun REFERENCES nel DB. */
  risorsa_id: string | null;
  costo: number;
  /** ISO date (YYYY-MM-DD). */
  valid_from: string;
  /** ISO date o null (nessuna scadenza). */
  valid_to: string | null;
  is_default: boolean;
  attivo: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  /** Join popolato solo se il modulo fornitori è presente lato client. */
  fornitore?: { id: string; ragione_sociale: string } | null;
  /** Join popolato solo se il modulo HR è presente. */
  risorsa?: { id: string; nome: string } | null;
}

export type StatoAssegnazione =
  | "proposta"
  | "confermata"
  | "in_esecuzione"
  | "consuntivato"
  | "annullata";

export const STATO_ASSEGNAZIONE_LABELS: Record<StatoAssegnazione, string> = {
  proposta: "Proposta",
  confermata: "Confermata",
  in_esecuzione: "In esecuzione",
  consuntivato: "Consuntivato",
  annullata: "Annullata",
};

export interface PreventivoManodoperaAssegnazione {
  id: string;
  company_id: string;
  quote_id: string;
  quote_item_id: string;
  tariffa_id: string;
  variante_id: string;
  /** Snapshot del costo al momento dell'assegnazione. */
  costo_bloccato: number;
  costo_bloccato_at: string;
  stato: StatoAssegnazione;
  note: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  /** Join opzionale per visualizzazione. */
  variante?: TariffaCostoVariante;
}

/**
 * Origine del costo usato nel calcolo margine, in ordine di priorità:
 *   1. variante_assegnata  — costo_bloccato da assegnazione (highest trust)
 *   2. variante_default    — variante is_default=true della tariffa (preview)
 *   3. costo_default_tariffa — tariffe_aziendali.costo_default
 *   4. stimato             — fallback legacy, accuratezza incerta
 */
export type FonteCosto =
  | "variante_assegnata"
  | "variante_default"
  | "costo_default_tariffa"
  | "stimato";

export interface MargineQuoteItem {
  quote_item_id: string;
  nome: string;
  quantita: number;
  prezzo_vendita_unitario: number;
  totale_vendita: number;
  /** Null se la riga non è manodopera/tariffa. */
  tariffa_id: string | null;
  /** Id variante scelta (se assegnata o default), altrimenti null. */
  variante_scelta_id: string | null;
  costo_unitario: number;
  totale_costo: number;
  margine_euro: number;
  margine_pct: number;
  fonte_costo: FonteCosto;
}

export interface MargineBreakdown {
  quote_id: string;
  righe: MargineQuoteItem[];
  totale_vendita: number;
  totale_costo: number;
  margine_totale_euro: number;
  margine_totale_pct: number;
  /**
   * - `completo`  → tutte le righe con tariffa hanno un'assegnazione
   * - `parziale`  → alcune sì, altre no
   * - `stimato`   → nessuna assegnazione, costo_default ovunque
   */
  stato_completezza: "completo" | "parziale" | "stimato";
}

/** Replica client-side della function `has_cost_permission`. */
export interface UserPermissions {
  can_view_costs: boolean;
  can_view_margins: boolean;
  can_choose_variant: boolean;
  can_view_assegnazioni: boolean;
  can_edit_assegnazioni: boolean;
}

export type PermissionKey = keyof UserPermissions;
