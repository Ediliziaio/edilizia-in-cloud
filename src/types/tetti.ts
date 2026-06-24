export type TetUnitaMisura = "mq" | "ml" | "cad" | "corpo" | "kg" | "h" | "a corpo";
export type TetStato = "bozza" | "da_consegnare" | "consegnato" | "in_valutazione" | "accettato" | "rifiutato" | "scaduto" | "archiviato";

export interface TetListinoCapitolo { id: string; company_id: string; nome: string; ordine: number; }
export interface TetListinoVoce {
  id: string; company_id: string; capitolo_id: string | null; codice: string | null;
  descrizione: string; unita_misura: TetUnitaMisura;
  costo_materiali: number; costo_manodopera: number; ricarico_pct: number; prezzo_unitario: number;
  articolo_id: string | null; tariffa_id: string | null; note: string | null; ordine: number;
}
export interface TetComputoVoce {
  id: string; progetto_id: string; company_id: string; capitolo_nome: string;
  descrizione: string; unita_misura: TetUnitaMisura; quantita: number;
  prezzo_unitario: number; costo_materiali: number; costo_manodopera: number;
  sconto_pct: number; importo: number; margine_eur: number; margine_pct: number;
  listino_voce_id: string | null; ordine: number;
  /** Prezzario regionale di provenienza della voce (citazione base d'asta). NULL = voce libera/listino. */
  fonte?: string | null;
}
export interface TetProgetto {
  id: string; company_id: string; code: string | null; stato: TetStato; tipo_intervento: string | null; numero_falde: number | null;
  cliente_nome: string | null; cliente_cognome: string | null; cliente_email: string | null; cliente_telefono: string | null;
  cantiere_indirizzo: string | null; cantiere_citta: string | null; cantiere_provincia: string | null; cantiere_cap: string | null;
  immobile_tipo: string | null; immobile_superficie_mq: number | null; immobile_anno: number | null; immobile_piani: number | null;
  superficie_pianta_mq: number | null; pendenza_pct: number | null; perimetro_ml: number | null; amianto: boolean;
  opportunita_id: string | null; cliente_id: string | null; template_id: string | null;
  sconto_pct: number; iva_pct: number; detrazione_pct: number;
  totale_imponibile: number; totale: number; note: string | null;
}
export interface TetProgettoMedia { id: string; progetto_id: string; company_id: string; tipo: string; url: string; caption: string | null; ordine: number; }

// ─── Template PDF (un record per azienda) ────────────────────────────────────
// Le liste jsonb hanno shape uniforme {titolo, descrizione} (esigenze/soluzione/
// usp) e {autore, ruolo, testo} (testimonianze), {fase, durata, descrizione}
// (cronoprogramma). Esposte come tipi dedicati così editor e PDF condividono
// la stessa forma.
export interface TetListItem { titolo: string; descrizione?: string | null; }
export interface TetTestimonianza { autore: string; ruolo?: string | null; testo: string; }
export interface TetCronoFase { fase: string; durata?: string | null; descrizione?: string | null; }
export interface TetFaqItem { domanda: string; risposta: string; }

export interface TetTemplatePdf {
  id: string;
  company_id: string;
  logo_url: string | null;
  color_primary: string | null;
  color_secondary: string | null;
  color_accent: string | null;
  color_text: string | null;
  chi_siamo: string | null;
  chi_siamo_foto_url: string | null;
  esigenze: TetListItem[];
  soluzione: TetListItem[];
  usp: TetListItem[];
  testimonianze: TetTestimonianza[];
  cronoprogramma: TetCronoFase[];
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
  garanzie: TetListItem[];
  faq: TetFaqItem[];
  percorso: TetListItem[];
  show_garanzie: boolean;
  show_percorso: boolean;
  cover_title_size: number | null;
  cover_text_align: "left" | "center" | "right" | null;
  // ─── Cover parity (preset 1-click, stesso set di sr_template_pdf) ──────────
  // Schema `cover_*` del modulo tetti che mappa 1:1 le `pdf_cover_*` di Serramenti.
  cover_bg_color: string | null;
  cover_eyebrow: string | null;
  cover_eyebrow_size: number | null;
  cover_subtitle_size: number | null;
  cover_logo_size: number | null;
  cover_overlay_style: "flat" | "gradient" | "gradient_diag" | "vignette" | null;
  cover_text_vertical: "top" | "center" | "bottom" | null;
  cover_decoration_style: "square" | "circle" | "line" | "pattern" | "none" | null;
  cover_show_decoration: boolean | null;
  cover_show_client_card: boolean | null;
  default_iva_pct: number | null;
  default_detrazione_pct: number | null;
  default_validita_giorni: number | null;
}
