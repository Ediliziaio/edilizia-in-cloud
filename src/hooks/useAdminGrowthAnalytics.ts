import { useQuery } from "@tanstack/react-query";
import {
  differenceInCalendarDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfDay,
  format,
  isWithinInterval,
  startOfDay,
  startOfMonth,
} from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import type { DateRange } from "@/components/admin/dashboard/DashboardDateFilter";
import {
  getAdminRevenueBreakdown,
  getCompanyMonthlyRevenue,
  isRevenueEligibleCompany,
  type AdminRevenueCompanyLike,
} from "@/lib/adminRevenue";

interface GrowthCompany extends AdminRevenueCompanyLike {
  id: string;
  name: string;
  sector: string | null;
  status: string | null;
  created_at: string;
  trial_ends_at: string | null;
  subscription_plan_id: string | null;
}

interface GrowthProfile {
  id: string;
  company_id: string | null;
  created_at: string;
}

interface GrowthInvoice {
  id: string;
  company_id: string;
  amount_paid: number;
  amount_due: number;
  currency: string;
  status: string;
  paid_at: string | null;
  created_at: string;
}

interface GrowthLog {
  company_id: string;
  event_type: string;
  old_status: string | null;
  new_status: string | null;
  created_at: string;
}

export interface GrowthTrendPoint {
  key: string;
  label: string;
  newCompanies: number;
  trialsStarted: number;
  newPayingCompanies: number;
  newUsers: number;
  collected: number;
  newMrr: number;
}

export interface GrowthCompanyRow {
  companyId: string;
  companyName: string;
  status: string | null;
  planName: string;
  monthlyRevenue: number;
  date: string;
}

export interface AdminGrowthAnalyticsData {
  fromIso: string;
  toIso: string;
  granularity: "day" | "month";
  currentMrr: number;
  payingCompanies: number;
  nonPayingActiveCompanies: number;
  excludedMrr: number;
  collected: number;
  monthlyCollectedAverage: number;
  newUsers: number;
  newCompanies: number;
  trialsStarted: number;
  newPayingCompanies: number;
  newMrr: number;
  trialConversionRate: number;
  trend: GrowthTrendPoint[];
  newPayingRows: GrowthCompanyRow[];
  trialRows: GrowthCompanyRow[];
}

function toRange(range: DateRange) {
  const from = startOfDay(range.from);
  const to = endOfDay(range.to);
  return { from, to, fromIso: from.toISOString(), toIso: to.toISOString() };
}

function centsToEuro(amount: number): number {
  return Math.round((Number(amount || 0) / 100) * 100) / 100;
}

function isDateInRange(value: string | null | undefined, from: Date, to: Date): boolean {
  if (!value) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && isWithinInterval(date, { start: from, end: to });
}

function isTrialCompany(company: GrowthCompany): boolean {
  const status = String(company.status ?? "").toLowerCase();
  return status === "trial" || status === "expired" || Boolean(company.trial_ends_at);
}

function getPlanName(company: GrowthCompany): string {
  const subscription = Array.isArray(company.company_subscriptions)
    ? company.company_subscriptions[0]
    : company.company_subscriptions;
  const subscriptionPlan = subscription?.subscription_plans;
  const companyPlan = Array.isArray(company.subscription_plans)
    ? company.subscription_plans[0]
    : company.subscription_plans;
  return subscriptionPlan?.name || companyPlan?.name || "Nessun piano";
}

