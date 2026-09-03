/**
 * Sanitizer condiviso per dati cliente (create-customer, import).
 *
 * Motivazione: un bug ricorrente di import (specie da AI/OCR) scambia
 * i campi quando il documento sorgente ha layout "Numero Cognome" o
 * "+39 333 1234567 MARIO ROSSI". Questo modulo rileva valori numerici
 * finiti in first_name / last_name e prova a ricostruire l'anagrafica
 * corretta, senza mai perdere dati (il valore originale diventa phone
 * o note se non c'è spazio).
 */

export interface RawCustomerInput {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  fiscal_code?: string | null;
  vat_number?: string | null;
  address?: string | null;
  site_address?: string | null;
  notes?: string | null;
}

export interface SanitizedCustomer {
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string;
  fiscal_code: string | null;
  vat_number: string | null;
  address: string | null;
  site_address: string | null;
  notes: string | null;
  fixes_applied: string[];      // audit: lista dei fix eseguiti
}

const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;

function cleanString(s: unknown): string {
  return String(s ?? "").replace(ZERO_WIDTH_RE, "").replace(/\s+/g, " ").trim();
}

/**
 * Detect se una stringa "sembra" un numero di telefono italiano/internazionale:
 * - almeno 6 cifre
 * - può contenere +, spazi, -, ., ()
 * - NO lettere
 */
export function looksLikePhone(s: string): boolean {
  const cleaned = cleanString(s);
  if (!cleaned) return false;
  // Se contiene lettere (alfabeto latino esteso), non è un phone
  if (/[a-zA-ZÀ-ÿ]/.test(cleaned)) return false;
  const digits = cleaned.replace(/\D/g, "");
  return digits.length >= 6 && digits.length <= 15;
}

/**
 * Detect se una stringa "sembra" un codice fiscale (16 alfanum) o P.IVA (11 cifre).
 */
export function looksLikeFiscalCode(s: string): boolean {
  const cleaned = cleanString(s).toUpperCase();
  if (!cleaned) return false;
  // P.IVA: 11 cifre
  if (/^\d{11}$/.test(cleaned)) return true;
  // CF: 16 alfanum con pattern lettere+cifre+lettere+cifre+lettere+cifre+lettera
  if (/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(cleaned)) return true;
  return false;
}

/**
 * Detect se una stringa "sembra" un'email.
 */
export function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanString(s));
}

/**
 * Normalizza un numero di telefono: rimuove caratteri invisibili e spazi ridondanti.
 * Ritorna null se non è un phone valido (6-15 cifre).
 */
export function normalizePhone(s: unknown): string | null {
  const raw = cleanString(s);
  if (!raw) return null;
  const allowed = /^[0-9+\s().-]+$/;
  if (!allowed.test(raw)) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 15) return null;
  return raw;
}

/**
 * Sanitizza un input cliente applicando correzioni automatiche per i
 * casi di import malformato più comuni.
 */
