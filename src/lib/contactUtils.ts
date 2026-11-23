import { format } from "date-fns";
import { it } from "date-fns/locale";

// ── Avatar helpers ──

export const AVATAR_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-orange-500",
];

export function getInitials(first: string, last?: string | null) {
  const f = first?.[0]?.toUpperCase() || "";
  const l = last?.[0]?.toUpperCase() || "";
  return f + l || "?";
}

export function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ── Date formatting ──

export function formatContactDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "dd MMM yyyy", { locale: it });
  } catch {
    return "—";
  }
}

// ── Phone normalization ──

/** Remove spaces, dashes, dots from phone number for consistent storage and dedup */
export function cleanPhone(phone: string): string {
  return phone.replace(/[\s\-.]/g, "");
}

/**
 * Il numero col prefisso internazionale (+39…), come lo vogliono WhatsApp e SMS:
 * «333 123 4567», «0039 333…» e «39333…» diventano «+39333…». Un numero che non si
 * riconosce resta com'è, solo ripulito: meglio un numero da controllare che uno perso.
 */
export function telefonoInternazionale(phone: string): string {
  const pulito = cleanPhone(phone).replace(/[()]/g, "");
  const cifre = pulito.replace(/\D/g, "");
  if (!cifre) return pulito;
  // Solo un numero fatto di cifre: «int. 2» o due numeri nello stesso campo restano come
  // sono, invece di diventare un numero inventato.
  if (!/^\+?\d+$/.test(pulito)) return pulito;
  if (pulito.startsWith("+")) return /^\d{8,15}$/.test(cifre) ? `+${cifre}` : pulito;
  if (cifre.startsWith("00")) return /^\d{8,15}$/.test(cifre.slice(2)) ? `+${cifre.slice(2)}` : pulito;
  if (/^(3\d{8,9}|0\d{5,10})$/.test(cifre)) return `+39${cifre}`;
  if (/^39(3\d{8,9}|0\d{5,10})$/.test(cifre)) return `+${cifre}`;
  return pulito;
}

/** Le forme in cui lo stesso numero può essere già salvato, per ritrovare il contatto. */
export function formeTelefono(phone: string): string[] {
  const internazionale = telefonoInternazionale(phone);
  const forme = new Set([internazionale, cleanPhone(phone)]);
  if (internazionale.startsWith("+")) {
    forme.add(internazionale.slice(1));
    forme.add(`00${internazionale.slice(1)}`);
    if (internazionale.startsWith("+39")) forme.add(internazionale.slice(3));
  }
  return [...forme];
}

// ── Shared types ──

export interface CustomFieldDef {
  id: string;
  name: string;
  field_type: string;
  section: string;
  options: string[] | null;
}