function makeBuckets(from: Date, to: Date): {
  granularity: "day" | "month";
  trend: GrowthTrendPoint[];
  add: (dateValue: string | null | undefined, updater: (point: GrowthTrendPoint) => void) => void;
} {
  const days = differenceInCalendarDays(to, from);
  const granularity: "day" | "month" = days <= 45 ? "day" : "month";
  const dates =
    granularity === "day"
      ? eachDayOfInterval({ start: from, end: to })
      : eachMonthOfInterval({ start: startOfMonth(from), end: startOfMonth(to) });

  const trend = dates.map((date) => ({
    key: granularity === "day" ? format(date, "yyyy-MM-dd") : format(date, "yyyy-MM"),
    label: granularity === "day" ? format(date, "dd MMM", { locale: it }) : format(date, "MMM yy", { locale: it }),
    newCompanies: 0,
    trialsStarted: 0,
    newPayingCompanies: 0,
    newUsers: 0,
    collected: 0,
    newMrr: 0,
  }));
  const map = new Map(trend.map((point) => [point.key, point]));

  return {
    granularity,
    trend,
    add: (dateValue, updater) => {
      if (!dateValue) return;
      const date = new Date(dateValue);
      if (!Number.isFinite(date.getTime())) return;
      const key = granularity === "day" ? format(date, "yyyy-MM-dd") : format(date, "yyyy-MM");
      const point = map.get(key);
      if (point) updater(point);
    },
  };
}

function sortRowsDesc(a: GrowthCompanyRow, b: GrowthCompanyRow): number {
  return new Date(b.date).getTime() - new Date(a.date).getTime();
}

