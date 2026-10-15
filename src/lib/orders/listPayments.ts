import {buildInstallmentsFromLegacy, getAmountDue, getGrossOrderAmount, type OrderWithDetails} from "@/lib/orderUtils";
import {differenceInCalendarDays, format, parseISO} from "date-fns";

export type OrderPaymentFilter = "all" | "pending" | "unpaid" | "paid" | "overdue";
export function orderPaymentTiming(order: OrderWithDetails, today = new Date()) {
  if (getAmountDue(order) <= 0.01) return {nextDate: null as string | null, overdueDays: 0};
  const installments = order.installments?.length ? order.installments : buildInstallmentsFromLegacy(order);
  const dates = installments.filter(row => !row.is_paid && Number(row.amount) > 0)
    .map(row => (row as {expected_date?: string | null}).expected_date)
    .filter((date): date is string => !!date && !Number.isNaN(Date.parse(date))).sort();
  const nextDate = dates[0]?.slice(0, 10) ?? null;
  return {nextDate, overdueDays: nextDate ? Math.max(0, differenceInCalendarDays(today, parseISO(nextDate))) : 0};
}
export function matchesOrderPayment(order: OrderWithDetails, filter: OrderPaymentFilter, today = format(new Date(), "yyyy-MM-dd")) {
  if (filter === "all") return true;
  const due = getAmountDue(order);
  if (filter === "paid") return due <= 0.01 && getGrossOrderAmount(order) > 0;
  if (due <= 0.01) return false;
  if (filter !== "overdue") return true;
  const installments = order.installments?.length ? order.installments : buildInstallmentsFromLegacy(order);
  return installments.some(installment => {
    const date = (installment as {expected_date?: string | null}).expected_date;
    return !installment.is_paid && Number(installment.amount) > 0 && !!date &&
      !Number.isNaN(Date.parse(date)) && date.slice(0, 10) < today;
  });
}
