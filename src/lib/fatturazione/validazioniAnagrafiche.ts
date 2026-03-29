/**
 * Validation utilities for Italian fiscal codes (CF) and VAT numbers (P.IVA)
 */

export function validaPartitaIva(piva: string): { valida: boolean; errore?: string } {
  const cleaned = piva.replace(/\s/g, "");

  if (cleaned.length !== 11) {
    return { valida: false, errore: "La P.IVA deve avere 11 cifre" };
  }

  if (!/^\d{11}$/.test(cleaned)) {
    return { valida: false, errore: "La P.IVA deve contenere solo cifre" };
  }

  // Luhn-like check digit algorithm for Italian VAT
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const digit = parseInt(cleaned[i]);
    if (i % 2 === 0) {
      sum += digit;
    } else {
      const doubled = digit * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    }
  }

  if (sum % 10 !== 0) {
    return { valida: false, errore: "P.IVA non valida (check digit errato)" };
  }

  return { valida: true };
}

export function validaCodiceFiscale(cf: string): { valida: boolean; errore?: string } {
  const cleaned = cf.replace(/\s/g, "").toUpperCase();

  if (cleaned.length !== 16 && cleaned.length !== 11) {
    return {
      valida: false,
      errore: "Il CF deve avere 16 caratteri (persona fisica) o 11 cifre (persona giuridica)",
    };
  }

  if (cleaned.length === 11) {
    // CF numerico = P.IVA for legal entities
    return validaPartitaIva(cleaned);
  }

  // Basic format check for 16-char CF
  const cfRegex = /^[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z]\d{3}[A-Z]$/;
  if (!cfRegex.test(cleaned)) {
    return { valida: false, errore: "Formato Codice Fiscale non valido" };
  }

  // Check character algorithm
  const oddMap: Record<string, number> = {
    "0": 1,
    "1": 0,
    "2": 5,
    "3": 7,
    "4": 9,
    "5": 13,
    "6": 15,
    "7": 17,
    "8": 19,
    "9": 21,
    A: 1,
    B: 0,
    C: 5,
    D: 7,
    E: 9,
    F: 13,
    G: 15,
    H: 17,
    I: 19,
    J: 21,
    K: 2,
    L: 4,
    M: 18,
    N: 20,
    O: 11,
    P: 3,
    Q: 6,
    R: 8,
    S: 12,
    T: 14,
    U: 16,
    V: 10,
    W: 22,
    X: 25,
    Y: 24,
    Z: 23,
  };

  const evenMap: Record<string, number> = {
    "0": 0,
    "1": 1,
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
    "9": 9,
    A: 0,
    B: 1,
    C: 2,
    D: 3,
    E: 4,
    F: 5,
    G: 6,
    H: 7,
    I: 8,
    J: 9,
    K: 10,
    L: 11,
    M: 12,
    N: 13,
    O: 14,
    P: 15,
    Q: 16,
    R: 17,
    S: 18,
    T: 19,
    U: 20,
    V: 21,
    W: 22,
    X: 23,
    Y: 24,
    Z: 25,
  };

  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const c = cleaned[i];
    sum += i % 2 === 0 ? oddMap[c] ?? 0 : evenMap[c] ?? 0;
  }

  const expected = String.fromCharCode(65 + (sum % 26));
  if (cleaned[15] !== expected) {
    return { valida: false, errore: "Codice Fiscale non valido (carattere di controllo errato)" };
  }

  return { valida: true };
}
