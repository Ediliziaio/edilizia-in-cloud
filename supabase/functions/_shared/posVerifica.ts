/**
 * L'indirizzo della pagina pubblica di verifica di un POS emesso: è quello che il codice QR stampato sul PDF porta con sé.
 * Un QR stampato non può cambiare dominio, quindi si usa sempre quello canonico della piattaforma (non un dominio personalizzato
 * dell'azienda, che può cambiare o sparire); in prova lo si può sostituire con POS_VERIFICA_BASE_URL.
 *
 * Codice puro, senza Deno né browser.
 */
export const BASE_VERIFICA_POS = "https://app.ediliziaincloud.com";
export const PERCORSO_VERIFICA_POS = "/verifica-pos/";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Solo https, host e porta: niente percorso, niente parametri, niente credenziali. */
const BASE_VALIDA = /^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$/i;

export const idEmissioneValido = (id: string): boolean => UUID.test(id);

/** `https://…/verifica-pos/<id emissione>`; una base non valida non ferma l'emissione, si torna al dominio canonico. */
export function urlVerificaPos(idEmissione: string, base?: string | null): string {
  if (!idEmissioneValido(idEmissione)) throw new Error("Identificativo di emissione non valido per l'indirizzo di verifica");
  const pulita = (base ?? "").trim().replace(/\/+$/, "");
  return `${BASE_VALIDA.test(pulita) ? pulita : BASE_VERIFICA_POS}${PERCORSO_VERIFICA_POS}${idEmissione.toLowerCase()}`;
}
