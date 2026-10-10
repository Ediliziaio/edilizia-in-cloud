/**
 * Come si legge una richiesta di modifica del commercialista nella coda di
 * approvazione.
 *
 * La coda mostrava `campo: valore · campo: valore` con i nomi delle colonne del
 * database («due_date», «vat_rate»). Qui i nomi diventano parole italiane e i
 * valori restano corti.
 *
 * Modulo puro: nessun React, nessun Supabase.
 */

// I nomi dei campi come li scrive il database («due_date») diventano parole
// («Scadenza»); quelli che non conosciamo perdono il trattino basso.
const NOMI_CAMPI: Record<string, string> = {
  amount: "Importo",
  importo: "Importo",
  description: "Descrizione",
  descrizione: "Descrizione",
  date: "Data",
  data: "Data",
  due_date: "Scadenza",
  scadenza: "Scadenza",
  supplier: "Fornitore",
  fornitore: "Fornitore",
  category: "Categoria",
  categoria: "Categoria",
  note: "Note",
  notes: "Note",
  name: "Nome",
  title: "Titolo",
  status: "Stato",
  stato: "Stato",
  order_id: "Commessa",
  vat_rate: "Aliquota IVA",
};

export function nomeCampo(chiave: string): string {
  const noto = NOMI_CAMPI[chiave.toLowerCase()];
  if (noto) return noto;
  const parole = chiave.replace(/_/g, " ").trim();
  return parole ? parole.charAt(0).toUpperCase() + parole.slice(1) : chiave;
}

function valoreLeggibile(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "sì" : "no";
  const testo = typeof v === "object" ? JSON.stringify(v) : String(v);
  return testo.length > 80 ? `${testo.slice(0, 77)}…` : testo;
}

export function previewPayload(payload: Record<string, unknown>): string {
  const entries = Object.entries(payload ?? {}).slice(0, 4);
  if (entries.length === 0) return "—";
  return entries.map(([k, v]) => `${nomeCampo(k)}: ${valoreLeggibile(v)}`).join(" · ");
}
