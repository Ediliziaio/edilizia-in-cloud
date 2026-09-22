/**
 * src/types/serramenti.ts — Domain types per modulo Preventivatore Serramenti
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
  /** Foto/avatar opzionale del cliente (URL storage). Mostrata nel PDF se presente. */
  foto_url?: string;
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
  /**
   * Prezzo pieno scritto a mano, IVA esclusa: sostituisce la somma delle voci
   * (sconto e IVA si calcolano sopra). Null = somma delle voci. Si scrive solo
   * se l'azienda l'ha acceso in Impostazioni → Margini
   * (preventivo_impostazioni.prezzo_finale_a_mano).
   */
  prezzo_manuale?: number | null;
  fin_anticipo_pct: number;
  fin_piani: SrPianoFinanziamento[];
  fin_tabella_id: string | null;
  /** Riga specifica scelta dalla tabella finanziamento (importo×durata→rata). */
  fin_tabella_riga_id: string | null;
  /** FK alla regola di sconto azienda applicata (override manuale possibile). */
  discount_rule_id: string | null;
  /**
   * Modalità pagamento cliente: array di milestone con percentuale.
   * Esempio: [{label:"Acconto",percentuale:30,when:"Firma"},
   *           {label:"Inizio lavori",percentuale:40,when:"Consegna"},
   *           {label:"Saldo",percentuale:30,when:"Fine collaudo"}]
   */
  pagamento_milestones: Array<{ label: string; percentuale: number; when?: string | null }> | null;
  /**
   * Schema pagamento di alto livello: guida i template default per le
   * milestone e mostra/nasconde la sezione finanziaria.
   * - tutto_finanziato:       100% via finanziaria (no milestone)
   * - acconto_finanziato:     1 acconto + saldo via finanziaria
   * - due_acconti_finanziato: 2 acconti + saldo via finanziaria
   * - due_acconti_saldo:      2 acconti + saldo a fine (no finanziaria)
   * - tre_step:               default Italia (firma + merce + saldo)
   * - personalizzato:         l'utente definisce manualmente
   */
  schema_pagamento: SrSchemaPagamento | null;

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

  /** Solo backoffice, mai nel PDF cliente. */
  note_interne: string | null;
  /** Visibili nel PDF cliente (migration 20270513240000): condizioni speciali,
   *  tempi consegna concordati, scelte di stile, ecc. */
  note_cliente: string | null;
  /** Revisioni preventivo (migration 20270513250000). */
  parent_id: string | null;
  revision_number: number;
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
  /** Macrocategoria selezionata manualmente quando il serramento non è
   *  collegato a una family del listino. Usata per fallback foto + pagina
   *  dedicata nel PDF. NULL = nessun override. */
  macrocategoria_override_id: string | null;
  listino_voce_id: string | null;
  /** Snapshot del fornitore/listino usato per il prezzo. Necessario quando
   *  piu' linee prodotto condividono la stessa family e le stesse misure. */
  supplier_catalog_id: string | null;
  supplier_product_line_id: string | null;
  prezzo_unitario: number | null;
  prezzo_totale: number | null;
  /** Snapshot delle scelte sugli ASSI (variabili prodotto) della family al
   *  momento del preventivo. Mappa { axis_codice -> axis_value_id }.
   *  Snapshot: se l'azienda modifica le maggiorazioni dopo, i preventivi
   *  gia' creati conservano il prezzo originale. */
  valori_assi: Record<string, string>;
  /** Per ogni variante, la voce scelta dentro il valore di valori_assi: il
   *  colore vero di «Colore Standard» ({ colore: "Grigio antracite RAL 7016" }).
   *  Migrazione 20280916700000. */
  scelte_assi?: Record<string, string> | null;
  foto_storage_path: string | null;
  foto_render_path: string | null;
  note: string | null;
  /** Se TRUE, esclude la manodopera dal prezzo unitario di questa riga.
   *  Default FALSE = posa inclusa come configurata sull'articolo del listino.
   *  Use case: vendita "solo fornitura" — cliente fa installare da altri,
   *  ricambi, sconto commerciale. Vedi migration 20270513. */
  posa_esclusa: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * SrServizioRow — voci servizi aggiuntivi del preventivo (trasporto, tiro al
 * piano, ENEA, smaltimento, sopralluogo extra...). La manodopera/posa è
 * concettualmente INCLUSA nel prezzo del singolo prodotto del listino
 * (vedi FamilyEditor.posa_tariffa_default_id), non in queste righe.
 *
 * NB: la tabella DB è sr_servizi_progetto (rinominata da sr_manodopera_progetto).
 * Manteniamo alias SrManodoperaRow per retrocompat temporanea.
 */
