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

/**
 * Il blocco con i dati del cliente. Vuoto se non c'è nessun dato utile.
 * `luogoAppuntamento` è l'indirizzo scritto sull'appuntamento (la sede, il
 * cantiere): si ripete solo se diverso da quello del cliente.
 */
export function schedaClienteEvento(c: ContattoPerEvento | null | undefined, luogoAppuntamento?: string | null): string {
  if (!c) return "";
  const nome = nomeDelContatto(c);
  const indirizzo = indirizzoDelContatto(c);
  const luogo = t(luogoAppuntamento);
  const righe: string[] = [];
  if (nome) righe.push(`Cliente: ${nome}`);
  if (t(c.phone)) righe.push(`Telefono: ${t(c.phone)}`);
  if (t(c.email)) righe.push(`Email: ${t(c.email)}`);
  if (indirizzo) {
    righe.push(`Indirizzo del cliente: ${indirizzo}`);
    righe.push(`Mappa: ${linkMappe(indirizzo)}`);
  }
  const stessoLuogo = luogo && indirizzo && luogo.toLowerCase().replace(/[\s,.]/g, "").includes(t(c.address).toLowerCase().replace(/[\s,.]/g, "")) && !!t(c.address);
  if (luogo && !stessoLuogo) righe.push(`Luogo dell'appuntamento: ${luogo}`);
  if (righe.length === 0) return "";
  return [INIZIO_SCHEDA, ...righe, FINE_SCHEDA].join("\n");
}

/** Toglie il blocco quando l'evento rientra da Google. */
export function senzaSchedaCliente(descrizione: string): string {
  const inizio = INIZIO_SCHEDA.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fine = FINE_SCHEDA.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return descrizione.replace(new RegExp(`${inizio}[\\s\\S]*?${fine}\\n?`, "g"), "");
}
