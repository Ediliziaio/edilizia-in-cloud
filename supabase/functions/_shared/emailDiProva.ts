/**
 * Email di prova (send-test-email): da chi partono, a chi arrivano, con che
 * oggetto.
 *
 * Fino al 21/09/2026 bastava essere autenticati: con `testMode: true` la
 * funzione spediva a QUALSIASI indirizzo un oggetto e un HTML scelti da chi
 * chiamava, dal mittente della piattaforma. Chiunque avesse un account in una
 * qualunque azienda cliente poteva usarla per mandare phishing a nome di
 * EdiliziaInCloud. La prova di una campagna aveva lo stesso buco: HTML della
 * campagna (scritto dall'azienda) verso un indirizzo qualsiasi.
 *
 * Adesso, per chi non è super admin:
 *  - la prova parte dal mittente della SUA azienda, mai da quello della
 *    piattaforma: è anche l'unico modo perché provi qualcosa (dal mittente
 *    di piattaforma il marketing lo rifiuta Elastic, «From … not allowed»);
 *  - arriva solo al suo indirizzo o a quello di un collega della stessa
 *    azienda, cioè le persone interne di `get_internal_chat_profiles`. Non un
 *    profilo qualsiasi con quel company_id: anche i clienti stanno in
 *    `profiles`, e un'importazione ne porta migliaia con indirizzi scelti
 *    dall'azienda;
 *  - l'oggetto comincia sempre con «[TEST]».
 * Il super admin resta libero: il pannello di prova dei provider serve a lui.
 *
 * Funzioni pure, senza import: provate da src/test/logic/emailDiProva.test.ts.
 */

export const PREFISSO_PROVA = "[TEST]";

export const MOTIVO_DESTINATARIO_NON_AMMESSO =
  "La prova può arrivare solo al tuo indirizzo o a quello di un collega dell'azienda.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Un indirizzo solo: niente elenchi separati da virgole o punti e virgola,
// niente «Nome <indirizzo>».
const INDIRIZZO_SINGOLO = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export function normalizzaIndirizzo(valore: unknown): string {
  return typeof valore === "string" ? valore.trim().toLowerCase() : "";
}

export function indirizzoSingoloValido(valore: unknown): boolean {
  return INDIRIZZO_SINGOLO.test(normalizzaIndirizzo(valore));
}

export type EsitoDestinatarioProva =
  | { ammesso: true; perche: "super_admin" | "se_stesso" | "collega" }
  | { ammesso: false; motivo: string };

export function destinatarioProvaAmmesso(dati: {
  destinatario: unknown;
  superAdmin: boolean;
  /** L'email dell'utente che chiama (auth.users). */
  emailChiamante: string | null | undefined;
  /** Gli indirizzi dei colleghi dell'azienda da cui parte la prova. */
  emailColleghi: ReadonlyArray<string | null | undefined>;
}): EsitoDestinatarioProva {
  const destinatario = normalizzaIndirizzo(dati.destinatario);
  if (!INDIRIZZO_SINGOLO.test(destinatario)) {
    return { ammesso: false, motivo: "Indirizzo del destinatario non valido." };
  }
  if (dati.superAdmin) return { ammesso: true, perche: "super_admin" };
  if (destinatario === normalizzaIndirizzo(dati.emailChiamante)) {
    return { ammesso: true, perche: "se_stesso" };
  }
  if (dati.emailColleghi.some((email) => normalizzaIndirizzo(email) === destinatario)) {
    return { ammesso: true, perche: "collega" };
  }
  return { ammesso: false, motivo: MOTIVO_DESTINATARIO_NON_AMMESSO };
}

/** L'oggetto di una prova inviata da chi non è super admin. */
export function oggettoProva(oggetto: unknown): string {
  const testo = typeof oggetto === "string" ? oggetto.replace(/[\r\n]+/g, " ").trim() : "";
  if (!testo) return `${PREFISSO_PROVA} Email di verifica`;
  return testo.startsWith(PREFISSO_PROVA) ? testo : `${PREFISSO_PROVA} ${testo}`;
}

export type MittenteProva =
  /** L'azienda indicata dalla pagina: chi non è super admin deve appartenerle. */
  | { da: "azienda_richiesta"; companyId: string }
  /** Il mittente della piattaforma: solo il super admin, dal pannello dei provider. */
  | { da: "piattaforma" }
  /** Nessuna azienda indicata (una pagina vecchia rimasta aperta): la sua. */
  | { da: "azienda_del_profilo" }
  | { da: "errore"; motivo: string };

/** Da quale mittente parte una prova in testMode. */
export function mittenteProva(dati: { aziendaRichiesta: unknown; superAdmin: boolean }): MittenteProva {
  const richiesta = dati.aziendaRichiesta;
  if (richiesta === undefined || richiesta === null || richiesta === "") {
    return dati.superAdmin ? { da: "piattaforma" } : { da: "azienda_del_profilo" };
  }
  if (typeof richiesta !== "string" || !UUID.test(richiesta)) {
    return { da: "errore", motivo: "company_id non valido" };
  }
  return { da: "azienda_richiesta", companyId: richiesta };
}