async function fetchAdminGrowthAnalytics(range: DateRange): Promise<AdminGrowthAnalyticsData> {
  const { from, to, fromIso, toIso } = toRange(range);
  const { granularity, trend, add } = makeBuckets(from, to);

  const [companiesRes, profilesRes, invoicesRes, logsRes] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, name, sector, status, created_at, trial_ends_at, subscription_plan_id, payment_method, stripe_customer_id, stripe_subscription_status, is_platform_admin_company, subscription_plans:subscription_plan_id(name, price_monthly, price_yearly), company_subscriptions(status, stripe_subscription_id, billing_period, current_period_start, current_period_end, subscription_plans:plan_id(name, price_monthly, price_yearly))"
      )
      .eq("is_platform_admin_company", false)
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("profiles")
      .select("id, company_id, created_at", { count: "exact" })
      .not("company_id", "is", null)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: true })
      .limit(20000),
    supabase
      .from("subscription_invoices")
      .select("id, company_id, amount_paid, amount_due, currency, status, paid_at, created_at")
      .eq("status", "paid")
      .not("paid_at", "is", null)
      .gte("paid_at", fromIso)
      .lte("paid_at", toIso)
      .order("paid_at", { ascending: true })
      .limit(20000),
    supabase
      .from("subscription_logs")
      .select("company_id, event_type, old_status, new_status, created_at")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: true })
      .limit(10000),
  ]);

  if (companiesRes.error) throw companiesRes.error;
  if (profilesRes.error) throw profilesRes.error;
  if (invoicesRes.error) throw invoicesRes.error;
  if (logsRes.error) throw logsRes.error;

  const companies = (companiesRes.data ?? []) as GrowthCompany[];
  const profiles = (profilesRes.data ?? []) as GrowthProfile[];
  const invoices = (invoicesRes.data ?? []) as GrowthInvoice[];
  const logs = (logsRes.data ?? []) as GrowthLog[];
  const companyMap = new Map(companies.map((company) => [company.id, company]));
  const revenueBreakdown = getAdminRevenueBreakdown(companies);

  const periodInvoiceCompanyIds = Array.from(new Set(invoices.map((invoice) => invoice.company_id)));
  const previousPaidCompanyIds = new Set<string>();
  if (periodInvoiceCompanyIds.length > 0) {
    const { data, error } = await supabase
      .from("subscription_invoices")
      .select("company_id")
      .eq("status", "paid")
      .not("paid_at", "is", null)
      .lt("paid_at", fromIso)
      .in("company_id", periodInvoiceCompanyIds)
      .limit(20000);

    if (error) throw error;
    (data ?? []).forEach((row) => previousPaidCompanyIds.add(row.company_id));
  }

  const periodCompanies = companies.filter((company) => isDateInRange(company.created_at, from, to));
  const trialCompanies = periodCompanies.filter(isTrialCompany);
  const newPayingDates = new Map<string, string>();

  invoices.forEach((invoice) => {
    if (!previousPaidCompanyIds.has(invoice.company_id)) {
      newPayingDates.set(invoice.company_id, invoice.paid_at ?? invoice.created_at);
    }
  });

  logs
    .filter((log) => log.event_type === "payment_completed" || log.new_status === "active")
    .forEach((log) => {
      const company = companyMap.get(log.company_id);
      if (company && isRevenueEligibleCompany(company)) {
        const previous = newPayingDates.get(log.company_id);
        if (!previous || new Date(log.created_at) < new Date(previous)) {
          newPayingDates.set(log.company_id, log.created_at);
        }
      }
    });

  periodCompanies
    .filter(isRevenueEligibleCompany)
    .forEach((company) => {
      const previous = newPayingDates.get(company.id);
      if (!previous || new Date(company.created_at) < new Date(previous)) {
        newPayingDates.set(company.id, company.created_at);
      }
    });

  periodCompanies.forEach((company) => {
    add(company.created_at, (point) => {
      point.newCompanies += 1;
      if (isTrialCompany(company)) point.trialsStarted += 1;
    });
  });

  profiles.forEach((profile) => {
    add(profile.created_at, (point) => {
      point.newUsers += 1;
    });
  });

  invoices.forEach((invoice) => {
    add(invoice.paid_at ?? invoice.created_at, (point) => {
      point.collected += centsToEuro(invoice.amount_paid);
    });
  });

  newPayingDates.forEach((date, companyId) => {
    const company = companyMap.get(companyId);
    if (!company) return;
    const monthlyRevenue = getCompanyMonthlyRevenue(company);
    add(date, (point) => {
      point.newPayingCompanies += 1;
      point.newMrr += monthlyRevenue;
    });
  });

  const collected = invoices.reduce((sum, invoice) => sum + centsToEuro(invoice.amount_paid), 0);
  const newMrr = Array.from(newPayingDates.keys()).reduce((sum, companyId) => {
    const company = companyMap.get(companyId);
    return company ? sum + getCompanyMonthlyRevenue(company) : sum;
  }, 0);
  const convertedTrials = trialCompanies.filter((company) => newPayingDates.has(company.id)).length;
  const monthsInRange = Math.max(1, (differenceInCalendarDays(to, from) + 1) / 30.4375);

  const newPayingRows: GrowthCompanyRow[] = Array.from(newPayingDates.entries())
    .map(([companyId, date]) => {
      const company = companyMap.get(companyId);
      if (!company) return null;
      return {
        companyId,
        companyName: company.name,
        status: company.status,
        planName: getPlanName(company),
        monthlyRevenue: getCompanyMonthlyRevenue(company),
        date,
      };
    })
    .filter((row): row is GrowthCompanyRow => Boolean(row))
    .sort(sortRowsDesc)
    .slice(0, 6);

  const trialRows = trialCompanies
    .map((company) => ({
      companyId: company.id,
      companyName: company.name,
      status: company.status,
      planName: getPlanName(company),
      monthlyRevenue: getCompanyMonthlyRevenue(company),
      date: company.created_at,
    }))
    .sort(sortRowsDesc)
    .slice(0, 6);

  return {
    fromIso,
    toIso,
    granularity,
    currentMrr: revenueBreakdown.mrr,
    payingCompanies: revenueBreakdown.payingCompanies,
    nonPayingActiveCompanies: revenueBreakdown.nonPayingActiveCompanies,
    excludedMrr: revenueBreakdown.excludedMrr,
    collected,
    monthlyCollectedAverage: collected / monthsInRange,
    newUsers: profilesRes.count ?? profiles.length,
    newCompanies: periodCompanies.length,
    trialsStarted: trialCompanies.length,
    newPayingCompanies: newPayingDates.size,
    newMrr,
    trialConversionRate:
      trialCompanies.length > 0 ? Math.round((convertedTrials / trialCompanies.length) * 100) : 0,
    trend,
    newPayingRows,
    trialRows,
  };
}

export function useAdminGrowthAnalytics(range: DateRange) {
  const { fromIso, toIso } = toRange(range);

  return useQuery({
    queryKey: queryKeys.admin.growthAnalytics(fromIso, toIso),
    queryFn: () => fetchAdminGrowthAnalytics(range),
    staleTime: 60 * 1000,
  });
}
