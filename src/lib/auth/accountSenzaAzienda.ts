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
import { supabase } from "@/integrations/supabase/client";

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
  "Questo account non è collegato a nessuna azienda su Edilizia in Cloud. Per provare il gestionale lasciaci il tuo numero qui sotto: ti attiviamo noi l'accesso.";

/**
 * Fa diventare contatto per il commerciale chi è entrato senza azienda, una
 * volta per email su questo browser. Va chiamata PRIMA di chiudere la sessione:
 * la funzione legge email e nome dall'account verificato, non da qui.
 * Non lancia mai: un contatto mancato non deve bloccare l'uscita.
 */
export async function registraContattoSenzaAzienda(email: string | null | undefined): Promise<void> {
  const chiave = `eic_contatto_senza_azienda:${(email || "").toLowerCase()}`;
  try {
    if (localStorage.getItem(chiave)) return;
  } catch {
    /* si prova comunque */
  }
  try {
    await Promise.race([
      supabase.functions.invoke("public-lead-submit", {
        body: { source: "accesso_senza_azienda", tags: ["richiesta-demo"], page_path: "/login" },
      }),
      new Promise((resolve) => setTimeout(resolve, 4_000)),
    ]);
    try {
      localStorage.setItem(chiave, "1");
    } catch {
      /* niente */
    }
  } catch {
    /* best-effort */
  }
}
