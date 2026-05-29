/**
 * doc-validation (Deno copy) — MP-EMAIL-AI-06 · Validazioni deterministiche.
 * Copia 1:1 di src/lib/email-ai/doc-validation.ts (unit-testata lì). Pure, no deps.
 */

export function parseImporto(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  let s = raw.trim().replace(/[€$\s]/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function validatePartitaIva(raw: string | null | undefined): boolean {
  const piva = (raw ?? "").replace(/\D/g, "");
  if (piva.length !== 11) return false;
  if (/^0{11}$/.test(piva)) return false;
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    let n = piva.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}

export function checkQuadratura(imponibile: number | null, iva: number | null, totale: number | null, tol = 0.02): boolean {
  if (imponibile == null || iva == null || totale == null) return false;
  if (![imponibile, iva, totale].every((v) => Number.isFinite(v))) return false;
  return Math.abs(imponibile + iva - totale) <= tol;
}

export function isValidIban(raw: string | null | undefined): boolean {
  const iban = (raw ?? "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(iban)) return false;
  const COUNTRY_LEN: Record<string, number> = { IT: 27, SM: 27, DE: 22, FR: 27, ES: 24, NL: 18, AT: 20, BE: 16, PT: 25 };
  const expected = COUNTRY_LEN[iban.slice(0, 2)];
  if (expected && iban.length !== expected) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch >= "A" && ch <= "Z" ? (ch.charCodeAt(0) - 55).toString() : ch;
    for (const d of code) remainder = (remainder * 10 + (d.charCodeAt(0) - 48)) % 97;
  }
  return remainder === 1;
}

export function ibanEquivalenti(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "").toUpperCase();
  const na = norm(a), nb = norm(b);
  return na.length > 0 && na === nb;
}

export const SOGLIA_CONFIDENZA = 0.75;
