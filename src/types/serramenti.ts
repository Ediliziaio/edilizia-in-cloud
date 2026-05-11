/**
 * src/types/serramenti.ts — Domain types per modulo Stima Serramenti
 *
 * Mirror dello schema DB (sr_* tables). Mantenere allineato con la
 * migration 20260511180000_sr_modulo_wave1.sql.
 */

export type SrStatoProgetto =
  | "bozza"
  | "da_consegnare"
  | "consegnato"
  | "in_valutazione"
  | "accettato"
  | "rifiutato"
  | "scaduto"
  | "archiviato";

export type SrTipoIntervento =
  | "sostituzione"
  | "nuova_costruzione"
  | "ristrutturazione"
  | "manutenzione";

export type SrMaterialePrincipale =
  | "alluminio"
  | "pvc"
  | "legno"
  | "alluminio_legno"
  | "acciaio"
  | "misto";

export type SrMediaKind =
  | "situazione"
  | "prodotto"
  | "cantiere_simile"
  | "render"
  | "allegato";

export interface SrEsigenza {
  titolo: string;
  descrizione: string;
  evidenza?: string;
}

export interface SrSoluzioneItem {
  titolo: string;
  descrizione: string;
}

export interface SrTestimonianza {
  quote: string;
  autore: string;
  citta?: string;
  intervento?: string;
}

export interface SrPianoFinanziamento {
  nome: string;             // "Estesa" / "Standard"
  mesi: number;             // 120
  tasso: number;            // 5.5
  rata_mese: number;
  anticipo: number;
  finanziato: number;
}

export interface SrVariante {
  nome: "standard" | "comfort" | "premium" | string;
  label: string;
  prezzo: number;
  raccomandato?: boolean;
  specs: {
    materiale?: string;
    serie?: string;
    vetro?: string;
    uw?: number;
    rw?: number;
  };
  inclusi?: string[];
}

export interface SrCashflowRiga {
  anno: number;
  risparmio: number;       // € risparmio bolletta
  detrazione: number;      // € rata detrazione fiscale
  totale: number;          // risparmio + detrazione
  cumulato: number;
}

export interface SrProgettoRow {
  id: string;
  company_id: string;
  code: string;
  stato: SrStatoProgetto;
  created_by: string | null;
  created_at: string;
  updated_at: string;

  // Cliente
  cliente_id: string | null;
  cliente_nome: string | null;
  cliente_cognome: string | null;
  cliente_indirizzo: string | null;
  cliente_citta: string | null;
  cliente_cap: string | null;
  cliente_provincia: string | null;
  cliente_telefono: string | null;
  cliente_email: string | null;
  cliente_codice_fiscale: string | null;

  // Cantiere
  cantiere_indirizzo: string | null;
  cantiere_citta: string | null;
  cantiere_cap: string | null;
  cantiere_provincia: string | null;
  cantiere_lat: number | null;
  cantiere_lng: number | null;
  cantiere_zona_climatica: string | null;
  cantiere_piano: string | null;
  cantiere_condominio: boolean;
  cantiere_vincoli: string[] | null;

  // Intervento
  tipo_intervento: SrTipoIntervento;
  intervento_titolo: string | null;
  intervento_sintesi: string | null;
  materiale_principale: SrMaterialePrincipale | null;
  totale_serramenti: number;
  totale_accessori: number;
  metri_quadri_totali: number | null;

  // Copy preventivo
  esigenze: SrEsigenza[];
  soluzione: SrSoluzioneItem[];
  perche_noi: string[] | null;
  incluso_investimento: string[] | null;
  testimonianze: SrTestimonianza[];
  prossimi_passi: string[] | null;

  // Economia
  totale_min: number;
  totale_max: number;
  iva_inclusa: boolean;
  iva_percentuale: number;
  sconto_percentuale: number;
  sconto_importo: number;
  fin_anticipo_pct: number;
  fin_piani: SrPianoFinanziamento[];
  fin_tabella_id: string | null;

  // Varianti
  varianti_attive: boolean;
  varianti: SrVariante[];
  variante_selezionata: string | null;

