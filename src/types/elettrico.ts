import type { GalleryLavoroItem } from "./gallery";

export type EleUnitaMisura = "mq" | "ml" | "cad" | "corpo" | "kg" | "h" | "a corpo";
export type EleStato = "bozza" | "da_consegnare" | "consegnato" | "in_valutazione" | "accettato" | "rifiutato" | "scaduto" | "archiviato";

export interface EleListinoCapitolo { id: string; company_id: string; nome: string; ordine: number; }
export interface EleListinoVoce {
  id: string; company_id: string; capitolo_id: string | null; codice: string | null;
  descrizione: string; unita_misura: EleUnitaMisura;
  costo_materiali: number; costo_manodopera: number; ricarico_pct: number; prezzo_unitario: number;
  articolo_id: string | null; tariffa_id: string | null; note: string | null; ordine: number;
}
export interface EleComputoVoce {
  id: string; progetto_id: string; company_id: string; capitolo_nome: string;
  descrizione: string; unita_misura: EleUnitaMisura; quantita: number;
  prezzo_unitario: number; costo_materiali: number; costo_manodopera: number;
  sconto_pct: number; importo: number; margine_eur: number; margine_pct: number;
  listino_voce_id: string | null; ordine: number;
  /** Prezzario regionale di provenienza della voce (citazione base d'asta). NULL = voce libera/listino. */
  fonte?: string | null;
}
export interface EleProgetto {
  id: string; company_id: string; code: string | null; stato: EleStato; tipo_intervento: string | null;
  numero_punti: number | null; livello_impianto: string | null;
  cliente_nome: string | null; cliente_cognome: string | null; cliente_email: string | null; cliente_telefono: string | null;
  cantiere_indirizzo: string | null; cantiere_citta: string | null; cantiere_provincia: string | null; cantiere_cap: string | null;
  immobile_tipo: string | null; immobile_superficie_mq: number | null; immobile_anno: number | null; immobile_piani: number | null;
  massimale_detrazione: number | null;
  opportunita_id: string | null; cliente_id: string | null; template_id: string | null;
  sconto_pct: number; iva_pct: number; detrazione_pct: number;
  totale_imponibile: number; totale: number; note: string | null;
}
export interface EleProgettoMedia { id: string; progetto_id: string; company_id: string; tipo: string; url: string; caption: string | null; ordine: number; }

// ─── Template PDF (un record per azienda) ────────────────────────────────────
// Le liste jsonb hanno shape uniforme {titolo, descrizione} (esigenze/soluzione/
// usp) e {autore, ruolo, testo} (testimonianze), {fase, durata, descrizione}
// (cronoprogramma). Esposte come tipi dedicati così editor e PDF condividono
// la stessa forma.
export interface EleListItem { titolo: string; descrizione?: string | null; }
export interface EleTestimonianza { autore: string; ruolo?: string | null; testo: string; }
export interface EleCronoFase { fase: string; durata?: string | null; descrizione?: string | null; }
export interface EleFaqItem { domanda: string; risposta: string; }

export interface EleTemplatePdf {
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
  esigenze: EleListItem[];
  soluzione: EleListItem[];
  usp: EleListItem[];
  testimonianze: EleTestimonianza[];
  cronoprogramma: EleCronoFase[];
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
  garanzie: EleListItem[];
  faq: EleFaqItem[];
  percorso: EleListItem[];
  show_garanzie: boolean;
  show_percorso: boolean;
  cover_title_size: number | null;
  cover_text_align: "left" | "center" | "right" | null;
  default_iva_pct: number | null;
  default_detrazione_pct: number | null;
  default_validita_giorni: number | null;
  gallery_lavori: GalleryLavoroItem[] | null;
}
