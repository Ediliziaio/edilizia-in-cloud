/**
 * Esportazione completa dei dati dell'azienda (ondata 6).
 *
 * Quello che esisteva era l'export GDPR del SINGOLO utente (Art. 20:
 * profilo, sue commesse, suoi contatti) e una manciata di export per elenco.
 * Mancava la cosa che un imprenditore chiede quando vuole un backup, cambiare
 * gestionale o dare i dati al commercialista: tutto, in un colpo, leggibile.
 *
 * Scelte:
 *  - un CSV per tabella dentro un unico zip, non un JSON: il CSV lo apre chi lo
 *    riceve, il JSON no;
 *  - si scarica a blocchi di 1000 righe, così una tabella grande non fa una
 *    richiesta enorme né tiene tutto in memoria in una volta sola;
 *  - se una tabella non è leggibile (permessi, tabella assente) NON si
 *    interrompe tutto e non la si salta in silenzio: finisce nel resoconto e
 *    dentro lo zip come riga di un file `_mancanti.txt`. Un backup che tace su
 *    quello che non contiene è peggio di nessun backup.
 */
import { supabase } from "@/integrations/supabase/client";
import { neutralizeCsvFormula } from "@/lib/csvExport";

export interface TabellaEsportabile {
  /** Nome della tabella nel database. */
  tabella: string;
  /** Nome del file dentro lo zip, senza estensione. */
  file: string;
  /** Come si chiama per l'utente. */
  etichetta: string;
}

/**
 * Cosa entra nell'export. Solo tabelle con `company_id`: senza quello non si
 * può garantire che si stiano esportando i dati di QUESTA azienda e non di
 * un'altra, e un export che sconfina è un incidente, non una funzione.
 */
export const TABELLE_EXPORT: TabellaEsportabile[] = [
  { tabella: "profiles", file: "anagrafiche", etichetta: "Anagrafiche (clienti e personale)" },
  { tabella: "orders", file: "commesse", etichetta: "Commesse" },
  { tabella: "quotes", file: "preventivi", etichetta: "Preventivi" },
  { tabella: "quote_items", file: "preventivi-righe", etichetta: "Righe dei preventivi" },
  { tabella: "marketing_contacts", file: "contatti", etichetta: "Contatti" },
  { tabella: "suppliers", file: "fornitori", etichetta: "Fornitori" },
  { tabella: "purchase_orders", file: "ordini-acquisto", etichetta: "Ordini di acquisto" },
  { tabella: "documenti_fiscali", file: "documenti-fiscali", etichetta: "Documenti fiscali" },
  { tabella: "warehouse_stock", file: "magazzino", etichetta: "Magazzino" },
  { tabella: "warehouse_movements", file: "magazzino-movimenti", etichetta: "Movimenti di magazzino" },
  { tabella: "giornale_lavori", file: "giornale-lavori", etichetta: "Giornale dei lavori" },
  { tabella: "appointments", file: "appuntamenti", etichetta: "Appuntamenti" },
  { tabella: "tickets", file: "assistenza", etichetta: "Ticket di assistenza" },
  { tabella: "tasks", file: "attivita", etichetta: "Attività" },
  { tabella: "impianti_cliente", file: "impianti", etichetta: "Impianti" },
  { tabella: "contratti_manutenzione", file: "contratti-manutenzione", etichetta: "Contratti di manutenzione" },
  { tabella: "company_activity_log", file: "registro-attivita", etichetta: "Registro attività" },
];

const RIGHE_PER_BLOCCO = 1000;

export interface EsitoTabella {
  tabella: string;
  etichetta: string;
  righe: number;
  /** Presente solo se la tabella non è stata esportata. */
  errore?: string;
}

/** Una cella CSV, con le date leggibili e gli oggetti in JSON compatto. */
export function cellaCsv(valore: unknown): string {
  if (valore === null || valore === undefined) return "";
  if (typeof valore === "object") return JSON.stringify(valore);
  return String(valore);
}

/**
 * Costruisce un CSV con separatore `;` (quello che Excel italiano si aspetta)
 * dalle righe di una tabella, prendendo le intestazioni dall'unione delle
 * chiavi: righe con colonne mancanti non sfalsano le colonne.
 */
export function csvDaRighe(righe: Array<Record<string, unknown>>): string {
  if (righe.length === 0) return "";
  const intestazioni: string[] = [];
  const viste = new Set<string>();
  for (const r of righe) {
    for (const k of Object.keys(r)) {
      if (!viste.has(k)) { viste.add(k); intestazioni.push(k); }
    }
  }
  const cella = (v: unknown) => {
    const testo = neutralizeCsvFormula(cellaCsv(v));
    return /[";\n\r]/.test(testo) ? `"${testo.replace(/"/g, '""')}"` : testo;
  };
  const linee = [intestazioni.join(";")];
  for (const r of righe) linee.push(intestazioni.map((h) => cella(r[h])).join(";"));
  return linee.join("\r\n");
}

/** Scarica una tabella intera, a blocchi. */
export async function scaricaTabella(
  tabella: string,
  companyId: string,
): Promise<Array<Record<string, unknown>>> {
  const tutte: Array<Record<string, unknown>> = [];
  for (let da = 0; ; da += RIGHE_PER_BLOCCO) {
    const { data, error } = await supabase
      .from(tabella as never)
      .select("*")
      .eq("company_id", companyId)
      .range(da, da + RIGHE_PER_BLOCCO - 1);
    if (error) throw new Error(error.message);
    const blocco = (data ?? []) as unknown as Array<Record<string, unknown>>;
    tutte.push(...blocco);
    if (blocco.length < RIGHE_PER_BLOCCO) break;
  }
  return tutte;
}

/** Nome del file zip: azienda e data, così due export non si confondono. */
export function nomeArchivio(nomeAzienda: string | null | undefined, quando = new Date()): string {
  const pulito = (nomeAzienda ?? "azienda")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "azienda";
  const g = quando.toISOString().slice(0, 10);
  return `dati-${pulito}-${g}.zip`;
}

/** Riepilogo leggibile di cosa è entrato e cosa no, incluso nello zip. */
export function riepilogoTestuale(esiti: EsitoTabella[], nomeAzienda: string | null | undefined, quando = new Date()): string {
  const righe: string[] = [
    `Esportazione dati — ${nomeAzienda ?? "azienda"}`,
    `Generata il ${quando.toLocaleString("it-IT")}`,
    "",
    "CONTENUTO",
  ];
  for (const e of esiti.filter((x) => !x.errore)) {
    righe.push(`- ${e.etichetta}: ${e.righe} righe`);
  }
  const falliti = esiti.filter((x) => x.errore);
  if (falliti.length > 0) {
    righe.push("", "NON ESPORTATO — questi dati NON sono in questo archivio:");
    for (const e of falliti) righe.push(`- ${e.etichetta}: ${e.errore}`);
  }
  return righe.join("\n");
}
