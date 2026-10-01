/**
 * La scheda del cliente nella descrizione dell'evento di Google Calendar (01/10/2026).
 *
 * Il Bagno Group: chi va dal cliente (William e gli altri) apre l'evento sul
 * telefono e deve trovarci subito chi è, il telefono e l'INDIRIZZO della persona.
 * Prima la descrizione era solo la nota scritta a mano nell'appuntamento: nei
 * sopralluoghi e nei rilievi restava vuota, e l'indirizzo stava solo nella
 * scheda del contatto in EiC.
 *
 * Il blocco sta tra due righe fisse: quando l'evento torna da Google (sync a due
 * vie) il blocco si toglie, così non si salva dentro la nota dell'appuntamento e
 * non si duplica a ogni giro. Qui solo testo, senza database: provato a parte.
 */

export const INIZIO_SCHEDA = "— Scheda cliente (aggiornata da Edilizia in Cloud) —";
export const FINE_SCHEDA = "— fine scheda cliente —";

export interface ContattoPerEvento {
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  province?: string | null;
}

const t = (v: unknown): string => String(v ?? "").trim();

/** «Via Roma 5, 20159 Milano (MI)»; senza ripetere la città se già scritta nella via. */
export function indirizzoDelContatto(c: ContattoPerEvento | null | undefined): string {
  if (!c) return "";
  const via = t(c.address);
  const citta = t(c.city);
  const cap = t(c.postal_code);
  const prov = t(c.province).toUpperCase();
  const cittaGiaInVia = !!citta && via.toLowerCase().includes(citta.toLowerCase());
  const coda = [cap, cittaGiaInVia ? "" : citta].filter(Boolean).join(" ");
  const provScritta = !!prov && !via.toUpperCase().includes(`(${prov})`);
  // Senza CAP né città da aggiungere la provincia segue la via, senza virgola davanti.
  if (!coda) return provScritta ? [via, `(${prov})`].filter(Boolean).join(" ") : via;
  return [via, provScritta ? `${coda} (${prov})` : coda].filter(Boolean).join(", ");
}

export function nomeDelContatto(c: ContattoPerEvento | null | undefined): string {
  if (!c) return "";
  const persona = [t(c.first_name), t(c.last_name)].filter(Boolean).join(" ");
  return persona || t(c.company_name);
}

