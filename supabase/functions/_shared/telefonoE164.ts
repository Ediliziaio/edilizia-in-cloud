/**
 * Un numero di telefono scritto come capita («333 123 4567», «0039 333…», «+39…»)
 * nel formato E.164 che chiede Telnyx. Senza prefisso internazionale si assume
 * l'Italia. Restituisce null se il numero non è plausibile.
 */
export function normalizzaTelefonoE164(grezzo: unknown, prefissoPredefinito = "39"): string | null {
  let s = String(grezzo ?? "").trim();
  if (!s) return null;
  const haPiu = s.startsWith("+");
  s = s.replace(/[^\d]/g, "");
  if (!s) return null;
  if (!haPiu && s.startsWith("00")) s = s.slice(2);
  else if (!haPiu) {
    // Numero nazionale: i fissi italiani iniziano con 0 e restano con lo 0.
    s = prefissoPredefinito + s;
  }
  // Italia: cellulari 3xx con 9-10 cifre, fissi 0xx con 6-11 cifre.
  if (s.startsWith("39")) {
    const nazionale = s.slice(2);
    if (!/^(3\d{8,9}|0\d{5,10})$/.test(nazionale)) return null;
  }
  return /^\d{8,15}$/.test(s) ? `+${s}` : null;
}

/** +39 333 *** 4567: abbastanza per riconoscerlo, non per ricostruirlo. */
export function mascheraTelefono(e164: string | null | undefined): string | null {
  if (!e164 || !/^\+\d{8,15}$/.test(e164)) return null;
  return `${e164.slice(0, 3)}${"*".repeat(Math.max(3, e164.length - 6))}${e164.slice(-3)}`;
}