  // ROI
  risparmio_calcolato: boolean;
  risparmio_eur_anno: number | null;
  detrazione_aliquota: number | null;
  detrazione_eur_totale: number | null;
  detrazione_eur_anno: number | null;
  payback_anni: number | null;
  co2_risparmiata_t_anno: number | null;

  // Consulenza
  consulente_id: string | null;
  consulenza_at: string | null;
  consulenza_luogo: string | null;

  // Cronoprogramma
  crono_giorni_produzione: number;
  crono_giorni_posa: number;
  crono_giorni_collaudo: number;

  // Validità
  valido_fino_giorni: number;
  valido_fino_data: string | null;

  // Microsito pubblico
  public_token: string | null;
  public_url: string | null;
  allow_self_signing: boolean;
  firmato_il: string | null;
  firma_cliente_url: string | null;

  referral_amount_eur: number;

  // Link
  sopralluogo_id: string | null;
  sopralluogo_eseguito_il: string | null;
  opportunita_id: string | null;
  ordine_id: string | null;

  // Output
  pdf_url: string | null;
  pdf_generated_at: string | null;
  pdf_html_url: string | null;

  note_interne: string | null;
}

export interface SrSerramentoRow {
  id: string;
  progetto_id: string;
  company_id: string;
  position: number;
  tipologia: string;
  tipologia_label: string | null;
  ambiente: string | null;
  materiale: SrMaterialePrincipale | null;
  serie: string | null;
  vetro: string | null;
  vetro_specs: Record<string, unknown> | null;
  apertura: string | null;
  colore_interno: string | null;
  colore_esterno: string | null;
  larghezza_mm: number | null;
  altezza_mm: number | null;
  quantita: number;
  metri_quadri: number | null;
  family_id: string | null;
  listino_voce_id: string | null;
  prezzo_unitario: number | null;
  prezzo_totale: number | null;
  foto_storage_path: string | null;
  foto_render_path: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface SrManodoperaRow {
  id: string;
  progetto_id: string;
  company_id: string;
  position: number;
  tariffa_id: string | null;
  variante_id: string | null;
  descrizione: string;
  unita: string | null;
  quantita: number;
  prezzo_unitario_costo: number | null;
  prezzo_unitario_vendita: number | null;
  prezzo_totale_costo: number | null;
  prezzo_totale_vendita: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface SrAccessorioRow {
  id: string;
  progetto_id: string;
  company_id: string;
  position: number;
  tipo: string;
  descrizione: string | null;
  quantita: number;
  prezzo_unitario: number | null;
  prezzo_totale: number | null;
  listino_voce_id: string | null;
  serramento_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface SrMediaRow {
  id: string;
  progetto_id: string;
  company_id: string;
  kind: SrMediaKind;
  storage_path: string;
  url: string | null;
  caption: string | null;
  posizione_pdf: string | null;
  position: number;
  serramento_id: string | null;
  created_at: string;
}

export interface SrCalcoloRisparmioRow {
  id: string;
  progetto_id: string;
  company_id: string;
  zona_climatica: string | null;
  m2_serramenti: number | null;
  uw_attuale: number | null;
  uw_nuovo: number | null;
  gradi_giorno: number | null;
  ore_riscaldamento_giorno: number;
  prezzo_kwh_termico: number | null;
  inflazione_energia_annua: number;
  bolletta_media_anno_eur: number | null;
  risparmio_kwh_anno: number | null;
  risparmio_eur_anno: number | null;
  risparmio_pct: number | null;
  co2_risparmiata_kg_anno: number | null;
  detrazione_aliquota: number | null;
  detrazione_base_eur: number | null;
  detrazione_eur_totale: number | null;
  detrazione_eur_anno: number | null;
  cashflow: SrCashflowRiga[] | null;
  payback_anni: number | null;
  totale_recuperato_10y: number | null;
  calcolato_at: string;
}

export interface SrTemplatePdfRow {
  id: string;
  company_id: string;
  colore_primario: string;
  logo_url: string | null;
  ragione_sociale: string | null;
  indirizzo_completo: string | null;
  telefono: string | null;
  email: string | null;
  partita_iva: string | null;
  esigenze_default: SrEsigenza[];
  soluzione_default: SrSoluzioneItem[];
  perche_noi_default: string[];
  incluso_default: string[];
  prossimi_passi_default: string[];
  testimonianze_default: SrTestimonianza[];
  crono_giorni_produzione_default: number;
  crono_giorni_posa_per_pezzo_default: number;
  crono_giorni_collaudo_default: number;
  iva_percentuale_default: number;
  anticipo_pct_default: number;
  valido_giorni_default: number;
  created_at: string;
  updated_at: string;
}

export interface SrProgettoDetail {
  progetto: SrProgettoRow;
  serramenti: SrSerramentoRow[];
  accessori: SrAccessorioRow[];
  media: SrMediaRow[];
  risparmio: SrCalcoloRisparmioRow | null;
  manodopera: SrManodoperaRow[];
}

// ─── Wizard step ─────────────────────────────────────────────────────────────

export type SrWizardStep =
  | "cliente"
  | "immobile"
  | "esigenze"
  | "bom"
  | "accessori_foto"
  | "economia"
  | "consulenza"
  | "pdf";

export const SR_WIZARD_STEPS: { key: SrWizardStep; label: string; icon: string }[] = [
  { key: "cliente",        label: "Contatto",            icon: "User" },
  { key: "immobile",       label: "Immobile",            icon: "Home" },
  { key: "esigenze",       label: "Contenuti PDF",       icon: "MessageCircle" },
  { key: "bom",            label: "Composizione offerta",icon: "RectangleVertical" },
  { key: "accessori_foto", label: "Accessori e foto",    icon: "Image" },
  { key: "economia",       label: "Economia",            icon: "Euro" },
  { key: "consulenza",     label: "Consulenza",          icon: "Calendar" },
  { key: "pdf",            label: "Genera PDF",          icon: "FileText" },
];

// ─── Tipologie serramento (catalogo statico, override dal listino) ──────────

export const SR_TIPOLOGIE_SERRAMENTO = [
  { value: "finestra_1anta",      label: "Finestra a 1 anta" },
  { value: "finestra_2ante",      label: "Finestra a 2 ante" },
  { value: "finestra_3ante",      label: "Finestra a 3 ante" },
  { value: "finestra_4ante",      label: "Finestra a 4 ante" },
  { value: "portafinestra_1anta", label: "Porta-finestra a 1 anta" },
  { value: "portafinestra_2ante", label: "Porta-finestra a 2 ante" },
  { value: "portafinestra_3ante", label: "Porta-finestra a 3 ante" },
  { value: "alzante_scorrevole",  label: "Alzante-scorrevole" },
  { value: "scorrevole",          label: "Scorrevole" },
  { value: "a_libro",             label: "A libro / pieghevole" },
  { value: "bow_window",          label: "Bow-window" },
  { value: "fisso",               label: "Fisso" },
  { value: "lucernario",          label: "Lucernario" },
  { value: "tonda_ovale",         label: "Tonda / ovale" },
] as const;

export const SR_MATERIALI = [
  { value: "alluminio",       label: "Alluminio" },
  { value: "pvc",             label: "PVC" },
  { value: "legno",           label: "Legno" },
  { value: "alluminio_legno", label: "Alluminio-legno" },
  { value: "acciaio",         label: "Acciaio" },
  { value: "misto",           label: "Misto" },
] as const;

export const SR_ACCESSORI_TIPI = [
  { value: "avvolgibile",  label: "Avvolgibile" },
  { value: "cassonetto",   label: "Sostituzione cassonetto" },
  { value: "zanzariera",   label: "Zanzariera" },
  { value: "persiana",     label: "Persiana" },
  { value: "scuro",        label: "Scuro" },
  { value: "tapparella",   label: "Tapparella" },
  { value: "inferriata",   label: "Inferriata di sicurezza" },
  { value: "davanzale",    label: "Davanzale" },
  { value: "controtelaio", label: "Controtelaio" },
] as const;
