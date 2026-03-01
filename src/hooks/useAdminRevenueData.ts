import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subMonths, format, startOfMonth, endOfMonth } from "date-fns";
import { it } from "date-fns/locale";

export type HealthStatus = "healthy" | "at_risk" | "critical";

export interface CompanyHealthScore {
  companyId: string;
  companyName: string;
  sector: string;
  status: string;
  score: number; // 0-100
  health: HealthStatus;
  orderCount: number;
  ordersLast30d: number;
  userCount: number;
  lastOrderDate: string | null;
  hasCustomers: boolean;
  hasStaff: boolean;
  hasOrders: boolean;
  trialEndsAt: string | null;
}

export interface MrrMovement {
  month: string;
  newMrr: number;
  expansionMrr: number;
  contractionMrr: number;
  churnMrr: number;
  netNew: number;
}

export interface SectorRevenue {
  sector: string;
  sectorLabel: string;
  mrr: number;
  count: number;
}

export interface TrialActivation {
  total: number;
  withOrders: number;
  withCustomers: number;
  withStaff: number;
  hot: number;
  cold: number;
  conversionRate: number;
  avgDaysToFirstOrder: number | null;
  conversionTrend: ConversionTrendPoint[];
  hotTrialAlerts: HotTrialAlert[];
}

export interface ConversionTrendPoint {
  month: string;
  trialsStarted: number;
  converted: number;
  expired: number;
  rate: number;
}

export interface HotTrialAlert {
  companyId: string;
  companyName: string;
  score: number;
  daysUntilExpiry: number;
  ordersLast30d: number;
  userCount: number;
}

const sectorLabelsMap: Record<string, string> = {
  serramenti: "Serramenti",
  infissi: "Infissi",
  bagni: "Bagni",
  tetti: "Tetti",
  fotovoltaico: "Fotovoltaico",
  pittura: "Pittura",
  ristrutturazioni: "Ristrutturazioni",
  altro: "Altro",
};

function calculateHealthScore(
  company: any,
  healthData: any
): { score: number; health: HealthStatus } {
  let score = 0;

  // Has orders (25 pts)
  if (healthData?.order_count > 0) score += 15;
  if ((healthData?.orders_last_30d || 0) > 0) score += 10;

  // Has users (20 pts)
  if ((healthData?.user_count || 0) >= 2) score += 20;
  else if ((healthData?.user_count || 0) >= 1) score += 10;

  // Has customers (15 pts)
  if (healthData?.has_customers) score += 15;

  // Has staff (10 pts)
  if (healthData?.has_staff) score += 10;

  // Recent activity (20 pts)
  if (healthData?.last_order_date) {
    const daysSince = Math.floor(
      (Date.now() - new Date(healthData.last_order_date).getTime()) / 86400000
    );
    if (daysSince <= 7) score += 20;
    else if (daysSince <= 30) score += 15;
    else if (daysSince <= 60) score += 5;
  }

  // Active status bonus (10 pts)
  if (company.status === "active") score += 10;

  const health: HealthStatus =
    score >= 60 ? "healthy" : score >= 30 ? "at_risk" : "critical";

  return { score: Math.min(score, 100), health };
}

