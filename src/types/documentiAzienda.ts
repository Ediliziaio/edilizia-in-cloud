/**
 * I documenti dell'azienda: le carte della ditta, quelle che se scadono fermano
 * una gara o un cantiere. Le categorie servono solo a raggruppare e a decidere
 * il preavviso di partenza: il nome del documento resta libero.
 */

export const CATEGORIE_DOCUMENTO = [
  'certificazioni',
  'appalti_pubblici',
  'assicurazioni',
  'ambiente_rifiuti',
  'sedi_utenze',
  'sicurezza',
  'altro',
] as const;

export type CategoriaDocumento = (typeof CATEGORIE_DOCUMENTO)[number];

export const ETICHETTA_CATEGORIA: Record<CategoriaDocumento, string> = {
  certificazioni: 'Certificazioni',
  appalti_pubblici: 'Appalti pubblici',
  assicurazioni: 'Assicurazioni',
  ambiente_rifiuti: 'Ambiente e rifiuti',
  sedi_utenze: 'Sedi e utenze',
  sicurezza: 'Sicurezza',
  altro: 'Altro',
};

/** Quanti giorni prima avvisare, se chi carica non sceglie: il DURC scade in fretta, una ISO no. */
export const PREAVVISO_PREDEFINITO: Record<CategoriaDocumento, number> = {
  certificazioni: 60,
  appalti_pubblici: 60,
  assicurazioni: 30,
  ambiente_rifiuti: 30,
  sedi_utenze: 30,
  sicurezza: 30,
  altro: 30,
};

export type StatoDocumento = 'scaduto' | 'in_scadenza' | 'valido' | 'senza_scadenza';

export interface DocumentoAzienda {
  id: string;
  company_id: string;
  categoria: CategoriaDocumento;
  titolo: string;
  ente: string | null;
  numero: string | null;
  sede_id: string | null;
  sede_nome: string | null;
  data_documento: string | null;
  data_scadenza: string | null;
  rinnovo_mesi: number | null;
  alert_giorni_prima: number;
  alert_destinatari: string[];
  file_path: string | null;
  file_name: string | null;
  note: string | null;
  sostituisce_id: string | null;
  created_at: string;
  updated_at: string;
  stato: StatoDocumento;
  giorni_mancanti: number | null;
  versioni_precedenti: number;
}

/** Una versione archiviata: il documento com'era prima di un rinnovo. */
export interface VersioneDocumento {
  id: string;
  titolo: string;
  numero: string | null;
  data_documento: string | null;
  data_scadenza: string | null;
  file_path: string | null;
  file_name: string | null;
  archiviato_il: string | null;
  sostituisce_id: string | null;
}

export interface DatiDocumento {
  categoria: CategoriaDocumento;
  titolo: string;
  ente?: string | null;
  numero?: string | null;
  sede_id?: string | null;
  data_documento?: string | null;
  data_scadenza?: string | null;
  rinnovo_mesi?: number | null;
  alert_giorni_prima?: number;
  /** Chi avvisare. Vuoto = gli amministratori dell'azienda. */
  alert_destinatari?: string[];
  note?: string | null;
  file_path?: string | null;
  file_name?: string | null;
}

/**
 * L'elenco di partenza: le carte che ha quasi ogni impresa edile. Si spunta
 * quello che si ha, il resto sparisce e non torna più. Nessun obbligo: chi non
 * ha la SOA la toglie e non la rivede.
 */
export interface VoceDiPartenza {
  chiave: string;
  titolo: string;
  categoria: CategoriaDocumento;
  ente?: string;
  rinnovo_mesi?: number;
  spiegazione: string;
}

export const ELENCO_DI_PARTENZA: VoceDiPartenza[] = [
  {
    chiave: 'durc',
    titolo: 'DURC',
    categoria: 'appalti_pubblici',
    ente: 'INAIL / INPS / Cassa Edile',
    rinnovo_mesi: 4,
    spiegazione: 'Il documento di regolarità contributiva: vale 120 giorni.',
  },
  {
    chiave: 'soa',
    titolo: 'Attestazione SOA',
    categoria: 'appalti_pubblici',
    rinnovo_mesi: 36,
    spiegazione: 'Serve per gli appalti pubblici sopra i 150.000 euro.',
  },
  {
    chiave: 'visura',
    titolo: 'Visura camerale',
    categoria: 'certificazioni',
    ente: 'Camera di Commercio',
    rinnovo_mesi: 6,
    spiegazione: 'Spesso richiesta aggiornata a sei mesi.',
  },
  {
    chiave: 'iso9001',
    titolo: 'ISO 9001 — Qualità',
    categoria: 'certificazioni',
    rinnovo_mesi: 36,
    spiegazione: 'Certificato di sistema qualità.',
  },
  {
    chiave: 'iso14001',
    titolo: 'ISO 14001 — Ambiente',
    categoria: 'certificazioni',
    rinnovo_mesi: 36,
    spiegazione: 'Certificato di sistema ambientale.',
  },
  {
    chiave: 'iso45001',
    titolo: 'ISO 45001 — Salute e sicurezza',
    categoria: 'certificazioni',
    rinnovo_mesi: 36,
    spiegazione: 'Certificato di salute e sicurezza sul lavoro.',
  },
  {
    chiave: 'rc',
    titolo: 'Polizza responsabilità civile',
    categoria: 'assicurazioni',
    rinnovo_mesi: 12,
    spiegazione: 'La RC della ditta verso terzi e prestatori d’opera.',
  },
  {
    chiave: 'catastrofale',
    titolo: 'Polizza catastrofale',
    categoria: 'assicurazioni',
    rinnovo_mesi: 12,
    spiegazione: 'Eventi naturali: obbligatoria per le imprese dal 2025.',
  },
  {
    chiave: 'rentri',
    titolo: 'Iscrizione RENTRI',
    categoria: 'ambiente_rifiuti',
    rinnovo_mesi: 12,
    spiegazione: 'Il registro elettronico di tracciabilità dei rifiuti.',
  },
  {
    chiave: 'estintori',
    titolo: 'Verifica estintori',
    categoria: 'sicurezza',
    rinnovo_mesi: 6,
    spiegazione: 'Il controllo semestrale di chi fa manutenzione.',
  },
];
