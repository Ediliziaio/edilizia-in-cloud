import type { GalleryLavoroItem } from "./gallery";

export type PavUnitaMisura = "mq" | "ml" | "cad" | "corpo" | "kg" | "h" | "a corpo";
export type PavStato = "bozza" | "da_consegnare" | "consegnato" | "in_valutazione" | "accettato" | "rifiutato" | "scaduto" | "archiviato";

export interface PavListinoCapitolo { id: string; company_id: string; nome: string; ordine: number; }
export interface PavListinoVoce {
  id: string; company_id: string; capitolo_id: string | null; codice: string | null;
  descrizione: string; unita_misura: PavUnitaMisura;
  costo_materiali: number; costo_manodopera: number; ricarico_pct: number; prezzo_unitario: number;
  articolo_id: string | null; tariffa_id: string | null; note: string | null; ordine: number;
}
export interface PavComputoVoce {
  id: string; progetto_id: string; company_id: string; capitolo_nome: string;
  descrizione: string; unita_misura: PavUnitaMisura; quantita: number;
  prezzo_unitario: number; costo_materiali: number; costo_manodopera: number;
  sconto_pct: number; importo: number; margine_eur: number; margine_pct: number;
  listino_voce_id: string | null; ordine: number;
  /** Prezzario regionale di provenienza della voce (citazione base d'asta). NULL = voce libera/listino. */
  fonte?: string | null;
}
export interface PavProgetto {
  id: string; company_id: string; code: string | null; stato: PavStato; tipo_intervento: string | null;
  numero_ambienti: number | null; tipo_materiale: string | null;
  cliente_nome: string | null; cliente_cognome: string | null; cliente_email: string | null; cliente_telefono: string | null;
  cantiere_indirizzo: string | null; cantiere_citta: string | null; cantiere_provincia: string | null; cantiere_cap: string | null;
  immobile_tipo: string | null; immobile_superficie_mq: number | null; immobile_anno: number | null; immobile_piani: number | null;
  massimale_detrazione: number | null;
  opportunita_id: string | null; cliente_id: string | null; template_id: string | null;
  /** Rata finanziamento nel PDF: null=segui template, false=nascondi, true=mostra. */
  mostra_finanziamento?: boolean | null;
  sconto_pct: number; iva_pct: number; detrazione_pct: number;
  /**
   * Prezzo pieno scritto a mano, IVA esclusa: sostituisce la somma delle righe
   * del computo; sconto e IVA si calcolano sopra. Null = somma delle righe. Si
   * scrive solo se l'azienda l'ha acceso (preventivo_impostazioni.prezzo_finale_a_mano).
   */
  prezzo_manuale?: number | null;
  totale_imponibile: number; totale: number; note: string | null;
}
export interface PavProgettoMedia { id: string; progetto_id: string; company_id: string; tipo: string; url: string; caption: string | null; ordine: number; }

// ─── Template PDF (un record per azienda) ────────────────────────────────────
// Le liste jsonb hanno shape uniforme {titolo, descrizione} (esigenze/soluzione/
// usp) e {autore, ruolo, testo} (testimonianze), {fase, durata, descrizione}
// (cronoprogramma). Esposte come tipi dedicati così editor e PDF condividono
// la stessa forma.
export interface PavListItem { titolo: string; descrizione?: string | null; }
export interface PavTestimonianza { autore: string; ruolo?: string | null; testo: string; }
export interface PavCronoFase { fase: string; durata?: string | null; descrizione?: string | null; }
export interface PavFaqItem { domanda: string; risposta: string; }

export interface PavTemplatePdf {
  id: string;
  company_id: string;
  logo_url: string | null;
  cover_logo_url: string | null;
  color_primary: string | null;
  color_secondary: string | null;
  color_accent: string | null;
  color_text: string | null;
  chi_siamo: string | null;
  chi_siamo_foto_url: string | null;
  esigenze: PavListItem[];
  soluzione: PavListItem[];
  usp: PavListItem[];
  testimonianze: PavTestimonianza[];
  cronoprogramma: PavCronoFase[];
  cover_title: string | null;
  cover_subtitle: string | null;
  cover_image_url: string | null;
  payment_terms_text: string | null;
  validity_text: string | null;
  footer_text: string | null;
  show_chi_siamo: boolean;
  show_cronoprogramma: boolean;
  show_margine: boolean;
  ragione_sociale: string | null;
  indirizzo_completo: string | null;
  telefono: string | null;
  email: string | null;
  partita_iva: string | null;
  font_family: string | null;
  show_footer_version: boolean;
  show_footer_legal: boolean;
  cover_logo_position: "top_left" | "top_center" | "top_right" | "hidden" | null;
  cover_text_color: string | null;
  cover_overlay_opacity: number | null;
  garanzie: PavListItem[];
  faq: PavFaqItem[];
  percorso: PavListItem[];
  show_garanzie: boolean;
  show_percorso: boolean;
  cover_title_size: number | null;
  cover_text_align: "left" | "center" | "right" | null;
  default_iva_pct: number | null;
  default_detrazione_pct: number | null;
  default_validita_giorni: number | null;
  gallery_lavori: GalleryLavoroItem[] | null;
  /** Condizioni generali di contratto in markdown povero: il PDF le stampa in coda. */
  condizioni_legali_testo: string | null;
  condizioni_legali_attivo: boolean | null;
  /** Allega il modulo di recesso: serve se si firma con un privato a casa sua o a distanza. Spento di serie. */
  modulo_recesso_attivo?: boolean | null;
  /** Ordine e visibilità dei capitoli del PDF: [{chiave, visibile}]. null = di serie. */
  pdf_ordine_capitoli: Array<{ chiave: string; visibile: boolean }> | null;
  /** Pagine scritte dall'azienda, dentro la sequenza dei capitoli. */
  pdf_pagine_libere: Array<{ id: string; occhiello?: string | null; titolo: string; testoHtml?: string | null; fotoUrl?: string | null; didascalia?: string | null }>;
}