export function useAdminRevenueData() {
  return useQuery({
    queryKey: ["admin-revenue-intelligence"],
    queryFn: async () => {
      const [companiesRes, healthRes, subscriptionLogsRes] = await Promise.all([
        supabase
          .from("companies")
          .select("id, name, sector, status, created_at, trial_ends_at, subscription_plan_id, subscription_plans:subscription_plan_id(price_monthly)"),
        supabase.rpc("get_company_health_data"),
        supabase
          .from("subscription_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      const now = new Date();
      // Derive effective status: if trial has expired, treat as "expired"
      const companies = (companiesRes.data || []).map((c) => ({
        ...c,
        status: c.status === "trial" && c.trial_ends_at && new Date(c.trial_ends_at) < now
          ? "expired"
          : c.status,
      }));
      const healthDataMap = new Map<string, any>();
      (healthRes.data || []).forEach((h: any) => {
        healthDataMap.set(h.company_id, h);
      });

      // ---- HEALTH SCORES ----
      const healthScores: CompanyHealthScore[] = companies.map((c) => {
        const hd = healthDataMap.get(c.id);
        const { score, health } = calculateHealthScore(c, hd);
        return {
          companyId: c.id,
          companyName: c.name,
          sector: c.sector,
          status: c.status,
          score,
          health,
          orderCount: hd?.order_count || 0,
          ordersLast30d: hd?.orders_last_30d || 0,
          userCount: hd?.user_count || 0,
          lastOrderDate: hd?.last_order_date || null,
          hasCustomers: hd?.has_customers || false,
          hasStaff: hd?.has_staff || false,
          hasOrders: (hd?.order_count || 0) > 0,
          trialEndsAt: c.trial_ends_at,
        };
      });

      const healthSummary = {
        healthy: healthScores.filter((h) => h.health === "healthy").length,
        atRisk: healthScores.filter((h) => h.health === "at_risk").length,
        critical: healthScores.filter((h) => h.health === "critical").length,
      };

      // ---- REVENUE BY SECTOR ----
      const sectorMap = new Map<string, { mrr: number; count: number }>();
      companies
        .filter((c) => c.status === "active")
        .forEach((c) => {
          const plan = c.subscription_plans as { price_monthly: number } | null;
          const price = plan?.price_monthly || 0;
          const existing = sectorMap.get(c.sector) || { mrr: 0, count: 0 };
          sectorMap.set(c.sector, {
            mrr: existing.mrr + price,
            count: existing.count + 1,
          });
        });

      const revenueBySector: SectorRevenue[] = Array.from(sectorMap.entries())
        .map(([sector, data]) => ({
          sector,
          sectorLabel: sectorLabelsMap[sector] || sector,
          mrr: data.mrr,
          count: data.count,
        }))
        .sort((a, b) => b.mrr - a.mrr);

      // ---- MRR & ARR & NRR ----
      const activeCompanies = companies.filter((c) => c.status === "active");
      const currentMrr = activeCompanies.reduce((sum, c) => {
        const plan = c.subscription_plans as { price_monthly: number } | null;
        return sum + (plan?.price_monthly || 0);
      }, 0);

      const arr = currentMrr * 12;

      // NRR approximation: (current MRR from companies that existed 6mo ago) / (MRR 6mo ago)
      const sixMonthsAgo = subMonths(new Date(), 6);
      const companiesExistingSixMonths = activeCompanies.filter(
        (c) => new Date(c.created_at) <= sixMonthsAgo
      );
      const currentMrrFromExisting = companiesExistingSixMonths.reduce((sum, c) => {
        const plan = c.subscription_plans as { price_monthly: number } | null;
        return sum + (plan?.price_monthly || 0);
      }, 0);

      // Estimate MRR 6mo ago from all companies that were active at that time
      const allExistingSixMonths = companies.filter(
        (c) => new Date(c.created_at) <= sixMonthsAgo
      );
      const mrrSixMonthsAgo = allExistingSixMonths.reduce((sum, c) => {
        const plan = c.subscription_plans as { price_monthly: number } | null;
        if (c.status === "active" || c.status === "expired") {
          return sum + (plan?.price_monthly || 0);
        }
        return sum;
      }, 0);

      const nrr = mrrSixMonthsAgo > 0
        ? Math.round((currentMrrFromExisting / mrrSixMonthsAgo) * 100)
        : 100;

      // ---- MRR MOVEMENTS (last 6 months) ----
      const mrrMovements: MrrMovement[] = [];
      for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(now, i);
        const mStart = startOfMonth(monthDate);
        const mEnd = endOfMonth(monthDate);

        // New companies created this month that became active
        const newThisMonth = companies.filter((c) => {
          const created = new Date(c.created_at);
          return created >= mStart && created <= mEnd && c.status === "active";
        });
        const newMrr = newThisMonth.reduce((s, c) => {
          const plan = c.subscription_plans as { price_monthly: number } | null;
          return s + (plan?.price_monthly || 0);
        }, 0);

        // Churned: companies that expired this month (approximation)
        const churnedThisMonth = companies.filter((c) => {
          if (c.status !== "expired") return false;
          // Use trial_ends_at as proxy for churn date
          if (!c.trial_ends_at) return false;
          const churnDate = new Date(c.trial_ends_at);
          return churnDate >= mStart && churnDate <= mEnd;
        });
        const churnMrr = churnedThisMonth.reduce((s, c) => {
          const plan = c.subscription_plans as { price_monthly: number } | null;
          return s + (plan?.price_monthly || 0);
        }, 0);

        mrrMovements.push({
          month: format(monthDate, "MMM yy", { locale: it }),
          newMrr,
          expansionMrr: 0, // Would need plan change history
          contractionMrr: 0,
          churnMrr,
          netNew: newMrr - churnMrr,
        });
      }

      // ---- TRIAL INTELLIGENCE ----
      const trialCompanies = companies.filter((c) => c.status === "trial");
      const allTrialAndConverted = companies.filter(
        (c) => c.status === "trial" || c.status === "active" || c.status === "expired"
      );

      const trialWithOrders = trialCompanies.filter((c) => {
        const hd = healthDataMap.get(c.id);
        return hd && hd.order_count > 0;
      }).length;

      const trialWithCustomers = trialCompanies.filter((c) => {
        const hd = healthDataMap.get(c.id);
        return hd && hd.has_customers;
      }).length;

      const trialWithStaff = trialCompanies.filter((c) => {
        const hd = healthDataMap.get(c.id);
        return hd && hd.has_staff;
      }).length;

      // Hot trials: have orders in last 30d
      const hotTrials = trialCompanies.filter((c) => {
        const hd = healthDataMap.get(c.id);
        return hd && hd.orders_last_30d > 0;
      }).length;

      // Cold trials: no orders, no users beyond 1
      const coldTrials = trialCompanies.filter((c) => {
        const hd = healthDataMap.get(c.id);
        return (!hd || hd.order_count === 0) && (!hd || hd.user_count <= 1);
      }).length;

      // Time to first order for converted companies
      const convertedWithOrders = activeCompanies
        .map((c) => {
          const hd = healthDataMap.get(c.id);
          if (!hd?.last_order_date) return null;
          const created = new Date(c.created_at);
          const firstOrder = new Date(hd.last_order_date);
          return Math.max(0, Math.floor((firstOrder.getTime() - created.getTime()) / 86400000));
        })
        .filter((d): d is number => d !== null);

      const avgDaysToFirstOrder =
        convertedWithOrders.length > 0
          ? Math.round(convertedWithOrders.reduce((a, b) => a + b, 0) / convertedWithOrders.length)
          : null;

      const totalTrialPool = allTrialAndConverted.length;
      const conversionRate =
        totalTrialPool > 0
          ? Math.round((activeCompanies.length / totalTrialPool) * 100)
          : 0;

      // ---- CONVERSION TREND (last 6 months) ----
      const conversionTrend: ConversionTrendPoint[] = [];
      for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(now, i);
        const mStart = startOfMonth(monthDate);
        const mEnd = endOfMonth(monthDate);

        const trialsStarted = companies.filter((c) => {
          const created = new Date(c.created_at);
          return created >= mStart && created <= mEnd;
        }).length;

        const converted = companies.filter((c) => {
          const created = new Date(c.created_at);
          return created >= mStart && created <= mEnd && c.status === "active";
        }).length;

        const expired = companies.filter((c) => {
          const created = new Date(c.created_at);
          return created >= mStart && created <= mEnd && c.status === "expired";
        }).length;

        conversionTrend.push({
          month: format(monthDate, "MMM yy", { locale: it }),
          trialsStarted,
          converted,
          expired,
          rate: trialsStarted > 0 ? Math.round((converted / trialsStarted) * 100) : 0,
        });
      }

      // ---- HOT TRIAL ALERTS (expiring soon with high engagement) ----
      const hotTrialAlerts: HotTrialAlert[] = trialCompanies
        .filter((c) => {
          if (!c.trial_ends_at) return false;
          const daysLeft = Math.ceil(
            (new Date(c.trial_ends_at).getTime() - Date.now()) / 86400000
          );
          if (daysLeft > 7 || daysLeft < 0) return false;
          const hd = healthDataMap.get(c.id);
          return hd && (hd.orders_last_30d > 0 || hd.user_count >= 2);
        })
        .map((c) => {
          const hd = healthDataMap.get(c.id);
          return {
            companyId: c.id,
            companyName: c.name,
            score: calculateHealthScore(c, hd).score,
            daysUntilExpiry: Math.ceil(
              (new Date(c.trial_ends_at!).getTime() - Date.now()) / 86400000
            ),
            ordersLast30d: hd?.orders_last_30d || 0,
            userCount: hd?.user_count || 0,
          };
        })
        .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

      const trialActivation: TrialActivation = {
        total: trialCompanies.length,
        withOrders: trialWithOrders,
        withCustomers: trialWithCustomers,
        withStaff: trialWithStaff,
        hot: hotTrials,
        cold: coldTrials,
        conversionRate,
        avgDaysToFirstOrder,
        conversionTrend,
        hotTrialAlerts,
      };

      // LTV approximation: ARR / total churned (if any)
      const expiredCount = companies.filter((c) => c.status === "expired").length;
      const avgLtv =
        expiredCount > 0 && currentMrr > 0
          ? Math.round((currentMrr * activeCompanies.length) / (activeCompanies.length + expiredCount) * 12)
          : arr;

      return {
        currentMrr,
        arr,
        nrr,
        avgLtv,
        mrrMovements,
        revenueBySector,
        healthScores,
        healthSummary,
        trialActivation,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
