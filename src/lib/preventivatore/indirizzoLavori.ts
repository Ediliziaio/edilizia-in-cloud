/**
 * L'indirizzo dei lavori nel passo «Contatto» (06/10/2026). Di serie coincide con quello del cliente: si sceglie
 * «diverso» solo quando i lavori sono altrove. Qui le regole che non dipendono dall'interfaccia: che cosa vuol dire
 * «uguale», come si legge un indirizzo da un preventivo, come si scrive in una riga.
 */

export const CAMPI_INDIRIZZO = ["indirizzo", "citta", "cap", "provincia"] as const;
export type CampoIndirizzo = (typeof CAMPI_INDIRIZZO)[number];
export type Indirizzo = Record<CampoIndirizzo, string | null | undefined>;

/** Il testo come si confronta: senza spazi doppi né maiuscole («Via Roma  1» è «via roma 1»). */
export const norma = (v: string | null | undefined): string => (v ?? "").trim().replace(/\s+/g, " ").toLowerCase();

const pulito = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/** Legge l'indirizzo di un preventivo: `cliente_indirizzo…` o `cantiere_indirizzo…`. */
export function leggiIndirizzo(p: object, prefisso: "cliente" | "cantiere"): Indirizzo {
  const riga = p as Record<string, unknown>;
  return {
    indirizzo: pulito(riga[`${prefisso}_indirizzo`]),
    citta: pulito(riga[`${prefisso}_citta`]),
    cap: pulito(riga[`${prefisso}_cap`]),
    provincia: pulito(riga[`${prefisso}_provincia`]),
  };
}

/** Vero se non c'è scritto niente. */
export const indirizzoVuoto = (a: Indirizzo): boolean => CAMPI_INDIRIZZO.every((c) => norma(a[c]) === "");

/**
 * I lavori sono allo stesso indirizzo del cliente quando ogni campo dei lavori è vuoto oppure uguale a quello
 * del cliente. «Vuoto» conta come uguale: è il modo in cui i preventivi di prima dicevano «stesso indirizzo».
 */
export function indirizziUguali(cliente: Indirizzo, lavori: Indirizzo): boolean {
  return CAMPI_INDIRIZZO.every((c) => norma(lavori[c]) === "" || norma(lavori[c]) === norma(cliente[c]));
}

/** Vero se nel preventivo i lavori sono altrove (almeno un campo scritto e diverso da quello del cliente). */
export const lavoriDiversiDalCliente = (p: object): boolean =>
  !indirizziUguali(leggiIndirizzo(p, "cliente"), leggiIndirizzo(p, "cantiere"));

/** «Via Tortona 33, 20121 Milano (MI)»: una riga sola, senza pezzi vuoti. */
export function testoIndirizzo(a: Indirizzo): string {
  const luogo = [a.cap, a.citta].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
  const provincia = (a.provincia ?? "").trim();
  return [(a.indirizzo ?? "").trim(), provincia && luogo ? `${luogo} (${provincia})` : luogo || provincia]
    .filter(Boolean)
    .join(", ");
}
