/**
 * Questa persona entra nel gestionale, oppure è solo una scheda?
 *
 * In «Personale & HR → Profili» le due cose si confondevano: un profilo HR è
 * una scheda del personale, e l'accesso alla piattaforma è un account utente.
 * Fino al 29/10/2026 l'elenco non diceva quale persona avesse l'uno e quale
 * no, e `hr_profili.user_id` — la colonna che tiene il legame — non veniva
 * né letta né mostrata da nessuna parte: su 156 profili attivi ne risultavano
 * collegati 14, e per sapere chi potesse entrare bisognava aprire la pagina
 * degli utenti e confrontare a mano.
 *
 * Qui la risposta sta in un posto solo, così elenco e scheda dicono lo stesso.
 */

export interface ProfiloConAccesso {
  user_id?: string | null;
  email?: string | null;
}

export interface UtenteDiAzienda {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

export type StatoAccesso =
  /** Ha un account collegato: entra nel gestionale. */
  | "entra"
  /** Esiste un utente con la stessa email, ma il profilo non è legato a lui. */
  | "da_collegare"
  /** Era collegato a un account che non è più fra gli utenti dell'azienda. */
  | "revocato"
  /** Nessun accesso: è solo una scheda del personale. */
  | "nessuno";

export interface EsitoAccesso {
  stato: StatoAccesso;
  /** L'utente trovato, quando c'è. */
  utente: UtenteDiAzienda | null;
}

const normalizza = (v: string | null | undefined) =>
  String(v ?? "").trim().toLowerCase();

/**
 * Lo stato di accesso di un profilo, dati gli utenti dell'azienda.
 *
 * `utenti` è l'elenco dello staff (`useCompanyStaffUsers`): i clienti e i
 * segnalatori sono profili anche loro, ma non entrano nel gestionale.
 *
 * Con l'elenco degli utenti ancora da caricare la risposta onesta non è
 * «nessuno»: chi chiama passa `null` e non si mostra niente.
 */
export function accessoPiattaforma(
  profilo: ProfiloConAccesso,
  utenti: UtenteDiAzienda[] | null | undefined,
): EsitoAccesso | null {
  if (!utenti) return null;

  if (profilo.user_id) {
    const collegato = utenti.find((u) => u.id === profilo.user_id);
    if (collegato) return { stato: "entra", utente: collegato };
    // Il legame c'è ma quell'account non è (più) fra gli utenti dell'azienda:
    // non va detto che entra, perché non entra.
    return { stato: "revocato", utente: null };
  }

  const email = normalizza(profilo.email);
  if (email) {
    const stessaEmail = utenti.find((u) => normalizza(u.email) === email);
    if (stessaEmail) return { stato: "da_collegare", utente: stessaEmail };
  }

  return { stato: "nessuno", utente: null };
}

export const ETICHETTA_ACCESSO: Record<StatoAccesso, string> = {
  entra: "Entra nel gestionale",
  da_collegare: "Account da collegare",
  revocato: "Accesso revocato",
  nessuno: "Senza accesso",
};

/** Una riga che spiega lo stato, per la scheda della persona. */
export function spiegazioneAccesso(esito: EsitoAccesso): string {
  const nome = esito.utente
    ? [esito.utente.first_name, esito.utente.last_name].filter(Boolean).join(" ").trim() ||
      esito.utente.email ||
      ""
    : "";
  switch (esito.stato) {
    case "entra":
      return nome
        ? `Ha un account e può entrare nel gestionale (${nome}).`
        : "Ha un account e può entrare nel gestionale.";
    case "da_collegare":
      return `Esiste già un utente con questa email${nome ? ` (${nome})` : ""}, ma non è collegato a questa scheda.`;
    case "revocato":
      return "Era collegata a un account che non è più fra gli utenti dell’azienda.";
    case "nessuno":
      return "È solo una scheda del personale: questa persona non entra nel gestionale.";
  }
}

/** Quante persone entrano, fra quelle passate. */
export function quantiEntrano(
  profili: ProfiloConAccesso[],
  utenti: UtenteDiAzienda[] | null | undefined,
): number {
  if (!utenti) return 0;
  return profili.filter((p) => accessoPiattaforma(p, utenti)?.stato === "entra").length;
}
