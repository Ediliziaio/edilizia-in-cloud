/**
 * Sanitizer client-side (mirror di supabase/functions/_shared/customerDataSanitizer.ts).
 *
 * Usato nel preview di import per mostrare i fix che verranno applicati,
 * e nel detail page per suggerire correzioni (es. "il nome è un numero,
 * vuoi spostarlo in telefono?").
 *
 * IMPORTANTE: i due file devono restare allineati sulla logica. Il backend
 * è comunque la fonte di verità: qualunque client-side mapping sbagliato
 * viene corretto anche server-side.
 */

export interface RawCustomerInput {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  fiscal_code?: string | null;
  address?: string | null;
  site_address?: string | null;
  notes?: string | null;
}

export interface SanitizedCustomer extends RawCustomerInput {
  first_name: string;
  last_name: string;
  email: string;
  fixes_applied: string[];
}

const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;

function cleanString(s: unknown): string {
  return String(s ?? "").replace(ZERO_WIDTH_RE, "").replace(/\s+/g, " ").trim();
}

export function looksLikePhone(s: string): boolean {
  const cleaned = cleanString(s);
  if (!cleaned) return false;
  if (/[a-zA-ZÀ-ÿ]/.test(cleaned)) return false;
  const digits = cleaned.replace(/\D/g, "");
  return digits.length >= 6 && digits.length <= 15;
}

export function looksLikeFiscalCode(s: string): boolean {
  const cleaned = cleanString(s).toUpperCase();
  if (!cleaned) return false;
  if (/^\d{11}$/.test(cleaned)) return true;
  if (/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(cleaned)) return true;
  return false;
}

export function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanString(s));
}

export function normalizePhone(s: unknown): string | null {
  const raw = cleanString(s);
  if (!raw) return null;
  const allowed = /^[0-9+\s().-]+$/;
  if (!allowed.test(raw)) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 15) return null;
  return raw;
}

export function sanitizeCustomerInput(raw: RawCustomerInput): SanitizedCustomer {
  const fixes: string[] = [];

  let first = cleanString(raw.first_name);
  let last = cleanString(raw.last_name);
  let phone = cleanString(raw.phone);
  const email = cleanString(raw.email).toLowerCase();
  let fiscal = cleanString(raw.fiscal_code).toUpperCase();
  const address = cleanString(raw.address);
  const siteAddress = cleanString(raw.site_address);
  let notes = cleanString(raw.notes);

  if (first && looksLikePhone(first)) {
    if (!phone) {
      phone = first;
      first = "";
      fixes.push('Nome numerico → spostato in Telefono');
    } else if (phone !== first) {
      notes = notes
        ? `${notes}\n[Import] Numero aggiuntivo: ${first}`
        : `[Import] Numero aggiuntivo: ${first}`;
      first = "";
      fixes.push('Nome numerico duplicato → salvato in Note');
    } else {
      first = "";
      fixes.push('Nome numerico duplicato rimosso');
    }
  }

  if (last && looksLikePhone(last)) {
    if (!phone) {
      phone = last;
      last = "";
      fixes.push('Cognome numerico → spostato in Telefono');
    } else {
      notes = notes
        ? `${notes}\n[Import] Numero aggiuntivo: ${last}`
        : `[Import] Numero aggiuntivo: ${last}`;
      last = "";
      fixes.push('Cognome numerico → salvato in Note');
    }
  }

  if (first && looksLikeEmail(first)) {
    fixes.push('Nome era un\'email: rimosso');
    first = "";
  }

  if (first && looksLikeFiscalCode(first)) {
    if (!fiscal) {
      fiscal = first.toUpperCase();
      first = "";
      fixes.push('Nome era CF/P.IVA → spostato in Codice Fiscale');
    } else {
      first = "";
      fixes.push('Nome era CF duplicato rimosso');
    }
  }

  if (last && looksLikeFiscalCode(last)) {
    if (!fiscal) {
      fiscal = last.toUpperCase();
      last = "";
      fixes.push('Cognome era CF/P.IVA → spostato in Codice Fiscale');
    } else {
      last = "";
      fixes.push('Cognome era CF duplicato rimosso');
    }
  }

  if (!first && last) {
    const parts = last.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      first = parts[0];
      last = parts.slice(1).join(" ");
      fixes.push('Cognome splittato in Nome + Cognome');
    }
  }
  if (!last && first) {
    const parts = first.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      last = parts.slice(1).join(" ");
      first = parts[0];
      fixes.push('Nome splittato in Nome + Cognome');
    }
  }

  first = first.slice(0, 100);
  last = last.slice(0, 100);
  if (fiscal) fiscal = fiscal.slice(0, 16);

  return {
    first_name: first,
    last_name: last,
    phone: phone ? normalizePhone(phone) : null,
    email,
    fiscal_code: fiscal || null,
    address: address || null,
    site_address: siteAddress || null,
    notes: notes || null,
    fixes_applied: fixes,
  };
}
