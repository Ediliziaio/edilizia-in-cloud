/**
 * Domini delle caselle «di tutti» (Gmail, Outlook.com, Libero…): i record DNS
 * li gestisce il fornitore, non chi ha la casella.
 *
 * Il controllo SPF / DKIM / DMARC in Integrazioni li controllava come un
 * dominio aziendale e chiedeva di aggiungere record su gmail.com, con un
 * «rischio spam alto» che spaventava senza che si potesse fare niente
 * (05/10/2026). Ora li salta e lo dice in una riga.
 */
const DOMINI_GRATUITI: ReadonlySet<string> = new Set([
  // Google, Microsoft, Yahoo, Apple
  "gmail.com", "googlemail.com",
  "outlook.com", "outlook.it", "hotmail.com", "hotmail.it", "live.com", "live.it", "msn.com",
  "yahoo.com", "yahoo.it", "ymail.com",
  "icloud.com", "me.com", "mac.com",
  // Italiani
  "libero.it", "inwind.it", "iol.it", "blu.it", "virgilio.it", "alice.it", "tin.it", "tim.it",
  "tiscali.it", "fastwebnet.it", "email.it", "katamail.com",
  // Altri diffusi
  "aol.com", "aol.it", "gmx.com", "gmx.it", "gmx.net", "mail.com",
  "proton.me", "protonmail.com", "pm.me", "yandex.com", "zoho.com",
]);

export function eDominioGratuito(dominio: string | null | undefined): boolean {
  return DOMINI_GRATUITI.has(String(dominio ?? "").trim().toLowerCase().replace(/^@/, ""));
}
