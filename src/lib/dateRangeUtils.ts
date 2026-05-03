import { subDays, startOfDay, endOfDay, startOfMonth, startOfYear } from "date-fns";

/**
 * Union of all date-range preset types used across dashboards.
 * Each consumer can use a subset of these presets.
 */
export type DateRangePreset =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "month"
  | "quarter"
  | "year"
  | "all"
  | "custom";

/**
 * Resolves a date-range preset to concrete Date boundaries.
 * Supports all presets used in CompanyDashboard, MarketingDashboard,
 * CruscottoData and Scadenzario.
 */
export function getDateRange(
  preset: DateRangePreset | string,
  customFrom?: Date,
  customTo?: Date,
): { from: Date; to: Date } {
  const now = new Date();
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = subDays(now, 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "last7":
      return { from: startOfDay(subDays(now, 7)), to: endOfDay(now) };
    case "last30":
      return { from: startOfDay(subDays(now, 30)), to: endOfDay(now) };
    case "month":
      return { from: startOfMonth(now), to: endOfDay(now) };
    case "quarter":
      return { from: startOfDay(subDays(now, 90)), to: endOfDay(now) };
    case "year":
      return { from: startOfYear(now), to: endOfDay(now) };
    case "all":
      // "Sempre": copre l'intera storia. Usiamo un punto d'inizio molto basso
      // (anno 2000) e l'ora corrente. Le query standard sono comunque limitate
      // dal company_id e da indici sugli altri campi, quindi il costo è uguale
      // a un anno qualunque.
      return { from: new Date("2000-01-01T00:00:00Z"), to: endOfDay(now) };
    case "custom":
    default:
      return { from: customFrom || subDays(now, 30), to: customTo || now };
  }
}
