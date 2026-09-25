import { format, isValid, parseISO } from "date-fns";
import type { InstallmentLike } from "@/lib/commissions";

type DueInstallment = InstallmentLike & { expected_date?: string | null };

/** Amounts/dates must already be resolved with the payment plan's balance and triggers. */
export function paymentOverview(total: number, collected: number, installments: DueInstallment[], today = new Date()) {
  const remaining = Math.max(0, Math.round((total - collected) * 100) / 100);
  const excess = Math.max(0, Math.round((collected - total) * 100) / 100);
  const percent = total > 0 ? Math.max(0, Math.min(100, collected / total * 100)) : 0;
  const dated = installments.filter(i => !i.is_paid && i.type !== "financing" && Number(i.amount) > 0
    && i.expected_date && isValid(parseISO(i.expected_date)))
    .sort((a, b) => a.expected_date!.localeCompare(b.expected_date!));
  const overdue = dated.filter(i => i.expected_date!.slice(0, 10) < format(today, "yyyy-MM-dd"));
  const status = total <= 0 ? "Importo da definire" : excess > 0.01 ? "Incasso da verificare"
    : remaining <= 0.01 ? "Saldato" : overdue.length ? "Rate scadute"
    : collected > 0 ? "Incassato parzialmente" : "Da incassare";
  return { remaining, excess, percent, status, overdue: remaining > 0.01 ? overdue.length : 0, nextDate: remaining > 0.01 ? dated[0]?.expected_date ?? null : null };
}
