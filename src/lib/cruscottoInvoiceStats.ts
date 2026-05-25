import { addDays, format } from "date-fns";
import { safeNumber } from "@/lib/numberUtils";

export interface CruscottoInvoiceStats {
  total_outstanding: number;
  overdue_count: number;
  overdue_amount: number;
  due_this_week_count: number;
  due_this_week_amount: number;
  paid_this_month: number;
  issued_this_month: number;
  issued_this_month_amount: number;
}

export interface CruscottoInvoiceStatsRow {
  document_type: string | null;
  status: string | null;
  issue_date: string | null;
  due_date: string | null;
  total: number | null;
  paid_amount: number | null;
  updated_at: string | null;
  deleted_at?: string | null;
}

export const EMPTY_CRUSCOTTO_INVOICE_STATS: CruscottoInvoiceStats = {
  total_outstanding: 0,
  overdue_count: 0,
  overdue_amount: 0,
  due_this_week_count: 0,
  due_this_week_amount: 0,
  paid_this_month: 0,
  issued_this_month: 0,
  issued_this_month_amount: 0,
};

export const CRUSCOTTO_INVOICE_DOCUMENT_TYPES = ["invoice", "fattura", "fattura_accompagnatoria", "parcella"] as const;

const CLOSED_STATUSES = new Set(["paid", "pagata", "cancelled", "canceled", "annullata"]);

function toDateOnly(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null;
}

function isBetweenDateOnly(value: string | null, from: string, to: string) {
  return !!value && value >= from && value <= to;
}

function isInvoiceDocumentType(documentType: string | null) {
  return CRUSCOTTO_INVOICE_DOCUMENT_TYPES.includes(documentType as (typeof CRUSCOTTO_INVOICE_DOCUMENT_TYPES)[number]);
}

export function calculateCruscottoInvoiceStats(
  rows: CruscottoInvoiceStatsRow[],
  now: Date = new Date(),
): CruscottoInvoiceStats {
  const today = format(now, "yyyy-MM-dd");
  const weekEnd = format(addDays(now, 7), "yyyy-MM-dd");
  const monthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
  const monthEnd = format(new Date(now.getFullYear(), now.getMonth() + 1, 0), "yyyy-MM-dd");

  return rows.reduce<CruscottoInvoiceStats>((stats, row) => {
    if (!isInvoiceDocumentType(row.document_type) || row.deleted_at) return stats;

    const status = (row.status || "").toLowerCase();
    const isClosed = CLOSED_STATUSES.has(status);
    const total = safeNumber(row.total);
    const paidAmount = safeNumber(row.paid_amount);
    const remaining = Math.max(0, total - paidAmount);
    const dueDate = toDateOnly(row.due_date);
    const issueDate = toDateOnly(row.issue_date);
    const updatedDate = toDateOnly(row.updated_at);
    const isCollectable = !isClosed && remaining > 0;

    if (!isClosed) {
      stats.total_outstanding += remaining;
    }

    if (isCollectable && dueDate && dueDate < today) {
      stats.overdue_count += 1;
      stats.overdue_amount += remaining;
    }

    if (isCollectable && isBetweenDateOnly(dueDate, today, weekEnd)) {
      stats.due_this_week_count += 1;
      stats.due_this_week_amount += remaining;
    }

    if ((status === "paid" || status === "pagata") && isBetweenDateOnly(updatedDate, monthStart, monthEnd)) {
      stats.paid_this_month += total;
    }

    if (isBetweenDateOnly(issueDate, monthStart, monthEnd)) {
      stats.issued_this_month += 1;
      stats.issued_this_month_amount += total;
    }

    return stats;
  }, { ...EMPTY_CRUSCOTTO_INVOICE_STATS });
}
