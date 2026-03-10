import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CampaignStatsCards } from "./CampaignStatsCards";
import { EmailFunnelChart } from "./EmailFunnelChart";
import { EmailPerformanceChart } from "./EmailPerformanceChart";
import { EmailTopCampaignsTable } from "./EmailTopCampaignsTable";
import { CampaignCreateDropdown } from "./CampaignCreateDropdown";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function EmailStatsTab() {
  const { effectiveCompany: company } = useAuth();
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const rpcParams = useMemo(() => ({
    p_company_id: company?.id ?? "",
    p_campaign_id: campaignFilter !== "all" ? campaignFilter : null,
    p_date_from: dateFrom ? new Date(dateFrom).toISOString() : null,
    p_date_to: dateTo ? new Date(dateTo + "T23:59:59").toISOString() : null,
  }), [company?.id, campaignFilter, dateFrom, dateTo]);

  // Campaign list for filter dropdown
  const { data: campaigns = [] } = useQuery({
    queryKey: ["email-campaigns", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_campaigns")
        .select("id, name")
        .eq("company_id", company!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // 1) Summary stats via RPC
  const { data: statsRaw } = useQuery({
    queryKey: ["email-stats-summary", rpcParams],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_email_stats_summary", rpcParams as any);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const stats = {
    sent: Number(statsRaw?.total ?? 0),
    delivered: Number(statsRaw?.delivered ?? 0),
    opened: Number(statsRaw?.opened ?? 0),
    clicked: Number(statsRaw?.clicked ?? 0),
    bounced: Number(statsRaw?.bounced ?? 0),
    unsubscribed: Number(statsRaw?.unsubscribed ?? 0),
    spam: Number(statsRaw?.spam ?? 0),
  };

  const funnel = { ...stats, converted: 0 };

  // 2) Per-campaign stats via RPC
  const { data: campaignPerf = [] } = useQuery({
    queryKey: ["email-stats-by-campaign", rpcParams],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_email_stats_by_campaign", rpcParams as any);
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.campaign_id,
        name: r.campaign_name,
        sent_at: r.sent_at,
        delivered: Number(r.delivered),
        opened: Number(r.opened),
        clicked: Number(r.clicked),
        type: r.campaign_type,
      }));
    },
  });

  // 3) Daily stats by type via RPC
  const { data: dailyRaw = [] } = useQuery({
    queryKey: ["email-stats-by-date", rpcParams],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_email_stats_by_date", rpcParams as any);
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Build chart datasets from daily aggregated data
  const chartDatasets = useMemo(() => {
    if (dailyRaw.length === 0) return { open_rate: [], click_rate: [], delivery_rate: [] };

    // Group by date_label, aggregate types
    const byDate = new Map<string, {
      total: number; delivered: number; opened: number; clicked: number;
      byType: Record<string, { delivered: number; opened: number; clicked: number }>;
    }>();

    (dailyRaw as any[]).forEach((r) => {
      const date = r.date_label;
      if (!byDate.has(date)) {
        byDate.set(date, {
          total: 0, delivered: 0, opened: 0, clicked: 0,
          byType: {
            broadcast: { delivered: 0, opened: 0, clicked: 0 },
            automation: { delivered: 0, opened: 0, clicked: 0 },
            bulk: { delivered: 0, opened: 0, clicked: 0 },
          },
        });
      }
      const entry = byDate.get(date)!;
      const t = Number(r.total);
      entry.total += t;
      entry.delivered += Number(r.delivered);
      entry.opened += Number(r.opened);
      entry.clicked += Number(r.clicked);
      const cType = r.campaign_type || "broadcast";
      if (entry.byType[cType]) {
        entry.byType[cType].delivered += Number(r.delivered);
        entry.byType[cType].opened += Number(r.opened);
        entry.byType[cType].clicked += Number(r.clicked);
      }
    });

    const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 100) : 0;
    const entries = Array.from(byDate.entries());

    const open_rate = entries.map(([date, v]) => ({
      date, all: pct(v.opened, v.total),
      broadcast: pct(v.byType.broadcast.opened, v.total),
      automation: pct(v.byType.automation.opened, v.total),
      bulk: pct(v.byType.bulk.opened, v.total),
    }));
    const click_rate = entries.map(([date, v]) => ({
      date, all: pct(v.clicked, v.total),
      broadcast: pct(v.byType.broadcast.clicked, v.total),
      automation: pct(v.byType.automation.clicked, v.total),
      bulk: pct(v.byType.bulk.clicked, v.total),
    }));
    const delivery_rate = entries.map(([date, v]) => ({
      date, all: pct(v.delivered, v.total),
      broadcast: pct(v.byType.broadcast.delivered, v.total),
      automation: pct(v.byType.automation.delivered, v.total),
      bulk: pct(v.byType.bulk.delivered, v.total),
    }));

    return { open_rate, click_rate, delivery_rate };
  }, [dailyRaw]);

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <CampaignCreateDropdown />
        <Select value={campaignFilter} onValueChange={setCampaignFilter}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Tutte le campagne" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le campagne</SelectItem>
            {campaigns.map((c: any) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Dal</span>
          <Input type="date" className="w-[150px] h-9" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span>al</span>
          <Input type="date" className="w-[150px] h-9" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {/* Engagement summary + funnel */}
      <div>
        <h3 className="text-lg font-semibold text-foreground">Riepilogo del coinvolgimento</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Panoramica delle performance di tutte le email inviate nel periodo selezionato
        </p>
        <EmailFunnelChart data={funnel} />
      </div>

      {/* Performance analysis - 4 cards */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-3">Analisi delle prestazioni</h3>
        <CampaignStatsCards stats={stats} />
      </div>

      {/* Performance chart */}
      <EmailPerformanceChart datasets={chartDatasets} />

      {/* Top campaigns table */}
      <EmailTopCampaignsTable campaigns={campaignPerf} />
    </div>
  );
}