/** Collegamento a Google Maps per aprire il navigatore con un tocco. */
export function linkMappe(indirizzo: string): string {
  return indirizzo ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(indirizzo)}` : "";
}

export interface DatiEvento {
  contatto?: ContattoPerEvento | null;
  /** Indirizzo scritto sull'appuntamento (la sede, il cantiere). */
  luogo?: string | null;
  titolo?: string | null;
  /** Data ISO «2026-10-03» e ora «10:00:00». */
  data?: string | null;
  ora?: string | null;
  oraFine?: string | null;
  nomeAzienda?: string | null;
}

/** La descrizione di serie, se il calendario non ne ha una sua. */
export const MODELLO_DESCRIZIONE_STANDARD = [
  "Cliente: {{nome_completo}}",
  "Telefono: {{telefono}}",
  "Email: {{email}}",
  "Indirizzo del cliente: {{indirizzo_completo}}",
  "Mappa: {{mappa}}",
  "Luogo dell'appuntamento: {{luogo_diverso}}",
].join("\n");

/** Le variabili che il modello del calendario può usare (per il selettore nelle impostazioni). */
export const VARIABILI_DESCRIZIONE_EVENTO: { key: string; label: string }[] = [
  { key: "nome_completo", label: "Nome e cognome" },
  { key: "nome", label: "Nome" },
  { key: "cognome", label: "Cognome" },
  { key: "telefono", label: "Telefono" },
  { key: "email", label: "Email" },
  { key: "indirizzo_completo", label: "Indirizzo completo (via, CAP, città, provincia)" },
  { key: "indirizzo", label: "Via e numero" },
  { key: "cap", label: "CAP" },
  { key: "citta", label: "Città" },
  { key: "provincia", label: "Provincia" },
  { key: "mappa", label: "Link a Google Maps" },
  { key: "azienda", label: "Azienda del cliente" },
  { key: "luogo", label: "Luogo dell'appuntamento" },
  { key: "luogo_diverso", label: "Luogo, solo se diverso da casa del cliente" },
  { key: "titolo", label: "Titolo dell'appuntamento" },
  { key: "data", label: "Data" },
  { key: "ora", label: "Ora" },
];

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

function dataLeggibile(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t(iso));
  return m ? `${Number(m[3])} ${MESI[Number(m[2]) - 1] ?? ""} ${m[1]}` : "";
}

/** I valori per nome. I prefissi contact./contatto./appointment./appuntamento./system. si accettano. */
function valoriEvento(d: DatiEvento): Record<string, string> {
  const c = d.contatto ?? {};
  const indirizzo = indirizzoDelContatto(c);
  const luogo = t(d.luogo);
  const via = t(c.address);
  const normalizza = (x: string) => x.toLowerCase().replace(/[\s,.]/g, "");
  const stessoLuogo = !!luogo && !!via && normalizza(luogo).includes(normalizza(via));
  const nomeCompleto = nomeDelContatto(c);
  return {
    nome: t(c.first_name), first_name: t(c.first_name),
    cognome: t(c.last_name), last_name: t(c.last_name),
    nome_completo: nomeCompleto, full_name: nomeCompleto, name: nomeCompleto,
    telefono: t(c.phone), phone: t(c.phone),
    email: t(c.email),
    indirizzo: via, address: via,
    cap: t(c.postal_code), postal_code: t(c.postal_code),
    citta: t(c.city), city: t(c.city),
    provincia: t(c.province).toUpperCase(), province: t(c.province).toUpperCase(),
    indirizzo_completo: indirizzo,
    mappa: linkMappe(indirizzo),
    azienda: t(c.company_name), company_name: t(c.company_name),
    luogo, luogo_diverso: stessoLuogo ? "" : luogo,
    titolo: t(d.titolo), title: t(d.titolo),
    data: dataLeggibile(d.data), date: dataLeggibile(d.data),
    ora: t(d.ora).slice(0, 5), time: t(d.ora).slice(0, 5),
    ora_fine: t(d.oraFine).slice(0, 5),
    company_name_azienda: t(d.nomeAzienda),
  };
}

const PREFISSI = /^(?:contact|contatto|appointment|appuntamento|system)\./i;

/**
 * Scrive la descrizione dell'evento da un modello con le variabili {{…}}.
 * - Una riga le cui variabili sono TUTTE vuote sparisce (niente «Email: » a vuoto).
 * - Le variabili sconosciute passano per `applicaCustom` (i campi personalizzati del
 *   contatto, {{contact.nome_del_campo}}); se restano vuote, la riga sparisce.
 * - La nota scritta a mano nell'appuntamento sta SEMPRE sopra il blocco (non è una variabile):
 *   il blocco si toglie quando l'evento rientra da Google, la nota no.
 * - Il risultato sta tra le due righe fisse, così quando l'evento rientra da Google
 *   il blocco si toglie. Vuoto se non resta nessuna riga.
 */
export function descrizioneDaModello(
  modello: string | null | undefined,
  dati: DatiEvento,
  applicaCustom?: (testo: string) => string,
): string {
  const base = t(modello) ? String(modello) : MODELLO_DESCRIZIONE_STANDARD;
  const valori = valoriEvento(dati);
  const righe: string[] = [];
  for (const originale of base.split(/\r?\n/)) {
    if (!originale.includes("{{")) {
      if (originale.trim()) righe.push(originale.trimEnd());
      continue;
    }
    let riga = originale.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (tutto, nome: string) => {
      const chiave = nome.replace(PREFISSI, "").toLowerCase();
      if (/^(system\.)?company_name$/i.test(nome)) return t(dati.nomeAzienda);
      return Object.prototype.hasOwnProperty.call(valori, chiave) ? valori[chiave] : tutto;
    });
    if (riga.includes("{{") && applicaCustom) riga = applicaCustom(riga);
    // Variabili che nessuno sa risolvere: spariscono, non si stampano come sono.
    riga = riga.replace(/\{\{\s*[\w.-]+\s*\}\}/g, "");
    const staticoSolo = originale.replace(/\{\{[^}]*\}\}/g, "");
    const senzaSpazi = (x: string) => x.replace(/\s+/g, "");
    if (senzaSpazi(riga) === senzaSpazi(staticoSolo)) continue; // tutte le variabili vuote
    righe.push(riga.trimEnd());
  }
  if (righe.length === 0) return "";
  return [INIZIO_SCHEDA, ...righe, FINE_SCHEDA].join("\n").slice(0, 4000);
}

/** La scheda standard (nessun modello del calendario). */
export function schedaClienteEvento(c: ContattoPerEvento | null | undefined, luogoAppuntamento?: string | null): string {
  if (!c) return "";
  return descrizioneDaModello(null, { contatto: c, luogo: luogoAppuntamento });
}

/** Toglie il blocco quando l'evento rientra da Google. */
export function senzaSchedaCliente(descrizione: string): string {
  const inizio = INIZIO_SCHEDA.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fine = FINE_SCHEDA.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return descrizione.replace(new RegExp(`${inizio}[\\s\\S]*?${fine}\\n?`, "g"), "");
}
