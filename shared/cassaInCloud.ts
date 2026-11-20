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
};

export type EsitoImportCassa = { importati: number; assenti: number };

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
