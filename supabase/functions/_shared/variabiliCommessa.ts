/**
 * Variabili di commessa per le email automatiche.
 *
 * Le email che partono dagli eventi di commessa (benvenuto, fattura, data di
 * installazione, saldo) parlano al CLIENTE della commessa, non a un contatto
 * marketing: servono il codice, gli importi, la data di posa, l'IBAN
 * dell'azienda. Qui si costruisce la mappa e si sostituisce nel testo.
 *
 * Modulo puro (niente Deno, niente rete): lo usa `process-automation` e lo
 * provano i test in `src/test/logic/variabiliCommessa.test.ts`.
 */

export interface OrdineVariabili {
  order_code?: string | null;
  description?: string | null;
  total_amount?: number | string | null;
  deposit_amount?: number | string | null;
  balance_amount?: number | string | null;
  expected_date?: string | null;
  work_start_date?: string | null;
  indirizzo_lavori?: string | null;
  work_address?: string | null;
  client_name?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
}

export interface ClienteVariabili {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface AziendaVariabili {
  nome?: string | null;
  email?: string | null;
  telefono?: string | null;
  iban?: string | null;
  intestatario_conto?: string | null;
}

/** Prefissi gestiti qui: un segnaposto con questi prefissi non resta mai stampato. */
const PREFISSI = ["commessa", "cliente", "azienda"] as const;

const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];
const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

const pulito = (v: unknown): string => (v == null ? "" : String(v).trim());

/**
 * «2026-09-25» → «venerdì 25 settembre 2026». Una data senza ora non ha fuso:
 * si legge come data di calendario, non come istante, altrimenti a mezzanotte
 * UTC diventerebbe il giorno prima.
 */
export function dataEstesa(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(pulito(iso));
  if (!m) return "";
  const [anno, mese, giorno] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(anno, mese - 1, giorno));
  if (Number.isNaN(d.getTime()) || d.getUTCMonth() !== mese - 1) return "";
  return `${GIORNI[d.getUTCDay()]} ${giorno} ${MESI[mese - 1]} ${anno}`;
}

/** «2026-09-25» → «25/09/2026». */
export function dataBreve(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(pulito(iso));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** 1234.5 → «1.234,50 €». Vuoto se l'importo manca: meglio che «0,00 €». */
export function euro(v: number | string | null | undefined): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  const [intero, decimali] = Math.abs(n).toFixed(2).split(".");
  const conPunti = intero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "-" : ""}${conPunti},${decimali} €`;
}

/** IBAN a gruppi di quattro, come si stampa su una fattura. */
export function ibanLeggibile(v: string | null | undefined): string {
  const s = pulito(v).replace(/\s+/g, "").toUpperCase();
  return s ? s.replace(/(.{4})/g, "$1 ").trim() : "";
}

export function costruisciVariabiliCommessa(input: {
  ordine: OrdineVariabili;
  cliente?: ClienteVariabili | null;
  azienda?: AziendaVariabili | null;
  fase?: string | null;
}): Record<string, string> {
  const { ordine, cliente, azienda, fase } = input;

  // Il cliente della commessa è un profilo; se manca (commessa importata o
  // creata a mano) restano i campi copiati sulla commessa.
  const nomeDaCommessa = pulito(ordine.client_name);
  const nome = pulito(cliente?.first_name) || nomeDaCommessa.split(/\s+/)[0] || "";
  const cognome = pulito(cliente?.last_name)
    || (pulito(cliente?.first_name) ? "" : nomeDaCommessa.split(/\s+/).slice(1).join(" "));
  const nomeCompleto = [nome, cognome].filter(Boolean).join(" ");

  const saldo = ordine.balance_amount != null && ordine.balance_amount !== ""
    ? ordine.balance_amount
    : ordine.total_amount != null && ordine.deposit_amount != null
      ? Number(ordine.total_amount) - Number(ordine.deposit_amount)
      : null;

  const v: Record<string, string> = {
    "commessa.codice": pulito(ordine.order_code),
    "commessa.descrizione": pulito(ordine.description),
    "commessa.importo": euro(ordine.total_amount),
    "commessa.acconto": euro(ordine.deposit_amount),
    "commessa.saldo": euro(saldo),
    "commessa.data_installazione": dataEstesa(ordine.expected_date),
    "commessa.data_installazione_breve": dataBreve(ordine.expected_date),
    "commessa.inizio_lavori": dataEstesa(ordine.work_start_date),
    "commessa.indirizzo": pulito(ordine.indirizzo_lavori) || pulito(ordine.work_address),
    "commessa.fase": pulito(fase),
    "cliente.nome": nome,
    "cliente.cognome": cognome,
    "cliente.nome_completo": nomeCompleto,
    "cliente.email": pulito(cliente?.email) || pulito(ordine.client_email),
    "cliente.telefono": pulito(cliente?.phone) || pulito(ordine.client_phone),
    "azienda.nome": pulito(azienda?.nome),
    "azienda.email": pulito(azienda?.email),
    "azienda.telefono": pulito(azienda?.telefono),
    "azienda.iban": ibanLeggibile(azienda?.iban),
    "azienda.intestatario_conto": pulito(azienda?.intestatario_conto) || pulito(azienda?.nome),
  };
  return v;
}

/**
 * Sostituisce `{{commessa.x}}`, `{{cliente.x}}`, `{{azienda.x}}`. Un nome
 * sconosciuto con questi prefissi diventa vuoto: un «{{commessa.codce}}» con
 * un refuso non deve arrivare al cliente così com'è. Gli altri segnaposto
 * (contatto, unsubscribe…) restano a chi li gestisce dopo.
 */
export function sostituisciVariabiliCommessa(testo: string, variabili: Record<string, string>): string {
  if (!testo || !testo.includes("{{")) return testo ?? "";
  const re = new RegExp(`\\{\\{\\s*((?:${PREFISSI.join("|")})\\.[\\w]+)\\s*\\}\\}`, "g");
  return testo.replace(re, (_m, chiave: string) => variabili[chiave] ?? "");
}

/**
 * La fattura da allegare: fra i file della commessa, il più recente in una
 * cartella che si chiama «fattur…» (la predefinita è «Fatture e pagamenti»),
 * oppure con «fattur» nel nome del file se la cartella non c'è.
 * Nella cartella finiscono anche le ricevute dei bonifici: se ci sono file con
 * «fattur» nel nome vincono loro, così una ricevuta caricata dopo la fattura
 * non parte al cliente al posto della fattura.
 */
export function scegliFatturaDaAllegare<T extends { file_name: string | null; created_at: string; cartella?: string | null }>(
  file: T[],
): T | null {
  const haFattura = (s: string | null | undefined) => /fattur/i.test(pulito(s));
  const inCartella = file.filter((f) => haFattura(f.cartella));
  const conNome = inCartella.filter((f) => haFattura(f.file_name));
  const candidati = conNome.length > 0
    ? conNome
    : inCartella.length > 0 ? inCartella : file.filter((f) => haFattura(f.file_name));
  if (candidati.length === 0) return null;
  return [...candidati].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}
