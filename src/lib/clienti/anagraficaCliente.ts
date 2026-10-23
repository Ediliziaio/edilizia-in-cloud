/**
 * L'anagrafica del cliente che si capisce da sola (23/10/2026): un nome da
 * condominio o da società salvato come «persona», e i dati che mancano per
 * chiamare, scrivere e fatturare.
 */

/** Parole con cui comincia o che contiene il nome di un'azienda, di un ente o di un condominio. */
const SEGNI_AZIENDA = [
  /^(condominio|cond\.|supercondominio|residence)\b/i,
  /\b(s\.?\s?r\.?\s?l\.?s?|s\.?\s?p\.?\s?a\.?|s\.?\s?n\.?\s?c\.?|s\.?\s?a\.?\s?s\.?|s\.?\s?s\.?|soc\.?\s?coop\.?)(?=\s|$|,)/i,
  /^(societ[aà]|ditta|impresa|studio|associazione|cooperativa|consorzio|fondazione|parrocchia|comune di|immobiliare|azienda|hotel|albergo|ristorante)\b/i,
];

export function sembraAzienda(nome: string | null | undefined): boolean {
  const n = (nome ?? "").trim();
  return n.length > 2 && SEGNI_AZIENDA.some((re) => re.test(n));
}

export interface ClientePerCompletare {
  email?: string | null;
  phone?: string | null;
  fiscal_code?: string | null;
  vat_number?: string | null;
  address?: string | null;
  city?: string | null;
  is_business?: boolean | null;
}

const vuoto = (v: string | null | undefined) => !v || !v.trim() || v.trim() === "—" || v.trim() === "-";

/** Le etichette dei campi che mancano, come si chiamano nella scheda anagrafica. */
export function campiDaCompletare(c: ClientePerCompletare): string[] {
  const mancano: string[] = [];
  if (vuoto(c.phone)) mancano.push("Telefono");
  const email = (c.email ?? "").trim().toLowerCase();
  if (!email.includes("@") || email.endsWith("@no-email.ediliziaincloud.local")) mancano.push("Email");
  if (c.is_business) {
    if (vuoto(c.vat_number)) mancano.push("Partita IVA");
  } else if (vuoto(c.fiscal_code)) {
    mancano.push("Codice fiscale");
  }
  if (vuoto(c.address)) mancano.push("Indirizzo");
  else if (vuoto(c.city)) mancano.push("Città");
  return mancano;
}
