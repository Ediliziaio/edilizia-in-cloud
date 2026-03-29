// src/types/fatturazione.ts
// Complete Italian fiscal billing types for the native billing module

export const REGIMI_FISCALI = {
  RF01: 'Ordinario',
  RF02: 'Contribuenti minimi (art.1, c.96-117, L. 244/07)',
  RF04: 'Agricoltura e attività connesse e pesca',
  RF05: 'Vendita sali e tabacchi (art.74, c.1, DPR 633/72)',
  RF06: 'Commercio fiammiferi (art.74, c.1, DPR 633/72)',
  RF07: 'Editoria (art.74, c.1, DPR 633/72)',
  RF08: 'Gestione servizi telefonia pubblica',
  RF09: 'Rivendita documenti di trasporto pubblico',
  RF10: 'Intrattenimenti, giochi (art.74, c.6, DPR 633/72)',
  RF11: 'Agenzie viaggi (art.74-ter, DPR 633/72)',
  RF12: 'Agriturismo (art.5, c.2, L. 413/91)',
  RF13: 'Vendite a domicilio (art.25-bis, c.6, DPR 600/73)',
  RF14: 'Rivendita beni usati, oggetti arte/antiquariato',
  RF15: 'Agenzie vendite all\'asta (art.40-bis, DL 41/95)',
  RF16: 'IVA per cassa P.A. (art.6, c.5, DPR 633/72)',
  RF17: 'IVA per cassa soggetti con volume affari < 2ML',
  RF18: 'Altro',
  RF19: 'Regime forfettario (art.1, c.54-89, L. 190/2014)',
} as const;

export const METODI_PAGAMENTO_SDI = {
  MP01: 'Contanti',
  MP02: 'Assegno',
  MP03: 'Assegno circolare',
  MP04: 'Contanti presso Tesoreria',
  MP05: 'Bonifico',
  MP06: 'Vaglia cambiario',
  MP07: 'Bollettino bancario',
  MP08: 'Carta di pagamento',
  MP09: 'RID',
  MP10: 'RID utenze',
  MP11: 'RID veloce',
  MP12: 'RIBA',
  MP13: 'MAV',
  MP14: 'Quietanza erario',
  MP15: 'Giroconto su conti di contabilità speciale',
  MP16: 'Domiciliazione bancaria',
  MP17: 'Domiciliazione postale',
  MP18: 'Bollettino di c/c postale',
  MP19: 'SEPA Direct Debit',
  MP20: 'SEPA Direct Debit CORE',
  MP21: 'SEPA Direct Debit B2B',
  MP22: 'Trattenuta su somme già riscosse',
  MP23: 'PagoPA',
} as const;

export const NATURE_IVA = {
  N1: 'Escluse ex art. 15',
  N2_1: 'Non soggette – artt. 7-7septies DPR 633/72',
  N2_2: 'Non soggette – altri casi',
  N3_1: 'Non imponibili – esportazioni',
  N3_2: 'Non imponibili – cessioni intracomunitarie',
  N3_3: 'Non imponibili – cessioni verso San Marino',
  N3_4: 'Non imponibili – operazioni assimilate alle esportazioni',
  N3_5: 'Non imponibili – dichiarazioni d\'intento',
  N3_6: 'Non imponibili – altre operazioni',
  N4: 'Esenti',
  N5: 'Regime del margine / IVA non esposta in fattura',
  N6_1: 'Reverse charge – rottami e materiali',
  N6_2: 'Reverse charge – oro e argento puro',
  N6_3: 'Reverse charge – subappalto edile',
  N6_4: 'Reverse charge – cessione fabbricati',
  N6_5: 'Reverse charge – telefoni cellulari',
  N6_6: 'Reverse charge – prodotti elettronici',
  N6_7: 'Reverse charge – comparto edile e connessi',
  N6_8: 'Reverse charge – settore energetico',
  N6_9: 'Reverse charge – altri casi',
  N7: 'IVA assolta in altro stato UE',
} as const;

export const TIPI_DOCUMENTO_FATTURAPA = {
  TD01: 'Fattura',
  TD02: 'Acconto/anticipo su fattura',
  TD03: 'Acconto/anticipo su parcella',
  TD04: 'Nota di credito',
  TD05: 'Nota di debito',
  TD06: 'Parcella',
  TD16: 'Integrazione fattura reverse charge interno',
  TD17: 'Integrazione/autofattura per acquisto servizi dall\'estero',
  TD18: 'Integrazione per acquisto beni intracomunitari',
  TD19: 'Integrazione/autofattura per acquisto beni ex art.17 c.2',
  TD20: 'Autofattura per regolarizzazione',
  TD21: 'Autofattura per splafonamento',
  TD24: 'Fattura differita art.21 c.4 lett.a)',
  TD25: 'Fattura differita art.21 c.4 terzo periodo lett.b)',
  TD27: 'Fattura per autoconsumo o cessioni gratuite',
} as const;

