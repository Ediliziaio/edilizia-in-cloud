import { getEffectiveMRR } from "@/lib/paymentStatus";

export type CostKind = "ai" | "email" | "sms" | "render";
export interface CompanyEconomicsIdentity {
  id: string;
  name: string;
  status: string;
  payment_method: string | null;
  created_at: string;
  plan_name: string | null;
  plan_monthly_eur: number | null;
  custom_monthly_eur: number | null;
  override_expires_at: string | null;
}
export interface CostObservation {
  company_id: string | null;
  kind: CostKind;
  events: number;
  recorded_eur: number;
  missing_events: number;
  estimated_events: number;
}
export interface ProviderCostSnapshot {
  id: string;
  label: string;
  kind: "cycle" | "annual" | "free";
  period_start: string;
  period_end: string;
  observed_at: string;
  current_amount: number;
  forecast_amount: number | null;
  currency: "USD" | "EUR";
  eur_per_unit: number | null;
  fx_date: string | null;
  source_url: string;
  last_invoice_amount: number | null;
  last_invoice_date: string | null;
  note: string;
}
export interface EconomicsReport {
  measured_at: string;
  period_start: string;
  period_end: string;
  database_bytes?: number;
  storage_bytes?: number;
  storage_measured_at?: string;
  companies: CompanyEconomicsIdentity[];
  costs: CostObservation[];
  storage: {
    company_id: string | null;
    bytes: number;
    exports_bytes: number;
    files: number;
  }[];
  providers: ProviderCostSnapshot[];
  legacy_ai: { events: number; recorded_eur: number; note: string };
}
const number = (value: number | null | undefined) =>
  Number.isFinite(Number(value)) ? Number(value ?? 0) : 0;
const duration = (from: string, to: string) =>
  new Date(to).getTime() - new Date(from).getTime();
export const euro = (amount: number | null) =>
  amount === null
    ? "Non disponibile"
    : new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
        maximumFractionDigits:
          Math.abs(amount) > 0 && Math.abs(amount) < 0.01 ? 4 : 2,
      }).format(amount);
export function providerPeriodCost(
  provider: ProviderCostSnapshot,
  report: EconomicsReport,
  forecast = false,
): number | null {
  if (provider.kind === "free") return 0;
  const rate = provider.currency === "EUR" ? 1 : provider.eur_per_unit;
  if (rate === null || !Number.isFinite(rate) || rate <= 0) return null;
  if (provider.kind === "cycle") {
    // Una rilevazione di un altro ciclo non può diventare costo zero del ciclo selezionato.
    if (
      duration(provider.period_start, report.period_start) !== 0 ||
      duration(provider.period_end, report.period_end) !== 0
    )
      return null;
    if (forecast && provider.forecast_amount === null) return null;
    return (
      number(forecast ? provider.forecast_amount : provider.current_amount) *
      rate
    );
  }
  const end = Math.min(
    new Date(provider.period_end).getTime(),
    new Date(forecast ? report.period_end : report.measured_at).getTime(),
  );
  const start = Math.max(
    new Date(provider.period_start).getTime(),
    new Date(report.period_start).getTime(),
  );
  const total = duration(provider.period_start, provider.period_end);
  return total > 0
    ? ((number(provider.current_amount) * Math.max(0, end - start)) / total) *
        rate
    : null;
}
export function companyEconomics(report: EconomicsReport, id: string) {
  const company = report.companies.find((row) => row.id === id);
  if (!company) return null;
  const denominator = report.companies.length; // Anche omaggi, trial, sospesi e ambiente interno: il loro spazio continua a esistere.
  const providerAmounts = report.providers.map((p) =>
    providerPeriodCost(p, report),
  );
  const sharedAvailable =
    providerAmounts.length > 0 && providerAmounts.every((n) => n !== null);
  const shared = sharedAvailable
    ? providerAmounts.reduce<number>((sum, n) => sum + n!, 0) / denominator
    : null;
  const rows = report.costs.filter((row) => row.company_id === id);
  const direct = rows.reduce((sum, row) => sum + number(row.recorded_eur), 0);
  const missing = rows.reduce(
    (sum, row) => sum + number(row.missing_events),
    0,
  );
  const estimated = rows.reduce(
    (sum, row) => sum + number(row.estimated_events),
    0,
  );
  const validOverride =
    company.custom_monthly_eur !== null &&
    (!company.override_expires_at ||
      new Date(company.override_expires_at).getTime() >
        new Date(report.measured_at).getTime());
  const price = validOverride
    ? company.custom_monthly_eur
    : company.plan_monthly_eur;
  const paying = getEffectiveMRR(company, 1) === 1;
  const mrr =
    paying &&
    (price === null || !Number.isFinite(Number(price)) || Number(price) < 0)
      ? null
      : getEffectiveMRR(company, price);
  const knownCost = shared === null ? null : direct + shared;
  // È il residuo sul canone corrente, NON un utile consuntivo né ricavi incassati.
  const margin = knownCost === null || mrr === null ? null : mrr - knownCost;
  const storage = report.storage.find((row) => row.company_id === id);
  return {
    company,
    rows,
    direct,
    shared,
    knownCost,
    mrr,
    margin,
    missing,
    estimated,
    denominator,
    storage,
    partial: true as const,
  };
}
export function economicsCsv(report: EconomicsReport): string {
  const escape = (value: string) =>
    `"${(/^[=+@\-\t\r]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
  const rows = report.companies
    .map((c) => companyEconomics(report, c.id)!)
    .map((r) => [
      r.company.name,
      r.mrr,
      r.direct,
      r.shared,
      r.margin,
      "Parziale: canone corrente meno costi noti; consumi futuri e costi non misurati esclusi",
    ]);
  return (
    "\uFEFF" +
    [
      [
        "Azienda",
        "Canone EUR/mese",
        "Costi registrati EUR",
        "Quota comune EUR",
        "Residuo provvisorio EUR",
        "Qualità",
      ],
      ...rows,
    ]
      .map((row) =>
        row
          .map((v) => escape(v === null ? "Non disponibile" : String(v)))
          .join(";"),
      )
      .join("\r\n")
  );
}
