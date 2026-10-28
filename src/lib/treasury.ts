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

export function formatTreasuryCurrency(value: unknown, fallback = "—", currency: string | null = "EUR"): string {
  const amount = toFiniteAmount(value, Number.NaN);
  if (!Number.isFinite(amount)) return fallback;
  // useGrouping "always": il CLDR italiano omette il punto delle migliaia
  // sotto le 5 cifre (8597,21 accanto a 52.941,81 sembrava un refuso) —
  // stessa scelta di lib/formatters.ts.
  const code = currency && /^[A-Z]{3}$/.test(currency) ? currency : "EUR";
  const precision = ["BTC", "ETH"].includes(code) ? { minimumFractionDigits: 2, maximumFractionDigits: 8 } : {};
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: code, useGrouping: "always", ...precision }).format(amount);
}

export function treasuryTransactionAmount(row: { amount?: unknown; currency?: string; metadata?: { provider?: string; currency_code?: string; amount?: unknown } | null }): number {
  if (row.metadata?.provider === "saltedge" && row.metadata.currency_code === row.currency && typeof row.metadata.amount === "number" && Number.isFinite(row.metadata.amount)) {
    return row.metadata.amount;
  }
  return toFiniteAmount(row.amount);
}

export function sumTreasuryByCurrency<T extends { currency?: string | null }>(rows: T[], amount: (row: T) => unknown) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const currency = row.currency || "EUR";
    totals.set(currency, (totals.get(currency) ?? 0) + toFiniteAmount(amount(row)));
  }
  return [...totals].map(([currency, total]) => ({ currency, total }));
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
