/**
 * Account senza azienda (24/11/2026).
 *
 * Il bottone «Continua con Google» crea un utente auth per chiunque, ma
 * un'azienda nasce solo dal commerciale (la registrazione passa da /demo).
 * Chi entrava con Google senza essere cliente aveva la sessione aperta e
 * nessun ruolo: l'app lo rimandava al login senza dire niente, lui rifaceva
 * password e codice email, e il giro ricominciava (Domenico Cerrato, 24/11).
 *
 * Ora chi risulta senza ruolo viene disconnesso e la pagina di accesso
 * spiega perché, con il link alla demo.
 */
const CHIAVE = "eic_account_senza_azienda";

export function segnalaAccountSenzaAzienda(email: string | null | undefined): void {
  try {
    sessionStorage.setItem(CHIAVE, email || "");
  } catch {
    /* storage non disponibile: il messaggio non compare, l'uscita sì */
  }
}

/** Restituisce l'email segnalata (stringa vuota se ignota) e la cancella; null se nessuna. */
export function leggiAccountSenzaAzienda(): string | null {
  try {
    const v = sessionStorage.getItem(CHIAVE);
    if (v !== null) sessionStorage.removeItem(CHIAVE);
    return v;
  } catch {
    return null;
  }
}

export const MESSAGGIO_ACCOUNT_SENZA_AZIENDA =
  "Questo account non è collegato a nessuna azienda su Edilizia in Cloud. Se vuoi provare il gestionale, richiedi la demo: ti attiviamo l'accesso noi.";