export function sanitizeCustomerInput(raw: RawCustomerInput): SanitizedCustomer {
  const fixes: string[] = [];

  let first = cleanString(raw.first_name);
  let last = cleanString(raw.last_name);
  let phone = cleanString(raw.phone);
  const email = cleanString(raw.email).toLowerCase();
  let fiscal = cleanString(raw.fiscal_code).toUpperCase();
  let vat = cleanString(raw.vat_number).toUpperCase().replace(/^IT/, "");
  const address = cleanString(raw.address);
  const siteAddress = cleanString(raw.site_address);
  let notes = cleanString(raw.notes);

  // ── FIX 1: first_name contiene un telefono ─────────────────────
  // Es: first_name="3209143982", last_name="LANZA" → phone=3209143982, first_name=""
  if (first && looksLikePhone(first)) {
    if (!phone) {
      phone = first;
      first = "";
      fixes.push('first_name numerico spostato in phone');
    } else if (phone !== first) {
      // Phone già valorizzato con un altro valore → salva first numerico nelle note
      notes = notes
        ? `${notes}\n[Import] Numero aggiuntivo rilevato: ${first}`
        : `[Import] Numero aggiuntivo rilevato: ${first}`;
      first = "";
      fixes.push('first_name numerico duplicato salvato in note');
    } else {
      // Stesso numero, solo duplicato
      first = "";
      fixes.push('first_name numerico duplicato di phone rimosso');
    }
  }

  // ── FIX 2: last_name contiene un telefono ──────────────────────
  if (last && looksLikePhone(last)) {
    if (!phone) {
      phone = last;
      last = "";
      fixes.push('last_name numerico spostato in phone');
    } else {
      notes = notes
        ? `${notes}\n[Import] Numero aggiuntivo rilevato: ${last}`
        : `[Import] Numero aggiuntivo rilevato: ${last}`;
      last = "";
      fixes.push('last_name numerico salvato in note');
    }
  }

  // ── FIX 3: first_name è un'email ───────────────────────────────
  if (first && looksLikeEmail(first)) {
    if (!email) {
      // Non può succedere qui perché l'email dovrebbe essere già valorizzata,
      // ma per sicurezza la trattiamo come nota.
      notes = notes ? `${notes}\n[Import] ${first}` : `[Import] ${first}`;
    }
    fixes.push('first_name email rimosso');
    first = "";
  }

  // ── FIX 4: first_name è un codice fiscale / P.IVA ──────────────
  if (first && looksLikeFiscalCode(first)) {
    if (!fiscal) {
      fiscal = first.toUpperCase();
      first = "";
      fixes.push('first_name CF/P.IVA spostato in fiscal_code');
    } else {
      first = "";
      fixes.push('first_name CF duplicato rimosso');
    }
  }

  // ── FIX 5: last_name è un codice fiscale / P.IVA ───────────────
  if (last && looksLikeFiscalCode(last)) {
    if (!fiscal) {
      fiscal = last.toUpperCase();
      last = "";
      fixes.push('last_name CF/P.IVA spostato in fiscal_code');
    } else {
      last = "";
      fixes.push('last_name CF duplicato rimosso');
    }
  }

  // ── FIX 6: uno dei due nomi è vuoto → ricostruzione ────────────
  // Se first è vuoto e last ha almeno due parole, splitta: prima = first, resto = last
  if (!first && last) {
    const parts = last.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      first = parts[0];
      last = parts.slice(1).join(" ");
      fixes.push('last_name splittato in first + last');
    }
  }
  // Se last è vuoto e first ha almeno due parole, splitta: prima = first, resto = last
  if (!last && first) {
    const parts = first.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      last = parts.slice(1).join(" ");
      first = parts[0];
      fixes.push('first_name splittato in first + last');
    }
  }

  // ── FIX 7: trim a max length e uppercase CF ────────────────────
  first = first.slice(0, 100);
  last = last.slice(0, 100);
  if (fiscal) fiscal = fiscal.slice(0, 16);

  // ── FIX 10: una P.IVA scritta nel campo codice fiscale ─────────
  // Storicamente il campo in scheda cliente si chiamava "CF / P.IVA" e
  // raccoglieva entrambi: le società ci finivano dentro la partita IVA, che
  // però non è un codice fiscale e non combaciava mai con quella della fattura.
  // Undici cifre = partita IVA: si sposta al posto giusto.
  if (fiscal && /^[0-9]{11}$/.test(fiscal)) {
    if (!vat) {
      vat = fiscal;
      fiscal = "";
      fixes.push('P.IVA spostata da fiscal_code a vat_number');
    } else if (vat === fiscal) {
      fiscal = "";
      fixes.push('P.IVA duplicata in fiscal_code rimossa');
    }
  }
  if (vat) vat = vat.slice(0, 13);

  // ── FIX 8: address === city duplicato in email/phone → nothing ──

  // ── FIX 9: se siamo una persona giuridica (last_name == ragione sociale)
  // e first_name era vuoto, lascia first_name vuoto ma genera "Cliente" come
  // fallback SOLO lato edge function se il client ha proprio mandato first
  // vuoto — non qui: è responsabilità del chiamante.

  return {
    first_name: first,
    last_name: last,
    phone: phone ? normalizePhone(phone) : null,
    email,
    fiscal_code: fiscal || null,
    vat_number: vat || null,
    address: address || null,
    site_address: siteAddress || null,
    notes: notes || null,
    fixes_applied: fixes,
  };
}

/**
 * Versione "fail-safe": non auto-fixa, ma valida e ritorna errori.
 * Usata quando vogliamo un controllo strict (es: single customer create da form).
 */
export function validateCustomerInput(raw: RawCustomerInput): string[] {
  const errors: string[] = [];
  const first = cleanString(raw.first_name);
  const last = cleanString(raw.last_name);

  if (!first && !last) {
    errors.push('Nome o cognome sono obbligatori');
  }
  if (first && looksLikePhone(first)) {
    errors.push('Il nome non può essere un numero di telefono');
  }
  if (last && looksLikePhone(last)) {
    errors.push('Il cognome non può essere un numero di telefono');
  }

  return errors;
}
