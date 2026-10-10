import { automationTriggerConfigErrors } from "./automationFilters.ts";

export function platformLifecycleWindows(configs: Array<Record<string, any>>) {
  let trialDays = 0, creditThreshold = 0;
  for (const config of configs) {
    if (automationTriggerConfigErrors(config).length) throw new Error("Configurazione trigger piattaforma non valida");
    const id = config.trigger_type ?? config.item_id ?? config.itemId ?? config.trigger_event;
    if (["trial_in_scadenza", "PLATFORM_TRIAL_EXPIRING"].includes(id)) trialDays = Math.max(trialDays, Number(config.giorni_prima ?? 3));
    if (["crediti_ai_bassi", "PLATFORM_AI_CREDITS_LOW"].includes(id)) creditThreshold = Math.max(creditThreshold, Number(config.soglia_eur ?? 5));
  }
  return { trialDays, creditThreshold };
}

export function platformAvailableCredits(row: Record<string, any>): number {
  const value = row.total_available_eur ?? (Number(row.balance_eur ?? 0) + Number(row.free_balance_eur ?? 0));
  if (value === "" || typeof value === "boolean" || !Number.isFinite(Number(value))) throw new Error("Saldo crediti AI non valido");
  return Number(value);
}

export function platformInvoiceDeadline(row: Record<string, any>): string | null {
  // Stripe's billing period end is not a payment due date. Only our legacy
  // manual charges intentionally stored their deadline in period_end.
  const date = row.due_date ?? (String(row.stripe_invoice_id ?? "").startsWith("manual_") ? row.period_end : null);
  return date && Number.isFinite(Date.parse(date)) ? date : null;
}

/** Stripe supplies UTC epoch seconds, not a billing-period end. */
export function stripeInvoiceDeadline(invoice: Record<string, any>): string | null {
  const seconds = invoice.due_date;
  if (seconds == null) return null; // Automatic card collection has no invoice deadline.
  if (typeof seconds !== "number" || !Number.isSafeInteger(seconds) || seconds < 0) throw new Error("Scadenza Stripe non valida");
  const date = new Date(seconds * 1000);
  if (!Number.isFinite(date.getTime())) throw new Error("Scadenza Stripe fuori intervallo");
  return date.toISOString();
}

export async function platformRows(query: (offset: number, limit: number) => PromiseLike<{ data: any[] | null; error: any }>): Promise<any[]> {
  const rows: any[] = [];
  for (let offset = 0; offset < 100000; offset += 500) {
    const { data, error } = await query(offset, 500);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
  throw new Error("Limite scansione raggiunto: risultato incompleto");
}
