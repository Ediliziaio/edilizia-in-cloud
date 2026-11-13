/**
 * Validatori per dati fiscali italiani (SuperAdmin → Dettagli azienda).
 * Implementazione offline (no API esterne) — per le verifiche live (VIES, ADE)
 * usare un'edge function dedicata.
 */

export interface FieldValidation {
  ok: boolean;
  /** Messaggio breve mostrabile in UI sotto il campo. Vuoto se ok. */
  hint?: string;
}

// ─── P.IVA ITALIANA ──────────────────────────────────────────────────────────
// 11 cifre, controllo Luhn dispari/pari (algoritmo MEF).
export function validatePartitaIva(raw: string | null | undefined): FieldValidation {
  if (!raw) return { ok: true }; // Optional field
  const senzaSpazi = raw.replace(/\s/g, "").toUpperCase();
  // Partita IVA estera (DE…, FR…, SM…): il checksum italiano non la riguarda e
  // qui non abbiamo modo di verificarla offline. Bloccarla vorrebbe dire
  // impedire di censire un cliente estero, che è peggio del non verificarla.
  if (/^[A-Z]{2}/.test(senzaSpazi) && !senzaSpazi.startsWith("IT")) {
    return { ok: true };
  }
  const cleaned = senzaSpazi.replace(/^IT/, "");
  if (!/^\d{11}$/.test(cleaned)) {
    return { ok: false, hint: "P.IVA: 11 cifre numeriche (es. 12345678901)" };
  }
  // Algoritmo Luhn IT (somma pesata)
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    let n = parseInt(cleaned[i], 10);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  if (sum % 10 !== 0) {
    return { ok: false, hint: "P.IVA non valida (checksum errato)" };
  }
  return { ok: true };
}

// ─── CODICE FISCALE ──────────────────────────────────────────────────────────
// Persona fisica: 16 caratteri con carattere di controllo (DM 23/12/1976).
// Società: stesso formato della P.IVA.

/** Nelle posizioni numeriche l'omocodia sostituisce le cifre con queste lettere. */
const OMOCODIA = "LMNPQRSTUV";
/** Cifra o lettera di omocodia: le due cose sono intercambiabili nel CF. */
const CIFRA_CF = `[0-9${OMOCODIA}]`;
const FORMATO_CF = new RegExp(
  `^[A-Z]{6}${CIFRA_CF}{2}[A-EHLMPRST]${CIFRA_CF}{2}[A-Z]${CIFRA_CF}{3}[A-Z]$`,
);

/** Valore di ogni carattere nelle posizioni DISPARI (1ª, 3ª, …), 1-based. */
const VALORI_DISPARI: Record<string, number> = {
  "0": 1, "1": 0, "2": 5, "3": 7, "4": 9, "5": 13, "6": 15, "7": 17, "8": 19, "9": 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
  N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};

/** Valore nelle posizioni PARI: cifra com'è, lettera come indice alfabetico. */
function valorePari(c: string): number {
  return c >= "0" && c <= "9" ? c.charCodeAt(0) - 48 : c.charCodeAt(0) - 65;
}

/** Carattere di controllo atteso per i primi 15 caratteri. */
export function carattereControlloCF(primi15: string): string {
  let somma = 0;
  for (let i = 0; i < 15; i++) {
    const c = primi15[i];
    // i è 0-based: i pari sono le posizioni DISPARI in numerazione umana.
    somma += i % 2 === 0 ? VALORI_DISPARI[c] : valorePari(c);
  }
  return String.fromCharCode(65 + (somma % 26));
}

export function validateCodiceFiscale(raw: string | null | undefined): FieldValidation {
  if (!raw) return { ok: true };
  const cleaned = raw.replace(/\s/g, "").toUpperCase();
  // Società = identico alla P.IVA
  if (/^\d{11}$/.test(cleaned)) {
    return validatePartitaIva(cleaned);
  }
  if (!FORMATO_CF.test(cleaned)) {
    return { ok: false, hint: "CF: 16 caratteri (persona) o 11 cifre (società)" };
  }
  // Il 16° carattere è calcolato dai primi 15: un CF inventato passa il formato
  // ma quasi mai il controllo. Prima si fermava al formato e bastava.
  if (cleaned[15] !== carattereControlloCF(cleaned.slice(0, 15))) {
    return { ok: false, hint: "CF non valido (carattere di controllo errato)" };
  }
  return { ok: true };
}

