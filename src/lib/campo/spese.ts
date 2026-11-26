/**
 * Spese dell'operaio (24/11/2026): lo scontrino del carburante, del pedaggio, del parcheggio.
 * Una spesa = una foto + un importo. L'ufficio la approva, la rifiuta o la segna rimborsata (`campo_spese`).
 */
export type TipoSpesa = "carburante" | "pedaggio" | "parcheggio" | "pasto" | "materiale" | "altro";
export type StatoSpesa = "inviata" | "approvata" | "rifiutata" | "rimborsata";
export type PagataCon = "soldi_miei" | "carta_aziendale";

export const TIPI_SPESA: { value: TipoSpesa; label: string }[] = [
  { value: "carburante", label: "Carburante" },
  { value: "pedaggio", label: "Pedaggio" },
  { value: "parcheggio", label: "Parcheggio" },
  { value: "pasto", label: "Pasto" },
  { value: "materiale", label: "Materiale" },
  { value: "altro", label: "Altro" },
];

export const STATI_SPESA: Record<StatoSpesa, string> = {
  inviata: "In attesa",
  approvata: "Approvata",
  rifiutata: "Non approvata",
  rimborsata: "Rimborsata",
};

export const COLONNE_SPESA =
  "id, company_id, user_id, order_id, giorno, tipo, importo, descrizione, foto_path, pagata_con, stato, nota_ufficio, deciso_il, created_at, company_cost_id, expense_report_id";

export interface Spesa {
  id: string;
  company_id: string;
  user_id: string;
  order_id: string | null;
  giorno: string;
  tipo: TipoSpesa;
  importo: number;
  descrizione: string | null;
  foto_path: string | null;
  pagata_con: PagataCon;
  stato: StatoSpesa;
  nota_ufficio: string | null;
  deciso_il: string | null;
  created_at: string;
  /** Il costo nato all'approvazione (sul cantiere, se c'è). */
  company_cost_id: string | null;
  /** La nota spese del mese in Tesoreria, se l'ha pagata l'operaio. */
  expense_report_id: string | null;
}

/** «12,50», «12.50 €», «€ 1.234,5» → numero; niente di sensato → null. */
export function leggiImporto(testo: string): number | null {
  let s = testo.replace(/[^\d.,]/g, "");
  if (!s) return null;
  const virgola = s.lastIndexOf(",");
  const punto = s.lastIndexOf(".");
  if (virgola > -1 && punto > -1) {
    // L'ultimo separatore è quello dei decimali, l'altro delle migliaia.
    s = virgola > punto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (virgola > -1) {
    s = s.replace(/,/g, ".");
  }
  if ((s.match(/\./g) ?? []).length > 1) {
    const ultimo = s.lastIndexOf(".");
    s = s.slice(0, ultimo).replace(/\./g, "") + s.slice(ultimo);
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0 || n >= 100_000) return null;
  return Math.round(n * 100) / 100;
}

/** Cartella privata: <azienda>/<utente>/<id>.<estensione> (la regola sul bucket la controlla). */
export function percorsoScontrino(companyId: string, userId: string, spesaId: string, nomeFile: string): string {
  const est = (nomeFile.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  return `${companyId}/${userId}/${spesaId}.${est}`;
}

export function euro(n: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

/** Totali per stato: quanto aspetta, quanto è approvato e da rimborsare. */
export function totaliSpese(spese: Pick<Spesa, "stato" | "importo" | "pagata_con">[]) {
  const somma = (f: (s: Pick<Spesa, "stato" | "importo" | "pagata_con">) => boolean) =>
    Math.round(spese.filter(f).reduce((t, s) => t + Number(s.importo), 0) * 100) / 100;
  return {
    inAttesa: somma(s => s.stato === "inviata"),
    daRimborsare: somma(s => s.stato === "approvata" && s.pagata_con === "soldi_miei"),
  };
}

/** Una segnalazione (ticket dal cantiere) fatta senza rete, con le foto (piano campo completo 1.7). */
export interface SegnalazioneInCoda {
  company_id: string;
  user_id: string;
  riga: Record<string, unknown> & { id: string };
  foto: Array<{ path: string; blob: Blob; contentType: string; nome: string }>;
}

/** Una spesa fatta senza rete, in coda sul telefono (piano campo completo 1.7). `user_id` e `company_id` in cima:
 * la coda li usa per sapere di chi è e di quale azienda (syncItemScope). */
export interface SpesaInCoda {
  company_id: string;
  user_id: string;
  riga: {
    id: string; company_id: string; user_id: string; order_id: string | null; tipo: string; importo: number;
    descrizione: string | null; pagata_con: string; giorno: string;
  };
  foto?: { path: string; blob: Blob; contentType: string };
}
