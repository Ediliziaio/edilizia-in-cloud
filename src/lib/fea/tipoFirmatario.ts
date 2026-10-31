/**
 * Privato o azienda: decide se chi firma vede il diritto di recesso di 14 giorni (Codice del consumo)
 * o no. Il server sceglie «azienda» quando il preventivo ha ragione sociale o partita IVA; i moduli
 * non le passavano, e il 30/10/2026 un preventivo per un'impresa è partito come «privato».
 */

/** Caselle personali: un indirizzo fuori da questi domini è probabilmente di un'azienda. */
const DOMINI_PERSONALI = new Set([
  "gmail.com", "googlemail.com", "libero.it", "virgilio.it", "hotmail.com", "hotmail.it", "outlook.com", "outlook.it",
  "live.com", "live.it", "msn.com", "yahoo.com", "yahoo.it", "ymail.com", "icloud.com", "me.com", "mac.com",
  "alice.it", "tim.it", "tin.it", "tiscali.it", "fastwebnet.it", "email.it", "inwind.it", "aruba.it", "pec.it",
  "legalmail.it", "proton.me", "protonmail.com", "gmx.com", "gmx.it", "aol.com",
]);

/** true se l'email ha un dominio proprio (es. amministrazione@impresa.it): vale come suggerimento, non come prova. */
export function emailSembraAziendale(email: string | null | undefined): boolean {
  const m = /@([^@\s]+)$/.exec((email ?? "").trim().toLowerCase());
  if (!m) return false;
  return !DOMINI_PERSONALI.has(m[1]);
}

/** Partita IVA italiana: 11 cifre, con o senza «IT» davanti. Vuota = non indicata. */
export function partitaIvaValida(piva: string | null | undefined): boolean {
  const v = (piva ?? "").replace(/\s/g, "").toUpperCase().replace(/^IT/, "");
  return v === "" || /^\d{11}$/.test(v);
}