// ─── CAP ITALIANO ────────────────────────────────────────────────────────────
export function validateCAP(raw: string | null | undefined): FieldValidation {
  if (!raw) return { ok: true };
  const cleaned = raw.replace(/\s/g, "");
  if (!/^\d{5}$/.test(cleaned)) {
    return { ok: false, hint: "CAP: 5 cifre numeriche" };
  }
  return { ok: true };
}

// ─── PROVINCIA ────────────────────────────────────────────────────────────────
const ITALIAN_PROVINCES = new Set([
  "AG","AL","AN","AO","AR","AP","AT","AV","BA","BT","BL","BN","BG","BI","BO",
  "BZ","BS","BR","CA","CL","CB","CE","CT","CZ","CH","CO","CS","CR","KR","CN",
  "EN","FM","FE","FI","FG","FC","FR","GE","GO","GR","IM","IS","SP","AQ","LT",
  "LE","LC","LI","LO","LU","MC","MN","MS","MT","ME","MI","MO","MB","NA","NO",
  "NU","OR","PD","PA","PR","PV","PG","PU","PE","PC","PI","PT","PN","PZ","PO",
  "RG","RA","RC","RE","RI","RN","RM","RO","SA","SS","SV","SI","SR","SO","SU",
  "TA","TE","TR","TO","TP","TN","TV","TS","UD","VA","VE","VB","VC","VR","VV",
  "VI","VT",
]);

export function validateProvincia(raw: string | null | undefined): FieldValidation {
  if (!raw) return { ok: true };
  const cleaned = raw.replace(/\s/g, "").toUpperCase();
  if (cleaned.length !== 2) {
    return { ok: false, hint: "Sigla provincia: 2 lettere (es. MI, RM)" };
  }
  if (!ITALIAN_PROVINCES.has(cleaned)) {
    return { ok: false, hint: "Sigla provincia non riconosciuta" };
  }
  return { ok: true };
}

// ─── CODICE SDI / DESTINATARIO ───────────────────────────────────────────────
export function validateSDI(raw: string | null | undefined): FieldValidation {
  if (!raw) return { ok: true };
  const cleaned = raw.replace(/\s/g, "").toUpperCase();
  // SDI: 7 caratteri alfanumerici
  if (!/^[A-Z0-9]{7}$/.test(cleaned)) {
    return { ok: false, hint: "Codice SDI: 7 caratteri alfanumerici" };
  }
  return { ok: true };
}

// ─── PEC ──────────────────────────────────────────────────────────────────────
export function validatePEC(raw: string | null | undefined): FieldValidation {
  if (!raw) return { ok: true };
  const cleaned = raw.trim();
  // Email valida + dominio probabilmente PEC (heuristic — non blocking)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    return { ok: false, hint: "Indirizzo PEC non valido" };
  }
  return { ok: true };
}

// ─── EMAIL GENERICA ──────────────────────────────────────────────────────────
export function validateEmail(raw: string | null | undefined): FieldValidation {
  if (!raw) return { ok: false, hint: "Email obbligatoria" };
  const cleaned = raw.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    return { ok: false, hint: "Formato email non valido" };
  }
  return { ok: true };
}

// ─── WEBSITE ──────────────────────────────────────────────────────────────────
export function validateWebsite(raw: string | null | undefined): FieldValidation {
  if (!raw) return { ok: true };
  const cleaned = raw.trim();
  try {
    const url = new URL(cleaned);
    if (!["http:", "https:"].includes(url.protocol)) {
      return { ok: false, hint: "Usa http:// o https://" };
    }
    if (!url.hostname.includes(".")) {
      return { ok: false, hint: "Dominio non valido" };
    }
    return { ok: true };
  } catch {
    // Tentativo di auto-fix: prova ad aggiungere https://
    if (/^[a-z0-9]/i.test(cleaned) && cleaned.includes(".")) {
      return { ok: false, hint: "Aggiungi https:// all'inizio" };
    }
    return { ok: false, hint: "URL non valido" };
  }
}

// ─── TELEFONO IT ──────────────────────────────────────────────────────────────
export function validatePhone(raw: string | null | undefined): FieldValidation {
  if (!raw) return { ok: true };
  const cleaned = raw.replace(/[\s().-]/g, "");
  // Accetta: +39 prefisso, oppure cifre 6-15
  if (!/^(\+\d{1,3})?\d{6,15}$/.test(cleaned)) {
    return {
      ok: false,
      hint: "Telefono: solo cifre, opzionale prefisso +39 (es. +393331234567)",
    };
  }
  return { ok: true };
}
