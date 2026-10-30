/**
 * Verifica pubblica di un POS emesso (la pagina che apre il codice QR stampato sul PDF): tipi della risposta e piccole
 * funzioni pure, così la pagina resta sottile e si prova senza browser.
 */
export type StatoVerificaPos = "in_vigore" | "superata" | "archiviata";

export interface EsitoVerificaPos {
  trovata: boolean;
  impresa?: string | null;
  cantiere?: string | null;
  revisione?: number;
  emesso_il?: string | null;
  /** SHA-256 del PDF emesso: si confronta con quello di un file ricevuto per posta. */
  pdf_sha256?: string | null;
  stato?: StatoVerificaPos;
  revisione_in_vigore?: number | null;
  in_vigore_dal?: string | null;
}

export async function improntaSha256(bytes: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** «uguale» solo se l'impronta del file coincide con quella registrata all'emissione; senza impronta registrata non si afferma nulla. */
export function confrontaImpronta(calcolata: string, registrata: string | null | undefined): "uguale" | "diverso" | "non_verificabile" {
  if (!registrata) return "non_verificabile";
  return calcolata.trim().toLowerCase() === registrata.trim().toLowerCase() ? "uguale" : "diverso";
}

/** La risposta del server letta con prudenza: un valore inatteso diventa «non trovata», mai uno stato inventato. */
export function leggiEsitoVerifica(grezzo: unknown): EsitoVerificaPos {
  if (!grezzo || typeof grezzo !== "object") return { trovata: false };
  const o = grezzo as Record<string, unknown>;
  if (o.trovata !== true) return { trovata: false };
  const testo = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const stato = o.stato === "in_vigore" || o.stato === "superata" || o.stato === "archiviata" ? o.stato : undefined;
  if (!stato) return { trovata: false };
  return {
    trovata: true, stato,
    impresa: testo(o.impresa), cantiere: testo(o.cantiere), emesso_il: testo(o.emesso_il), pdf_sha256: testo(o.pdf_sha256), in_vigore_dal: testo(o.in_vigore_dal),
    revisione: numero(o.revisione) ?? undefined, revisione_in_vigore: numero(o.revisione_in_vigore),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const idVerificaValido = (id: string | undefined): id is string => !!id && UUID.test(id);
