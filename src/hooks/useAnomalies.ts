import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subMonths, startOfMonth } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { AnomalyFilterState } from "@/components/AnomaliesFilterSidebar";
import type { Anomaly } from "@/components/AnomaliesTable";
import type { AnomalyKPIData } from "@/components/AnomaliesKPIDashboard";
import type { AnomalyChartDataPoint } from "@/components/AnomaliesChart";
import { INITIAL_ANOMALY_FILTER_STATE } from "@/components/AnomaliesFilterSidebar";

export function useAnomalies() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const [filters, setFilters] = useState<AnomalyFilterState>(INITIAL_ANOMALY_FILTER_STATE);
  const [sortBy, setSortBy] = useState<string>("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDirection("asc");
    }
  };

  // ── Fetch raw anomalies ──────────────────────────────────────
  const { data: rawAnomalies = [], isLoading } = useQuery({
    queryKey: ["anomalies", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("anomalies" as never)
        .select(
          "id, created_at, type, priority, status, title, description, impact_amount, assigned_to, order_id, orders(order_code), profiles:assigned_to(full_name)"
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as unknown[];
    },
    enabled: !!companyId,
  });

  // ── Client-side filtering + mapping ─────────────────────────
  const anomalies: Anomaly[] = useMemo(() => {
    return (rawAnomalies as any[])
      .filter((a) => {
        if (filters.date_from && a.created_at < filters.date_from) return false;
        if (filters.date_to && a.created_at > filters.date_to + "T23:59:59") return false;
        if (filters.priority !== "all" && a.priority !== filters.priority) return false;
        if (filters.status !== "all" && a.status !== filters.status) return false;
        if (filters.type !== "all" && a.type !== filters.type) return false;
        if (filters.order_number && !((a.orders as any)?.order_code || "").toLowerCase().includes(filters.order_number.toLowerCase())) return false;
        if (filters.assigned_to_ids.length > 0 && !filters.assigned_to_ids.includes(a.assigned_to)) return false;
        if (filters.impact_min !== undefined && Number(a.impact_amount) < filters.impact_min) return false;
        if (filters.impact_max !== undefined && Number(a.impact_amount) > filters.impact_max) return false;
        return true;
      })
      .sort((a, b) => {
        const aVal = (a as any)[sortBy] ?? "";
        const bVal = (b as any)[sortBy] ?? "";
        const cmp = String(aVal).localeCompare(String(bVal), "it", { numeric: true });
        return sortDirection === "asc" ? cmp : -cmp;
      })
      .map((a: any) => ({
        id: a.id,
        order_number: a.orders?.order_code || "—",
        client_name: "—", // orders non ha customer join qui — può essere aggiunto in futuro
        created_at: a.created_at,
        type: a.type,
        title: a.title,
        description: a.description,
        impact_amount: Number(a.impact_amount) || 0,
        priority: a.priority,
        status: a.status,
        assigned_to_name: a.profiles?.full_name,
      }));
  }, [rawAnomalies, filters, sortBy, sortDirection]);

  // ── KPI ──────────────────────────────────────────────────────
  const kpiData: AnomalyKPIData = useMemo(() => {
    const all = rawAnomalies as any[];
    const pending = all.filter((a) => a.status !== "resolved" && a.status !== "closed");
    const urgent = all.filter((a) => a.priority === "urgent");
    const inReview = all.filter((a) => a.status === "in_review");
    const todayStr = new Date().toISOString().slice(0, 10);
    const resolvedToday = all.filter((a) => a.status === "resolved" && a.created_at?.startsWith(todayStr));
    const total = all.length;
    const resolved = all.filter((a) => a.status === "resolved" || a.status === "closed").length;

    return {
      pending_total: pending.reduce((s, a) => s + Number(a.impact_amount || 0), 0),
      pending_count: pending.length,
      urgent_total: urgent.reduce((s, a) => s + Number(a.impact_amount || 0), 0),
      urgent_count: urgent.length,
      in_review_total: inReview.reduce((s, a) => s + Number(a.impact_amount || 0), 0),
      in_review_count: inReview.length,
      resolved_today_total: resolvedToday.reduce((s, a) => s + Number(a.impact_amount || 0), 0),
      resolved_today_count: resolvedToday.length,
      resolution_rate_percent: total > 0 ? Math.round((resolved / total) * 100) : 0,
      trend_pending: 0,
    };
  }, [rawAnomalies]);

  // ── Chart (ultimi 6 mesi) ─────────────────────────────────
  const chartData: AnomalyChartDataPoint[] = useMemo(() => {
    const all = rawAnomalies as any[];
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const start = startOfMonth(subMonths(now, 5 - i));
      const end = startOfMonth(subMonths(now, 4 - i));
      const inMonth = all.filter((a) => {
        const d = new Date(a.created_at);
        return d >= start && d < end;
      });
      return {
        date: format(start, "MMM yy", { locale: it }),
        mezzo: inMonth
          .filter((a) => a.type === "dati" || a.type === "integrazioni")
          .reduce((s, a) => s + Number(a.impact_amount || 0), 0),
        manodopera: inMonth
          .filter((a) => a.type === "fatturazione" || a.type === "workflow")
          .reduce((s, a) => s + Number(a.impact_amount || 0), 0),
      };
    });
  }, [rawAnomalies]);

  return {
    filters,
    setFilters,
    anomalies,
    isLoading,
    anomaliesCount: anomalies.length,
    kpiData,
    chartData,
    sortBy,
    sortDirection,
    handleSort,
    rawCount: (rawAnomalies as any[]).length,
  };
}
