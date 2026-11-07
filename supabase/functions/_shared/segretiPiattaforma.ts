// Le regole sui segreti di platform_settings, senza chiamate di rete.
//
// Qui non si importa niente: così le regole si provano da sole, come per
// _shared/saluteIntegrazioni.ts. getPlatformSetting.ts le usa.

/**
 * È una chiave segreta? Stessa regola di `e_segreto_piattaforma()` nel
 * database: dal 19/09/2026 il valore di queste chiavi sta nel Vault e nella
 * tabella resta la riga vuota.
 *
 * Conta perché per una chiave segreta rileggere `platform_settings` non è un
 * ripiego: è garantito restituire stringa vuota, cioè «non configurata», che
 * è una risposta falsa.
 */
export function eChiaveSegreta(chiave: string): boolean {
  const k = chiave ?? "";
  return (
    /(_key|_secret|_token|_pass|_password)(_|$)/.test(k) &&
    !/_(set|configured|configurata|missing|status|at|id)$/.test(k) &&
    k !== "posthog_api_key" &&
    k !== "stripe_publishable_key"
  );
}

/** Quanto aspettare fra un tentativo e il successivo, in millisecondi. */
export const ATTESE_RITENTATIVO_MS = [200, 600];

/**
 * Vale la pena ritentare? Sì per gli intoppi di PostgREST e della rete.
 *
 * Il 06/11/2026 i due visti in produzione erano «Could not query the database
 * for the schema cache» e una pagina HTML di errore del gateway al posto del
 * JSON: entrambi passano da soli, e nessuno dei due vuol dire che il segreto
 * non ci sia.
 */
export function eErroreTransitorio(messaggio: string): boolean {
  const m = (messaggio ?? "").toLowerCase();
  return (
    m.includes("schema cache") ||
    m.includes("<!doctype html") ||
    m.includes("fetch failed") ||
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("connection") ||
    m.includes("502") ||
    m.includes("503") ||
    m.includes("504")
  );
}

/**
 * L'esito di una lettura, con la distinzione che una semplice stringa non può
 * esprimere: `letturaRiuscita: false` vuol dire «non lo so», non «non è
 * impostata».
 */
export interface EsitoImpostazione {
  valore: string;
  letturaRiuscita: boolean;
  errore: string | null;
}
