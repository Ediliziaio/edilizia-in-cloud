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
  prezzo_unitario: number | null;
  prezzo_totale: number | null;
  /** Snapshot delle scelte sugli ASSI (variabili prodotto) della family al
   *  momento del preventivo. Mappa { axis_codice -> axis_value_id }.
   *  Snapshot: se l'azienda modifica le maggiorazioni dopo, i preventivi
   *  gia' creati conservano il prezzo originale. */
  valori_assi: Record<string, string>;
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
  /** Snapshot della modalita_prezzo del listino al momento del pick.
   *  Determina cosa copiare da serramenti: dims (griglia/mq) o quantita (pz). */
  modalita_prezzo: "pz" | "mq" | "griglia" | "misura_libera" | null;
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
  // Personalizzazione PDF avanzata (migration 20270315000000 + 20270317000000 + 20270318000000)
  pdf_cover_hero: string | null;
  pdf_cover_subhero: string | null;
  pdf_cover_eyebrow: string | null;
  pdf_cover_image_url: string | null;
  pdf_cover_overlay_opacity: number | null;
  pdf_cover_bg_color: string | null;
  pdf_cover_eyebrow_size: number | null;
  pdf_cover_title_size: number | null;
  pdf_cover_subtitle_size: number | null;
  pdf_cover_text_color: string | null;
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
  // ─── Blocchi conversione PDF (CRO playbook) ───────────────────────────
  /** Lista garanzie mostrate sulla pagina "Le nostre garanzie". */
  garanzie: SrGaranzia[] | null;
  /** Mostra box urgenza/validità prezzo nel PDF (cover + investimento). */
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
  /** Font family PDF (migration 20270514000000). 'helvetica' (default safe)
   *  | 'inter' | 'roboto'. Helvetica fallback automatico se font fallisce. */
  pdf_font_family: "helvetica" | "inter" | "roboto";
  /** Mostra footer versioning su ogni pagina PDF (migration 20270514010000).
   *  Default true. "Preventivo {code} · v{rev} · pagina X/N · data". */
  pdf_show_revision_footer: boolean;
  /** Mostra footer legale esteso (REA, capitale sociale, PEC). Migration
   *  20270514020000. Default false — opt-in per setup B2B. */
  pdf_show_legal_footer: boolean;
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
  titolo: "Il tuo percorso",
  sottotitolo: "Dalla prima chiamata alla consegna chiavi in mano: ogni fase è documentata.",
  fasi: [
    {
      nome: "Consulenza", icona: "chiamata",
      step: ["Chiamata conoscitiva", "Primo appuntamento", "Comprensione esigenze"],
    },
    {
      nome: "Proposta", icona: "proposta",
      step: ["Ricerca prodotto", "Proposta soluzione", "Offerta personalizzata", "Firma contratto"],
    },
    {
      nome: "Produzione", icona: "produzione",
      step: ["Presa misure", "Produzione", "Consegna magazzino", "Fissaggio data posa"],
    },
    {
      nome: "Montaggio", icona: "montaggio",
      step: ["Preparazione area", "Montaggio", "Pulizia finale", "Collaudo", "Pratica ENEA"],
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

/** Default per garanzie: 5 garanzie standard per serramentisti. */
export const SR_GARANZIE_DEFAULT: SrGaranzia[] = [
  {
    icona: "shield",
    titolo: "Garanzia 10 anni sul prodotto",
    descrizione: "Profili, ferramenta e vetri coperti da garanzia decennale del produttore. Sostituzione gratuita in caso di difetto di fabbrica.",
  },
  {
    icona: "tools",
    titolo: "Posa certificata UNI 11673",
    descrizione: "Garanzia decennale sulla posa eseguita secondo norma UNI 11673 con tripla sigillatura. Nera su bianco in offerta.",
  },
  {
    icona: "clock",
    titolo: "Tempi garantiti contrattualmente",
    descrizione: "Se sforiamo la data di consegna concordata, paghiamo noi la penale. Te la mettiamo per iscritto.",
  },
  {
    icona: "drop",
    titolo: "Zero infiltrazioni in 10 anni",
    descrizione: "Tripla sigillatura perimetrale: nastri autoespandenti + membrana traspirante + finitura. Garantito.",
  },
  {
    icona: "refresh",
    titolo: "Soddisfatto o intervieni gratis",
    descrizione: "Nei primi 12 mesi, qualsiasi anomalia di funzionamento o estetica viene risolta senza alcun costo aggiuntivo.",
  },
];

/** Default per confronto Prima/Dopo numerico (parametri standard infissi). */
export const SR_CONFRONTO_DEFAULT: SrConfrontoRiga[] = [
  { parametro: "Trasmittanza termica Uw", prima: "~3,5 W/m²K", dopo: "1,1 W/m²K", delta: "−68%" },
  { parametro: "Abbattimento acustico", prima: "~26 dB", dopo: "38 dB", delta: "+46%" },
  { parametro: "Tenuta aria", prima: "Classe 1", dopo: "Classe 4", delta: "4×" },
  { parametro: "Bolletta gas stimata/anno", prima: "€1.450", dopo: "€1.310", delta: "−€140" },
];

/** Default certificazioni serramentista standard. */
export const SR_CERTIFICAZIONI_DEFAULT: SrCertificazione[] = [
  { nome: "Marcatura CE", logo_url: null },
  { nome: "UNI EN ISO 9001", logo_url: null },
  { nome: "UNI 11673 (posa)", logo_url: null },
  { nome: "ENEA", logo_url: null },
  { nome: "Confartigianato", logo_url: null },
];

/** Default bonus per value stacking. */
export const SR_BONUS_DEFAULT: SrBonus[] = [
  { icona: "gift", titolo: "Zanzariere magnetiche in regalo", valore_eur: 280 },
  { icona: "tools", titolo: "Pulizia post-cantiere certificata", valore_eur: 150 },
  { icona: "calendar", titolo: "1 anno di assistenza taratura gratuita", valore_eur: 120 },
];

/** Default FAQ con 6 obiezioni comuni del settore serramenti. */
export const SR_FAQ_DEFAULT: SrFaq[] = [
  {
    domanda: "E se piove durante la posa?",
    risposta: "Posiamo in qualsiasi condizione: i nostri teli e protezioni proteggono interni e mobili. Solo in caso di temporale violento o vento forte (sicurezza operatori) rinviamo di 1-2 giorni.",
  },
  {
    domanda: "Devo lasciarvi le chiavi?",
    risposta: "Solo se preferisci. Possiamo lavorare in tua presenza, lasciamo sempre la casa pulita a fine giornata. Per multi-giorno alcuni clienti preferiscono lasciare le chiavi: in quel caso firmiamo verbale.",
  },
  {
    domanda: "Quando arrivano i serramenti?",
    risposta: "Tempistica standard: 60-90 giorni dalla conferma ordine (produzione + logistica). Per ordini urgenti abbiamo accordi con il fornitore per consegne in 30-45 giorni.",
  },
  {
    domanda: "Posso cambiare colore in corso d'opera?",
    risposta: "Fino a 5 giorni dall'ordine senza costi. Dopo, dipende dallo stato di lavorazione: se i profili non sono ancora tagliati, possiamo cambiare. Altrimenti il colore va confermato.",
  },
  {
    domanda: "Funziona anche con condominio storico/vincolato?",
    risposta: "Sì. Per immobili vincolati (centro storico, Belle Arti) prepariamo SCIA e materiale fotografico per autorizzazione. Tempistica aggiuntiva 30-45 giorni per pratica.",
  },
  {
    domanda: "Come avviene il pagamento?",
    risposta: "Acconto alla firma contratto (tipicamente 30-40%), saldo alla consegna serramenti in cantiere. Possibili finanziamenti a tasso agevolato fino a 60 mesi.",
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
  | "investimento"
  | "percorso"
  | "garanzie"
  | "confronto"
  | "faq"
  | "render"
  | "cta"
  | "condizioni";

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
    descrizione: "Anagrafica cliente, esigenze, soluzione, perché scegliere voi.",
    obbligatoria: true,
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
  {
    id: "allegato_tecnico",
    label: "Allegato tecnico",
    descrizione: "Composizione serramenti (foto + scheda tecnica) + La tua consulenza.",
    obbligatoria: true,
  },
  {
    id: "investimento",
    label: "L'investimento",
    descrizione: "Prezzo, modalità pagamento, finanziamento, risparmio + cashflow, incluso.",
    obbligatoria: true,
  },
  {
    id: "percorso",
    label: "Il tuo percorso",
    descrizione: "Pagina con le 4 fasi e gli step (configurata sopra).",
    obbligatoria: false,
  },
  {
    id: "garanzie",
    label: "Le nostre garanzie",
    descrizione: "5 garanzie con badge visivi (decennale, posa, tempi, infiltrazioni, soddisfazione).",
    obbligatoria: false,
  },
  {
    id: "confronto",
    label: "Confronto Prima & Dopo numerico",
    descrizione: "Tabella tecnica: serramento attuale vs nuovo (Uw, acustica, bolletta, ecc).",
    obbligatoria: false,
  },
  {
    id: "render",
    label: "Prima & Dopo (render AI)",
    descrizione: "Foto attuale vs render AI. Mostrata solo se ci sono media.",
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
];

/** Ordine default delle pagine PDF (usato quando pdf_pages_order è NULL). */
export const SR_PDF_PAGES_DEFAULT: SrPdfPageOrderItem[] = SR_PDF_PAGES_META.map((p) => ({
  id: p.id,
  visible: true,
}));

/**
 * Merge robust: prende l'array salvato dall'utente e garantisce:
 *  - tutte le pagine canoniche sono presenti (aggiunge le mancanti in coda)
 *  - filtra id sconosciuti (es. pagina rimossa in futuro update)
 *  - le pagine obbligatorie hanno sempre visible=true (anche se salvato false
 *    da una versione precedente).
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
  // Aggiungi le pagine mancanti in coda (es. nuova pagina rilasciata dopo
  // che l'utente ha già salvato un ordine).
  for (const meta of SR_PDF_PAGES_META) {
    if (!seen.has(meta.id)) {
      out.push({ id: meta.id, visible: true });
    }
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
  /** @deprecated alias di servizi */
  manodopera: SrServizioRow[];
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
  { key: "accessori_foto", label: "Foto e render",       icon: "Image" },
  { key: "economia",       label: "Economia",            icon: "Euro" },
  { key: "consulenza",     label: "Consulenza",          icon: "Calendar" },
  { key: "pdf",            label: "Genera PDF",          icon: "FileText" },
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
