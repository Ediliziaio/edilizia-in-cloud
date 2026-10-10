/**
 * Le regole di sicurezza dell'azienda che qualcuno applica davvero (09/10/2026).
 *
 * Su tredici comandi, tre funzionano: il blocco dopo troppi tentativi sbagliati, la durata del blocco e
 * l'elenco degli indirizzi da cui si può entrare. Li legge solo `check-login-security`, chiamata dalla
 * schermata di accesso. Gli altri dieci (2FA obbligatoria, scadenza e regole della password, tre avvisi) non
 * li leggeva nessun codice: la pagina non li mostra più, le colonne restano dov'erano.
 *
 * Qui sta la parte che si può provare senza schermo: come si legge l'elenco degli indirizzi e come ci si
 * accorge che chi salva rischia di restare fuori.
 */

/** Colonne di `companies` che la pagina legge e scrive: ognuna ha un lettore in check-login-security. */
export const COLONNE_REGOLE_SICUREZZA = ["allowed_ips", "max_failed_attempts", "lockout_duration_minutes"] as const;

export const TENTATIVI_MINIMI = 3;
export const TENTATIVI_MASSIMI = 10;

/** 0 = lo sblocca un amministratore (la funzione lo traduce in un blocco di un anno). */
export const DURATE_BLOCCO: { valore: string; etichetta: string }[] = [
  { valore: "15", etichetta: "15 minuti" },
  { valore: "30", etichetta: "30 minuti" },
  { valore: "60", etichetta: "1 ora" },
  { valore: "1440", etichetta: "24 ore" },
  { valore: "0", etichetta: "Finché non lo sblocca un amministratore" },
];

export function etichettaDurata(valore: string): string {
  return DURATE_BLOCCO.find((d) => d.valore === valore)?.etichetta ?? `${valore} minuti`;
}

/** Un indirizzo per riga, ma si accettano anche virgole e spazi: chi incolla un elenco non perde niente. */
export function elencoIndirizzi(testo: string): string[] {
  const visti = new Set<string>();
  for (const voce of testo.split(/[\s,;]+/)) {
    const pulita = voce.trim();
    if (pulita) visti.add(pulita);
  }
  return [...visti];
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/;
const IPV6 = /^[0-9a-f:]+(?:\/\d{1,3})?$/i;

/** Il tentativo di scrivere un indirizzo che non lo è: un refuso nell'elenco lascerebbe tutti fuori. */
export function indirizzoNonValido(voce: string): boolean {
  const v4 = IPV4.exec(voce);
  if (v4) {
    const ottetti = v4.slice(1, 5).map(Number);
    return ottetti.some((n) => n > 255) || (v4[5] !== undefined && Number(v4[5]) > 32);
  }
  if (voce.includes(":")) return !IPV6.test(voce) || (voce.match(/:::/g)?.length ?? 0) > 0;
  return true;
}

/** `ip_address` arriva dal database come inet: a volte con la maschera di un solo indirizzo. */
export function indirizzoSenzaMaschera(valore: unknown): string | null {
  if (typeof valore !== "string" || !valore.trim()) return null;
  return valore.trim().replace(/\/(32|128)$/, "");
}

/**
 * L'indirizzo di chi sta salvando è nell'elenco?
 * `true` = c'è · `false` = non c'è · `null` = non si può dire (indirizzo ignoto, oppure l'elenco ha una voce
 * con la maschera, che qui non si prova a leggere).
 */
export function indirizzoNellElenco(indirizzo: string | null, elenco: string[]): boolean | null {
  if (!indirizzo) return null;
  if (elenco.includes(indirizzo)) return true;
  if (elenco.some((voce) => voce.includes("/"))) return null;
  return false;
}

/** Salvando, chi scrive un elenco rischia di chiudere fuori anche sé stesso? */
export function rischiaDiRestareFuori(elenco: string[], indirizzo: string | null): boolean {
  return elenco.length > 0 && indirizzoNellElenco(indirizzo, elenco) !== true;
}
