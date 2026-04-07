import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AIUsageSummary {
  company_id: string;
  company_name: string;
  today_cost_eur: number;
  month_cost_eur: number;
  today_requests: number;
  month_requests: number;
  top_model: string;
  top_provider: string;
}

export interface AIUsageKPIs {
  total_cost_today: number;
  total_cost_month: number;
  active_companies_today: number;
  total_requests_month: number;
}

export interface AIUsageFilters {
  provider?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface RawUsageRow {
  company_id: string;
  model: string;
  provider: string;
  cost_eur: number;
  created_at: string;
}

export function useAIUsageMonitor(filters: AIUsageFilters = {}) {
  return useQuery({
    queryKey: ["admin", "ai-usage-monitor", filters],
    queryFn: async (): Promise<{ summaries: AIUsageSummary[]; kpis: AIUsageKPIs }> => {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const dateFrom = filters.dateFrom
        ? new Date(filters.dateFrom)
        : monthStart;
      const dateTo = filters.dateTo ? new Date(filters.dateTo) : now;

      // Build query
      let query = supabase
        .from("ai_usage_log" as never)
        .select("company_id, model, provider, cost_eur, created_at" as never)
        .gte("created_at" as never, dateFrom.toISOString())
        .lte("created_at" as never, dateTo.toISOString());

      if (filters.provider && filters.provider !== "all") {
        query = query.eq("provider" as never, filters.provider);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as RawUsageRow[];

      // Fetch companies
      const { data: companies, error: companiesError } = await supabase
        .from("companies")
        .select("id, name");
      if (companiesError) throw new Error(companiesError.message);

      const companyMap = new Map(
        ((companies ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name])
      );

      // Aggregate per company
      const byCompany = new Map<
        string,
        {
          today_cost: number;
          month_cost: number;
          today_requests: number;
          month_requests: number;
          models: Map<string, number>;
          providers: Map<string, number>;
        }
      >();

      for (const row of rows) {
        const entry = byCompany.get(row.company_id) ?? {
          today_cost: 0,
          month_cost: 0,
          today_requests: 0,
          month_requests: 0,
          models: new Map(),
          providers: new Map(),
        };

        const isToday = new Date(row.created_at) >= todayStart;
        const cost = Number(row.cost_eur) || 0;

        if (isToday) {
          entry.today_cost += cost;
          entry.today_requests += 1;
        }
        entry.month_cost += cost;
        entry.month_requests += 1;
        entry.models.set(row.model, (entry.models.get(row.model) ?? 0) + 1);
        entry.providers.set(row.provider, (entry.providers.get(row.provider) ?? 0) + 1);
        byCompany.set(row.company_id, entry);
      }

      const summaries: AIUsageSummary[] = Array.from(byCompany.entries())
        .map(([company_id, agg]) => {
          const topModel = [...agg.models.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";
          const topProvider =
            [...agg.providers.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";
          return {
            company_id,
            company_name: companyMap.get(company_id) ?? company_id,
            today_cost_eur: agg.today_cost,
            month_cost_eur: agg.month_cost,
            today_requests: agg.today_requests,
            month_requests: agg.month_requests,
            top_model: topModel,
            top_provider: topProvider,
          };
        })
        .sort((a, b) => b.month_cost_eur - a.month_cost_eur);

      const kpis: AIUsageKPIs = {
        total_cost_today: summaries.reduce((s, r) => s + r.today_cost_eur, 0),
        total_cost_month: summaries.reduce((s, r) => s + r.month_cost_eur, 0),
        active_companies_today: summaries.filter((r) => r.today_requests > 0).length,
        total_requests_month: summaries.reduce((s, r) => s + r.month_requests, 0),
      };

      return { summaries, kpis };
    },
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}
