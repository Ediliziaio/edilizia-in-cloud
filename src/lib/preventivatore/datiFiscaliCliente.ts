/**
 * I dati fiscali del cliente di un preventivo (30/10/2026): un privato ha il
 * codice fiscale, un'azienda la partita IVA (più codice fiscale, PEC e codice
 * destinatario per la fattura elettronica). Prima il preventivo aveva solo
 * «Committente: nome o ragione sociale», e il contratto firmato non diceva a
 * chi era intestato davvero.
 *
 * I controlli sono di forma, non bloccano: un preventivo si può preparare anche
 * prima di avere il codice fiscale del cliente.
 */

export type TipoCliente = "privato" | "azienda";

export interface DatiFiscaliCliente {
  tipo: TipoCliente;
  codiceFiscale?: string | null;
  partitaIva?: string | null;
  pec?: string | null;
  codiceSdi?: string | null;
}

const pulito = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "").toUpperCase();

/** Codice fiscale di una persona (16 caratteri, con omocodie) o di un'azienda (11 cifre). */
export function codiceFiscaleValido(cf: string): boolean {
  const c = pulito(cf);
  if (/^\d{11}$/.test(c)) return partitaIvaValida(c);
  if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(c)) return false;
  const dispari: Record<string, number> = { 0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21, A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23 };
  let somma = 0;
  for (let k = 0; k < 15; k++) {
    const ch = c[k];
    somma += k % 2 === 0 ? dispari[ch] : /\d/.test(ch) ? Number(ch) : ch.charCodeAt(0) - 65;
  }
  return String.fromCharCode(65 + (somma % 26)) === c[15];
}

/** Partita IVA italiana: 11 cifre con la cifra di controllo. Accetta il prefisso «IT». */
export function partitaIvaValida(piva: string): boolean {
  const p = pulito(piva).replace(/^IT/, "");
  if (!/^\d{11}$/.test(p)) return false;
  let somma = 0;
  for (let k = 0; k < 10; k++) {
    let n = Number(p[k]);
    if (k % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    somma += n;
  }
  return (10 - (somma % 10)) % 10 === Number(p[10]);
}

/** Il codice destinatario della fattura elettronica: 7 caratteri (6 per la PA). */
export const codiceSdiValido = (sdi: string) => /^[A-Z0-9]{6,7}$/.test(pulito(sdi));

/** Cosa manca o non torna, in parole: vuoto se è tutto a posto o se il campo non è stato scritto. */
export function avvisiDatiFiscali(d: DatiFiscaliCliente): Partial<Record<"codiceFiscale" | "partitaIva" | "codiceSdi", string>> {
  const out: Partial<Record<"codiceFiscale" | "partitaIva" | "codiceSdi", string>> = {};
  if (pulito(d.codiceFiscale) && !codiceFiscaleValido(d.codiceFiscale!)) out.codiceFiscale = "Codice fiscale non valido: controlla i 16 caratteri.";
  if (d.tipo === "azienda" && pulito(d.partitaIva) && !partitaIvaValida(d.partitaIva!)) out.partitaIva = "Partita IVA non valida: servono 11 cifre corrette.";
  if (d.tipo === "azienda" && pulito(d.codiceSdi) && !codiceSdiValido(d.codiceSdi!)) out.codiceSdi = "Il codice destinatario ha 7 caratteri (6 per la Pubblica Amministrazione).";
  return out;
}

/** La riga dei dati fiscali per il PDF: «C.F. …» per un privato, «P.IVA … · C.F. … · PEC … · SDI …» per un'azienda. */
export function rigaDatiFiscali(d: DatiFiscaliCliente): string {
  const cf = pulito(d.codiceFiscale), piva = pulito(d.partitaIva).replace(/^IT/, ""), sdi = pulito(d.codiceSdi), pec = (d.pec ?? "").trim();
  if (d.tipo === "privato") return cf ? `C.F. ${cf}` : "";
  return [piva && `P.IVA ${piva}`, cf && cf !== piva && `C.F. ${cf}`, pec && `PEC ${pec}`, sdi && `Codice destinatario ${sdi}`].filter(Boolean).join(" · ");
}
