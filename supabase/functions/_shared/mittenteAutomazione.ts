/**
 * Il mittente di un'email di automazione (19/09/2026).
 *
 * Si sceglie in due posti: sul passo «Invia email» (Da nome, Da email) e nelle
 * Impostazioni dell'automazione («Dettagli mittente email»). Il motore leggeva
 * solo il passo, e il nome solo se c'era anche l'indirizzo: chi compilava le
 * Impostazioni, o scriveva sul passo il nome senza l'indirizzo, riceveva il
 * mittente predefinito dell'azienda senza nessun avviso.
 *
 * Regole:
 * - il passo vince sulle Impostazioni, campo per campo;
 * - un indirizzo scritto male vale come vuoto: meglio il mittente dell'azienda
 *   che un'email rifiutata dal provider;
 * - tutto vuoto = come prima, il mittente dell'azienda.
 *
 * Nessun import: lo usano sia il motore (Deno) sia la scheda Impostazioni.
 * Provato in src/test/logic/mittenteAutomazione.test.ts.
 */

export interface MittenteScelto {
  nome: string | null;
  email: string | null;
}

const EMAIL_MITTENTE = /^[^@\s<>",;()]+@[^@\s<>",;()]+\.[a-z]{2,}$/i;

function testo(valore: unknown): string {
  return typeof valore === "string" ? valore.trim() : "";
}

/** Un indirizzo utilizzabile come mittente (senza nome, senza spazi). */
export function indirizzoMittenteValido(valore: unknown): boolean {
  return EMAIL_MITTENTE.test(testo(valore));
}

export function mittenteDelPasso(
  passo: { from_name?: unknown; from_email?: unknown },
  flusso: { sender_name?: unknown; sender_email?: unknown } | null | undefined,
): MittenteScelto {
  const indirizzo = (valore: unknown) => (indirizzoMittenteValido(valore) ? testo(valore) : "");
  const nome = testo(passo.from_name) || testo(flusso?.sender_name);
  const email = indirizzo(passo.from_email) || indirizzo(flusso?.sender_email);
  return { nome: nome || null, email: email || null };
}
