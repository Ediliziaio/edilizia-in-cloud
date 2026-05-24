export function toFiniteAmount(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) return fallback;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatTreasuryCurrency(value: unknown, fallback = "—"): string {
  const amount = toFiniteAmount(value, Number.NaN);
  if (!Number.isFinite(amount)) return fallback;
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(amount);
}

export function parsePositiveAmount(value: string): number | null {
  const amount = toFiniteAmount(value, Number.NaN);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function isChronologicalDateRange(from?: string, to?: string): boolean {
  if (!from || !to) return true;
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  return start <= end;
}

export function sanitizeTreasurySearchTerm(value: string, maxLength = 80): string {
  return value
    .trim()
    .replace(/[(),%]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, maxLength)
    .trim();
}

export function buildBankTransactionSearchFilter(value: string): string | null {
  const search = sanitizeTreasurySearchTerm(value);
  if (!search) return null;

  return ["description", "creditor_name", "debtor_name", "reference"]
    .map((column) => `${column}.ilike.%${search}%`)
    .join(",");
}
