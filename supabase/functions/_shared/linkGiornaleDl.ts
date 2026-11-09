/**
 * Il link alla pagina firmata del giornale per la direzione lavori: un token a caso
 * che vale 30 giorni. Nel database solo la sua impronta. Modulo puro.
 */
export const GIORNI_VALIDITA_LINK_DL = 30;

/** A chi si manda una pagina firmata: il ruolo resta registrato sull'invio. */
export const RUOLI_INVIO_GIORNALE = [
  { value: "direzione_lavori", label: "Direzione lavori" },
  { value: "cse", label: "Coordinatore sicurezza (CSE)" },
  { value: "committente", label: "Committente" },
  { value: "altro", label: "Altro" },
] as const;
export type RuoloInvioGiornale = (typeof RUOLI_INVIO_GIORNALE)[number]["value"];
export const ruoloInvioValido = (v: unknown): v is RuoloInvioGiornale =>
  RUOLI_INVIO_GIORNALE.some((r) => r.value === v);
const FORMATO_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export const tokenDlBenFormato = (t: unknown): t is string => typeof t === "string" && FORMATO_TOKEN.test(t);

export function emailDlValida(v: unknown): v is string {
  return typeof v === "string" && v.length <= 320 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(v);
}

export function nuovoTokenDl(): string {
  const byte = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...byte)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function improntaTokenDl(token: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function scadenzaLinkDl(da: Date = new Date()): string {
  return new Date(da.getTime() + GIORNI_VALIDITA_LINK_DL * 86_400_000).toISOString();
}
