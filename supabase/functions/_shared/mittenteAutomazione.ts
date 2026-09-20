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

// ── Da quali domini può spedire un'azienda (20/09/2026) ─────────────────────
//
// Il provider è condiviso fra tutte le aziende: accetta come mittente
// qualunque indirizzo su un dominio verificato nel NOSTRO account, di chiunque
// sia. L'indirizzo scelto nell'automazione era controllato solo nella forma:
// scritto lì l'indirizzo di un'altra azienda, l'email sarebbe partita a suo
// nome. Finché nessuno aveva un dominio collegato il buco era teorico; dal
// giorno in cui i domini si collegano davvero, no.
//
// Regola: l'indirizzo scelto vale solo se il suo dominio è uno di quelli che
// l'azienda ha collegato e verificato per quel canale. Altrimenti si scarta e
// resta il mittente dell'azienda (come per un indirizzo scritto male).

export interface DominioAzienda {
  domain?: string | null;
  is_active?: boolean | null;
  ee_spf_verified?: boolean | null;
  ee_dkim_verified?: boolean | null;
  resend_status?: string | null;
  sg_cname_1_valid?: boolean | null;
  sg_cname_2_valid?: boolean | null;
  sg_cname_3_valid?: boolean | null;
}

/** Il dominio di un indirizzo, in minuscolo ("" se non è un indirizzo). */
export function dominioDi(indirizzo: unknown): string {
  const t = testo(indirizzo).toLowerCase();
  const at = t.lastIndexOf("@");
  return at > 0 ? t.slice(at + 1) : "";
}

/** I domini da cui l'azienda può spedire su quel canale: stesse regole di resolveSender. */
export function dominiAmmessi(righe: DominioAzienda[] | null | undefined, stream: "marketing" | "transactional"): string[] {
  return (righe ?? [])
    .filter((r) => r?.is_active === true)
    .filter((r) =>
      stream === "marketing"
        ? r.ee_spf_verified === true && r.ee_dkim_verified === true
        : r.resend_status === "verified" || (r.sg_cname_1_valid === true && r.sg_cname_2_valid === true && r.sg_cname_3_valid === true)
    )
    .map((r) => testo(r.domain).toLowerCase())
    .filter(Boolean);
}

/** L'indirizzo scelto resta solo se il suo dominio è dell'azienda; il nome resta sempre. */
export function soloDominiDellAzienda(scelto: MittenteScelto, ammessi: string[]): MittenteScelto {
  if (!scelto.email) return scelto;
  return ammessi.includes(dominioDi(scelto.email)) ? scelto : { nome: scelto.nome, email: null };
}