export const CAUSALI_RITENUTA = {
  A: 'Lavoro autonomo – arte o professione',
  B: 'Opere dell\'ingegno, brevetti, know-how',
  C: 'Utili da contratti associazione in partecipazione',
  E: 'Provvigioni agenti, mediatori, rappresentanti',
  M: 'Lavoro autonomo non esercitato abitualmente',
  ZO: 'Titolo diverso dai precedenti',
} as const;

export const TIPI_CASSA_PREVIDENZIALE = {
  TC01: 'Cassa Naz. Geometri',
  TC02: 'EPAP',
  TC03: 'Cassa Naz. Ragionieri',
  TC04: 'Cassa Naz. Periti Ind.',
  TC06: 'INARCASSA',
  TC07: 'Cassa Naz. Biologici',
  TC10: 'ENPAM',
  TC12: 'ENPAVIT',
  TC15: 'CNPR',
  TC22: 'Cassa Naz. Veterinari',
} as const;

// ─── Core interfaces ──────────────────────────────────────────

export interface RigaDocumento {
  id: string;
  numero_linea: number;
  tipo_cessione?: 'SC' | 'PR' | 'AB' | 'AC';
  codice_articolo?: string;
  descrizione: string;
  quantita: number;
  unita_misura: string;
  prezzo_unitario: number;
  sconto_percentuale?: number;
  sconto_valore?: number;
  imponibile: number;
  aliquota_iva: string;
  natura_iva?: keyof typeof NATURE_IVA;
  imposta: number;
  totale_riga: number;
  ritenuta?: boolean;
  riferimento_amministrazione?: string;
  note_riga?: string;
}

export interface RiepilogoIVA {
  aliquota: string;
  natura?: keyof typeof NATURE_IVA;
  imponibile: number;
  imposta: number;
  esigibilita: 'I' | 'D' | 'S';
  riferimento_normativo?: string;
}

export interface ScadenzaPagamento {
  numero_rata: number;
  data_scadenza: string;
  importo: number;
  metodo_pagamento: keyof typeof METODI_PAGAMENTO_SDI;
  iban?: string;
  istituto_finanziario?: string;
  pagato: boolean;
  pagato_at?: string;
  pagato_importo?: number;
}

export interface ClienteSnapshot {
  ragione_sociale: string;
  partita_iva?: string;
  codice_fiscale?: string;
  codice_sdi?: string;
  pec?: string;
  indirizzo_via?: string;
  indirizzo_cap?: string;
  indirizzo_comune?: string;
  indirizzo_provincia?: string;
  indirizzo_nazione?: string;
  tipo_cliente: 'B2B' | 'B2C' | 'PA' | 'Estero';
  cig?: string;
  cup?: string;
}

export type StatoDocumento =
  | 'bozza' | 'emessa' | 'inviata_sdi' | 'consegnata' | 'accettata'
  | 'rifiutata' | 'scaduta' | 'pagata' | 'parzialmente_pagata' | 'stornata' | 'annullata';

export type TipoDocumento =
  | 'fattura' | 'fattura_pa' | 'nota_credito' | 'nota_debito'
  | 'autofattura' | 'fattura_riepilogativa' | 'proforma' | 'preventivo' | 'ddt'
  | 'integrazione_servizi_estero' | 'integrazione_beni_ue' | 'integrazione_beni_extra_ue';

export interface DocumentoFiscale {
  id: string;
  company_id: string;
  tipo: TipoDocumento;
  numero: string;
  numero_progressivo: number;
  anno: number;
  serie?: string;
  data_emissione: string;
  data_scadenza?: string;
  data_consegna?: string;
  anagrafica_id?: string;
  cliente_snapshot: ClienteSnapshot;
  stato: StatoDocumento;

  // SDI
  sdi_id_trasmissione?: string;
  sdi_stato?: string;
  sdi_data_consegna?: string;
  sdi_file_xml_url?: string;
  sdi_ricevuta_url?: string;
  sdi_errori?: unknown[];
  sdi_notifica_tipo?: string;
  trasmissione?: 'sdi' | 'pec' | 'manuale';

  // Righe
  righe: RigaDocumento[];
  riepilogo_iva: RiepilogoIVA[];

  // Totali
  subtotale: number;
  sconto_globale_percentuale?: number;
  sconto_globale_valore?: number;
  imponibile_totale: number;
  iva_totale: number;
  totale_documento: number;
  arrotondamento?: number;

  // Bollo
  bollo_virtuale?: boolean;
  bollo_importo?: number;

  // Ritenuta
  ritenuta_acconto?: boolean;
  ritenuta_tipo?: 'RT01' | 'RT02';
  ritenuta_aliquota?: number;
  ritenuta_causale?: string;
  ritenuta_importo?: number;

  // Cassa
  cassa_previdenziale?: boolean;
  cassa_tipo?: string;
  cassa_aliquota?: number;
  cassa_imponibile?: number;
  cassa_importo?: number;
  cassa_aliquota_iva?: string;
  cassa_ritenuta?: boolean;

  totale_da_pagare: number;

