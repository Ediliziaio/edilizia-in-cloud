import { format, isValid, parseISO, subDays } from "date-fns";

export type OperationalPeriod = "tutto" | "30" | "90" | "anno";
export function operationalPeriod(value: string | null): OperationalPeriod {
  return value === "30" || value === "90" || value === "anno" ? value : "tutto";
}

/** Dates are compared as local calendar days, including both boundaries. */
export function inOperationalPeriod(
  value: string | null | undefined,
  period: OperationalPeriod,
  now = new Date(),
): boolean {
  if (period === "tutto") return true;
  if (!value || !isValid(parseISO(value))) return false;
  const day = value.slice(0, 10);
  const today = format(now, "yyyy-MM-dd");
  const start =
    period === "anno"
      ? `${now.getFullYear()}-01-01`
      : format(subDays(now, Number(period)), "yyyy-MM-dd");
  return day >= start && day <= today;
}

/** Namespace each tab so a supplier/date/state filter never affects its neighbours. */
export function updateOperationalParams(
  params: URLSearchParams,
  prefix: "rdo" | "ddt",
  values: Record<string, string | null>,
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (Object.keys(values).some((key) => !["pagina", "vista"].includes(key)))
    next.delete(`${prefix}_pagina`);
  for (const [key, value] of Object.entries(values)) {
    if (
      value == null ||
      value === "" ||
      value === "tutti" ||
      value === "all" ||
      value === "tutto"
    )
      next.delete(`${prefix}_${key}`);
    else next.set(`${prefix}_${key}`, value);
  }
  return next;
}
export function operationalPage(
  value: string | null,
  total: number,
  size = 25,
): number {
  const parsed = Number(value);
  return Math.min(
    Math.max(1, Math.ceil(total / size)),
    Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1,
  );
}
