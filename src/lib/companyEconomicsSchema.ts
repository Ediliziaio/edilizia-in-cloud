import { z } from "zod";
import type { EconomicsReport } from "./companyEconomics";
const date = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const amount = z.number().finite();
const count = z.number().int().nonnegative();
const identity = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  payment_method: z.string().nullable(),
  created_at: date,
  plan_name: z.string().nullable(),
  plan_monthly_eur: amount.nullable(),
  custom_monthly_eur: amount.nullable(),
  override_expires_at: date.nullable(),
});
const provider = z
  .object({
    id: z.string(),
    label: z.string(),
    kind: z.enum(["cycle", "annual", "free"]),
    period_start: date,
    period_end: date,
    observed_at: date,
    current_amount: amount.nonnegative(),
    forecast_amount: amount.nonnegative().nullable(),
    currency: z.enum(["USD", "EUR"]),
    eur_per_unit: amount.positive().nullable(),
    fx_date: date.nullable(),
    source_url: z.string().url(),
    last_invoice_amount: amount.nullable(),
    last_invoice_date: date.nullable(),
    note: z.string(),
  })
  .refine(
    (value) => Date.parse(value.period_end) > Date.parse(value.period_start),
  );
const schema = z
  .object({
    measured_at: date,
    period_start: date,
    period_end: date,
    companies: z.array(identity),
    costs: z.array(
      z.object({
        company_id: z.string().nullable(),
        kind: z.enum(["ai", "email", "sms", "render"]),
        events: count,
        recorded_eur: amount,
        missing_events: count,
        estimated_events: count,
      }),
    ),
    storage: z.array(
      z.object({
        company_id: z.string().nullable(),
        bytes: amount.nonnegative(),
        exports_bytes: amount.nonnegative(),
        files: count,
      }),
    ),
    providers: z.array(provider).min(1),
    legacy_ai: z.object({
      events: count,
      recorded_eur: amount,
      note: z.string(),
    }),
    database_bytes: amount.nonnegative().optional(),
    storage_bytes: amount.nonnegative().optional(),
    storage_measured_at: date.optional(),
  })
  .refine(
    (value) =>
      Date.parse(value.period_end) > Date.parse(value.period_start) &&
      Date.parse(value.measured_at) >= Date.parse(value.period_start) &&
      Date.parse(value.measured_at) <= Date.parse(value.period_end),
  );
export function parseEconomicsReport(payload: unknown): EconomicsReport {
  const result = schema.safeParse(payload);
  if (!result.success)
    throw new Error(
      "Rilevazione economica incompleta o non valida. Costi e margine non possono essere calcolati.",
    );
  // With strictNullChecks disabled, Zod infers required nullable fields as optional.
  // safeParse above still validates their presence at runtime.
  return result.data as EconomicsReport;
}
