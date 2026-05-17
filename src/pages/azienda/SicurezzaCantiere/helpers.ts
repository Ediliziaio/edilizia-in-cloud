/**
 * SicurezzaCantiere — helpers
 * Estratto da SicurezzaCantiere.tsx (MP-CAN-001 Fase 3).
 *
 * Solo utility puri di formatting/parsing dati. Nessuna logica
 * fiscale-legale dei documenti POS/DUVRI è stata modificata.
 */
import type { DpiItem } from "./types";

export const getSupabaseErrorMessage = (error: {
  message?: string;
  details?: string | null;
  hint?: string | null;
}) => error.message || error.details || error.hint || "Operazione non riuscita";

export const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export const readFunctionError = async (res: Response, fallback: string) => {
  const text = await res.text();
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text) as { error?: string; message?: string };
    return parsed.error || parsed.message || fallback;
  } catch {
    return text;
  }
};

export const toStartOfDay = (value: Date) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

export const parseDateOnly = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const isPastDate = (value?: string | null) => {
  const date = parseDateOnly(value);
  return !!date && date < toStartOfDay(new Date());
};

export const formatDpi = (item: DpiItem) => {
  if (typeof item === "string") return item;
  const dpi = Array.isArray(item.dpi) ? item.dpi.join(", ") : item.dpi;
  return [item.mansione, dpi].filter(Boolean).join(": ") || "DPI da verificare";
};

export const statToneClass = (tone: string) => {
  switch (tone) {
    case "red":
      return "border-red-200 bg-red-50/70 text-red-700";
    case "green":
      return "border-green-200 bg-green-50/70 text-green-700";
    case "amber":
      return "border-amber-200 bg-amber-50/70 text-amber-700";
    case "indigo":
      return "border-indigo-200 bg-indigo-50/70 text-indigo-700";
    default:
      return "border-blue-200 bg-blue-50/70 text-blue-700";
  }
};
