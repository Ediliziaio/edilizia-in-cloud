/**
 * CustomersList — formatters
 * Estratto da CustomersList.tsx (MP-CAN-001 Fase 2).
 */
import { INTERNAL_NO_EMAIL_DOMAIN } from "./constants";

export function formatFullName(
  first: string | null | undefined,
  last: string | null | undefined,
): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  const isPlaceholderF = f === "—" || f === "-";
  const isPlaceholderL = l === "—" || l === "-";
  const joined = `${isPlaceholderF ? "" : f} ${isPlaceholderL ? "" : l}`.trim();
  return joined || "(senza nome)";
}

/** Display name aware di is_business (ragione sociale). */
export function formatDisplayName(c: {
  is_business?: boolean | null;
  business_name?: string | null;
  first_name: string | null;
  last_name: string | null;
}): string {
  if (c.is_business && c.business_name && c.business_name.trim()) {
    return c.business_name.trim();
  }
  return formatFullName(c.first_name, c.last_name);
}

export function formatInitials(c: {
  is_business?: boolean | null;
  business_name?: string | null;
  first_name: string | null;
  last_name: string | null;
}): string {
  if (c.is_business && c.business_name && c.business_name.trim()) {
    return c.business_name.trim().charAt(0).toUpperCase();
  }
  const f = (c.first_name ?? "").trim();
  const l = (c.last_name ?? "").trim();
  const isPlaceholderF = f === "—" || f === "-";
  const isPlaceholderL = l === "—" || l === "-";
  return (
    `${isPlaceholderF ? "" : f.charAt(0)}${isPlaceholderL ? "" : l.charAt(0)}`.toUpperCase()
  ) || "?";
}

/** Indirizzo compatto "CAP Città (PR)". */
export function formatLocality(
  city?: string | null,
  cap?: string | null,
  province?: string | null,
): string | null {
  const parts = [
    cap?.trim(),
    city?.trim(),
    province?.trim() ? `(${province.trim()})` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

export function formatPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const clean = phone.replace(/\s+/g, " ").trim();
  return clean || null;
}

export function formatCustomerEmail(email: string | null | undefined): string | null {
  const value = (email ?? "").trim();
  if (!value || value.endsWith(INTERNAL_NO_EMAIL_DOMAIN)) return null;
  return value;
}

export function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