  // Pagamento
  scadenze_pagamento: ScadenzaPagamento[];
  metodo_pagamento_codice?: keyof typeof METODI_PAGAMENTO_SDI;
  metodo_pagamento_nome?: string;
  iban_pagamento?: string;
  bic_pagamento?: string;
  nome_banca?: string;
  intestatario_conto?: string;

  // Riferimenti
  riferimenti_ordine?: unknown[];
  riferimenti_ddt?: unknown[];
  documento_correlato_id?: string;
  ordine_id?: string;

  // PA
  cig?: string;
  cup?: string;
  codice_commessa_convenzione?: string;

  // DDT
  ddt_causale_trasporto?: string;
  ddt_numero_colli?: number;
  ddt_peso?: string;
  ddt_mezzo_trasporto?: string;
  ddt_data_ora_consegna?: string;
  ddt_indirizzo_consegna?: unknown;
  ddt_porto?: 'Franco' | 'Assegnato';
  ddt_aspetto_beni?: string;
  ddt_vettore?: unknown;
  ddt_fatturato?: boolean;
  ddt_fattura_id?: string;

  // Allegati & note
  allegati?: unknown[];
  pdf_url?: string;
  note_documento?: string;
  causale?: unknown[];
  note_interne?: string;

  // Pagamento tracking
  importo_pagato: number;
  pagato_at?: string;

  // Preventivo
  data_validita?: string;
  probabilita_chiusura?: number;
  testo_intro?: string;
  testo_conclusivo?: string;

  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

// ─── Anagrafica types ─────────────────────────────────────────

export type TipoAnagrafica = 'cliente' | 'fornitore' | 'entrambi';
export type TipoSoggetto = 'giuridico' | 'fisico' | 'pa' | 'estero';
export type TipoCliente = 'B2B' | 'B2C' | 'PA' | 'Estero';

export interface AnagraficaNative {
  id: string;
  company_id: string;
  tipo: TipoAnagrafica;
  tipo_soggetto: TipoSoggetto;
  ragione_sociale?: string;
  forma_giuridica?: string;
  nome?: string;
  cognome?: string;
  partita_iva?: string;
  codice_fiscale?: string;
  codice_sdi?: string;
  pec?: string;
  indirizzo_via?: string;
  indirizzo_numero_civico?: string;
  indirizzo_cap?: string;
  indirizzo_comune?: string;
  indirizzo_provincia?: string;
  indirizzo_nazione?: string;
  telefono?: string;
  cellulare?: string;
  email?: string;
  email_fatture?: string;
  sito_web?: string;
  indirizzi_consegna?: unknown[];
  tipo_cliente: TipoCliente;
  aliquota_iva_default?: string;
  sconto_default?: number;
  condizioni_pagamento_default?: string;
  metodo_pagamento_default?: string;
  giorni_pagamento_default?: number;
  iban_cliente?: string;
  bic_cliente?: string;
  cig?: string;
  cup?: string;
  fatturato_totale: number;
  numero_fatture: number;
  ultima_fattura_at?: string;
  note?: string;
  tags?: string[];
  attivo: boolean;
  // Reconciliation fields
  cliente_id?: string | null;
  sync_from_cliente?: boolean;
  last_synced_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArticoloNative {
  id: string;
  company_id: string;
  codice?: string;
  descrizione: string;
  descrizione_estesa?: string;
  unita_misura: string;
  prezzo_vendita: number;
  prezzo_acquisto?: number;
  aliquota_iva: string;
  natura_iva?: string;
  categoria?: string;
  attivo: boolean;
  created_at: string;
  updated_at: string;
}

export interface AnagraficaAzienda {
  id: string;
  company_id: string;
  ragione_sociale: string;
  partita_iva: string;
  codice_fiscale: string;
  forma_giuridica: string;
  indirizzo_via: string;
  indirizzo_numero_civico?: string;
  indirizzo_cap: string;
  indirizzo_comune: string;
  indirizzo_provincia: string;
  indirizzo_nazione: string;
  codice_sdi?: string;
  pec?: string;
  codice_rea?: string;
  capitale_sociale?: number;
  numero_iscr_registro_imprese?: string;
  regime_fiscale: string;
  iban_principale?: string;
  bic_swift?: string;
  intestatario_conto?: string;
  nome_banca?: string;
  logo_url?: string;
  colore_primario?: string;
  font_fattura?: string;
  telefono?: string;
  email?: string;
  sito_web?: string;
  ultimo_numero_fattura: number;
  ultimo_numero_nc: number;
  ultimo_numero_ddt: number;
  ultimo_numero_preventivo: number;
  prefisso_fattura: string;
  prefisso_nc: string;
  prefisso_ddt: string;
  prefisso_preventivo: string;
  anno_corrente: number;
  reset_numeratore_annuale: boolean;
  note_fattura_default?: string;
  condizioni_pagamento_default?: string;
  sdi_provider: 'aruba' | 'infocert' | 'poste' | 'manuale';
  sdi_api_key?: string;
  sdi_configurato: boolean;
  /** Split payment (scissione pagamenti) per fatture verso PA */
  split_payment_pa: boolean;
  created_at: string;
  updated_at: string;
}
