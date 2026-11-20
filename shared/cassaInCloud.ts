export type PuntoVenditaCassa = {
  id: string;
  nome: string;
  partita_iva: string | null;
  citta: string | null;
  valuta: string | null;
  compatibile: boolean;
};

export type CollegamentoCassa = {
  punto_vendita_id: string;
  nome: string;
  ultimo_import: string | null;
  sync_attivo?: boolean;
  ultimo_sync?: string | null;
  errore_sync?: string | null;
};

export type PagamentoCassa = {
  tipo: string;
  importo: number;
  resto: number | null;
  descrizione: string | null;
  differito: boolean;
};

export type ScontrinoCassa = {
  esterno_id: string;
  cassa_id: string | null;
  numero: string | null;
  numero_z: string | null;
  data: string;
  ora: string | null;
  totale: number;
  resto: number | null;
  pagamenti: PagamentoCassa[];
  confermato: boolean | null;
  con_reso: boolean;
  con_fattura: boolean;
  fatture: FatturaDaCassa[];
};

export type FatturaDaCassa = {
  id: string;
  numero: string | null;
  data: string | null;
  differita: boolean | null;
};

export type IvaChiusuraCassa = {
  id: string | null;
  nome: string | null;
  aliquota: number | null;
  natura: string | null;
  ventilazione: boolean;
  non_fiscale: boolean;
  scontrini: number | null;
  annulli: number | null;
  pagamenti: Array<{ tipo: string; importo: number | null; annulli: number | null; descrizione: string | null }>;
};

export type ChiusuraCassa = {
  esterno_id: string;
  cassa_id: string | null;
  numero: string | null;
  giorno: string;
  data_chiusura: string;
  ora: string | null;
  tipo: string | null;
  numero_scontrini: number | null;
  numero_annulli: number | null;
  totale_scontrini: number | null;
  annulli: number | null;
  contanti: number | null;
  elettronici: number | null;
  ticket: number | null;
  non_incassato: number | null;
  differiti: number | null;
  sconti: number | null;
  fatture_dirette: number | null;
  note_credito: number | null;
  conti: number | null;
  iva: IvaChiusuraCassa[];
};

export type EsitoImportCassa = { importati: number; assenti: number; chiusure?: number };

export type ConfrontoCassa = {
  punto_vendita_id: string;
  punto_vendita_nome: string;
  cassa_id: string | null;
  giorno: string;
  numero_scontrini: number;
  totale_scontrini: number;
  scontrini_assenti: number;
  con_resi: boolean;
  con_fatture: boolean;
  con_differiti: boolean;
  chiusure: Array<{ id: string; valuta: string | null; presente: boolean; dati: ChiusuraCassa }>;
};

export type ValoriPropostaCassa = {
  lordo: number;
  contanti: number;
  pos: number;
  ricavi: number;
  iva: number;
  versione: string;
};

export type PropostaCassa = {
  valori: ValoriPropostaCassa | null;
  scrittura_id: string | null;
  accredito_id: string | null;
  scrittura_da_verificare: boolean;
  pos_da_verificare: boolean;
  puo_registrare: boolean;
};

export type AccreditoCassa = {
  id: string;
  bank_transaction_id: string;
  giorno: string | null;
  conto: string;
  lordo: number;
  netto: number;
  commissioni: number;
  chiusure: number;
  dal_chiusure: string | null;
  al_chiusure: string | null;
};

const GIORNO_MS = 86_400_000;
export const GIORNI_IMPORT_CASSA = 31;

const dataRoma = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function giornoCassa(data = new Date()): string {
  return dataRoma.format(data);
}

export function spostaGiornoCassa(giorno: string, giorni: number): string {
  return new Date(Date.parse(`${giorno}T00:00:00Z`) + giorni * GIORNO_MS).toISOString().slice(0, 10);
}

export function intervalliCassa(dal: string, al: string, maxGiorni = GIORNI_IMPORT_CASSA) {
  const inizio = new Date(`${dal}T00:00:00Z`);
  const fine = new Date(`${al}T00:00:00Z`);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (!Number.isFinite(+inizio) || !Number.isFinite(+fine) ||
      iso(inizio) !== dal || iso(fine) !== al || fine < inizio ||
      +fine - +inizio >= maxGiorni * GIORNO_MS) return [];

  // Cassa in Cloud accetta intervalli inferiori a tre giorni.
  const intervalli: Array<{ dal: string; al: string }> = [];
  for (let ts = +inizio; ts <= +fine; ts += 2 * GIORNO_MS) {
    intervalli.push({ dal: iso(new Date(ts)), al: iso(new Date(Math.min(ts + GIORNO_MS, +fine))) });
  }
  return intervalli;
}