export interface SrServizioRow {
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

/** @deprecated usare SrServizioRow */
export type SrManodoperaRow = SrServizioRow;

export interface SrAccessorioRow {
  id: string;
  progetto_id: string;
  company_id: string;
  position: number;
  tipo: string;
  descrizione: string | null;
  quantita: number;
  // Misure: aggiunte dalla migration 20270312000000_sr_accessori_misure.sql
  // (use case: dialog "Copia misure dai serramenti"). Prima erano scritte
  // via `as any` cast -> il type system non proteggeva refactor.
  larghezza_mm: number | null;
  altezza_mm: number | null;
  /** La profondità, per il cassonetto (larghezza × altezza × profondità). Migrazione 20280916970000. */
  profondita_mm?: number | null;
  prezzo_unitario: number | null;
  prezzo_totale: number | null;
  listino_voce_id: string | null;
  serramento_id: string | null;
  note: string | null;
  /** Esclude la manodopera dal prezzo unitario di questo accessorio.
   *  Default FALSE = posa inclusa come configurata sul listino. */
  posa_esclusa: boolean;
  // ── Collegamento listino prodotti (migration 20270513220000) ─────────────
  /** FK opzionale a article_families. NULL = riga free-form legacy. */
  family_id: string | null;
  /** Snapshot {axisCode: valueId} delle variabili scelte. */
  valori_assi: Record<string, string> | null;
  /** La voce scelta dentro ogni valore (il colore di una fascia). Migrazione 20280916700000. */
  scelte_assi?: Record<string, string> | null;
  /** Snapshot della modalita_prezzo del listino al momento del pick.
   *  Determina cosa copiare da serramenti: dims (griglia/mq) o quantita (pz). */
  modalita_prezzo: "pz" | "mq" | "griglia" | "misura_libera" | null;
  /** Snapshot del fornitore/listino usato per il prezzo. */
  supplier_catalog_id: string | null;
  supplier_product_line_id: string | null;
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
  /** M11 · Pairing esplicito Before/After. Solo su row di kind='render':
   *  punta alla row di kind='situazione' che è la "prima" accoppiata.
   *  NULL = nessun pair esplicito (fallback session-id legacy). */
  pair_situazione_id: string | null;
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
  // Personalizzazione PDF avanzata (migration 20270315000000 + 20270317000000 + 20270318000000)
  pdf_cover_hero: string | null;
  pdf_cover_subhero: string | null;
  pdf_cover_eyebrow: string | null;
  pdf_cover_image_url: string | null;
  pdf_cover_overlay_opacity: number | null;
  /** M13 · Stile overlay sopra immagine cover. 'flat' (default) |
   *  'gradient' (vertical) | 'gradient_diag' | 'vignette'. */
  pdf_cover_overlay_style: "flat" | "gradient" | "gradient_diag" | "vignette";
  /** M17 · Posizione logo cover. 'top_left' (default) | 'top_right' |
   *  'top_center' | 'hidden'. Solo cover, non altre pagine. */
  pdf_cover_logo_position: "top_left" | "top_right" | "top_center" | "hidden";
  /** Dimensione del logo in copertina come scala % (60–160). NULL = 100% (base). */
  pdf_cover_logo_size: number | null;
  /** Logo versione chiara per la copertina (sfondo scuro). Se null, usa logo_url. */
  pdf_cover_logo_url: string | null;
  /** M18 · Allineamento verticale blocco testo cover. 'bottom' (default) |
   *  'center' | 'top'. Indipendente da pdf_cover_text_align (orizzontale). */
  pdf_cover_text_vertical: "top" | "center" | "bottom";
  /** M19 · Variante decorazione cover. 'square' (default) | 'circle' |
   *  'line' | 'pattern' | 'none'. Ignorato se pdf_cover_show_decoration=false. */
  pdf_cover_decoration_style: "square" | "circle" | "line" | "pattern" | "none";
  pdf_cover_bg_color: string | null;
  pdf_cover_eyebrow_size: number | null;
  pdf_cover_title_size: number | null;
  pdf_cover_subtitle_size: number | null;
  pdf_cover_text_color: string | null;
  pdf_cover_eyebrow_color: string | null;
  pdf_cover_title_color: string | null;
  pdf_cover_subtitle_color: string | null;
  pdf_cover_show_decoration: boolean | null;
  pdf_cover_show_client_card: boolean | null;
  pdf_cover_text_align: string | null;
  pdf_cta_finale_titolo: string | null;
  pdf_cta_finale_passi: string[] | null;
  chi_siamo_attivo: boolean;
  chi_siamo_foto_url: string | null;
  chi_siamo_titolo: string | null;
  chi_siamo_testo: string | null;
  recensioni_attivo: boolean;
  render_disclaimer: string | null;
  consulente_descrizione_default: string | null;
  percorso_cliente: SrPercorsoCliente | null;
  /** Ordine e visibilità delle pagine PDF. NULL = ordine default. */
  pdf_pages_order: SrPdfPageOrderItem[] | null;
  /**
   * I blocchi del preventivo (come funziona, protezione, controlli, documenti,
   * diario): solo i campi che l'azienda ha cambiato rispetto ai testi di serie.
   * Vedi supabase/functions/_shared/blocchiPreventivo.ts.
   */
  pdf_blocchi?: Record<string, unknown> | null;
  // ─── Blocchi conversione PDF (CRO playbook) ───────────────────────────
  /** Lista garanzie mostrate sulla pagina "Le nostre garanzie". */
  garanzie: SrGaranzia[] | null;
  /** Mostra box urgenza/validità prezzo nel PDF (cover + pagina economica). */
  urgenza_attiva: boolean;
  urgenza_titolo: string | null;
  urgenza_descrizione: string | null;
  /** Sconto early bird (es. -5% se firmi entro N giorni). */
  early_bird_attivo: boolean;
  early_bird_pct: number | null;
  early_bird_giorni: number | null;
  /** Tabella confronto numerico Prima/Dopo. */
  confronto_attivo: boolean;
  confronto_titolo: string | null;
  confronto_righe: SrConfrontoRiga[] | null;
  /** Loghi certificazioni mostrati in chi siamo. */
  certificazioni: SrCertificazione[] | null;
  /** Bonus aggiuntivi (value stacking) mostrati nella sezione incluso. */
  bonus_aggiuntivi: SrBonus[] | null;
  /** FAQ pagina dedicata. */
  faq_items: SrFaq[] | null;
  /** Brand legitimacy footer (dati legali). */
  brand_footer_attivo: boolean;
  brand_footer_testo: string | null;
  /** Condizioni e disclaimer legali (pagina appendice). */
  condizioni_legali_attivo: boolean;
  condizioni_legali_testo: string | null;
  /** Allega il modulo di recesso: serve se si firma con un privato a casa sua o a distanza. Spento di serie. */
  modulo_recesso_attivo?: boolean | null;
  /** Mostra il blocco "Firma e conferma online" (link pagina pubblica) nel PDF.
   *  Default false = nascosto. */
  pdf_mostra_firma_online?: boolean;
  /** Font family PDF (migration 20270514000000). 'helvetica' (default safe)
   *  | 'inter' | 'roboto'. Helvetica fallback automatico se font fallisce. */
  pdf_font_family: "helvetica" | "inter" | "roboto";
  /** Mostra footer versioning su ogni pagina PDF (migration 20270514010000).
   *  Default true. "Preventivo {code} · v{rev} · pagina X/N · data". */
  pdf_show_revision_footer: boolean;
  /** Mostra footer legale esteso (REA, capitale sociale, PEC). Migration
   *  20270514020000. Default false — opt-in per setup B2B. */
  pdf_show_legal_footer: boolean;
  /** Template subhero copertina con placeholders (migration 20270514030000).
   *  NULL = fallback a pdf_cover_subhero. Placeholders: {cliente_nome},
   *  {cliente_nome_completo}, {cantiere_citta}, {num_serramenti}, ecc. */
  pdf_cover_subhero_template: string | null;
  /** Mostra rata mensile minima nel box "Totale preventivo" (M7,
   *  migration 20270514040000). Richiede piano di finanziamento configurato.
   *  Default false. */
  pdf_mostra_rata_mensile: boolean;
  /** Mostra prezzo netto dopo recupero fiscale (es. ecobonus 50%) nel box
   *  "Totale preventivo" (M7, migration 20270514040000). Default true. */
  pdf_mostra_recupero_fiscale: boolean;
  /** Mostra mini-tabella 10 anni con breakdown detrazione fiscale (M8,
   *  migration 20270514050000). Off di default. */
  pdf_mostra_tabella_ecobonus: boolean;
  /** Genera una pagina A4 dedicata per ogni gruppo serramento con foto
   *  di sopralluogo o render AI (M9, migration 20270514060000). Off default. */
  pdf_pagine_articolo_dedicate: boolean;
  /** Metriche "Perché noi" data-driven (M10, migration 20270514070000).
   *  Array di big-numbers renderizzate sopra la lista USP nel PDF. */
  pdf_perche_noi_metriche: SrPercheNoiMetrica[];
  /** Galleria foto lavori realizzati (pagina "I nostri lavori" nel PDF). */
  gallery_lavori: Array<{ id: string; url: string; didascalia?: string | null; luogo?: string | null }> | null;
  created_at: string;
  updated_at: string;
}

/** Pagina "Il tuo percorso" del PDF preventivo. Fasi + step editabili. */
export interface SrPercorsoCliente {
  attivo: boolean;
  titolo: string;
  sottotitolo: string;
  fasi: SrPercorsoFase[];
}
export interface SrPercorsoFase {
  /** Nome della fase, mostrato in maiuscolo (es. "CONSULENZA"). */
  nome: string;
  /** Icona key: chiamata | proposta | produzione | montaggio | custom. */
  icona: "chiamata" | "proposta" | "produzione" | "montaggio" | "custom";
  /** Lista step della fase (5 max consigliato per leggibilità PDF). */
  step: string[];
}

/** Template di default (mostrato la prima volta nell'editor). */
export const SR_PERCORSO_DEFAULT: SrPercorsoCliente = {
  attivo: true,
  titolo: "Dal sopralluogo al collaudo",
  sottotitolo: "Un percorso chiaro, con passaggi verificabili prima, durante e dopo la posa.",
  fasi: [
    {
      nome: "Analisi", icona: "chiamata",
      step: ["Raccolta esigenze", "Verifica foto e misure disponibili", "Prima valutazione tecnica"],
    },
    {
      nome: "Rilievo", icona: "proposta",
      step: ["Sopralluogo tecnico", "Rilievo misure definitive", "Verifica posa, soglie e finiture"],
    },
    {
      nome: "Conferma", icona: "produzione",
      step: ["Scelta materiali e accessori", "Preventivo definitivo", "Firma e avvio ordine"],
    },
    {
      nome: "Posa", icona: "montaggio",
      step: ["Programmazione cantiere", "Protezione ambienti", "Montaggio e regolazioni", "Collaudo finale e documenti"],
    },
  ],
};

// ─── Blocchi conversione PDF (CRO playbook) ───────────────────────────────

/** Una garanzia mostrata sulla pagina "Le nostre garanzie". */
export interface SrGaranzia {
  icona: "shield" | "tools" | "money" | "drop" | "refresh" | "clock" | "award" | "custom";
  titolo: string;
  descrizione: string;
}

/** M10 · Metrica "Perché noi" data-driven (big number + label).
 *  Renderizzata come card numerica grande sopra la lista USP bullet. */
export interface SrPercheNoiMetrica {
  /** Numero o stringa breve da mostrare in evidenza (es. "127", "9.4"). */
  value: string;
  /** Etichetta sotto il numero (es. "cantieri completati"). */
  label: string;
  /** Suffisso unità inline al numero, opzionale (es. "/10", "+", "%"). */
  suffix?: string | null;
  /** Emoji singolo o pittogramma (es. "🏗️", "⭐"). */
  icon?: string | null;
  /** Se "auto_anni_fondazione", il PDF deriva value da company.anno_fondazione. */
  auto_kind?: "auto_anni_fondazione" | null;
}

/** M10 · Metriche default suggerite quando l'azienda inizia ad usare la
 *  sezione. Servono come template editabile, non vengono auto-inserite. */
export const SR_PERCHE_NOI_METRICHE_DEFAULT: SrPercheNoiMetrica[] = [
  { value: "—", label: "anni di esperienza", icon: "📅", auto_kind: "auto_anni_fondazione" },
  { value: "—", label: "cantieri completati", icon: "🏗️", auto_kind: null },
  { value: "—", label: "recensioni verificate", icon: "⭐", auto_kind: null },
  { value: "—", label: "anni di garanzia indicati", suffix: null, icon: "🛡️", auto_kind: null },
];

/** Riga della tabella Confronto Prima/Dopo numerico (parametro tecnico). */
export interface SrConfrontoRiga {
  parametro: string;       // "Trasmittanza Uw"
  prima: string;           // "~3,5 W/m²K"
  dopo: string;            // "1,1 W/m²K"
  delta: string | null;    // "-68%" oppure null
}

/** Certificazione/marchio di qualità (logo + nome). */
export interface SrCertificazione {
  nome: string;
  logo_url: string | null;
}

/** Bonus aggiuntivo per value stacking (regalo tangibile con valore €). */
export interface SrBonus {
  icona: "gift" | "tools" | "shield" | "wrench" | "phone" | "calendar" | "custom";
  titolo: string;
  valore_eur: number | null;
}

/** Domanda frequente / obiezione anticipata. */
export interface SrFaq {
  domanda: string;
  risposta: string;
}

/** Default per garanzie: garanzie standard, prudenti e personalizzabili. */
export const SR_GARANZIE_DEFAULT: SrGaranzia[] = [
  {
    icona: "shield",
    titolo: "Garanzia prodotto documentata",
    descrizione: "Profili, vetri e ferramenta sono accompagnati dalle condizioni del produttore, così sai cosa è coperto e per quanto tempo.",
  },
  {
    icona: "tools",
    titolo: "Rilievo tecnico prima dell'ordine",
    descrizione: "Prima della produzione verifichiamo misure, fuori squadra, soglie, spallette e vincoli di posa per ridurre sorprese in cantiere.",
  },
  {
    icona: "clock",
    titolo: "Tempi condivisi e tracciabili",
    descrizione: "Produzione, consegna e posa si fissano in anticipo; se qualcosa cambia, te lo diciamo subito.",
  },
  {
    icona: "drop",
    titolo: "Posa curata nei punti critici",
    descrizione: "Sigillature, fissaggi e finiture scelti per il tuo foro finestra, non uguali per tutti.",
  },
  {
    icona: "refresh",
    titolo: "Assistenza dopo la posa",
    descrizione: "Dopo il montaggio restiamo disponibili per regolazioni, chiarimenti e supporto sulle prime settimane di utilizzo.",
  },
  {
    icona: "award",
    titolo: "Documenti finali ordinati",
    descrizione: "A fine lavoro consegniamo la documentazione utile: dati prodotto, indicazioni di manutenzione e riferimenti per eventuali pratiche.",
  },
];

/** Default per confronto Prima/Dopo numerico (parametri standard infissi). */
export const SR_CONFRONTO_DEFAULT: SrConfrontoRiga[] = [
  // Il meno è quello della tastiera: il segno tipografico «−» non esiste in
  // Helvetica e nel PDF spariva, così «−68%» usciva come un aumento del 68%.
  { parametro: "Trasmittanza termica Uw", prima: "~3,5 W/m²K", dopo: "1,1 W/m²K", delta: "-68%" },
  { parametro: "Abbattimento acustico", prima: "~26 dB", dopo: "38 dB", delta: "+46%" },
  { parametro: "Tenuta aria", prima: "Classe 1", dopo: "Classe 4", delta: "4×" },
  // Tolta il 22/09/2026 la riga «Bolletta gas stimata/anno: € 1.450 → € 1.310»: esce
  // nel PDF di chi non ha scritto le sue righe, con cifre fisse uguali per tutti i
  // clienti, lette come la bolletta di casa propria.
];

/**
 * Le certificazioni che «Ripristina» mette nel modello: solo quelle che valgono per
 * ogni serramentista (la marcatura CE è del prodotto) o che dicono un metodo. Prima
 * c'erano anche ISO 9001, «ENEA» (è l'ente delle pratiche, non una certificazione) e
 * Confartigianato (un'associazione): nel PDF sembravano titoli dell'azienda.
 */
export const SR_CERTIFICAZIONI_DEFAULT: SrCertificazione[] = [
  { nome: "Marcatura CE", logo_url: null },
  { nome: "Posa secondo UNI 11673", logo_url: null },
];

/** Tre omaggi d'esempio, caricabili dall'editor del modello: nel PDF non escono da soli. */
export const SR_BONUS_DEFAULT: SrBonus[] = [
  { icona: "tools", titolo: "Controllo finale e regolazione serramenti", valore_eur: 120 },
  { icona: "gift", titolo: "Pulizia ordinata dell'area di posa a fine lavori", valore_eur: 90 },
  { icona: "calendar", titolo: "Supporto iniziale su uso, manutenzione e documentazione", valore_eur: 60 },
];

/** Default FAQ con 6 obiezioni comuni del settore serramenti. */
export const SR_FAQ_DEFAULT: SrFaq[] = [
  {
    domanda: "Il prezzo può cambiare dopo il sopralluogo?",
    risposta: "Il prezzo può cambiare solo se dal rilievo emergono misure, lavorazioni o vincoli non visibili prima. In quel caso lo segnaliamo prima della conferma definitiva.",
  },
  {
    domanda: "Quando vengono ordinate le misure definitive?",
    risposta: "Le misure definitive vengono prese prima dell'ordine al fornitore o della produzione. È il passaggio che serve per evitare adattamenti improvvisati in posa.",
  },
  {
    domanda: "Quando arrivano i serramenti?",
    risposta: "La tempistica dipende da misure, finiture, disponibilità del fornitore e periodo dell'anno. Prima della conferma indichiamo una finestra realistica di produzione, consegna e posa.",
  },
  {
    domanda: "Cosa devo preparare prima della posa?",
    risposta: "Ti chiediamo di liberare le aree vicine ai serramenti e segnalarci eventuali mobili, impianti o punti delicati. Il resto viene organizzato con la squadra prima del cantiere.",
  },
  {
    domanda: "Il render AI è vincolante?",
    risposta: "No. Il render aiuta a immaginare l'effetto estetico, ma il risultato finale dipende da misure reali, prodotti scelti, luce, finiture e fattibilità tecnica.",
  },
  {
    domanda: "Come avviene il pagamento?",
    risposta: "Lo schema viene indicato nel preventivo: acconto alla conferma, eventuali passaggi intermedi e saldo secondo consegna, avanzamento o posa. Se previsto, possiamo includere anche una simulazione di finanziamento.",
  },
];

/**
 * Identificatori delle pagine del PDF preventivo configurabili dall'admin
 * via Template editor → Ordine pagine.
 *
 * NB: la "cover" è sempre la prima e non rientra qui. I render aggiuntivi
 * (3°, 4° foto AI) escono dall'ordine configurabile: vanno sempre in coda.
 */
export type SrPdfPageId =
  | "chi_siamo"
  | "proposta"
  | "allegato_tecnico"
  | "macro_dedicate"
  | "linee_dedicate"
  | "articoli_dedicati"
  | "investimento"
  | "percorso"
  | "garanzie"
  | "confronto"
  | "faq"
  | "render"
  | "cta"
  | "condizioni"
  | "gallery_lavori"
  // I blocchi della libreria (_shared/blocchiPreventivo.ts): testi e foto di serie
  // per i serramenti, che l'azienda cambia dall'ordine delle pagine.
  | "come_funziona"
  | "protezione"
  | "controlli"
  | "documenti"
  | "diario";

export interface SrPdfPageOrderItem {
  id: SrPdfPageId;
  visible: boolean;
}

/** Metadata user-facing per ogni pagina (label + descrizione + always-visible). */
export interface SrPdfPageMeta {
  id: SrPdfPageId;
  label: string;
  descrizione: string;
  /** Se true, la pagina non può essere nascosta (toggle visible disabilitato). */
  obbligatoria: boolean;
  /**
   * false = la pagina nasce nascosta, anche nei modelli già salvati. Oggi nessuna:
   * dal 22/09/2026 anche i blocchi che promettono qualcosa nascono accesi.
   */
  diSerie?: boolean;
}

export const SR_PDF_PAGES_META: SrPdfPageMeta[] = [
  {
    id: "chi_siamo",
    label: "Chi siamo",
    descrizione: "Presentazione azienda (foto + testo descrittivo).",
    obbligatoria: false,
  },
  {
    id: "proposta",
    label: "Proposta di intervento",
    descrizione: "Anagrafica cliente, esigenze, soluzione, perché scegliere voi, la consulenza con consulente e appuntamento.",
    obbligatoria: true,
  },
  // Cosa rende isolante un serramento, con due foto tecniche: prima dei prodotti,
  // così il cliente sa cosa guardare nelle schede che seguono.
  {
    id: "come_funziona",
    label: "Come è fatto un serramento",
    descrizione: "Vetro, bordo del vetro, telaio e posa spiegati con due foto tecniche.",
    obbligatoria: false,
  },
  // Le pagine dedicate macrocategoria ("Linea Prodotto") sono ora messe
  // PRIMA dell'allegato tecnico: l'utente vede prima la presentazione del
  // catalogo (cos'è la linea INFISSI WND, foto, descrizione estesa) e POI
  // la composizione tecnica dettagliata (cosa entra in cantiere). Senza
  // questo swap il cliente vedeva i singoli pezzi prima di sapere a che
  // linea appartenevano — flusso narrativo invertito.
  {
    id: "macro_dedicate",
    label: "Pagine dedicate macrocategoria",
    descrizione: "Una pagina per ogni macrocategoria con mostra_pagina_dedicata_pdf=true.",
    obbligatoria: false,
  },
  // Le schede delle linee (Listino → linea → «Scheda di …»): una pagina per
  // ogni linea usata nel preventivo, subito dopo quelle delle tipologie.
  {
    id: "linee_dedicate",
    label: "Il sistema scelto (schede delle linee)",
    descrizione: "Una pagina per ogni linea usata, es. PVC Salamander 76: foto del profilo, descrizione e dati tecnici.",
    obbligatoria: false,
  },
  {
    id: "render",
    label: "Prima & Dopo (render AI)",
    descrizione: "Foto attuale vs render AI. Mostrata solo se ci sono media.",
    obbligatoria: false,
  },
  // M9: pagine foto-tecniche dedicate per articolo. Visibili solo se il
  // toggle pdf_pagine_articolo_dedicate è attivo AND ci sono media legati
  // a serramenti via serramento_id. Come tutte le pagine con le immagini dei
  // prodotti stanno PRIMA dell'allegato tecnico (regola del 14/09/2026).
  {
    id: "articoli_dedicati",
    label: "Pagine foto-tecniche per articolo",
    descrizione: "Una pagina per ogni gruppo serramento con foto sopralluogo o render AI.",
    obbligatoria: false,
  },
  {
    id: "allegato_tecnico",
    label: "Allegato tecnico",
    descrizione: "Composizione serramenti (foto + scheda tecnica).",
    obbligatoria: true,
  },
  // La proposta economica segue sempre l'allegato tecnico (regola del
  // 14/09/2026, vedi regoleOrdinePagine): prima i prodotti, poi cosa si
  // installa, poi il prezzo. Percorso, garanzie e confronto vengono dopo.
  {
    id: "investimento",
    label: "Proposta economica",
    descrizione: "Totale preventivo, modalità pagamento, finanziamento, risparmio + cashflow, incluso.",
    obbligatoria: true,
  },
  {
    id: "percorso",
    label: "Il tuo percorso",
    descrizione: "Pagina con le 4 fasi e gli step (configurata sopra).",
    obbligatoria: false,
  },
  // Dopo il percorso, quello che succede in casa durante e dopo la posa: vicino
  // alla decisione rispondono ai dubbi del cliente. Promettono qualcosa: accese di
  // serie (22/09/2026), l'azienda le rilegge e le spegne se non lo fa.
  {
    id: "protezione",
    label: "Protezione della casa",
    descrizione: "Come proteggete pavimenti, muri e arredi durante la posa.",
    obbligatoria: false,
  },
  {
    id: "controlli",
    label: "Controlli di qualità",
    descrizione: "Cosa verificate su ogni serramento prima della consegna.",
    obbligatoria: false,
  },
  {
    id: "documenti",
    label: "Documenti consegnati",
    descrizione: "Il fascicolo che il cliente riceve a fine lavori.",
    obbligatoria: false,
  },
  {
    id: "diario",
    label: "Diario fotografico",
    descrizione: "Le foto della posa, anche dei punti che poi restano coperti.",
    obbligatoria: false,
  },
  {
    id: "garanzie",
    label: "Le nostre garanzie",
    descrizione: "Garanzie e rassicurazioni operative con badge visivi.",
    obbligatoria: false,
  },
  {
    id: "confronto",
    label: "Confronto Prima & Dopo numerico",
    descrizione: "Tabella tecnica indicativa o configurata: serramento attuale vs nuovo.",
    obbligatoria: false,
  },
  {
    id: "faq",
    label: "FAQ — obiezioni anticipate",
    descrizione: "6 domande frequenti con risposte chiare per anticipare i dubbi del cliente.",
    obbligatoria: false,
  },
  {
    id: "cta",
    label: "Pronti per partire + recensioni",
    descrizione: "Box CTA finale + testimonianze cliente (se attive).",
    obbligatoria: true,
  },
  {
    id: "condizioni",
    label: "Condizioni e disclaimer legali",
    descrizione: "Appendice T&C contrattuali + dati legali azienda (P.IVA, REA, assicurazione).",
    obbligatoria: false,
  },
  {
    id: "gallery_lavori",
    label: "I nostri lavori",
    descrizione: "Galleria foto di interventi realizzati dall'azienda.",
    obbligatoria: false,
  },
];

/** Ordine default delle pagine PDF (usato quando pdf_pages_order è NULL). */
export const SR_PDF_PAGES_DEFAULT: SrPdfPageOrderItem[] = SR_PDF_PAGES_META.map((p) => ({
  id: p.id,
  visible: p.diSerie !== false,
}));

/**
 * Merge robust: prende l'array salvato dall'utente e garantisce:
 *  - tutte le pagine canoniche sono presenti (le mancanti entrano dopo la
 *    pagina che le precede nell'ordine di default, nascoste se `diSerie` è false)
 *  - filtra id sconosciuti (es. pagina rimossa in futuro update)
 *  - le pagine obbligatorie hanno sempre visible=true (anche se salvato false
 *    da una versione precedente)
 *  - le pagine con le immagini dei prodotti stanno prima dell'allegato tecnico
 *    e la proposta economica subito dopo (regoleOrdinePagine).
 */
export function normalizePdfPagesOrder(
  saved: SrPdfPageOrderItem[] | null | undefined,
): SrPdfPageOrderItem[] {
  const validIds = new Set<SrPdfPageId>(SR_PDF_PAGES_META.map((p) => p.id));
  const obbligatori = new Set<SrPdfPageId>(
    SR_PDF_PAGES_META.filter((p) => p.obbligatoria).map((p) => p.id),
  );
  const out: SrPdfPageOrderItem[] = [];
  const seen = new Set<SrPdfPageId>();
  for (const item of saved ?? []) {
    if (!item || !validIds.has(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push({
      id: item.id,
      visible: obbligatori.has(item.id) ? true : !!item.visible,
    });
  }
  // Le pagine mancanti (rilasciate dopo che l'utente ha salvato un ordine)
  // entrano dopo la pagina che le precede nell'ordine di default: le schede
  // delle linee seguono le pagine delle tipologie, non finiscono in fondo.
  SR_PDF_PAGES_META.forEach((meta, i) => {
    if (seen.has(meta.id)) return;
    let dopo = -1;
    for (let j = i - 1; j >= 0 && dopo === -1; j--) {
      dopo = out.findIndex((it) => it.id === SR_PDF_PAGES_META[j].id);
    }
    out.splice(dopo + 1, 0, { id: meta.id, visible: meta.diSerie !== false });
    seen.add(meta.id);
  });
  return regoleOrdinePagine(out);
}

/** Le pagine con le immagini dei prodotti: tipologie, schede delle linee, foto e render, pagine articolo. */
const PAGINE_PRODOTTO: SrPdfPageId[] = ["macro_dedicate", "linee_dedicate", "render", "articoli_dedicati"];

/**
 * Due regole che valgono per ogni azienda, qualunque ordine abbia salvato
 * (decise il 14/09/2026): i prodotti si mostrano prima dell'allegato tecnico, e
 * la proposta economica viene subito dopo l'allegato. Una pagina prodotto già
 * messa prima dell'allegato resta dov'è.
 */
function regoleOrdinePagine(pagine: SrPdfPageOrderItem[]): SrPdfPageOrderItem[] {
  const out = [...pagine];
  const indice = (id: SrPdfPageId) => out.findIndex((p) => p.id === id);
  if (indice("allegato_tecnico") === -1) return out;
  const dopoAllegato = out.filter((p, i) => PAGINE_PRODOTTO.includes(p.id) && i > indice("allegato_tecnico"));
  for (const pagina of dopoAllegato) {
    out.splice(indice(pagina.id), 1);
    out.splice(indice("allegato_tecnico"), 0, pagina);
  }
  const iInvestimento = indice("investimento");
  if (iInvestimento !== -1) {
    const [investimento] = out.splice(iInvestimento, 1);
    out.splice(indice("allegato_tecnico") + 1, 0, investimento);
  }
  return out;
}

export interface SrProgettoDetail {
  progetto: SrProgettoRow;
  serramenti: SrSerramentoRow[];
  accessori: SrAccessorioRow[];
  media: SrMediaRow[];
  risparmio: SrCalcoloRisparmioRow | null;
  /** Servizi aggiuntivi (trasporto, ENEA, smaltimento, sopralluogo) */
  servizi: SrServizioRow[];
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

// Step accorpati (6 fasi): "esigenze" (Contenuti PDF) è confluito in "immobile"
// e "consulenza" in "pdf". Le chiavi esigenze/consulenza restano valide nel tipo
// (i componenti StepContenuti/StepConsulenza vengono renderizzati dentro gli step
// accorpati) ma non compaiono più come fasi separate → flusso più snello.
export const SR_WIZARD_STEPS: { key: SrWizardStep; label: string; icon: string }[] = [
  { key: "cliente",        label: "Contatto",             icon: "User" },
  { key: "immobile",       label: "Immobile e contenuti", icon: "Home" },
  { key: "bom",            label: "Composizione offerta", icon: "RectangleVertical" },
  { key: "accessori_foto", label: "Foto e render",        icon: "Image" },
  { key: "economia",       label: "Economia",             icon: "Euro" },
  { key: "pdf",            label: "Consulenza e PDF",      icon: "FileText" },
];

// ─── Tipologie serramento (catalogo statico, override dal listino) ──────────

// ─── Schema pagamento (modalità di alto livello) ──────────────────────────

export type SrSchemaPagamento =
  | "tutto_finanziato"
  | "acconto_finanziato"
  | "due_acconti_finanziato"
  | "due_acconti_saldo"
  | "tre_step"
  | "personalizzato";

export interface SrPagamentoMilestone {
  label: string;
  percentuale: number;
  when?: string | null;
}

/**
 * Template milestone per ogni schema. La somma fa 100% (eccetto schemi
 * "personalizzato" che parte vuoto). Le label/when sono editabili dopo.
 */
export const SR_SCHEMI_PAGAMENTO: Record<SrSchemaPagamento, {
  label: string;
  description: string;
  hasFinanziamento: boolean;
  milestones: SrPagamentoMilestone[];
}> = {
  tutto_finanziato: {
    label: "Tutto finanziato",
    description: "Importo intero tramite finanziaria, niente acconto cliente.",
    hasFinanziamento: true,
    milestones: [
      { label: "Finanziamento", percentuale: 100, when: "Erogato dalla finanziaria all'inizio dei lavori" },
    ],
  },
  acconto_finanziato: {
    label: "Acconto + finanziato",
    description: "Acconto alla firma + resto via finanziaria.",
    hasFinanziamento: true,
    milestones: [
      { label: "Acconto alla firma", percentuale: 30, when: "Firma contratto" },
      { label: "Finanziamento", percentuale: 70, when: "Erogato all'inizio lavori" },
    ],
  },
  due_acconti_finanziato: {
    label: "2 acconti + finanziato",
    description: "Firma + arrivo merce + resto via finanziaria.",
    hasFinanziamento: true,
    milestones: [
      { label: "Acconto alla firma", percentuale: 20, when: "Firma contratto" },
      { label: "Acconto arrivo merce", percentuale: 30, when: "Merce in magazzino" },
      { label: "Finanziamento", percentuale: 50, when: "Erogato all'inizio lavori" },
    ],
  },
  due_acconti_saldo: {
    label: "2 acconti + saldo",
    description: "Firma + arrivo merce + saldo a fine lavori, senza finanziaria.",
    hasFinanziamento: false,
    milestones: [
      { label: "Acconto alla firma", percentuale: 30, when: "Firma contratto" },
      { label: "Acconto arrivo merce", percentuale: 40, when: "Merce in magazzino" },
      { label: "Saldo", percentuale: 30, when: "Fine collaudo" },
    ],
  },
  tre_step: {
    label: "3 step (firma + merce + saldo)",
    description: "Pattern standard: acconto firma + acconto arrivo merce + saldo prima dei lavori.",
    hasFinanziamento: false,
    milestones: [
      { label: "Acconto alla firma", percentuale: 30, when: "Firma contratto" },
      { label: "Acconto arrivo merce", percentuale: 40, when: "Merce in magazzino" },
      { label: "Saldo", percentuale: 30, when: "Prima dei lavori" },
    ],
  },
  personalizzato: {
    label: "Personalizzato",
    description: "Crea uno schema su misura per questo cliente.",
    hasFinanziamento: true,
    milestones: [],
  },
};

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
